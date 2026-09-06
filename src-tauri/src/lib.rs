use portable_pty::{native_pty_system, CommandBuilder, PtySize};
use std::io::{Read, Write};
use std::sync::{Arc, Mutex};
use dashmap::DashMap;
use tauri::ipc::Channel;
use tauri::Emitter;
use hephaestus::Isolate;

mod agent_hooks;
mod automations;
mod canvas_mcp;
mod claude_bridge;
mod git_clone;
mod node_ingest;
mod notes;
mod pairing_relay;
mod quota;
mod secrets;
mod service_proxy;
mod tasks;
mod tasks_store;
mod warp_bridge;

/// Managed slug → dev-server-port map, read by the reverse proxy in
/// `service_proxy.rs` and written by `register_service_route`. The bool is
/// whether the proxy bound its port — `false` means hostnames won't route and
/// callers should keep the direct `localhost:<port>` URL.
struct ServiceRoutes(service_proxy::Routes, bool);

/// Map a per-branch hostname slug to the worktree's dev-server port so the proxy
/// can route `<slug>.localhost` to it. Called by the frontend wherever it already
/// computes a workspace port (Run tab, Live Preview). Returns whether the proxy
/// is live.
#[tauri::command]
fn register_service_route(slug: String, port: u16, routes: tauri::State<'_, ServiceRoutes>) -> bool {
    if let Ok(mut r) = routes.0.lock() {
        r.insert(slug.to_ascii_lowercase(), port);
    }
    routes.1
}

/// Process-global isolation backend (Job Objects on Windows). Provisioned lazily
/// the first time a sandboxed PTY session is created.
static ISOLATE: std::sync::OnceLock<Arc<dyn Isolate>> = std::sync::OnceLock::new();

/// Register a project root with the asset:// scope so CodeMirrorPane can serve
/// local images referenced from files inside it. `assetProtocol.scope` in
/// `tauri.conf.json` starts empty (closed) — every path an image can come from
/// must flow through here. Idempotent; a bad path is non-fatal.
fn allow_project_asset_scope(app: &tauri::AppHandle, path: &str) {
    use tauri::Manager;
    if path.is_empty() { return; }
    let _ = app.asset_protocol_scope().allow_directory(path, true);
}


#[tauri::command(async)]
fn create_workspace(app: tauri::AppHandle, location: String, name: String) -> Result<String, String> {
    let path = std::path::Path::new(&location).join(&name);
    std::fs::create_dir_all(&path).map_err(|e| e.to_string())?;
    let s = path.to_string_lossy().to_string();
    allow_project_asset_scope(&app, &s);
    Ok(s)
}

#[derive(serde::Serialize)]
struct DirEntry {
    name: String,
    path: String,
    is_dir: bool,
}

#[tauri::command(async)]
fn list_directory(path: String) -> Result<Vec<DirEntry>, String> {
    #[cfg(windows)]
    let path = path.replace('/', "\\");
    let mut entries: Vec<DirEntry> = std::fs::read_dir(&path)
        .map_err(|e| e.to_string())?
        .filter_map(|e| e.ok())
        .map(|e| {
            let p = e.path();
            let is_dir = p.is_dir();
            DirEntry {
                name: e.file_name().to_string_lossy().to_string(),
                path: p.to_string_lossy().to_string(),
                is_dir,
            }
        })
        .collect();

    entries.sort_by(|a, b| {
        b.is_dir
            .cmp(&a.is_dir)
            .then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase()))
    });

    Ok(entries)
}

#[tauri::command(async)]
fn read_file(path: String) -> Result<String, String> {
    std::fs::read_to_string(&path).map_err(|e| e.to_string())
}

#[tauri::command(async)]
fn write_file(path: String, content: String) -> Result<(), String> {
    std::fs::write(&path, content).map_err(|e| e.to_string())
}

/// Atomic write (temp + rename, mkdir -p, optional exec bit) used by the agent-
/// hooks installer for managed scripts and for merged agent config files. The
/// atomicity matters: a crash mid-write must never leave an agent's own
/// settings.json truncated.
#[tauri::command(async)]
fn hooks_write_atomic(path: String, content: String, executable: bool) -> Result<(), String> {
    agent_hooks::write_atomic(std::path::Path::new(&path), &content, executable)
        .map_err(|e| e.to_string())
}

#[derive(serde::Serialize)]
struct HookPaths {
    home: String,
    hooks_dir: String,
    endpoint_env: String,
    endpoint_cmd: String,
    windows: bool,
}

/// Filesystem locations + platform the agent-hooks installer needs. Sourced from
/// Rust so the frontend never has to resolve the home dir or guess the OS.
#[tauri::command(async)]
fn hooks_paths() -> HookPaths {
    let dir = agent_hooks::hooks_dir();
    HookPaths {
        home: global_home().to_string_lossy().to_string(),
        endpoint_env: dir.join("endpoint.env").to_string_lossy().to_string(),
        endpoint_cmd: dir.join("endpoint.cmd").to_string_lossy().to_string(),
        hooks_dir: dir.to_string_lossy().to_string(),
        windows: cfg!(windows),
    }
}

/// Returns the @usetempest/atlas package directory inside the runtime folder.
/// Dev builds: src-tauri/resources/atlas/node_modules/@usetempest/atlas/
/// Release builds: <exe>/resources/atlas/node_modules/@usetempest/atlas/
/// (macOS: Tempest.app/Contents/Resources/resources/atlas/...)
fn atlas_resource_dir(app: &tauri::AppHandle) -> Result<std::path::PathBuf, String> {
    #[cfg(debug_assertions)]
    {
        let _ = app;
        Ok(std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("resources")
            .join("atlas")
            .join("node_modules")
            .join("@usetempest")
            .join("atlas"))
    }
    #[cfg(not(debug_assertions))]
    {
        let _ = app;
        // Use current_exe() instead of Tauri's resource_dir(): on Windows,
        // resource_dir() can return a drive-relative path (e.g. "D:resources\...")
        // instead of an absolute path ("D:\resources\..."), which causes Node to
        // fail resolving the script with EISDIR: lstat 'D:'.
        let exe = std::env::current_exe().map_err(|e| e.to_string())?;
        let exe_dir = exe.parent()
            .ok_or_else(|| "Cannot determine executable directory".to_string())?;
        // macOS .app bundles split executable (Contents/MacOS/) from resources
        // (Contents/Resources/); other platforms keep them side-by-side.
        #[cfg(target_os = "macos")]
        let base = exe_dir.parent()
            .ok_or_else(|| "Cannot determine Contents directory".to_string())?
            .join("Resources");
        #[cfg(not(target_os = "macos"))]
        let base = exe_dir.to_path_buf();
        Ok(base.join("resources").join("atlas").join("node_modules").join("@usetempest").join("atlas"))
    }
}

/// Stable, Tempest-owned directory for the semantic embedding model. Lives in the
/// app-data dir (survives app updates, shared across every project) so the ~25 MB
/// model is downloaded once and never re-fetched. Passed to Atlas via
/// `--model-cache`; created on demand.
fn atlas_model_dir(app: &tauri::AppHandle) -> Result<std::path::PathBuf, String> {
    use tauri::Manager;
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?.join("atlas-models");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

/// Spawn `node .../atlas/dist/mcp/server-entry.js --init --path <project>` in the
/// background. The Node process initialises the .atlas/ directory and builds the
/// first full code-graph index, then exits. Fire-and-forget — any errors are
/// written to stderr by the Node process itself.
#[tauri::command(async)]
fn start_atlas_index(app: tauri::AppHandle, project_path: String, semantic: bool) -> Result<(), String> {
    let entry = atlas_resource_dir(&app)?
        .join("dist")
        .join("mcp")
        .join("server-entry.js");
    let _ = app.emit("atlas:log", serde_json::json!({ "path": &project_path, "line": format!("[atlas-init] entry: {}", entry.display()) }));
    if !entry.exists() {
        return Err(format!("Atlas not bundled — entry not found at: {}", entry.display()));
    }

    // Semantic search is a user-consented, Tempest-owned setting. Pass it (and
    // the stable model cache dir) to Atlas as CLI args — never an env block.
    let model_dir = if semantic { Some(atlas_model_dir(&app)?) } else { None };

    let mut cmd = new_command(&resolve_node());
    cmd.arg("--liftoff-only") // prevents V8 turboshaft Zone OOM on tree-sitter WASM grammars (Node >=22)
        .arg(&entry)
        .arg("--init")
        .arg("--path")
        .arg(&project_path);
    if let Some(dir) = &model_dir {
        cmd.arg("--semantic").arg("--model-cache").arg(dir);
    }
    let mut child = cmd
        .current_dir(&project_path)
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to spawn Atlas index: {e}"))?;

    // Stream stdout + stderr to the frontend as `atlas:log` events so output
    // appears live in the browser DevTools console. Each handle gets its own
    // thread so neither blocks the other. Child is moved into the stderr thread
    // which waits for exit — stdout is drained separately and will finish first.
    let stdout = child.stdout.take();
    let stderr = child.stderr.take();

    let app_out = app.clone();
    let path_out = project_path.clone();
    std::thread::spawn(move || {
        use std::io::BufRead;
        if let Some(h) = stdout {
            for line in std::io::BufReader::new(h).lines().flatten() {
                let _ = app_out.emit("atlas:log", serde_json::json!({ "path": path_out, "line": line }));
            }
        }
    });

    let app_err = app.clone();
    let path_err = project_path.clone();
    std::thread::spawn(move || {
        use std::io::BufRead;
        if let Some(h) = stderr {
            for line in std::io::BufReader::new(h).lines().flatten() {
                let _ = app_err.emit("atlas:log", serde_json::json!({ "path": path_err, "line": line }));
            }
        }
        let _ = child.wait();
    });

    // Write agent MCP config files now that we know the entry path.
    write_atlas_mcp_config(&project_path, &entry, model_dir.as_deref())?;

    Ok(())
}

/// Pre-download the semantic embedding model into Tempest's stable cache dir,
/// streaming hub progress to the frontend as `atlas:model-download` events.
/// Invoked when the user consents to semantic search during onboarding. Resolves
/// when the model is ready (or rejects on failure) so the UI can await it.
#[tauri::command(async)]
fn download_atlas_model(app: tauri::AppHandle) -> Result<(), String> {
    let entry = atlas_resource_dir(&app)?.join("dist").join("mcp").join("server-entry.js");
    if !entry.exists() {
        return Err(format!("Atlas not bundled — entry not found at: {}", entry.display()));
    }
    let model_dir = atlas_model_dir(&app)?;

    let mut child = new_command(&resolve_node())
        .arg("--liftoff-only")
        .arg(&entry)
        .arg("--download-model")
        .arg("--model-cache")
        .arg(&model_dir)
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to spawn model download: {e}"))?;

    let stdout = child.stdout.take();
    let stderr = child.stderr.take();

    // Diagnostics: forward stderr to the atlas log channel.
    let app_err = app.clone();
    let err_thread = std::thread::spawn(move || {
        use std::io::BufRead;
        if let Some(h) = stderr {
            for line in std::io::BufReader::new(h).lines().map_while(Result::ok) {
                let _ = app_err.emit("atlas:log", serde_json::json!({ "line": line }));
            }
        }
    });

    // Stream JSON progress lines → `atlas:model-download` events on this thread
    // (the command runs async, so blocking here is fine).
    if let Some(h) = stdout {
        use std::io::BufRead;
        for line in std::io::BufReader::new(h).lines().map_while(Result::ok) {
            if let Ok(v) = serde_json::from_str::<serde_json::Value>(&line) {
                let _ = app.emit("atlas:model-download", v);
            }
        }
    }

    let status = child.wait().map_err(|e| e.to_string())?;
    let _ = err_thread.join();
    if status.success() { Ok(()) } else { Err("Model download failed — see logs.".to_string()) }
}

/// Build the `args` array agents use to spawn the atlas MCP server. When the user
/// has consented to semantic search, `model_dir` is Some and `--semantic` +
/// `--model-cache` are appended — as ARGS, so no env block is written anywhere.
fn atlas_mcp_args(entry_str: &str, proj_str: &str, model_dir: Option<&std::path::Path>) -> Vec<String> {
    let mut args = vec![
        "--liftoff-only".to_string(),
        entry_str.to_string(),
        "--path".to_string(),
        proj_str.to_string(),
    ];
    if let Some(dir) = model_dir {
        args.push("--semantic".to_string());
        args.push("--model-cache".to_string());
        args.push(dir.to_string_lossy().replace('\\', "/"));
    }
    args
}

fn write_atlas_mcp_config(project_path: &str, entry: &std::path::Path, model_dir: Option<&std::path::Path>) -> Result<(), String> {
    let entry_str = entry.to_string_lossy().replace('\\', "/");
    let proj_str  = project_path.replace('\\', "/");
    let root = std::path::Path::new(project_path);
    let args = atlas_mcp_args(&entry_str, &proj_str, model_dir);

    // Shared helper: read existing JSON, merge `mcpServers.atlas`, write back.
    // Used by Claude Code, Gemini CLI, Cursor, and Kiro — all use the same shape.
    let upsert_mcp_servers = |file: &std::path::Path| -> Result<(), String> {
        let existing = std::fs::read_to_string(file).unwrap_or_default();
        let mut v: serde_json::Value = serde_json::from_str(&existing)
            .unwrap_or_else(|_| serde_json::json!({}));
        v["mcpServers"]["atlas"] = serde_json::json!({
            "type": "stdio",
            "command": "node",
            "args": args
        });
        let out = serde_json::to_string_pretty(&v).map_err(|e| e.to_string())?;
        if let Some(parent) = file.parent() {
            std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        std::fs::write(file, out + "\n").map_err(|e| e.to_string())
    };

    // Claude Code — .mcp.json (also read by Cline/Roo, Zed, Windsurf)
    upsert_mcp_servers(&root.join(".mcp.json"))?;

    // Cursor — .cursor/mcp.json
    upsert_mcp_servers(&root.join(".cursor").join("mcp.json"))?;

    // Gemini CLI — .gemini/settings.json
    upsert_mcp_servers(&root.join(".gemini").join("settings.json"))?;

    // Kiro (AWS) — .kiro/settings/mcp.json
    upsert_mcp_servers(&root.join(".kiro").join("settings").join("mcp.json"))?;

    // opencode — opencode.jsonc (falls back to opencode.json if it already exists).
    // Shape differs: `mcp.<name>` with `type: "local"` and `command` as an array.
    {
        let oc_path = {
            let json = root.join("opencode.json");
            if json.exists() { json } else { root.join("opencode.jsonc") }
        };
        let existing = std::fs::read_to_string(&oc_path).unwrap_or_default();
        let mut v: serde_json::Value = serde_json::from_str(&existing)
            .unwrap_or_else(|_| serde_json::json!({}));
        let mut oc_cmd = vec!["node".to_string()];
        oc_cmd.extend(args.iter().cloned());
        v["mcp"]["atlas"] = serde_json::json!({
            "type": "local",
            "command": oc_cmd,
            "enabled": true
        });
        let out = serde_json::to_string_pretty(&v).map_err(|e| e.to_string())?;
        std::fs::write(&oc_path, out + "\n").map_err(|e| e.to_string())?;
    }

    // All config files contain absolute machine-specific paths — keep out of git.
    ensure_atlas_mcp_gitignore(project_path);

    Ok(())
}

/// Register the canvas MCP server (`tempest-canvas`) in the agent-config files at
/// `project_path` (the cwd a canvas agent runs in). `command` points at our own exe
/// with `--canvas-mcp` — see `canvas_mcp.rs`. Merges alongside atlas's own entry.
/// Called from the canvas UI just before spawning an agent/terminal node's session.
#[tauri::command]
fn write_canvas_mcp_config(app: tauri::AppHandle, project_path: String, project_id: String) -> Result<(), String> {
    use tauri::Manager;
    let db = app.path().app_data_dir().map_err(|e| e.to_string())?.join("tempest.db");
    let db_str = db.to_string_lossy().replace('\\', "/");
    let exe = std::env::current_exe().map_err(|e| e.to_string())?;
    let exe_str = exe.to_string_lossy().replace('\\', "/");
    let root = std::path::Path::new(&project_path);

    let upsert = |file: &std::path::Path| -> Result<(), String> {
        let existing = std::fs::read_to_string(file).unwrap_or_default();
        let mut v: serde_json::Value = serde_json::from_str(&existing)
            .unwrap_or_else(|_| serde_json::json!({}));
        v["mcpServers"]["tempest-canvas"] = serde_json::json!({
            "type": "stdio",
            "command": &exe_str,
            "args": ["--canvas-mcp", "--db", &db_str, "--project", &project_id]
        });
        let out = serde_json::to_string_pretty(&v).map_err(|e| e.to_string())?;
        if let Some(parent) = file.parent() {
            std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        std::fs::write(file, out + "\n").map_err(|e| e.to_string())
    };

    upsert(&root.join(".mcp.json"))?;                                  // Claude Code, Cline/Roo, Zed, Windsurf
    upsert(&root.join(".cursor").join("mcp.json"))?;                   // Cursor
    upsert(&root.join(".gemini").join("settings.json"))?;             // Gemini CLI
    upsert(&root.join(".kiro").join("settings").join("mcp.json"))?;   // Kiro

    // opencode — different shape (mcp.<name>, command as array).
    {
        let oc_path = { let j = root.join("opencode.json"); if j.exists() { j } else { root.join("opencode.jsonc") } };
        let existing = std::fs::read_to_string(&oc_path).unwrap_or_default();
        let mut v: serde_json::Value = serde_json::from_str(&existing)
            .unwrap_or_else(|_| serde_json::json!({}));
        v["mcp"]["tempest-canvas"] = serde_json::json!({
            "type": "local",
            "command": [&exe_str, "--canvas-mcp", "--db", &db_str, "--project", &project_id],
            "enabled": true
        });
        let out = serde_json::to_string_pretty(&v).map_err(|e| e.to_string())?;
        std::fs::write(&oc_path, out + "\n").map_err(|e| e.to_string())?;
    }

    ensure_atlas_mcp_gitignore(&project_path);
    Ok(())
}

fn ensure_atlas_mcp_gitignore(project_path: &str) {
    let gitignore = std::path::Path::new(project_path).join(".gitignore");
    let existing = std::fs::read_to_string(&gitignore).unwrap_or_default();
    let entries = [
        ".mcp.json",
        ".cursor/mcp.json",
        ".gemini/settings.json",
        ".kiro/settings/mcp.json",
        "opencode.jsonc",
        "opencode.json",
    ];
    let lines_to_add: Vec<&str> = entries
        .iter()
        .filter(|e| !existing.lines().any(|l| l.trim() == **e))
        .copied()
        .collect();
    if lines_to_add.is_empty() { return; }
    let suffix = if existing.ends_with('\n') || existing.is_empty() { "" } else { "\n" };
    let addition = lines_to_add.join("\n");
    let _ = std::fs::write(&gitignore, format!("{}{}{}\n", existing, suffix, addition));
}

#[derive(serde::Serialize)]
struct SymbolNode {
    id: String,
    name: String,
    kind: String,
    file_path: String,
    start_line: i64,
    end_line: i64,
    language: String,
}

#[derive(serde::Serialize)]
struct SymbolEdge {
    source: String,
    target: String,
    kind: String,
}

#[derive(serde::Serialize)]
struct GraphData {
    nodes: Vec<SymbolNode>,
    edges: Vec<SymbolEdge>,
}

#[tauri::command(async)]
fn get_atlas_graph(project_path: String) -> Result<GraphData, String> {
    let db_path = std::path::Path::new(&project_path)
        .join(".tempest")
        .join("atlas")
        .join("atlas.db");

    if !db_path.exists() {
        return Err(format!("Atlas database not found at {}", db_path.display()));
    }

    let conn = rusqlite::Connection::open_with_flags(
        &db_path,
        rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY | rusqlite::OpenFlags::SQLITE_OPEN_URI,
    )
    .map_err(|e| format!("Failed to open atlas db: {e}"))?;

    let mut node_stmt = conn
        .prepare("SELECT id, name, kind, file_path, start_line, end_line, language FROM nodes")
        .map_err(|e| format!("Failed to prepare nodes query: {e}"))?;

    let nodes = node_stmt
        .query_map([], |row| {
            Ok(SymbolNode {
                id: row.get(0)?,
                name: row.get(1)?,
                kind: row.get(2)?,
                file_path: row.get(3)?,
                start_line: row.get(4)?,
                end_line: row.get(5)?,
                language: row.get(6)?,
            })
        })
        .map_err(|e| format!("Failed to query nodes: {e}"))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("Failed to read nodes: {e}"))?;

    let mut edge_stmt = conn
        .prepare("SELECT source, target, kind FROM edges")
        .map_err(|e| format!("Failed to prepare edges query: {e}"))?;

    let edges = edge_stmt
        .query_map([], |row| {
            Ok(SymbolEdge {
                source: row.get(0)?,
                target: row.get(1)?,
                kind: row.get(2)?,
            })
        })
        .map_err(|e| format!("Failed to query edges: {e}"))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("Failed to read edges: {e}"))?;

    Ok(GraphData { nodes, edges })
}

#[derive(serde::Serialize)]
struct SymbolMatch {
    name: String,
    kind: String,
    file_path: String,
    start_line: i64,
    end_line: i64,
    language: String,
}

/// Keyword search over the Atlas symbol index. Extracts significant tokens from
/// `question`, scores every indexed symbol by name/path matches, and returns the
/// top matches. Real data from the project's `.tempest/atlas/atlas.db`; used to
/// answer `@codebase` mentions in Chat.
#[tauri::command(async)]
fn atlas_query(project_path: String, question: String) -> Result<Vec<SymbolMatch>, String> {
    let db_path = std::path::Path::new(&project_path)
        .join(".tempest")
        .join("atlas")
        .join("atlas.db");

    if !db_path.exists() {
        return Err(format!("Atlas database not found at {}", db_path.display()));
    }

    let stop: std::collections::HashSet<&str> = [
        "the", "and", "for", "that", "this", "with", "how", "does", "what", "why",
        "where", "codebase", "from", "into", "are", "was", "were", "has", "have",
        "not", "you", "your", "can", "should", "would", "when", "which", "who",
    ]
    .into_iter()
    .collect();

    let keywords: Vec<String> = question
        .split(|c: char| !c.is_alphanumeric())
        .filter(|t| t.len() >= 3)
        .map(|t| t.to_lowercase())
        .filter(|t| !stop.contains(t.as_str()))
        .collect();

    if keywords.is_empty() {
        return Ok(Vec::new());
    }

    let conn = rusqlite::Connection::open_with_flags(
        &db_path,
        rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY | rusqlite::OpenFlags::SQLITE_OPEN_URI,
    )
    .map_err(|e| format!("Failed to open atlas db: {e}"))?;

    let mut stmt = conn
        .prepare("SELECT name, kind, file_path, start_line, end_line, language FROM nodes")
        .map_err(|e| format!("Failed to prepare query: {e}"))?;

    let rows = stmt
        .query_map([], |row| {
            Ok(SymbolMatch {
                name: row.get(0)?,
                kind: row.get(1)?,
                file_path: row.get(2)?,
                start_line: row.get(3)?,
                end_line: row.get(4)?,
                language: row.get(5)?,
            })
        })
        .map_err(|e| format!("Failed to query nodes: {e}"))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("Failed to read nodes: {e}"))?;

    let mut scored: Vec<(i32, SymbolMatch)> = rows
        .into_iter()
        .filter_map(|s| {
            let name_l = s.name.to_lowercase();
            let path_l = s.file_path.to_lowercase();
            let mut score = 0;
            for kw in &keywords {
                if name_l == *kw {
                    score += 3;
                } else if name_l.contains(kw.as_str()) {
                    score += 2;
                }
                if path_l.contains(kw.as_str()) {
                    score += 1;
                }
            }
            if score > 0 {
                Some((score, s))
            } else {
                None
            }
        })
        .collect();

    scored.sort_by(|a, b| b.0.cmp(&a.0));
    Ok(scored.into_iter().take(40).map(|(_, s)| s).collect())
}

#[tauri::command(async)]
fn check_atlas_db(project_path: String) -> bool {
    std::path::Path::new(&project_path)
        .join(".tempest")
        .join("atlas")
        .join("atlas.db")
        .exists()
}

fn global_home() -> std::path::PathBuf {
    #[cfg(windows)]
    let key = "USERPROFILE";
    #[cfg(not(windows))]
    let key = "HOME";
    std::env::var(key).map(std::path::PathBuf::from).unwrap_or_else(|_| std::path::PathBuf::from("."))
}

#[tauri::command(async)]
fn check_goose_atlas_config() -> bool {
    let p = global_home().join(".config").join("goose").join("profiles.yaml");
    std::fs::read_to_string(p).map(|s| s.contains("atlas:")).unwrap_or(false)
}

#[tauri::command(async)]
fn write_goose_atlas_config(app: tauri::AppHandle, semantic: bool) -> Result<(), String> {
    let entry = atlas_resource_dir(&app)?.join("dist").join("mcp").join("server-entry.js");
    let entry_str = entry.to_string_lossy().replace('\\', "/");
    let path = global_home().join(".config").join("goose").join("profiles.yaml");
    if let Some(p) = path.parent() { std::fs::create_dir_all(p).map_err(|e| e.to_string())?; }
    let existing = std::fs::read_to_string(&path).unwrap_or_default();
    if existing.contains("atlas:") { return Ok(()); }
    let semantic_args = if semantic {
        let dir = atlas_model_dir(&app)?.to_string_lossy().replace('\\', "/");
        format!("      - --semantic\n      - --model-cache\n      - {dir}\n")
    } else { String::new() };
    let atlas_block = format!("  atlas:\n    name: Atlas\n    type: stdio\n    cmd: node\n    args:\n      - --liftoff-only\n      - {entry_str}\n{semantic_args}    enabled: true\n");
    let content = if existing.is_empty() {
        format!("extensions:\n{atlas_block}")
    } else if let Some(pos) = existing.find("extensions:") {
        let insert_at = existing[pos..].find('\n').map(|n| pos + n + 1).unwrap_or(existing.len());
        format!("{}{}{}", &existing[..insert_at], atlas_block, &existing[insert_at..])
    } else {
        format!("{}\nextensions:\n{atlas_block}", existing.trim_end())
    };
    std::fs::write(&path, content).map_err(|e| e.to_string())
}

#[tauri::command(async)]
fn check_codex_atlas_config() -> bool {
    let p = global_home().join(".codex").join("config.toml");
    std::fs::read_to_string(p).map(|s| s.contains("[mcp_servers.atlas]")).unwrap_or(false)
}

#[tauri::command(async)]
fn write_codex_atlas_config(app: tauri::AppHandle, semantic: bool) -> Result<(), String> {
    let entry = atlas_resource_dir(&app)?.join("dist").join("mcp").join("server-entry.js");
    let entry_str = entry.to_string_lossy().replace('\\', "/");
    let path = global_home().join(".codex").join("config.toml");
    if let Some(p) = path.parent() { std::fs::create_dir_all(p).map_err(|e| e.to_string())?; }
    let existing = std::fs::read_to_string(&path).unwrap_or_default();
    if existing.contains("[mcp_servers.atlas]") { return Ok(()); }
    let semantic_args = if semantic {
        let dir = atlas_model_dir(&app)?.to_string_lossy().replace('\\', "/");
        format!(", \"--semantic\", \"--model-cache\", \"{dir}\"")
    } else { String::new() };
    let atlas_block = format!("\n[mcp_servers.atlas]\ncommand = \"node\"\nargs = [\"--liftoff-only\", \"{entry_str}\"{semantic_args}]\n");
    std::fs::write(&path, format!("{}{}", existing.trim_end(), atlas_block)).map_err(|e| e.to_string())
}

#[tauri::command]
async fn db_check_docker() -> bool {
    dbiso::check_docker_available().await
}

#[tauri::command(async)]
fn db_check_ready(workspace_path: String) -> bool {
    dbiso::get_current_base_image(&workspace_path).is_some()
}

#[tauri::command]
async fn db_build(
    app: tauri::AppHandle,
    conn_str: String,
    method: String,
    workspace_path: String,
    project_name: String,
) -> Result<(), String> {
    let method = dbiso::SnapshotMethod::from_str(&method);
    dbiso::build_base_image(&conn_str, method, &workspace_path, &project_name, move |msg| {
        let _ = app.emit("db:log", &msg);
    })
    .await
    .map(|_| ())
}

#[tauri::command]
async fn shell_run(
    app: tauri::AppHandle,
    state: tauri::State<'_, RunState>,
    session_id: String,
    cwd: String,
    cmd: String,
    env: Option<std::collections::HashMap<String, String>>,
) -> Result<(), String> {
    // Per-workspace PORT etc., so parallel worktrees' dev servers don't collide.
    let env = env.unwrap_or_default();
    #[cfg(windows)]
    let mut child = std::process::Command::new("cmd")
        .args(["/C", &cmd])
        .current_dir(&cwd)
        .envs(env)
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn()
        .map_err(|e| e.to_string())?;
    #[cfg(not(windows))]
    let mut child = std::process::Command::new("sh")
        .args(["-c", &cmd])
        .current_dir(&cwd)
        .envs(env)
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn()
        .map_err(|e| e.to_string())?;

    let stdout = child.stdout.take().ok_or("no stdout")?;
    let stderr = child.stderr.take().ok_or("no stderr")?;
    state.0.lock().unwrap().insert(session_id.clone(), child);

    use std::sync::{Arc, atomic::{AtomicU8, Ordering}};
    let done = Arc::new(AtomicU8::new(0));

    let app2 = app.clone(); let sid2 = session_id.clone(); let ev = format!("run:{sid2}");
    let done2 = done.clone(); let app_d2 = app.clone(); let sid_d2 = session_id.clone();
    std::thread::spawn(move || {
        use std::io::{BufRead, BufReader};
        for line in BufReader::new(stdout).lines().flatten() {
            let _ = app2.emit(&ev, &line);
        }
        if done2.fetch_add(1, Ordering::SeqCst) == 1 {
            let _ = app_d2.emit(&format!("run:{sid_d2}:done"), ());
        }
    });

    let app3 = app.clone(); let sid3 = session_id.clone(); let ev3 = format!("run:{sid3}");
    let done3 = done.clone(); let app_d3 = app.clone(); let sid_d3 = session_id.clone();
    std::thread::spawn(move || {
        use std::io::{BufRead, BufReader};
        for line in BufReader::new(stderr).lines().flatten() {
            let _ = app3.emit(&ev3, &line);
        }
        if done3.fetch_add(1, Ordering::SeqCst) == 1 {
            let _ = app_d3.emit(&format!("run:{sid_d3}:done"), ());
        }
    });

    Ok(())
}

/// Run a repo-supplied worktree hook (`tempest.yml` `setup:` / `teardown:`) to
/// completion, one command at a time, stopping at the first failure.
///
/// Unlike `shell_run` this waits and reports the exit status: a worktree must
/// not be reported ready on the strength of a command that failed. Output lines
/// are streamed as `hook:{token}` events so the caller can show progress.
#[tauri::command(async)]
fn run_hook(
    app: tauri::AppHandle,
    token: String,
    cwd: String,
    commands: Vec<String>,
    env: Option<std::collections::HashMap<String, String>>,
) -> Result<(), String> {
    use std::io::{BufRead, BufReader};

    let ev = format!("hook:{token}");
    let (program, flag) = if cfg!(windows) { ("cmd", "/C") } else { ("sh", "-c") };

    for cmd_str in commands {
        let _ = app.emit(&ev, format!("$ {cmd_str}"));

        let mut command = new_command(program);
        command
            .arg(flag)
            .arg(&cmd_str)
            .current_dir(&cwd)
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped());
        // The config's `env` is already stripped of loader and DB-isolation
        // variables by tempestConfig.ts before it reaches here.
        if let Some(ref vars) = env {
            for (k, v) in vars {
                command.env(k, v);
            }
        }

        let mut child = command
            .spawn()
            .map_err(|e| format!("{cmd_str}: failed to start: {e}"))?;

        let stdout = child.stdout.take().ok_or("no stdout")?;
        let stderr = child.stderr.take().ok_or("no stderr")?;

        // stderr on its own thread; stdout drained here. Both must be consumed
        // or a chatty command fills its pipe buffer and blocks forever.
        let app_err = app.clone();
        let ev_err = ev.clone();
        let err_thread = std::thread::spawn(move || {
            let mut tail = String::new();
            for line in BufReader::new(stderr).lines().map_while(Result::ok) {
                let _ = app_err.emit(&ev_err, &line);
                tail = line;
            }
            tail
        });

        for line in BufReader::new(stdout).lines().map_while(Result::ok) {
            let _ = app.emit(&ev, &line);
        }

        let last_err = err_thread.join().unwrap_or_default();
        let status = child.wait().map_err(|e| format!("{cmd_str}: {e}"))?;
        if !status.success() {
            let code = status.code().map_or("signal".to_string(), |c| c.to_string());
            return Err(if last_err.is_empty() {
                format!("`{cmd_str}` exited with {code}")
            } else {
                format!("`{cmd_str}` exited with {code}: {last_err}")
            });
        }
    }
    Ok(())
}

#[tauri::command]
fn shell_kill(state: tauri::State<'_, RunState>, session_id: String) -> Result<(), String> {
    if let Some(mut child) = state.0.lock().unwrap().remove(&session_id) {
        let _ = child.kill();
    }
    Ok(())
}

#[tauri::command(async)]
fn db_list_branches(workspace_path: String) -> Vec<dbiso::DbBranch> {
    dbiso::all_branches(&workspace_path)
}

#[tauri::command]
async fn db_sweep_orphans() -> Result<(), String> {
    dbiso::sweep_orphans().await
}

#[tauri::command(async)]
fn remove_atlas_index(project_path: String) -> Result<(), String> {
    let atlas_dir = std::path::Path::new(&project_path).join(".tempest").join("atlas");
    if atlas_dir.exists() {
        std::fs::remove_dir_all(&atlas_dir)
            .map_err(|e| format!("Failed to remove atlas index: {e}"))?;
    }
    Ok(())
}

/// Start the atlas daemon for a project (MCP server / file-watcher mode).
/// If the daemon is already running for this path the call is a no-op.
/// If it exited, it is restarted so the file watcher resumes.
#[tauri::command(async)]
fn start_atlas_daemon(
    app: tauri::AppHandle,
    state: tauri::State<'_, DaemonState>,
    project_path: String,
) -> Result<(), String> {
    let mut map = state.0.lock().unwrap();

    // Check whether the existing child is still alive before spawning another.
    if let Some((child, _)) = map.get_mut(&project_path) {
        match child.try_wait() {
            Ok(None) => return Ok(()), // still running — nothing to do
            _ => {}                    // exited or error — fall through and restart
        }
    }

    let entry = atlas_resource_dir(&app)?
        .join("dist")
        .join("mcp")
        .join("server-entry.js");

    if !entry.exists() {
        return Err(format!("Atlas not bundled — entry not found at: {}", entry.display()));
    }

    let child = new_command(&resolve_node())
        .arg("--liftoff-only")
        .arg(&entry)
        .arg("--path")
        .arg(&project_path)
        .current_dir(&project_path)
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .spawn()
        .map_err(|e| format!("Failed to spawn Atlas daemon: {e}"))?;

    let pid = child.id();
    atlas_daemons_set(&app, &project_path, Some(pid));
    let job = hephaestus::lifecycle_job(pid).ok();
    map.insert(project_path, (child, job));
    Ok(())
}

/// Kill the atlas daemon for a project. Called when the user removes the project
/// from Tempest or the app is exiting.
#[tauri::command(async)]
fn stop_atlas_daemon(
    app: tauri::AppHandle,
    state: tauri::State<'_, DaemonState>,
    project_path: String,
) -> Result<(), String> {
    let mut map = state.0.lock().unwrap();
    if let Some((mut child, _job)) = map.remove(&project_path) {
        let _ = child.kill();
        let _ = child.wait();
    }
    atlas_daemons_set(&app, &project_path, None);
    Ok(())
}

fn mcp_notify(proc: &mut McpBridgeProcess, method: &str, params: serde_json::Value) -> Result<(), String> {
    use std::io::Write;
    let msg = serde_json::json!({ "jsonrpc": "2.0", "method": method, "params": params });
    let line = serde_json::to_string(&msg).map_err(|e| e.to_string())?;
    proc.writer.write_all(line.as_bytes()).map_err(|e| e.to_string())?;
    proc.writer.write_all(b"\n").map_err(|e| e.to_string())?;
    proc.writer.flush().map_err(|e| e.to_string())
}

fn mcp_request(proc: &mut McpBridgeProcess, method: &str, params: serde_json::Value) -> Result<serde_json::Value, String> {
    use std::io::{BufRead, Write};
    let id = proc.next_id;
    proc.next_id += 1;

    let req = serde_json::json!({ "jsonrpc": "2.0", "id": id, "method": method, "params": params });
    let line = serde_json::to_string(&req).map_err(|e| e.to_string())?;
    proc.writer.write_all(line.as_bytes()).map_err(|e| e.to_string())?;
    proc.writer.write_all(b"\n").map_err(|e| e.to_string())?;
    proc.writer.flush().map_err(|e| e.to_string())?;

    loop {
        let mut buf = String::new();
        let n = proc.reader.read_line(&mut buf).map_err(|e| e.to_string())?;
        if n == 0 { return Err("Atlas MCP process closed connection".to_string()); }
        let trimmed = buf.trim();
        if trimmed.is_empty() { continue; }
        let parsed: serde_json::Value = serde_json::from_str(trimmed)
            .map_err(|e| format!("MCP JSON parse error: {e}"))?;

        if parsed.get("method").is_some() {
            if parsed["method"] == "roots/list" {
                if let Some(rid) = parsed.get("id").cloned() {
                    let resp = serde_json::json!({ "jsonrpc": "2.0", "id": rid, "result": { "roots": [] } });
                    let resp_str = serde_json::to_string(&resp).map_err(|e| e.to_string())?;
                    proc.writer.write_all(resp_str.as_bytes()).map_err(|e| e.to_string())?;
                    proc.writer.write_all(b"\n").map_err(|e| e.to_string())?;
                    proc.writer.flush().map_err(|e| e.to_string())?;
                }
            }
            continue;
        }

        if parsed.get("id") == Some(&serde_json::json!(id)) {
            if let Some(err) = parsed.get("error") {
                return Err(format!("MCP error: {err}"));
            }
            return Ok(parsed.get("result").cloned().unwrap_or(serde_json::Value::Null));
        }
    }
}

fn spawn_atlas_mcp_bridge(app: &tauri::AppHandle, project_path: &str) -> Result<McpBridgeProcess, String> {
    let entry = atlas_resource_dir(app)?
        .join("dist").join("mcp").join("server-entry.js");
    if !entry.exists() {
        return Err(format!("Atlas not bundled at: {}", entry.display()));
    }

    let mut child = new_command(&resolve_node())
        .arg("--liftoff-only")
        .arg(&entry)
        .arg("--path")
        .arg(project_path)
        .current_dir(project_path)
        .stdin(std::process::Stdio::piped())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::null())
        .spawn()
        .map_err(|e| format!("Failed to spawn Atlas MCP bridge: {e}"))?;

    let stdin  = child.stdin.take().ok_or_else(||  "Failed to acquire Atlas MCP stdin".to_string())?;
    let stdout = child.stdout.take().ok_or_else(|| "Failed to acquire Atlas MCP stdout".to_string())?;

    let job = hephaestus::lifecycle_job(child.id()).ok();
    let mut proc = McpBridgeProcess {
        child,
        writer:  std::io::BufWriter::new(stdin),
        reader:  std::io::BufReader::new(stdout),
        next_id: 1,
        _job:    job,
    };

    mcp_request(&mut proc, "initialize", serde_json::json!({
        "protocolVersion": "2024-11-05",
        "capabilities": {},
        "clientInfo": { "name": "tempest", "version": "1.0" }
    }))?;
    mcp_notify(&mut proc, "notifications/initialized", serde_json::json!({}))?;

    Ok(proc)
}

#[tauri::command(async)]
fn atlas_mcp_tools(
    app: tauri::AppHandle,
    state: tauri::State<'_, AtlasMcpState>,
    project_path: String,
) -> Result<String, String> {
    let mut map = state.0.lock().unwrap();

    let dead = map.get_mut(&project_path)
        .map(|p| !matches!(p.child.try_wait(), Ok(None)))
        .unwrap_or(false);
    if dead { map.remove(&project_path); }

    if !map.contains_key(&project_path) {
        let proc = spawn_atlas_mcp_bridge(&app, &project_path)?;
        map.insert(project_path.clone(), proc);
    }

    let proc = map.get_mut(&project_path).unwrap();
    let result = mcp_request(proc, "tools/list", serde_json::json!({}))?;
    let tools = result.get("tools").cloned().unwrap_or(serde_json::Value::Array(vec![]));
    serde_json::to_string(&tools).map_err(|e| e.to_string())
}

#[tauri::command(async)]
fn atlas_mcp_call(
    app: tauri::AppHandle,
    state: tauri::State<'_, AtlasMcpState>,
    project_path: String,
    tool_name: String,
    args_json: String,
) -> Result<String, String> {
    let args: serde_json::Value = serde_json::from_str(&args_json)
        .unwrap_or(serde_json::json!({}));

    let mut map = state.0.lock().unwrap();

    let dead = map.get_mut(&project_path)
        .map(|p| !matches!(p.child.try_wait(), Ok(None)))
        .unwrap_or(false);
    if dead { map.remove(&project_path); }

    if !map.contains_key(&project_path) {
        let proc = spawn_atlas_mcp_bridge(&app, &project_path)?;
        map.insert(project_path.clone(), proc);
    }

    let proc = map.get_mut(&project_path).unwrap();
    let result = mcp_request(proc, "tools/call", serde_json::json!({
        "name": tool_name,
        "arguments": args,
    }))?;
    serde_json::to_string(&result).map_err(|e| e.to_string())
}

#[tauri::command(async)]
fn git_ls_files(path: String) -> Result<Vec<String>, String> {
    let out = new_command("git")
        .args(["ls-files"])
        .current_dir(&path)
        .output()
        .map_err(|e| format!("Failed to run git ls-files: {e}"))?;
    if !out.status.success() {
        return Err(String::from_utf8_lossy(&out.stderr).trim().to_string());
    }
    Ok(String::from_utf8_lossy(&out.stdout)
        .lines()
        .filter(|l| !l.is_empty())
        .map(|l| l.to_string())
        .collect())
}

// ── SQLite ───────────────────────────────────────────────────────────────────

const DB_SCHEMA: &str = "
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS projects (
  id             TEXT PRIMARY KEY,
  name           TEXT NOT NULL,
  path           TEXT NOT NULL UNIQUE,
  expanded       INTEGER NOT NULL DEFAULT 1,
  worktree_order TEXT,                       -- JSON array of worktree paths (user drag order)
  atlas_indexed  INTEGER NOT NULL DEFAULT 0, -- Token Intelligence index decision
  created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  last_opened_at TEXT,
  archived_at    TEXT
);

CREATE TABLE IF NOT EXISTS branches (
  id           TEXT PRIMARY KEY,
  project_id   TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  path         TEXT NOT NULL UNIQUE,
  created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  last_opened_at TEXT,
  UNIQUE(project_id, name)
);
CREATE INDEX IF NOT EXISTS idx_branches_project_id ON branches(project_id);

CREATE TABLE IF NOT EXISTS sessions (
  id                TEXT PRIMARY KEY,
  project_id        TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  branch_id         TEXT REFERENCES branches(id) ON DELETE CASCADE,
  parent_session_id TEXT REFERENCES sessions(id) ON DELETE SET NULL,
  name              TEXT NOT NULL,
  agent             TEXT,
  conversation_id   TEXT,
  no_git            INTEGER NOT NULL DEFAULT 0,
  state             TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(state IN ('ACTIVE', 'CLOSED')),
  -- Where the session's terminal lives: 'tab' = the top tab bar (default), 'canvas'
  -- = a Threads canvas agent/terminal node. Canvas sessions are excluded from the
  -- startup tab-restore sweep and resumed lazily when their canvas opens.
  placement         TEXT NOT NULL DEFAULT 'tab',
  created_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  last_active_at    TEXT,
  archived_at       TEXT
);
CREATE INDEX IF NOT EXISTS idx_sessions_project_state ON sessions(project_id, state);
CREATE INDEX IF NOT EXISTS idx_sessions_branch_id    ON sessions(branch_id);
CREATE INDEX IF NOT EXISTS idx_sessions_parent_id    ON sessions(parent_session_id);

CREATE TABLE IF NOT EXISTS layouts (
  id         TEXT PRIMARY KEY,
  project_id TEXT NOT NULL UNIQUE REFERENCES projects(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS layout_nodes (
  id          TEXT PRIMARY KEY,
  layout_id   TEXT NOT NULL REFERENCES layouts(id) ON DELETE CASCADE,
  parent_id   TEXT REFERENCES layout_nodes(id) ON DELETE CASCADE,
  type        TEXT NOT NULL CHECK(type IN ('SPLIT', 'SESSION')),
  direction   TEXT CHECK(direction IN ('HORIZONTAL', 'VERTICAL')),
  session_id  TEXT REFERENCES sessions(id) ON DELETE CASCADE,
  order_index INTEGER NOT NULL,
  size        REAL,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS idx_layout_nodes_layout_id  ON layout_nodes(layout_id);
CREATE INDEX IF NOT EXISTS idx_layout_nodes_session_id ON layout_nodes(session_id);

CREATE TABLE IF NOT EXISTS recents (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  path        TEXT NOT NULL UNIQUE,
  last_opened TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS tabs (
  id          TEXT PRIMARY KEY,
  project_id  TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  kind        TEXT NOT NULL,                 -- diff | preview | editor | thread
  cwd         TEXT NOT NULL DEFAULT '',
  name        TEXT NOT NULL,
  preview_url TEXT,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS idx_tabs_project_id ON tabs(project_id);

CREATE TABLE IF NOT EXISTS app_state (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL                        -- JSON-encoded preference value
);

-- ── Threads (canvas chat) — see claude-docs/threads-plan.md ──────────────────
-- One canvas, listed directly under a project in the sidebar Threads dropdown.
CREATE TABLE IF NOT EXISTS threads (
  id          TEXT PRIMARY KEY,
  project_id  TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  viewport    TEXT,                          -- JSON {x,y,zoom} camera state
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  last_opened_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_threads_project ON threads(project_id);

-- A node on a canvas.
CREATE TABLE IF NOT EXISTS thread_nodes (
  id          TEXT PRIMARY KEY,
  thread_id   TEXT NOT NULL REFERENCES threads(id) ON DELETE CASCADE,
  kind        TEXT NOT NULL,                 -- 'chat' | 'text' | 'agent' | 'terminal'
  x           REAL NOT NULL,
  y           REAL NOT NULL,
  width       REAL,
  height      REAL,
  branch_id   TEXT REFERENCES branches(id) ON DELETE SET NULL,  -- execution binding; NULL = thinking node
  session_id  TEXT REFERENCES sessions(id) ON DELETE SET NULL,  -- agent/terminal nodes: the real PTY session
  data        TEXT,                          -- JSON: node-kind-specific
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS idx_thread_nodes_thread ON thread_nodes(thread_id);

-- Messages for chat nodes. Keyed by node, not project.
CREATE TABLE IF NOT EXISTS thread_messages (
  id          TEXT PRIMARY KEY,
  node_id     TEXT NOT NULL REFERENCES thread_nodes(id) ON DELETE CASCADE,
  role        TEXT NOT NULL,                 -- 'user' | 'assistant'
  parts       TEXT NOT NULL,                 -- JSON MessagePart[]
  seq         INTEGER NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS idx_thread_messages ON thread_messages(node_id, seq);

-- Directed connections between nodes on a canvas. source feeds context into target.
CREATE TABLE IF NOT EXISTS thread_edges (
  id             TEXT PRIMARY KEY,
  thread_id      TEXT NOT NULL REFERENCES threads(id) ON DELETE CASCADE,
  source         TEXT NOT NULL REFERENCES thread_nodes(id) ON DELETE CASCADE,
  target         TEXT NOT NULL REFERENCES thread_nodes(id) ON DELETE CASCADE,
  source_handle  TEXT,
  target_handle  TEXT,
  created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS idx_thread_edges_thread ON thread_edges(thread_id);

-- ── Automations ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS automations (
  id           TEXT PRIMARY KEY,
  project_id   TEXT REFERENCES projects(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  agent        TEXT NOT NULL DEFAULT 'claude-code',
  schedule     TEXT NOT NULL DEFAULT 'FREQ=DAILY;BYHOUR=9;BYMINUTE=0;BYSECOND=0',
  prompt       TEXT NOT NULL DEFAULT '',
  model        TEXT,
  enabled      INTEGER NOT NULL DEFAULT 1,
  next_run_at  TEXT,
  created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS idx_automations_project ON automations(project_id);

CREATE TABLE IF NOT EXISTS automation_runs (
  id            TEXT PRIMARY KEY,
  automation_id TEXT NOT NULL REFERENCES automations(id) ON DELETE CASCADE,
  status        TEXT NOT NULL DEFAULT 'dispatching',
  triggered_by  TEXT NOT NULL DEFAULT 'scheduler',
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS idx_automation_runs_automation ON automation_runs(automation_id);

CREATE TABLE IF NOT EXISTS automation_prompt_versions (
  id            TEXT PRIMARY KEY,
  automation_id TEXT NOT NULL REFERENCES automations(id) ON DELETE CASCADE,
  prompt        TEXT NOT NULL,
  source        TEXT NOT NULL DEFAULT 'edit',
  bucket_at     TEXT NOT NULL,
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_automation_prompt_versions_bucket
  ON automation_prompt_versions(automation_id, bucket_at);

CREATE TABLE IF NOT EXISTS notes (
  id         TEXT PRIMARY KEY,
  title      TEXT,
  body       TEXT NOT NULL DEFAULT '',
  scope      TEXT NOT NULL DEFAULT 'global',
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_notes_updated ON notes(updated_at DESC);
";

fn init_db(handle: &tauri::AppHandle) -> Result<rusqlite::Connection, String> {
    use tauri::Manager;
    let dir = handle.path().app_data_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let conn = rusqlite::Connection::open(dir.join("tempest.db")).map_err(|e| e.to_string())?;
    // Drop any pre-new-schema automations table BEFORE running the schema batch,
    // otherwise `CREATE INDEX ... ON automations(project_id)` blows up when the
    // existing table lacks that column. Trigger on any table missing project_id
    // (covers the old Eve 'slug' schema and any other stale shape).
    let automations_exists: bool = conn.query_row(
        "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='automations'",
        [],
        |r| r.get::<_, i64>(0),
    ).unwrap_or(0) > 0;
    if automations_exists {
        let has_project_id: bool = conn.query_row(
            "SELECT COUNT(*) FROM pragma_table_info('automations') WHERE name = 'project_id'",
            [],
            |r| r.get::<_, i64>(0),
        ).unwrap_or(0) > 0;
        if !has_project_id {
            let _ = conn.execute_batch("PRAGMA foreign_keys = OFF;");
            let _ = conn.execute_batch("
                BEGIN;
                DROP TABLE IF EXISTS automation_processes;
                DROP TABLE IF EXISTS automation_prompt_versions;
                DROP TABLE IF EXISTS automation_runs;
                DROP TABLE IF EXISTS automations;
                COMMIT;
            ");
            let _ = conn.execute_batch("PRAGMA foreign_keys = ON;");
        }
    }

    conn.execute_batch(DB_SCHEMA).map_err(|e| e.to_string())?;
    // Best-effort column adds for DBs created before the column existed
    // (CREATE TABLE IF NOT EXISTS never alters an existing table). The dup-column
    // error on already-migrated DBs is expected and ignored.
    let _ = conn.execute("ALTER TABLE sessions ADD COLUMN placement TEXT NOT NULL DEFAULT 'tab'", []);
    let _ = conn.execute("ALTER TABLE automations ADD COLUMN model TEXT", []);
    Ok(conn)
}

// ── SQLite: session persistence commands ─────────────────────────────────────
// Phase 1 of the JSON→SQLite migration (docs/session-migration-to-sql.md).
// The frontend keeps a synchronous in-memory mirror (src/store/sessions.ts) and
// hydrates it once via `db_load`; every mutation writes through these commands.

#[derive(serde::Serialize, serde::Deserialize, Clone)]
pub struct DbProject {
    pub id:             String,
    pub name:           String,
    pub path:           String,
    pub expanded:       bool,
    #[serde(rename = "worktreeOrder")]
    pub worktree_order: Option<String>, // JSON array
    #[serde(rename = "atlasIndexed")]
    pub atlas_indexed:  bool,
}

#[derive(serde::Serialize, serde::Deserialize, Clone)]
pub struct DbBranch {
    pub id:         String,
    #[serde(rename = "projectId")]
    pub project_id: String,
    pub name:       String,
    pub path:       String,
}

fn placement_tab() -> String { "tab".to_string() }

#[derive(serde::Serialize, serde::Deserialize, Clone)]
pub struct DbSession {
    pub id:                String,
    #[serde(rename = "projectId")]
    pub project_id:        String,
    #[serde(rename = "branchId")]
    pub branch_id:         Option<String>,
    #[serde(rename = "parentSessionId")]
    pub parent_session_id: Option<String>,
    pub name:              String,
    pub agent:             Option<String>,
    #[serde(rename = "conversationId")]
    pub conversation_id:   Option<String>,
    #[serde(rename = "noGit")]
    pub no_git:            bool,
    pub closed:            bool,
    // 'tab' (default) or 'canvas' — see the sessions table comment.
    #[serde(default = "placement_tab")]
    pub placement:        String,
    // Stable creation stamp — the sidebar orders rows by it so a session never
    // moves when it is closed and re-opened. Written once on INSERT.
    #[serde(rename = "createdAt", default)]
    pub created_at:        String,
}

#[derive(serde::Serialize)]
pub struct DbSnapshot {
    pub projects: Vec<DbProject>,
    pub branches: Vec<DbBranch>,
    pub sessions: Vec<DbSession>,
}

// Read the entire persisted graph for the in-memory mirror. Archived rows are
// excluded (archiving is a future phase; the column exists but is never set yet).
#[tauri::command(async)]
fn db_load(state: tauri::State<'_, DbState>) -> Result<DbSnapshot, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;

    let projects = conn
        .prepare(
            "SELECT id, name, path, expanded, worktree_order, atlas_indexed \
             FROM projects WHERE archived_at IS NULL",
        )
        .and_then(|mut stmt| {
            stmt.query_map([], |r| {
                Ok(DbProject {
                    id:             r.get(0)?,
                    name:           r.get(1)?,
                    path:           r.get(2)?,
                    expanded:       r.get(3)?,
                    worktree_order: r.get(4)?,
                    atlas_indexed:  r.get(5)?,
                })
            })?
            .collect::<Result<Vec<_>, _>>()
        })
        .map_err(|e| e.to_string())?;

    let branches = conn
        .prepare("SELECT id, project_id, name, path FROM branches")
        .and_then(|mut stmt| {
            stmt.query_map([], |r| {
                Ok(DbBranch { id: r.get(0)?, project_id: r.get(1)?, name: r.get(2)?, path: r.get(3)? })
            })?
            .collect::<Result<Vec<_>, _>>()
        })
        .map_err(|e| e.to_string())?;

    let sessions = conn
        .prepare(
            "SELECT id, project_id, branch_id, parent_session_id, name, agent, conversation_id, no_git, state, placement, created_at \
             FROM sessions WHERE archived_at IS NULL",
        )
        .and_then(|mut stmt| {
            stmt.query_map([], |r| {
                Ok(DbSession {
                    id:                r.get(0)?,
                    project_id:        r.get(1)?,
                    branch_id:         r.get(2)?,
                    parent_session_id: r.get(3)?,
                    name:              r.get(4)?,
                    agent:             r.get(5)?,
                    conversation_id:   r.get(6)?,
                    no_git:            r.get(7)?,
                    closed:            r.get::<_, String>(8)? == "CLOSED",
                    placement:         r.get(9)?,
                    created_at:        r.get(10)?,
                })
            })?
            .collect::<Result<Vec<_>, _>>()
        })
        .map_err(|e| e.to_string())?;

    Ok(DbSnapshot { projects, branches, sessions })
}

// All writes use `ON CONFLICT(id) DO UPDATE` — never `INSERT OR REPLACE`, which
// would delete-then-reinsert the row and fire ON DELETE cascades on children
// (nulling sub-sessions' parent_session_id, or wiping a project's sessions).

// Create a project row if absent, never clobbering fields owned by the projects
// store (expanded, worktree_order, …). Used by the session write path to
// guarantee the FK parent exists regardless of write ordering.
#[tauri::command(async)]
fn db_ensure_project(app: tauri::AppHandle, state: tauri::State<'_, DbState>, id: String, name: String, path: String) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO projects (id, name, path) VALUES (?1, ?2, ?3) ON CONFLICT(id) DO NOTHING",
        rusqlite::params![id, name, path],
    )
    .map_err(|e| e.to_string())?;
    allow_project_asset_scope(&app, &path);
    Ok(())
}

// Full project upsert owned by the projects store.
#[tauri::command(async)]
fn db_upsert_project(app: tauri::AppHandle, state: tauri::State<'_, DbState>, project: DbProject) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    // atlas_indexed is intentionally NOT written here — it is owned by the atlas
    // decision store, and this list-level upsert must not reset it.
    conn.execute(
        "INSERT INTO projects (id, name, path, expanded, worktree_order, last_opened_at) \
         VALUES (?1, ?2, ?3, ?4, ?5, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) \
         ON CONFLICT(id) DO UPDATE SET name = excluded.name, path = excluded.path, \
           expanded = excluded.expanded, worktree_order = excluded.worktree_order, \
           updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')",
        rusqlite::params![
            project.id, project.name, project.path,
            project.expanded, project.worktree_order,
        ],
    )
    .map_err(|e| e.to_string())?;
    allow_project_asset_scope(&app, &project.path);
    Ok(())
}

#[tauri::command(async)]
fn db_set_project_atlas_indexed(state: tauri::State<'_, DbState>, id: String, indexed: bool) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    conn.execute("UPDATE projects SET atlas_indexed = ?2 WHERE id = ?1", rusqlite::params![id, indexed])
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command(async)]
fn db_upsert_branch(app: tauri::AppHandle, state: tauri::State<'_, DbState>, branch: DbBranch) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO branches (id, project_id, name, path) VALUES (?1, ?2, ?3, ?4) \
         ON CONFLICT(id) DO UPDATE SET project_id = excluded.project_id, name = excluded.name, \
         path = excluded.path, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')",
        rusqlite::params![branch.id, branch.project_id, branch.name, branch.path],
    )
    .map_err(|e| e.to_string())?;
    allow_project_asset_scope(&app, &branch.path);
    Ok(())
}

#[tauri::command(async)]
fn db_upsert_session(state: tauri::State<'_, DbState>, session: DbSession) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let db_state = if session.closed { "CLOSED" } else { "ACTIVE" };
    conn.execute(
        // created_at is set on INSERT only (falling back to now when the caller
        // sends none) and deliberately left alone by the UPDATE branch — it is
        // the sidebar's ordering key and must survive close/re-open.
        "INSERT INTO sessions \
           (id, project_id, branch_id, parent_session_id, name, agent, conversation_id, no_git, state, placement, created_at) \
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, \
                 COALESCE(NULLIF(?11, ''), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))) \
         ON CONFLICT(id) DO UPDATE SET \
           project_id = excluded.project_id, branch_id = excluded.branch_id, \
           parent_session_id = excluded.parent_session_id, name = excluded.name, \
           agent = excluded.agent, conversation_id = excluded.conversation_id, \
           no_git = excluded.no_git, state = excluded.state, placement = excluded.placement, \
           updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')",
        rusqlite::params![
            session.id,
            session.project_id,
            session.branch_id,
            session.parent_session_id,
            session.name,
            session.agent,
            session.conversation_id,
            session.no_git,
            db_state,
            session.placement,
            session.created_at,
        ],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command(async)]
fn db_delete_session(state: tauri::State<'_, DbState>, id: String) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM sessions WHERE id = ?1", rusqlite::params![id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command(async)]
fn db_delete_branch(state: tauri::State<'_, DbState>, id: String) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM branches WHERE id = ?1", rusqlite::params![id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command(async)]
fn db_delete_project(state: tauri::State<'_, DbState>, id: String) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM projects WHERE id = ?1", rusqlite::params![id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

// Delete every session whose id is not in `valid_ids` (the startup orphan sweep).
// An empty list clears all sessions, matching `DELETE FROM sessions`.
#[tauri::command(async)]
fn db_prune_sessions(state: tauri::State<'_, DbState>, valid_ids: Vec<String>) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    if valid_ids.is_empty() {
        conn.execute("DELETE FROM sessions", []).map_err(|e| e.to_string())?;
        return Ok(());
    }
    let placeholders = std::iter::repeat("?").take(valid_ids.len()).collect::<Vec<_>>().join(",");
    let sql = format!("DELETE FROM sessions WHERE id NOT IN ({placeholders})");
    conn.execute(
        &sql,
        rusqlite::params_from_iter(valid_ids.iter()),
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

// ── Recents ──────────────────────────────────────────────────────────────────

#[derive(serde::Serialize, serde::Deserialize)]
pub struct DbRecent {
    pub id:          String,
    pub name:        String,
    pub path:        String,
    #[serde(rename = "lastOpened")]
    pub last_opened: String,
}

#[tauri::command(async)]
fn db_load_recents(state: tauri::State<'_, DbState>) -> Result<Vec<DbRecent>, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    conn.prepare("SELECT id, name, path, last_opened FROM recents ORDER BY last_opened DESC")
        .and_then(|mut stmt| {
            stmt.query_map([], |r| {
                Ok(DbRecent { id: r.get(0)?, name: r.get(1)?, path: r.get(2)?, last_opened: r.get(3)? })
            })?
            .collect::<Result<Vec<_>, _>>()
        })
        .map_err(|e| e.to_string())
}

#[tauri::command(async)]
fn db_upsert_recent(state: tauri::State<'_, DbState>, recent: DbRecent) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO recents (id, name, path, last_opened) VALUES (?1, ?2, ?3, ?4) \
         ON CONFLICT(path) DO UPDATE SET name = excluded.name, last_opened = excluded.last_opened",
        rusqlite::params![recent.id, recent.name, recent.path, recent.last_opened],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command(async)]
fn db_delete_recent(state: tauri::State<'_, DbState>, path: String) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM recents WHERE path = ?1", rusqlite::params![path])
        .map_err(|e| e.to_string())?;
    Ok(())
}

// ── Tabs (non-terminal: diff / preview / editor / chat) ──────────────────────

#[derive(serde::Serialize, serde::Deserialize)]
pub struct DbTab {
    pub id:         String,
    #[serde(rename = "projectId")]
    pub project_id: String,
    pub kind:       String,
    pub cwd:        String,
    pub name:       String,
    #[serde(rename = "previewUrl")]
    pub preview_url: Option<String>,
}

#[tauri::command(async)]
fn db_load_tabs(state: tauri::State<'_, DbState>) -> Result<Vec<DbTab>, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    conn.prepare("SELECT id, project_id, kind, cwd, name, preview_url FROM tabs ORDER BY created_at")
        .and_then(|mut stmt| {
            stmt.query_map([], |r| {
                Ok(DbTab {
                    id: r.get(0)?, project_id: r.get(1)?, kind: r.get(2)?,
                    cwd: r.get(3)?, name: r.get(4)?, preview_url: r.get(5)?,
                })
            })?
            .collect::<Result<Vec<_>, _>>()
        })
        .map_err(|e| e.to_string())
}

#[tauri::command(async)]
fn db_upsert_tab(state: tauri::State<'_, DbState>, tab: DbTab) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO tabs (id, project_id, kind, cwd, name, preview_url) VALUES (?1, ?2, ?3, ?4, ?5, ?6) \
         ON CONFLICT(id) DO UPDATE SET project_id = excluded.project_id, kind = excluded.kind, \
           cwd = excluded.cwd, name = excluded.name, preview_url = excluded.preview_url",
        rusqlite::params![tab.id, tab.project_id, tab.kind, tab.cwd, tab.name, tab.preview_url],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command(async)]
fn db_delete_tab(state: tauri::State<'_, DbState>, id: String) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM tabs WHERE id = ?1", rusqlite::params![id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

// ── App state (key/value preferences) ────────────────────────────────────────

#[tauri::command(async)]
fn db_load_app_state(state: tauri::State<'_, DbState>) -> Result<Vec<(String, String)>, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    conn.prepare("SELECT key, value FROM app_state")
        .and_then(|mut stmt| {
            stmt.query_map([], |r| Ok((r.get(0)?, r.get(1)?)))?
                .collect::<Result<Vec<_>, _>>()
        })
        .map_err(|e| e.to_string())
}

#[tauri::command(async)]
fn db_set_app_state(state: tauri::State<'_, DbState>, key: String, value: String) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO app_state (key, value) VALUES (?1, ?2) \
         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        rusqlite::params![key, value],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

// ── Threads (canvas chat) — see claude-docs/threads-plan.md ───────────────────

#[derive(serde::Serialize, serde::Deserialize)]
pub struct DbThread {
    pub id:         String,
    #[serde(rename = "projectId")]
    pub project_id: String,
    pub name:       String,
    pub viewport:   Option<String>,
    #[serde(rename = "sortOrder", default)]
    pub sort_order: i64,
}

#[derive(serde::Serialize, serde::Deserialize)]
pub struct DbThreadNode {
    pub id:         String,
    #[serde(rename = "threadId")]
    pub thread_id:  String,
    pub kind:       String,
    pub x:          f64,
    pub y:          f64,
    pub width:      Option<f64>,
    pub height:     Option<f64>,
    #[serde(rename = "branchId")]
    pub branch_id:  Option<String>,
    #[serde(rename = "sessionId")]
    pub session_id: Option<String>,
    pub data:       Option<String>,
}

#[derive(serde::Serialize, serde::Deserialize)]
pub struct DbThreadMessage {
    pub id:    String,
    pub role:  String,
    pub parts: String, // JSON MessagePart[]
}

#[derive(serde::Serialize, serde::Deserialize)]
pub struct DbThreadEdge {
    pub id:        String,
    #[serde(rename = "threadId")]
    pub thread_id: String,
    pub source:    String,
    pub target:    String,
    #[serde(rename = "sourceHandle")]
    pub source_handle: Option<String>,
    #[serde(rename = "targetHandle")]
    pub target_handle: Option<String>,
}

#[tauri::command(async)]
fn db_list_threads(state: tauri::State<'_, DbState>, project_id: String) -> Result<Vec<DbThread>, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    conn.prepare(
        "SELECT id, project_id, name, viewport, sort_order FROM threads \
         WHERE project_id = ?1 ORDER BY sort_order, created_at",
    )
    .and_then(|mut stmt| {
        stmt.query_map(rusqlite::params![project_id], |r| {
            Ok(DbThread {
                id: r.get(0)?, project_id: r.get(1)?, name: r.get(2)?,
                viewport: r.get(3)?, sort_order: r.get(4)?,
            })
        })?
        .collect::<Result<Vec<_>, _>>()
    })
    .map_err(|e| e.to_string())
}

#[tauri::command(async)]
fn db_upsert_thread(state: tauri::State<'_, DbState>, thread: DbThread) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO threads (id, project_id, name, viewport, sort_order) VALUES (?1, ?2, ?3, ?4, ?5) \
         ON CONFLICT(id) DO UPDATE SET name = excluded.name, viewport = excluded.viewport, \
           sort_order = excluded.sort_order, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')",
        rusqlite::params![thread.id, thread.project_id, thread.name, thread.viewport, thread.sort_order],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command(async)]
fn db_delete_thread(state: tauri::State<'_, DbState>, id: String) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM threads WHERE id = ?1", rusqlite::params![id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command(async)]
fn db_list_thread_nodes(state: tauri::State<'_, DbState>, thread_id: String) -> Result<Vec<DbThreadNode>, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    conn.prepare(
        "SELECT id, thread_id, kind, x, y, width, height, branch_id, session_id, data \
         FROM thread_nodes WHERE thread_id = ?1 ORDER BY created_at",
    )
    .and_then(|mut stmt| {
        stmt.query_map(rusqlite::params![thread_id], |r| {
            Ok(DbThreadNode {
                id: r.get(0)?, thread_id: r.get(1)?, kind: r.get(2)?,
                x: r.get(3)?, y: r.get(4)?, width: r.get(5)?, height: r.get(6)?,
                branch_id: r.get(7)?, session_id: r.get(8)?, data: r.get(9)?,
            })
        })?
        .collect::<Result<Vec<_>, _>>()
    })
    .map_err(|e| e.to_string())
}

#[tauri::command(async)]
fn db_upsert_thread_node(state: tauri::State<'_, DbState>, node: DbThreadNode) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO thread_nodes (id, thread_id, kind, x, y, width, height, branch_id, session_id, data) \
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10) \
         ON CONFLICT(id) DO UPDATE SET kind = excluded.kind, x = excluded.x, y = excluded.y, \
           width = excluded.width, height = excluded.height, branch_id = excluded.branch_id, \
           session_id = excluded.session_id, data = excluded.data, \
           updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')",
        rusqlite::params![
            node.id, node.thread_id, node.kind, node.x, node.y, node.width, node.height,
            node.branch_id, node.session_id, node.data,
        ],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command(async)]
fn db_delete_thread_node(state: tauri::State<'_, DbState>, id: String) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM thread_nodes WHERE id = ?1", rusqlite::params![id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command(async)]
fn db_load_thread_messages(state: tauri::State<'_, DbState>, node_id: String) -> Result<Vec<DbThreadMessage>, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    conn.prepare("SELECT id, role, parts FROM thread_messages WHERE node_id = ?1 ORDER BY seq")
        .and_then(|mut stmt| {
            stmt.query_map(rusqlite::params![node_id], |r| {
                Ok(DbThreadMessage { id: r.get(0)?, role: r.get(1)?, parts: r.get(2)? })
            })?
            .collect::<Result<Vec<_>, _>>()
        })
        .map_err(|e| e.to_string())
}

// Replace a node's entire conversation in one transaction.
#[tauri::command(async)]
fn db_replace_thread_messages(state: tauri::State<'_, DbState>, node_id: String, messages: Vec<DbThreadMessage>) -> Result<(), String> {
    let mut conn = state.0.lock().map_err(|e| e.to_string())?;
    let tx = conn.transaction().map_err(|e| e.to_string())?;
    tx.execute("DELETE FROM thread_messages WHERE node_id = ?1", rusqlite::params![node_id])
        .map_err(|e| e.to_string())?;
    for (seq, m) in messages.iter().enumerate() {
        tx.execute(
            "INSERT INTO thread_messages (id, node_id, role, parts, seq) VALUES (?1, ?2, ?3, ?4, ?5)",
            rusqlite::params![m.id, node_id, m.role, m.parts, seq as i64],
        )
        .map_err(|e| e.to_string())?;
    }
    tx.commit().map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command(async)]
fn db_list_thread_edges(state: tauri::State<'_, DbState>, thread_id: String) -> Result<Vec<DbThreadEdge>, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    conn.prepare(
        "SELECT id, thread_id, source, target, source_handle, target_handle \
         FROM thread_edges WHERE thread_id = ?1 ORDER BY created_at",
    )
    .and_then(|mut stmt| {
        stmt.query_map(rusqlite::params![thread_id], |r| {
            Ok(DbThreadEdge {
                id: r.get(0)?, thread_id: r.get(1)?, source: r.get(2)?, target: r.get(3)?,
                source_handle: r.get(4)?, target_handle: r.get(5)?,
            })
        })?
        .collect::<Result<Vec<_>, _>>()
    })
    .map_err(|e| e.to_string())
}

#[tauri::command(async)]
fn db_upsert_thread_edge(state: tauri::State<'_, DbState>, edge: DbThreadEdge) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO thread_edges (id, thread_id, source, target, source_handle, target_handle) \
         VALUES (?1, ?2, ?3, ?4, ?5, ?6) \
         ON CONFLICT(id) DO UPDATE SET source = excluded.source, target = excluded.target, \
           source_handle = excluded.source_handle, target_handle = excluded.target_handle",
        rusqlite::params![
            edge.id, edge.thread_id, edge.source, edge.target, edge.source_handle, edge.target_handle,
        ],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command(async)]
fn db_delete_thread_edge(state: tauri::State<'_, DbState>, id: String) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM thread_edges WHERE id = ?1", rusqlite::params![id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

/// Resolve `node` to an absolute path on macOS, where GUI-launched apps inherit
/// `/usr/bin:/bin:/usr/sbin:/sbin` (no /opt/homebrew, no /usr/local/bin, no
/// nvm/volta/fnm shims), which makes `Command::new("node").spawn()` fail with
/// `os error 2`. See issue #36. Cascade: current PATH → login shell → known
/// install locations. Cached for the process lifetime. Non-macOS: bare "node".
#[cfg(target_os = "macos")]
fn last_existing_shell_path(stdout: &[u8]) -> Option<String> {
    String::from_utf8_lossy(stdout)
        .lines()
        .rev()
        .map(str::trim)
        .find(|s| !s.is_empty() && std::path::Path::new(s).is_file())
        .map(str::to_string)
}

fn resolve_node() -> String {
    #[cfg(not(target_os = "macos"))]
    { "node".to_string() }
    #[cfg(target_os = "macos")]
    {
        use std::sync::OnceLock;
        static CACHED: OnceLock<String> = OnceLock::new();
        CACHED.get_or_init(|| {
            if let Ok(path) = std::env::var("PATH") {
                for dir in path.split(':').filter(|s| !s.is_empty()) {
                    let candidate = std::path::Path::new(dir).join("node");
                    if candidate.is_file() {
                        return candidate.to_string_lossy().into_owned();
                    }
                }
            }
            // NVM and other version managers are usually initialised by the
            // user's interactive shell config (for example ~/.zshrc), so use
            // their configured shell instead of /bin/sh.
            let shell = std::env::var("SHELL")
                .ok()
                .filter(|s| std::path::Path::new(s).is_file())
                .unwrap_or_else(|| "/bin/zsh".to_string());
            if let Ok(out) = new_detached_command(&shell)
                .args(["-lic", "command -v node"])
                .output()
            {
                if out.status.success() {
                    // Shell startup files may print banners. `command -v node`
                    // is the final command, so take the last valid path.
                    if let Some(path) = last_existing_shell_path(&out.stdout) {
                        return path;
                    }
                }
            }
            for p in ["/opt/homebrew/bin/node", "/usr/local/bin/node"] {
                if std::path::Path::new(p).is_file() {
                    return p.to_string();
                }
            }
            // ponytail: fall back to bare "node" — spawn will error clearly.
            "node".to_string()
        }).clone()
    }
}

#[cfg(all(test, target_os = "macos"))]
mod resolve_node_tests {
    #[test]
    fn shell_path_ignores_startup_output() {
        let executable = std::env::current_exe().unwrap();
        let output = format!("shell startup banner\n{}\n", executable.display());

        assert_eq!(
            super::last_existing_shell_path(output.as_bytes()),
            Some(executable.to_string_lossy().into_owned())
        );
    }
}

/// Build a `Command` that never opens a console window on Windows.
/// On every other platform this is identical to `std::process::Command::new`.
pub(crate) fn new_command(program: &str) -> std::process::Command {
    #[cfg(windows)]
    {
        let mut cmd = std::process::Command::new(program);
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        cmd.creation_flags(CREATE_NO_WINDOW);
        cmd
    }
    #[cfg(not(windows))]
    {
        std::process::Command::new(program)
    }
}

/// Build a `Command` for a probe whose output we capture, detached from any
/// controlling terminal.
///
/// We run these probes through an *interactive* login shell (`-lic`) so they see
/// PATH entries that only `~/.bashrc` / `~/.zshrc` set up — nvm, asdf, mise. The
/// `-i` is load-bearing, but it also makes the shell run bash's job-control
/// initialisation, which loops
///
/// ```text
/// while (tcgetpgrp(tty) != getpgrp()) kill(-getpgrp(), SIGTTIN);
/// ```
///
/// until its process group owns the terminal. Launched from a terminal, the probe
/// inherits Tempest's controlling terminal but is never that terminal's foreground
/// group — so it stops *itself* and never resumes, wedging the app's whole process
/// group. The window comes up white and will not close (Linux; on macOS the app is
/// usually launched from Finder with no controlling terminal, which is why this
/// stayed hidden).
///
/// `setsid()` puts the child in a fresh session with no controlling terminal, so
/// bash's fallback `open("/dev/tty")` fails, job control is disabled, and the probe
/// simply runs. Interactive rc files are still sourced — that part depends on `-i`,
/// not on owning a tty.
///
/// PTY-backed spawns (terminal panes, agent launches) intentionally keep their
/// controlling terminal and must NOT use this.
#[cfg(unix)]
fn new_detached_command(program: &str) -> std::process::Command {
    use std::os::unix::process::CommandExt;
    let mut cmd = new_command(program);
    unsafe {
        // SAFETY: runs in the forked child between fork and exec, where only
        // async-signal-safe calls are legal. `setsid` is async-signal-safe and
        // touches nothing but the child's own session and process group.
        // A failure here (EPERM if the child were already a group leader) is
        // non-fatal: the probe still runs, it just keeps the old behaviour.
        cmd.pre_exec(|| {
            libc::setsid();
            Ok(())
        });
    }
    cmd
}

#[cfg(all(test, unix))]
mod detached_command_tests {
    // Waits for `pid` to reach its post-exec session, returning that sid.
    fn settled_sid(pid: libc::pid_t) -> libc::pid_t {
        let mut last = -1;
        for _ in 0..200 {
            let sid = unsafe { libc::getsid(pid) };
            if sid != -1 {
                last = sid;
                // A detached child becomes its own session leader (sid == pid);
                // stop as soon as that lands so the test isn't timing-flaky.
                if sid == pid {
                    return sid;
                }
            }
            std::thread::sleep(std::time::Duration::from_millis(10));
        }
        last
    }

    #[test]
    fn detached_child_leaves_our_session() {
        // The point of new_detached_command: the child must leave our session, so
        // an interactive shell finds no controlling terminal, skips bash's
        // job-control handshake, and cannot stop itself waiting for a foreground
        // process group it will never be given.
        let mut child = super::new_detached_command("sh")
            .args(["-c", "sleep 5"])
            .spawn()
            .expect("spawn sh");
        let pid = child.id() as libc::pid_t;
        let child_sid = settled_sid(pid);
        let our_sid = unsafe { libc::getsid(0) };
        let _ = child.kill();
        let _ = child.wait();

        assert_eq!(child_sid, pid, "detached child should lead its own session");
        assert_ne!(child_sid, our_sid, "detached child must not share our session");
    }

    #[test]
    fn plain_child_stays_in_our_session() {
        // The contrast case, and a guard against over-applying the fix: plain
        // new_command must keep inheriting our session. PTY-backed spawns
        // (terminal panes, agent launches) need their controlling terminal.
        let mut child = super::new_command("sh")
            .args(["-c", "sleep 5"])
            .spawn()
            .expect("spawn sh");
        let pid = child.id() as libc::pid_t;
        std::thread::sleep(std::time::Duration::from_millis(100));
        let child_sid = unsafe { libc::getsid(pid) };
        let our_sid = unsafe { libc::getsid(0) };
        let _ = child.kill();
        let _ = child.wait();

        assert_eq!(child_sid, our_sid, "new_command must not detach the child");
    }

    #[test]
    fn interactive_login_probe_terminates() {
        // End-to-end: the exact shape that wedged the app. Without setsid this
        // stops on SIGTTIN/SIGTTOU whenever the launching process owns a terminal,
        // and `.output()` blocks forever instead of returning.
        super::new_detached_command("sh")
            .args(["-lic", "command -v sh >/dev/null 2>&1"])
            .output()
            .expect("interactive login probe should terminate, not hang");
    }
}

fn run_git(dir: &std::path::Path, args: &[&str]) -> Result<std::process::Output, String> {
    new_command("git")
        .args(args)
        .current_dir(dir)
        .output()
        .map_err(|e| format!("Failed to run git: {}", e))
}

fn git_stderr(output: &std::process::Output) -> String {
    String::from_utf8_lossy(&output.stderr).trim().to_string()
}

fn ensure_tempest_gitignore(project_path: &std::path::Path) {
    let gitignore = project_path.join(".gitignore");
    // Entries Tempest always keeps out of version control.
    // For ".tempest" we also accept the trailing-slash form ".tempest/".
    let entries: &[(&str, &[&str])] = &[
        (".tempest",     &[".tempest", ".tempest/"]),
        (".tempest-pid", &[".tempest-pid"]),
    ];

    let existing = std::fs::read_to_string(&gitignore).unwrap_or_default();

    let missing: Vec<&str> = entries
        .iter()
        .filter(|(_, variants)| {
            !existing.lines().any(|l| variants.contains(&l.trim()))
        })
        .map(|(canonical, _)| *canonical)
        .collect();

    if missing.is_empty() {
        return;
    }

    let prefix = if existing.is_empty() || existing.ends_with('\n') { "" } else { "\n" };
    let append = format!("{}{}\n", prefix, missing.join("\n"));
    let _ = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&gitignore)
        .and_then(|mut f| std::io::Write::write_all(&mut f, append.as_bytes()));
}

// Gitignored-but-needed files that git won't carry into a worktree.
// These are copied (not committed) from the project root into each new worktree.
// Only small text files belong here — large dependency dirs are linked instead
// (see DIRS_TO_LINK) to avoid 30–120s freezes copying tens of thousands of files.
const FILES_TO_COPY: &[&str] = &[".env", ".env.local", ".env.development", ".env.production"];

// Large dependency directories that are linked (junction on Windows, symlink on
// Unix) rather than copied. Copying these recursively can be 200–800 MB and tens
// of thousands of files, which froze the worker thread; a link is instantaneous.
const DIRS_TO_LINK: &[&str] = &["node_modules", ".venv"];

// Remove the junction (Windows) or symlink (Unix) entries for every DIRS_TO_LINK
// member inside a worktree BEFORE deleting the worktree itself.
//
// Without this, `fs::remove_dir_all` and `git worktree remove --force` follow
// the junction into the real node_modules and either freeze (deleting 100k+ files
// from the project) or corrupt it by removing the original.
//
// On Windows `std::fs::remove_dir` calls `RemoveDirectory`, which strips the
// reparse point atomically without traversing or touching the target directory.
// On Unix `std::fs::remove_file` removes the symlink without following it.
// In both cases a real (non-linked) directory is left untouched so `remove_dir_all`
// can handle it afterward.
fn remove_dir_links(worktree_path: &std::path::Path) {
    for dir_name in DIRS_TO_LINK {
        let link = worktree_path.join(dir_name);
        // exists() follows the reparse point — true when the junction/target is present.
        if link.exists() {
            #[cfg(windows)]
            let _ = std::fs::remove_dir(&link);
            #[cfg(not(windows))]
            let _ = std::fs::remove_file(&link);
        }
    }
}

fn copy_file_or_dir(src: &std::path::Path, dst: &std::path::Path) -> std::io::Result<()> {
    if src.is_dir() {
        std::fs::create_dir_all(dst)?;
        for entry in std::fs::read_dir(src)? {
            let entry = entry?;
            let dst_child = dst.join(entry.file_name());
            copy_file_or_dir(&entry.path(), &dst_child)?;
        }
    } else {
        if let Some(parent) = dst.parent() {
            std::fs::create_dir_all(parent)?;
        }
        std::fs::copy(src, dst)?;
    }
    Ok(())
}

#[tauri::command(async)]
fn git_init(project_path: String) -> Result<(), String> {
    let project = std::path::Path::new(&project_path);

    let out = run_git(project, &["init"])?;
    if !out.status.success() {
        return Err(git_stderr(&out));
    }

    // Explicitly set the initial branch to `main` so worktrees branch off a
    // predictable ref (avoids master/main ambiguity across git versions).
    let _ = run_git(project, &["symbolic-ref", "HEAD", "refs/heads/main"]);

    // Write .gitignore BEFORE staging so .tempest never enters history.
    ensure_tempest_gitignore(project);

    // Stage all existing files (respects .gitignore, so .tempest is excluded).
    let add = run_git(project, &["add", "-A"])?;
    if !add.status.success() {
        return Err(format!("git add failed: {}", git_stderr(&add)));
    }

    // Create an initial commit so a HEAD exists for worktree branching.
    // --allow-empty handles the case where the project has no files yet.
    let commit = run_git(project, &[
        "-c", "user.email=tempest@local",
        "-c", "user.name=Tempest",
        "commit", "--allow-empty", "-m", "Initial commit",
    ])?;
    if !commit.status.success() {
        return Err(format!("Initial commit failed: {}", git_stderr(&commit)));
    }

    Ok(())
}

#[tauri::command(async)]
fn check_git_initialized(path: String) -> bool {
    let p = std::path::Path::new(&path);
    let initialized = run_git(p, &["rev-parse", "--git-dir"])
        .map(|o| o.status.success())
        .unwrap_or(false);
    if initialized {
        ensure_tempest_gitignore(p);
    }
    initialized
}

#[tauri::command(async)]
fn git_add_remote(repo_path: String, remote_url: String) -> Result<(), String> {
    let path = std::path::Path::new(&repo_path);
    let out = run_git(path, &["remote", "add", "origin", &remote_url])?;
    if !out.status.success() {
        return Err(git_stderr(&out));
    }
    Ok(())
}

#[tauri::command]
async fn create_terminal_worktree(
    project_path: String,
    name: String,
    existing_branch: Option<String>,
) -> Result<String, String> {
    // The body is pure blocking work (git subprocesses + file ops). Run it on a
    // dedicated blocking thread so a slow worktree creation never starves Tauri's
    // bounded IPC worker pool. Both params are owned, so they move in cleanly.
    tauri::async_runtime::spawn_blocking(move || {
    let project = std::path::Path::new(&project_path);
    let tempest_dir = project.join(".tempest");
    std::fs::create_dir_all(&tempest_dir).map_err(|e| e.to_string())?;
    // Sanitize the name for use as a filesystem directory: branch names like
    // "feat/my-feature" would create a real subdirectory without this replacement.
    let dir_name = name.replace('/', "-");

    // 1. Ensure at least one commit exists so git worktree add has a HEAD to branch from.
    let has_commits = new_command("git")
        .args(["rev-parse", "--verify", "HEAD"])
        .current_dir(project)
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false);

    if !has_commits {
        ensure_tempest_gitignore(project);
        let add = new_command("git")
            .args(["add", "-A"])
            .current_dir(project)
            .output()
            .map_err(|e| format!("Failed to run git: {}", e))?;
        if !add.status.success() {
            return Err(format!(
                "git add failed: {}",
                String::from_utf8_lossy(&add.stderr).trim()
            ));
        }
        let commit = new_command("git")
            .args([
                "-c", "user.email=tempest@local",
                "-c", "user.name=Tempest",
                "commit", "--allow-empty", "-m", "Initial commit",
            ])
            .current_dir(project)
            .output()
            .map_err(|e| format!("Failed to run git: {}", e))?;
        if !commit.status.success() {
            return Err(format!(
                "Repository has no commits and auto-commit failed: {}",
                String::from_utf8_lossy(&commit.stderr).trim()
            ));
        }
    }

    // 2. Prune stale worktree metadata so a previous failed run can't block us.
    let _ = new_command("git")
        .args(["worktree", "prune"])
        .current_dir(project)
        .output();

    let worktree_path = tempest_dir.join(&dir_name);

    // 3. Handle pre-existing path.
    if worktree_path.exists() {
        let list_out = new_command("git")
            .args(["worktree", "list", "--porcelain"])
            .current_dir(project)
            .output()
            .map_err(|e| e.to_string())?;
        let listing = String::from_utf8_lossy(&list_out.stdout);
        let wt_str = worktree_path.to_string_lossy();
        let is_registered = listing
            .lines()
            .any(|l| l.strip_prefix("worktree ").map(|p| p == wt_str).unwrap_or(false));
        if is_registered {
            return Err(format!(
                "A workspace named '{}' already exists. Choose a different name.",
                name
            ));
        }
        std::fs::remove_dir_all(&worktree_path)
            .map_err(|e| format!("Failed to remove orphan directory: {}", e))?;
    }

    // 4. Create the worktree.
    let wt_path_str = worktree_path.to_string_lossy().to_string();
    let mut args = vec!["worktree", "add", &wt_path_str];
    // When checking out an existing branch, pass it directly (no -b).
    // When creating a new branch, pass -b <name> so git creates it.
    let branch_arg;
    if let Some(ref branch) = existing_branch {
        branch_arg = branch.clone();
        args.push(&branch_arg);
    } else {
        args.push("-b");
        args.push(&name);
    }
    let output = new_command("git")
        .args(&args)
        .current_dir(project)
        .output()
        .map_err(|e| format!("Failed to run git: {}", e))?;

    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).trim().to_string());
    }

    // 5. Write .tempest-pid to the worktree's git info/exclude so it never shows
    //    up as an untracked file in git status. info/exclude is local-only and
    //    never committed, making it the right place for tool-internal files.
    {
        let git_wt_dir = project.join(".git").join("worktrees").join(&dir_name);
        let info_dir = git_wt_dir.join("info");
        let _ = std::fs::create_dir_all(&info_dir);
        let exclude_path = info_dir.join("exclude");
        let existing = std::fs::read_to_string(&exclude_path).unwrap_or_default();
        if !existing.lines().any(|l| l.trim() == ".tempest-pid") {
            let append = if existing.is_empty() || existing.ends_with('\n') {
                ".tempest-pid\n".to_string()
            } else {
                "\n.tempest-pid\n".to_string()
            };
            let _ = std::fs::OpenOptions::new()
                .create(true)
                .append(true)
                .open(&exclude_path)
                .and_then(|mut f| std::io::Write::write_all(&mut f, append.as_bytes()));
        }
    }

    // 6. Copy gitignored-but-needed files so the agent sees them without committing.
    for name_to_copy in FILES_TO_COPY {
        let src = project.join(name_to_copy);
        if src.exists() {
            let _ = copy_file_or_dir(&src, &worktree_path.join(name_to_copy));
        }
    }

    // 6b. Link (don't copy) large dependency dirs. A directory junction (Windows)
    //     or symlink (Unix) is instantaneous and shares one on-disk copy, instead
    //     of recursively copying hundreds of MB. A failed link must never fail the
    //     whole worktree creation — log and continue so the agent still gets a
    //     usable tree (it can re-run install if the dep dir is missing).
    for dir_to_link in DIRS_TO_LINK {
        let src = project.join(dir_to_link);
        if !src.exists() {
            continue; // not every project has node_modules / .venv
        }
        let dest = worktree_path.join(dir_to_link);
        if dest.exists() {
            continue; // already present (e.g. tracked) — leave it alone
        }

        #[cfg(target_os = "windows")]
        {
            if let Err(e) = junction::create(&src, &dest) {
                eprintln!(
                    "Failed to create junction for {}: {} (continuing without it)",
                    dir_to_link, e
                );
            }
        }
        #[cfg(not(target_os = "windows"))]
        {
            if let Err(e) = std::os::unix::fs::symlink(&src, &dest) {
                eprintln!(
                    "Failed to create symlink for {}: {} (continuing without it)",
                    dir_to_link, e
                );
            }
        }
    }

    // 7. Detect empty worktree and surface a clear error.
    let is_empty = std::fs::read_dir(&worktree_path)
        .map(|mut d| d.all(|e| e.map(|e| e.file_name() == ".git").unwrap_or(false)))
        .unwrap_or(true);
    if is_empty {
        return Err(
            "Workspace created but contains no files. Your project files may be untracked \
             or gitignored. Run 'git add && git commit' in the project root first, or the \
             agent will see an empty directory."
                .into(),
        );
    }

    ensure_tempest_gitignore(project);
    Ok(worktree_path.to_string_lossy().to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}


#[derive(serde::Serialize)]
struct GitStatusEntry {
    xy: String,     // raw two-char index+worktree status from git status --short
    status: String, // kept for RightSidebar backward compat (dominant single char)
    path: String,
}

// ── Signed remote-config verification ────────────────────────────────────────
// The agents manifest (config/agents.json) is DATA that drives what the app
// spawns — a CLI command plus its flags — so, unlike the models list, it is
// delivered SIGNED. This verifies a detached minisign signature over the raw
// manifest bytes before the frontend is allowed to apply it. A malformed key,
// signature, or content mismatch all return `false`, and the frontend then
// keeps the bundled agent list.
//
// A DEDICATED key, separate from the updater's, so the two rotate independently.
// Ceremony (one-time):
//   1. minisign -G -p tempest-agents.pub -s tempest-agents.key
//   2. paste the `RW...` line from tempest-agents.pub below
//   3. keep tempest-agents.key as a CI secret; sign on every manifest change:
//        minisign -S -s tempest-agents.key -m config/agents.json
//      then commit config/agents.json and config/agents.json.minisig
// Empty key = channel disabled: every verify fails, the app stays on bundled.
const AGENTS_PUBKEY: &str = "RWS6sNKixTMBr+3cvpkDt+RjqjYkOxRnhqtD62YKrCgGmMsqfZkUr+Uc";

#[tauri::command(async)]
fn verify_minisign(data: String, signature: String) -> bool {
    if AGENTS_PUBKEY.is_empty() {
        return false;
    }
    let pk = match minisign_verify::PublicKey::from_base64(AGENTS_PUBKEY) {
        Ok(pk) => pk,
        Err(_) => return false,
    };
    let sig = match minisign_verify::Signature::decode(&signature) {
        Ok(sig) => sig,
        Err(_) => return false,
    };
    // `true` accepts both legacy and prehashed minisign signatures — both are
    // signatures from our key; which format `minisign -S` emits varies by version.
    pk.verify(data.as_bytes(), &sig, true).is_ok()
}

#[tauri::command(async)]
fn check_program_available(program: String) -> bool {
    let check_cmd = if cfg!(windows) { "where" } else { "which" };
    // Multi-word hints like "gh copilot" — only check the base executable name.
    let first = program.split_whitespace().next().unwrap_or(&program);
    let available_on_path = new_command(check_cmd)
        .arg(first)
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false);
    if available_on_path {
        return true;
    }

    #[cfg(unix)]
    {
        return login_shell_program_available(first);
    }
    #[cfg(not(unix))]
    false
}

#[cfg(unix)]
fn login_shell_program_available(program: &str) -> bool {
    #[cfg(target_os = "macos")]
    let fallback_shell = "/bin/zsh";
    #[cfg(not(target_os = "macos"))]
    let fallback_shell = "/bin/sh";

    let shell = std::env::var("SHELL")
        .ok()
        .filter(|s| std::path::Path::new(s).is_file())
        .unwrap_or_else(|| fallback_shell.to_string());
    new_detached_command(&shell)
        .args(["-lic", "command -v \"$TEMPEST_PROGRAM\" >/dev/null 2>&1"])
        .env("TEMPEST_PROGRAM", program)
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false)
}

#[cfg(not(windows))]
fn interactive_login_shell_args() -> Vec<String> {
    vec!["-il".into()]
}

#[cfg(all(test, unix))]
mod check_program_available_tests {
    #[test]
    fn login_shell_finds_available_program() {
        assert!(super::login_shell_program_available("sh"));
    }

    #[test]
    fn terminal_uses_interactive_login_shell() {
        assert_eq!(super::interactive_login_shell_args(), vec!["-il"]);
    }
}

#[tauri::command(async)]
fn get_node_version() -> Option<String> {
    new_command(&resolve_node())
        .arg("--version")
        .output()
        .ok()
        .filter(|o| o.status.success())
        .and_then(|o| String::from_utf8(o.stdout).ok())
        .map(|s| s.trim().to_string())
}

#[derive(serde::Serialize)]
struct BranchInfo {
    name: String,
    is_current: bool,
    is_remote: bool,
    is_worktree: bool,
    worktree_path: Option<String>,
}

#[tauri::command(async)]
fn git_status(path: String) -> Result<Vec<GitStatusEntry>, String> {
    let output = new_command("git")
        .args(["status", "--short", "--untracked-files=all"])
        .current_dir(&path)
        .output()
        .map_err(|e| format!("Failed to run git: {}", e))?;

    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).trim().to_string());
    }

    let entries = String::from_utf8_lossy(&output.stdout)
        .lines()
        .filter(|line| line.len() >= 4)
        .map(|line| {
            let xy = line[..2].to_string();
            let x = xy.chars().next().unwrap_or(' ');
            let y = xy.chars().nth(1).unwrap_or(' ');
            let status = if x != ' ' && x != '?' { x.to_string() } else { y.to_string() };
            let file_path = line[3..].trim().to_string();
            GitStatusEntry { xy, status, path: file_path }
        })
        .filter(|e| !e.path.is_empty())
        .collect();

    Ok(entries)
}

#[tauri::command(async)]
fn get_git_branch(path: String) -> Result<String, String> {
    // symbolic-ref works even on repos with no commits; rev-parse fails there
    let output = new_command("git")
        .args(["symbolic-ref", "--short", "HEAD"])
        .current_dir(&path)
        .output()
        .map_err(|e| e.to_string())?;

    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).trim().to_string());
    }

    Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
}

#[derive(serde::Serialize)]
struct CommitInfo {
    hash: String,
    author: String,
    relative_date: String,
    subject: String,
}

/// Return the most recent commits as structured records. An empty repo (no
/// commits yet) yields an empty list rather than an error.
#[tauri::command(async)]
fn git_recent_commits(path: String, count: u32) -> Result<Vec<CommitInfo>, String> {
    let n = if count == 0 { 5 } else { count.min(50) };
    let output = new_command("git")
        .args([
            "log",
            &format!("-{n}"),
            // Unit separator (\x1f) between fields — safe against subjects with pipes.
            "--pretty=format:%h\x1f%an\x1f%ar\x1f%s",
        ])
        .current_dir(&path)
        .output()
        .map_err(|e| format!("Failed to run git: {}", e))?;

    if !output.status.success() {
        return Ok(Vec::new());
    }

    let commits = String::from_utf8_lossy(&output.stdout)
        .lines()
        .filter_map(|line| {
            let mut parts = line.split('\u{1f}');
            let hash = parts.next()?.to_string();
            if hash.is_empty() {
                return None;
            }
            Some(CommitInfo {
                hash,
                author: parts.next().unwrap_or("").to_string(),
                relative_date: parts.next().unwrap_or("").to_string(),
                subject: parts.next().unwrap_or("").to_string(),
            })
        })
        .collect();

    Ok(commits)
}

/// Return the `origin` remote URL, or an empty string when no remote is set.
#[tauri::command(async)]
fn git_remote_url(path: String) -> Result<String, String> {
    let output = new_command("git")
        .args(["remote", "get-url", "origin"])
        .current_dir(&path)
        .output()
        .map_err(|e| format!("Failed to run git: {}", e))?;

    if !output.status.success() {
        return Ok(String::new());
    }

    Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
}

#[tauri::command(async)]
fn git_list_branches(repo_path: String) -> Result<Vec<BranchInfo>, String> {
    let dir = std::path::Path::new(&repo_path);

    // Build branch-name → worktree-path map so we can surface the existing
    // checkout directory for branches already in a worktree.
    let mut worktree_map: std::collections::HashMap<String, String> = std::collections::HashMap::new();
    if let Ok(wt_out) = run_git(dir, &["worktree", "list", "--porcelain"]) {
        if wt_out.status.success() {
            let wt_text = String::from_utf8_lossy(&wt_out.stdout);
            let mut cur_path = String::new();
            for line in wt_text.lines() {
                if let Some(p) = line.strip_prefix("worktree ") {
                    #[cfg(windows)]
                    { cur_path = p.replace('/', "\\"); }
                    #[cfg(not(windows))]
                    { cur_path = p.to_string(); }
                } else if let Some(br) = line.strip_prefix("branch refs/heads/") {
                    if !cur_path.is_empty() {
                        worktree_map.insert(br.to_string(), cur_path.clone());
                    }
                }
            }
        }
    }

    let out = run_git(dir, &["branch", "-a"])?;
    if !out.status.success() {
        return Err(git_stderr(&out));
    }

    let stdout = String::from_utf8_lossy(&out.stdout);
    let mut local_names = std::collections::HashSet::new();
    let mut branches: Vec<BranchInfo> = Vec::new();

    // Pass 1 — local branches including worktree-attached ones ("+" prefix)
    for l in stdout.lines() {
        if l.len() < 2 { continue; }
        let raw = l[2..].trim();
        if raw.starts_with("remotes/") { continue; }
        if raw.is_empty() { continue; }
        let is_current = l.starts_with("* ");
        let is_worktree = l.starts_with("+ ");
        let worktree_path = if is_worktree { worktree_map.get(raw).cloned() } else { None };
        local_names.insert(raw.to_string());
        branches.push(BranchInfo { name: raw.to_string(), is_current, is_remote: false, is_worktree, worktree_path });
    }

    // Pass 2 — remote-only branches (skip if a local tracking branch already exists)
    for l in stdout.lines() {
        if l.len() < 2 { continue; }
        let raw = l[2..].trim();
        if !raw.starts_with("remotes/") { continue; }
        if raw.contains(" -> ") { continue; }
        let after_remotes = &raw["remotes/".len()..];
        let name = match after_remotes.find('/') {
            Some(i) => after_remotes[i + 1..].to_string(),
            None => continue,
        };
        if name.is_empty() || local_names.contains(&name) { continue; }
        branches.push(BranchInfo { name, is_current: false, is_remote: true, is_worktree: false, worktree_path: None });
    }

    Ok(branches)
}

#[tauri::command(async)]
fn git_switch_branch(repo_path: String, branch: String) -> Result<(), String> {
    let dir = std::path::Path::new(&repo_path);

    // Get current branch so we can tag the stash to it
    let head_out = run_git(dir, &["rev-parse", "--abbrev-ref", "HEAD"])?;
    let current_branch = String::from_utf8_lossy(&head_out.stdout).trim().to_string();

    // Auto-stash if working tree is dirty
    let status_out = run_git(dir, &["status", "--porcelain"])?;
    let is_dirty = !String::from_utf8_lossy(&status_out.stdout).trim().is_empty();
    if is_dirty {
        let label = format!("tempest-autostash-from-{}", current_branch);
        let stash_out = run_git(dir, &["stash", "push", "-u", "-m", &label])?;
        if !stash_out.status.success() {
            return Err(git_stderr(&stash_out));
        }
    }

    // Switch branch
    let out = run_git(dir, &["checkout", &branch])?;
    if !out.status.success() {
        // Restore stash so the user's changes aren't lost
        if is_dirty {
            let _ = run_git(dir, &["stash", "pop"]);
        }
        return Err(git_stderr(&out));
    }

    // If there's an autostash saved from a previous visit to this branch, restore it
    let stash_list_out = run_git(dir, &["stash", "list"])?;
    let stash_list = String::from_utf8_lossy(&stash_list_out.stdout).to_string();
    let restore_label = format!("tempest-autostash-from-{}", branch);
    for line in stash_list.lines() {
        if line.contains(&restore_label) {
            // line format: "stash@{N}: On branch: <msg>"
            if let Some(idx) = line.split('{').nth(1).and_then(|s| s.split('}').next()) {
                let stash_ref = format!("stash@{{{}}}", idx);
                let _ = run_git(dir, &["stash", "pop", &stash_ref]);
            }
            break;
        }
    }

    Ok(())
}

#[tauri::command(async)]
fn git_delete_branch(repo_path: String, branch: String, force: bool, delete_remote: bool) -> Result<(), String> {
    let dir = std::path::Path::new(&repo_path);
    let flag = if force { "-D" } else { "-d" };
    let local = run_git(dir, &["branch", flag, &branch])?;
    if !local.status.success() {
        return Err(git_stderr(&local));
    }
    if delete_remote {
        // Best-effort — don't fail if the remote branch doesn't exist
        let _ = run_git(dir, &["push", "origin", "--delete", &branch]);
    }
    Ok(())
}

#[tauri::command(async)]
fn git_worktree_remove(repo_path: String, worktree_path: String) -> Result<(), String> {
    #[cfg(windows)]
    let worktree_path = worktree_path.replace('/', "\\");

    // Remove junctions / symlinks first — same reason as in close_and_remove_worktree.
    remove_dir_links(std::path::Path::new(&worktree_path));

    // Try git's own removal first (handles deregistration + directory delete).
    let out = new_command("git")
        .args(["-C", &repo_path, "worktree", "remove", "--force", &worktree_path])
        .output()
        .map_err(|e| e.to_string())?;

    if out.status.success() {
        return Ok(());
    }

    // Git failed — fall back to direct directory removal.
    // On Windows the PTY process can release its CWD handle asynchronously a
    // short moment after exit, so we retry up to 6 times with 500 ms gaps
    // (~3 s total budget) to ride out any remaining handle lag.
    let path = std::path::Path::new(&worktree_path);
    if path.exists() {
        let mut last_err = String::new();
        for i in 0..6u32 {
            if i > 0 {
                std::thread::sleep(std::time::Duration::from_millis(500));
            }
            match std::fs::remove_dir_all(path) {
                Ok(()) => { last_err = String::new(); break; }
                Err(e) => last_err = format!("Failed to remove directory: {}", e),
            }
        }

        // Last resort (Windows): Rust's fs::remove_dir_all can fail with
        // os error 32 due to inherited-handle subtleties where the OS's own
        // rmdir still succeeds. Shell out to `cmd /c rmdir /s /q`.
        #[cfg(windows)]
        if !last_err.is_empty() && path.exists() {
            let out = new_command("cmd")
                .args(["/c", "rmdir", "/s", "/q", &worktree_path])
                .output();
            if matches!(out, Ok(ref o) if o.status.success()) || !path.exists() {
                last_err = String::new();
            }
        }

        if !last_err.is_empty() {
            return Err(last_err);
        }
    }

    // Prune any dangling .git/worktrees/<name> refs left behind.
    let _ = new_command("git")
        .args(["-C", &repo_path, "worktree", "prune"])
        .output();

    Ok(())
}

#[tauri::command(async)]
fn git_branch_delete(repo_path: String, branch_name: String) -> Result<(), String> {
    let out = new_command("git")
        .args(["-C", &repo_path, "branch", "-D", &branch_name])
        .output()
        .map_err(|e| e.to_string())?;
    if out.status.success() {
        Ok(())
    } else {
        Err(String::from_utf8_lossy(&out.stderr).trim().to_string())
    }
}

#[tauri::command]
async fn check_branch_merged(repo_path: String, branch: String) -> Result<bool, String> {
    let dir = std::path::Path::new(&repo_path);

    // 1. Refresh remote state. Offline is fine — just fall back to local refs.
    let _ = run_git(dir, &["fetch", "--prune", "origin"]);

    // 2. If the remote branch is gone, treat it as merged (deleted after merge).
    let ls_remote = run_git(dir, &["ls-remote", "--heads", "origin", &branch])?;
    if ls_remote.status.success()
        && String::from_utf8_lossy(&ls_remote.stdout).trim().is_empty()
    {
        return Ok(true);
    }

    // 3. If the branch tip is an ancestor of a base branch, it's been merged.
    for base in ["origin/main", "origin/master", "origin/develop"] {
        let out = run_git(dir, &["merge-base", "--is-ancestor", &branch, base])?;
        if out.status.success() {
            return Ok(true);
        }
    }

    Ok(false)
}

// ── Diff ─────────────────────────────────────────────────────────────────────

#[derive(serde::Serialize)]
struct DiffLine {
    kind: String,           // "hunk" | "context" | "added" | "removed"
    line_old: Option<u32>,
    line_new: Option<u32>,
    content: String,
}

#[derive(serde::Serialize)]
struct FileDiff {
    status: String,         // "M" | "A" | "D" | "R"
    path: String,
    adds: u32,
    dels: u32,
    lines: Vec<DiffLine>,
}

#[derive(serde::Serialize)]
struct FileStats {
    path: String,
    adds: u32,
    dels: u32,
}

#[tauri::command(async)]
fn git_numstat(repo_path: String) -> Result<Vec<FileStats>, String> {
    let dir = std::path::Path::new(&repo_path);

    fn parse_numstat(text: &str) -> std::collections::HashMap<String, (u32, u32)> {
        let mut map = std::collections::HashMap::new();
        for line in text.lines() {
            let mut parts = line.splitn(3, '\t');
            let Some(adds_str) = parts.next() else { continue };
            let Some(dels_str) = parts.next() else { continue };
            let Some(path) = parts.next() else { continue };
            if path.is_empty() { continue; }
            let adds = adds_str.parse::<u32>().unwrap_or(0);
            let dels = dels_str.parse::<u32>().unwrap_or(0);
            let e = map.entry(path.to_string()).or_insert((0, 0));
            e.0 += adds;
            e.1 += dels;
        }
        map
    }

    // HEAD diff covers staged+unstaged tracked files.
    let mut combined = if let Ok(out) = run_git(dir, &["diff", "--numstat", "HEAD"]) {
        if out.status.success() {
            parse_numstat(&String::from_utf8_lossy(&out.stdout))
        } else {
            std::collections::HashMap::new()
        }
    } else {
        std::collections::HashMap::new()
    };

    // Untracked new files aren't in the HEAD diff — count their lines via diff --numstat /dev/null.
    // git status --short gives us the ?? entries; for each we run diff --no-index.
    if let Ok(status_out) = run_git(dir, &["status", "--short", "--untracked-files=all"]) {
        if status_out.status.success() {
            for line in String::from_utf8_lossy(&status_out.stdout).lines() {
                if line.starts_with("?? ") {
                    let path = line[3..].trim();
                    if path.is_empty() { continue; }
                    let full = dir.join(path);
                    // Count non-empty lines in the file as additions.
                    if let Ok(content) = std::fs::read_to_string(&full) {
                        let adds = content.lines().count() as u32;
                        combined.entry(path.to_string()).or_insert((adds, 0));
                    }
                }
            }
        }
    }

    let stats = combined
        .into_iter()
        .map(|(path, (adds, dels))| FileStats { path, adds, dels })
        .collect();
    Ok(stats)
}

fn parse_hunk_header(line: &str) -> (u32, u32) {
    // @@ -old_start[,count] +new_start[,count] @@
    let mut old_start = 1u32;
    let mut new_start = 1u32;
    for part in line.split_whitespace() {
        if let Some(rest) = part.strip_prefix('-') {
            let num = rest.split(',').next().unwrap_or("1");
            if let Ok(n) = num.parse::<u32>() { old_start = n; }
        } else if let Some(rest) = part.strip_prefix('+') {
            let num = rest.split(',').next().unwrap_or("1");
            if let Ok(n) = num.parse::<u32>() { new_start = n; }
        }
    }
    (old_start, new_start)
}

fn parse_unified_diff(text: &str) -> Vec<FileDiff> {
    let mut results: Vec<FileDiff> = Vec::new();
    let mut current: Option<FileDiff> = None;
    let mut old_line: u32 = 0;
    let mut new_line: u32 = 0;

    for line in text.lines() {
        if line.starts_with("diff --git ") {
            if let Some(f) = current.take() { results.push(f); }
            // Extract b-side path: "diff --git a/PATH b/PATH" — use rfind to handle spaces
            let path = line.rfind(" b/")
                .map(|i| line[i + 3..].to_string())
                .unwrap_or_default();
            current = Some(FileDiff { status: "M".to_string(), path, adds: 0, dels: 0, lines: Vec::new() });
            old_line = 0;
            new_line = 0;
        } else if line.starts_with("new file mode") {
            if let Some(ref mut f) = current { f.status = "A".to_string(); }
        } else if line.starts_with("deleted file mode") {
            if let Some(ref mut f) = current { f.status = "D".to_string(); }
        } else if line.starts_with("rename to ") {
            if let Some(ref mut f) = current {
                f.status = "R".to_string();
                f.path = line[10..].to_string();
            }
        } else if line.starts_with("@@") {
            if let Some(ref mut f) = current {
                let (o, n) = parse_hunk_header(line);
                old_line = o;
                new_line = n;
                f.lines.push(DiffLine { kind: "hunk".to_string(), line_old: None, line_new: None, content: line.to_string() });
            }
        } else if let Some(ref mut f) = current {
            if line.starts_with('+') && !line.starts_with("+++") {
                f.lines.push(DiffLine { kind: "added".to_string(), line_old: None, line_new: Some(new_line), content: line.to_string() });
                f.adds += 1;
                new_line += 1;
            } else if line.starts_with('-') && !line.starts_with("---") {
                f.lines.push(DiffLine { kind: "removed".to_string(), line_old: Some(old_line), line_new: None, content: line.to_string() });
                f.dels += 1;
                old_line += 1;
            } else if line.starts_with(' ') {
                f.lines.push(DiffLine { kind: "context".to_string(), line_old: Some(old_line), line_new: Some(new_line), content: line.to_string() });
                old_line += 1;
                new_line += 1;
            }
            // Skip: index/similarity/--- /+++ /binary/\ No newline lines
        }
    }
    if let Some(f) = current.take() { results.push(f); }
    results
}

#[tauri::command(async)]
fn git_diff(path: String) -> Result<Vec<FileDiff>, String> {
    let dir = std::path::Path::new(&path);
    // Show only uncommitted changes (working tree + staged) vs HEAD.
    // This makes the Diff tab "what's pending right now": after a clean
    // commit+push the working tree matches HEAD, so the diff is empty —
    // rather than re-showing every change committed on the branch.
    let output = run_git(dir, &["diff", "HEAD"])?;
    if !output.status.success() {
        return Err(git_stderr(&output));
    }
    Ok(parse_unified_diff(&String::from_utf8_lossy(&output.stdout)))
}

#[tauri::command]
async fn git_push_branch(repo_path: String, commit_message: Option<String>) -> Result<String, String> {
    let dir = std::path::Path::new(&repo_path);

    let branch_out = run_git(dir, &["symbolic-ref", "--short", "HEAD"])?;
    if !branch_out.status.success() {
        return Err(git_stderr(&branch_out));
    }
    let branch = String::from_utf8_lossy(&branch_out.stdout).trim().to_string();
    if branch.is_empty() {
        return Err("Could not determine current branch".to_string());
    }

    // Commit any pending changes before pushing.
    // If the user has already staged specific files (via the staging area), commit
    // only those.  If nothing is staged but there are unstaged changes (quick-push
    // path), fall back to staging everything so the push is never empty.
    let status_out = run_git(dir, &["status", "--porcelain"])?;
    if !status_out.stdout.is_empty() {
        let staged_check = run_git(dir, &["diff", "--cached", "--quiet"])?;
        let has_staged = !staged_check.status.success(); // exit 1 = something staged

        if !has_staged {
            // Nothing staged — auto-stage everything (old quick-push behaviour).
            let add_out = run_git(dir, &["add", "-A"])?;
            if !add_out.status.success() {
                return Err(format!("git add failed: {}", git_stderr(&add_out)));
            }
        }

        let base = commit_message
            .filter(|m| !m.trim().is_empty())
            .unwrap_or_else(|| format!("Agent work on {}", branch));
        let msg = format!("{}\n\nCo-authored-by: Tempest <tempest@local>", base);
        let commit_out = run_git(dir, &["commit", "-m", &msg])?;
        if !commit_out.status.success() {
            return Err(format!("Commit failed: {}", git_stderr(&commit_out)));
        }
    }

    let push_out = run_git(dir, &["push", "-u", "origin", &branch])?;
    if !push_out.status.success() {
        return Err(git_stderr(&push_out));
    }

    let remote_out = run_git(dir, &["remote", "get-url", "origin"])?;
    if !remote_out.status.success() {
        return Err(git_stderr(&remote_out));
    }
    let remote_url = String::from_utf8_lossy(&remote_out.stdout).trim().to_string();

    serde_json::to_string(&serde_json::json!({ "remoteUrl": remote_url, "branch": branch }))
        .map_err(|e| e.to_string())
}

// ── Push (no auto-commit) ────────────────────────────────────────────────────

#[tauri::command(async)]
fn git_push_current_branch(repo_path: String) -> Result<String, String> {
    let dir = std::path::Path::new(&repo_path);

    let branch_out = run_git(dir, &["symbolic-ref", "--short", "HEAD"])?;
    if !branch_out.status.success() {
        return Err(git_stderr(&branch_out));
    }
    let branch = String::from_utf8_lossy(&branch_out.stdout).trim().to_string();
    if branch.is_empty() {
        return Err("Could not determine current branch".to_string());
    }

    let push_out = run_git(dir, &["push", "-u", "origin", &branch])?;
    if !push_out.status.success() {
        return Err(git_stderr(&push_out));
    }

    let remote_out = run_git(dir, &["remote", "get-url", "origin"])?;
    if !remote_out.status.success() {
        return Err(git_stderr(&remote_out));
    }
    let remote_url = String::from_utf8_lossy(&remote_out.stdout).trim().to_string();

    serde_json::to_string(&serde_json::json!({ "remoteUrl": remote_url, "branch": branch }))
        .map_err(|e| e.to_string())
}

#[tauri::command(async)]
fn git_create_push_branch(repo_path: String, branch_name: String) -> Result<String, String> {
    let branch_name = branch_name.trim().to_string();
    if branch_name.is_empty() {
        return Err("Branch name cannot be empty".to_string());
    }

    let dir = std::path::Path::new(&repo_path);

    let checkout_out = run_git(dir, &["checkout", "-b", &branch_name])?;
    if !checkout_out.status.success() {
        return Err(format!("Failed to create branch: {}", git_stderr(&checkout_out)));
    }

    let push_out = run_git(dir, &["push", "-u", "origin", &branch_name])?;
    if !push_out.status.success() {
        // Switch back to original branch on push failure so the repo isn't left detached
        let _ = run_git(dir, &["checkout", "-"]);
        return Err(git_stderr(&push_out));
    }

    let remote_out = run_git(dir, &["remote", "get-url", "origin"])?;
    if !remote_out.status.success() {
        return Err(git_stderr(&remote_out));
    }
    let remote_url = String::from_utf8_lossy(&remote_out.stdout).trim().to_string();

    serde_json::to_string(&serde_json::json!({ "remoteUrl": remote_url, "branch": branch_name }))
        .map_err(|e| e.to_string())
}

// ── Staging ──────────────────────────────────────────────────────────────────

#[tauri::command(async)]
fn git_stage(repo_path: String, file_path: String) -> Result<(), String> {
    let dir = std::path::Path::new(&repo_path);
    let out = run_git(dir, &["add", "--", &file_path])?;
    if out.status.success() { Ok(()) } else { Err(git_stderr(&out)) }
}

#[tauri::command(async)]
fn git_unstage(repo_path: String, file_path: String) -> Result<(), String> {
    let dir = std::path::Path::new(&repo_path);
    let out = run_git(dir, &["restore", "--staged", "--", &file_path])?;
    if out.status.success() { Ok(()) } else { Err(git_stderr(&out)) }
}

#[tauri::command(async)]
fn git_discard(repo_path: String, file_path: String, untracked: bool) -> Result<(), String> {
    let dir = std::path::Path::new(&repo_path);
    if untracked {
        let full = dir.join(&file_path);
        std::fs::remove_file(&full)
            .or_else(|_| std::fs::remove_dir_all(&full))
            .map_err(|e| format!("Failed to remove: {}", e))
    } else {
        let out = run_git(dir, &["restore", "--", &file_path])?;
        if out.status.success() { Ok(()) } else { Err(git_stderr(&out)) }
    }
}

#[tauri::command(async)]
fn git_commit_staged(repo_path: String, message: String) -> Result<(), String> {
    if message.trim().is_empty() {
        return Err("Commit message cannot be empty".to_string());
    }
    let dir = std::path::Path::new(&repo_path);
    let out = run_git(dir, &["commit", "-m", message.trim()])?;
    if out.status.success() { Ok(()) } else { Err(git_stderr(&out)) }
}

#[tauri::command(async)]
fn git_diff_file(path: String, file_path: String, staged: bool, untracked: bool) -> Result<Vec<DiffLine>, String> {
    let dir = std::path::Path::new(&path);

    if untracked {
        // Render untracked file as entirely-added lines without running git.
        let full = dir.join(&file_path);
        let content = std::fs::read_to_string(&full)
            .map_err(|e| format!("Failed to read file: {}", e))?;
        return Ok(content.lines().enumerate().map(|(i, line)| DiffLine {
            kind: "added".to_string(),
            line_old: None,
            line_new: Some((i + 1) as u32),
            content: format!("+{}", line),
        }).collect());
    }

    let out = if staged {
        run_git(dir, &["diff", "--cached", "--", &file_path])?
    } else {
        run_git(dir, &["diff", "--", &file_path])?
    };

    if !out.status.success() {
        return Err(git_stderr(&out));
    }

    let text = String::from_utf8_lossy(&out.stdout);
    Ok(parse_unified_diff(&text).into_iter().next().map(|f| f.lines).unwrap_or_default())
}

// ── PTY ──────────────────────────────────────────────────────────────────────

#[derive(Clone, serde::Serialize)]
struct PtyOutputPayload {
    session_id: String,
    data: String,
}

/// Optional isolation request attached to a PTY session by the frontend.
///
/// When `mode != "off"` the session's process (and its whole subtree, on
/// Windows via a Job Object) is confined by Hephaestus using these bounds.
#[derive(serde::Deserialize)]
struct SandboxSpec {
    /// "off" | "monitor" | "enforce".
    mode: String,
    /// Hostname patterns the process may reach (e.g. `**.github.com`).
    allowed_hosts: Vec<String>,
    /// Hostname patterns the process may never reach. Beats `allowed_hosts`.
    #[serde(default)]
    block_hosts: Vec<String>,
    /// `true` mirrors the "permissive — allow all, block specific" policy;
    /// `false` mirrors "restrictive — block all, allow specific".
    #[serde(default)]
    network_default_allow: bool,
    /// Paths mounted read-write inside the sandbox.
    rw_paths: Vec<String>,
    /// Paths mounted read-only inside the sandbox.
    ro_paths: Vec<String>,
    /// OS-level resource quotas. Enforced on Windows via the Job Object.
    #[serde(default)]
    resources: SandboxResources,
}

/// Project policy governing *what may be launched*, as distinct from
/// [`SandboxSpec`], which governs how a running process is confined.
///
/// Checked before the PTY is opened so a refusal costs nothing. This is the
/// authoritative gate: the frontend also hides non-permitted agents, but that
/// is presentation, and presentation is not enforcement.
///
/// Both checks apply only to *agent* sessions — those spawned with an explicit
/// `command`. A plain shell session has no agent to vet, and an agent the user
/// types by hand into that shell bypasses this gate entirely; catching those
/// needs process-level interception, which is not wired up.
#[derive(serde::Deserialize, Default)]
struct SessionPolicy {
    /// Agent CLI names (`AGENT_CONFIGS[].hint`) permitted in this project.
    #[serde(default)]
    permitted_agents: Vec<String>,
    /// When `false`, an agent invocation carrying any flag in
    /// `skip_permission_flags` is refused.
    #[serde(default)]
    allow_skip_permissions: bool,
    /// The bypass flags to look for, sourced from `AGENT_CONFIGS[].autoApproveArgs`
    /// so the list stays single-sourced in the frontend rather than duplicated here.
    #[serde(default)]
    skip_permission_flags: Vec<String>,
}

/// Per-session resource quotas. Every field is optional; `None` leaves the
/// corresponding limit at the OS default.
#[derive(serde::Deserialize, Default)]
struct SandboxResources {
    #[serde(default)]
    max_memory_mb: Option<u64>,
    #[serde(default)]
    max_processes: Option<u32>,
    /// Accepted and carried through, but no Windows Job Object limit
    /// corresponds to lifetime disk-write bytes — enforced on Linux only.
    #[serde(default)]
    max_disk_write_mb: Option<u64>,
    /// Relative CPU share, 1–10 000 (cgroups scale). The Windows backend maps
    /// this onto the 1–9 weight that job CPU rate control accepts.
    #[serde(default)]
    cpu_weight: Option<u32>,
}

impl SandboxResources {
    /// Convert to the SDK's limit type. MB → bytes happens here so the spec
    /// stays in hephaestus' canonical unit.
    ///
    /// Applied on every isolation path, including lifecycle-only sessions:
    /// a quota is a property of the session, not of its network posture.
    fn to_limits(&self) -> hephaestus::ResourceLimits {
        let mut b = hephaestus::ResourceLimits::builder();
        if let Some(mb) = self.max_memory_mb {
            b = b.max_memory_bytes(mb.saturating_mul(1024 * 1024));
        }
        if let Some(n) = self.max_processes {
            b = b.max_processes(n);
        }
        if let Some(mb) = self.max_disk_write_mb {
            b = b.max_disk_write_bytes(mb.saturating_mul(1024 * 1024));
        }
        if let Some(w) = self.cpu_weight {
            b = b.cpu_weight(w);
        }
        b.build()
    }
}

struct PtySession {
    writer: Mutex<Box<dyn Write + Send>>,
    master: Mutex<Box<dyn portable_pty::MasterPty + Send>>,
    _slave: Mutex<Box<dyn portable_pty::SlavePty + Send>>,
    child:  Mutex<Box<dyn portable_pty::Child + Send + Sync>>,
    /// Working directory (worktree path) this session was spawned in. Used to
    /// locate the `.tempest-pid` sidecar file on close so it can be cleaned up.
    cwd: String,
    /// Isolation handle when this session was created inside a Hephaestus
    /// sandbox. `None` for unsandboxed sessions. Taken and destroyed on close.
    isolate_handle: Mutex<Option<hephaestus::IsolateHandle>>,
    /// Always-on lifecycle Job Object — present for every PTY session that is
    /// NOT covered by the full Hephaestus sandbox (which already provides its
    /// own `KILL_ON_JOB_CLOSE` job). Dropping this handle kills the shell and
    /// its entire process tree atomically, including children reparented via
    /// `Start-Process` / ShellExecute that `taskkill /T` cannot reach.
    /// `None` when the session is running inside the Hephaestus sandbox, when
    /// `process_id()` returned `None` at spawn time, or on non-Windows.
    lifecycle_job: Mutex<Option<hephaestus::LifecycleJob>>,
    /// DB isolation branch name. Taken on close to fire branch_delete.
    db_branch_name: Mutex<Option<String>>,
}

/// Path of the per-worktree PID sidecar file. We persist the PTY's OS PID here
/// so a workspace can be deleted even after an app restart wiped in-memory
/// `PtyState` — the orphaned shell keeps a handle on the worktree dir otherwise.
fn pid_file_path(worktree_path: &str) -> std::path::PathBuf {
    std::path::Path::new(worktree_path).join(".tempest-pid")
}

/// Force-kill a process AND its entire process tree by OS PID. On Windows this
/// is `taskkill /F /T /PID` (so agent subprocesses die with the shell); on Unix
/// it's `kill -9`. Fails silently — the process may already be gone.
fn kill_pid_tree(pid: u32) {
    #[cfg(windows)]
    {
        let _ = new_command("taskkill")
            .args(["/F", "/T", "/PID", &pid.to_string()])
            .output();
    }
    #[cfg(unix)]
    {
        unsafe {
            libc::kill(pid as i32, libc::SIGKILL);
        }
    }
}

/// Read the PID persisted in `<worktree_path>/.tempest-pid`, if the file exists
/// and holds a valid integer. Used as a fallback source of the PTY child's PID
/// when `Child::process_id()` returns `None` (ConPTY can report `None`) or when
/// `PtyState` no longer tracks the session (e.g. after an app restart).
fn read_pid_file(worktree_path: &str) -> Option<u32> {
    std::fs::read_to_string(pid_file_path(worktree_path))
        .ok()
        .and_then(|contents| contents.trim().parse::<u32>().ok())
}

/// `<app_data>/atlas-daemons.json` — persisted `project_path → pid` map for
/// every atlas daemon Tempest currently owns, used by the startup orphan
/// sweep to reap leaks from a crashed previous Tempest.
fn atlas_daemons_file(app: &tauri::AppHandle) -> Option<std::path::PathBuf> {
    use tauri::Manager;
    app.path().app_data_dir().ok().map(|d| d.join("atlas-daemons.json"))
}

fn atlas_daemons_read(app: &tauri::AppHandle) -> std::collections::HashMap<String, u32> {
    atlas_daemons_file(app)
        .and_then(|p| std::fs::read_to_string(p).ok())
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

fn atlas_daemons_write(app: &tauri::AppHandle, map: &std::collections::HashMap<String, u32>) {
    if let Some(p) = atlas_daemons_file(app) {
        if let Some(parent) = p.parent() { let _ = std::fs::create_dir_all(parent); }
        if let Ok(s) = serde_json::to_string(map) { let _ = std::fs::write(p, s); }
    }
}

fn atlas_daemons_set(app: &tauri::AppHandle, project_path: &str, pid: Option<u32>) {
    let mut map = atlas_daemons_read(app);
    match pid {
        Some(p) => { map.insert(project_path.to_string(), p); }
        None    => { map.remove(project_path); }
    }
    atlas_daemons_write(app, &map);
}

/// Startup orphan sweep. Kills leaked PTY-shell PIDs (via `.tempest-pid`
/// sidecars in each known worktree) and leaked atlas daemon PIDs (via
/// `atlas-daemons.json` in app-data) left behind by a previous Tempest
/// that crashed before cleaning up, then clears the persisted records.
///
/// ponytail: sweeps by PID only. Windows recycles PIDs after a reboot,
/// so in the narrow window "previous Tempest crashed → machine rebooted →
/// an unrelated process now owns that PID → user relaunches Tempest" we
/// could kill something we shouldn't. Upgrade path: persist process
/// creation time alongside the PID and cross-check before killing.
fn sweep_orphan_processes(app: tauri::AppHandle, worktrees: Vec<String>) {
    let me = std::process::id();
    for wt in worktrees {
        if let Some(pid) = read_pid_file(&wt) {
            if pid != 0 && pid != me { kill_pid_tree(pid); }
            let _ = std::fs::remove_file(pid_file_path(&wt));
        }
    }
    let map = atlas_daemons_read(&app);
    for pid in map.values() {
        if *pid != 0 && *pid != me { kill_pid_tree(*pid); }
    }
    atlas_daemons_write(&app, &Default::default());
}

pub struct PtyState(pub(crate) Arc<DashMap<String, Arc<PtySession>>>);

pub struct ZenState(pub Mutex<std::collections::HashMap<String, (String, String)>>);

/// (child, KILL_ON_JOB_CLOSE handle). Dropping the LifecycleJob kills the
/// daemon subtree — so even a hard-crashed Tempest cannot leak node.exe.
/// `None` when the OS refused the job attach (very rare) or on non-Windows.
pub struct DaemonState(pub Mutex<std::collections::HashMap<String, (std::process::Child, Option<hephaestus::LifecycleJob>)>>);

pub struct RunState(pub Mutex<std::collections::HashMap<String, std::process::Child>>);

pub struct DbState(pub Mutex<rusqlite::Connection>);

struct McpBridgeProcess {
    child:   std::process::Child,
    writer:  std::io::BufWriter<std::process::ChildStdin>,
    reader:  std::io::BufReader<std::process::ChildStdout>,
    next_id: u64,
    /// KILL_ON_JOB_CLOSE handle for the bridge subtree. Dropping this reaps
    /// the node.exe even if Tempest crashes. `None` on non-Windows or job
    /// attach failure.
    _job:    Option<hephaestus::LifecycleJob>,
}

pub struct AtlasMcpState(pub(crate) Mutex<std::collections::HashMap<String, McpBridgeProcess>>);

#[tauri::command]
fn open_zen_window(
    app: tauri::AppHandle,
    state: tauri::State<'_, ZenState>,
    path: String,
    name: String,
) -> Result<(), String> {
    let label = format!(
        "zen-{}",
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_millis())
            .unwrap_or(0)
    );
    state.0.lock().unwrap().insert(label.clone(), (path, name));
    tauri::WebviewWindowBuilder::new(
        &app,
        &label,
        tauri::WebviewUrl::App("index.html".into()),
    )
    .title("Tempest")
    .decorations(false)
    .inner_size(1280.0, 800.0)
    .center()
    .disable_drag_drop_handler()
    .build()
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn get_zen_config(
    state: tauri::State<'_, ZenState>,
    label: String,
) -> Option<(String, String)> {
    state.0.lock().unwrap().get(&label).cloned()
}

/// The resolved interactive shell binary, probed once and cached for the life of
/// the process. Probing `pwsh` (spawning `pwsh -?`) costs ~100–200ms on Windows,
/// which previously ran on *every* PTY spawn; caching makes subsequent spawns
/// instant.
static SHELL: std::sync::OnceLock<String> = std::sync::OnceLock::new();

/// Probe the platform for the preferred interactive shell. On Windows this checks
/// whether PowerShell Core (`pwsh`) is available and falls back to the bundled
/// `powershell.exe`; on Unix it honors `$SHELL` and falls back to `/bin/bash`.
/// Called at most once per process via `SHELL.get_or_init`.
fn resolve_shell() -> String {
    #[cfg(windows)]
    {
        if new_command("pwsh").arg("-?").output().is_ok() {
            "pwsh".to_string()
        } else {
            "powershell.exe".to_string()
        }
    }
    #[cfg(not(windows))]
    {
        std::env::var("SHELL").unwrap_or_else(|_| "/bin/bash".to_string())
    }
}

#[cfg(not(windows))]
fn agent_shell_args(agent_invocation: String) -> Vec<String> {
    vec![
        "-lic".into(),
        format!("{}; exec $SHELL -il", agent_invocation),
    ]
}

#[cfg(all(test, not(windows)))]
mod agent_shell_args_tests {
    #[test]
    fn launches_agent_from_interactive_login_shell() {
        assert_eq!(
            super::agent_shell_args("codex".into()),
            vec!["-lic", "codex; exec $SHELL -il"]
        );
    }
}

#[tauri::command]
async fn create_pty_session(
    session_id: String,
    cwd: String,
    rows: u16,
    cols: u16,
    command: Option<String>,
    args: Option<Vec<String>>,
    sandbox: Option<SandboxSpec>,
    policy: Option<SessionPolicy>,
    db_isolation: Option<bool>,
    // Extra environment from the project's `tempest.yml`. Names are validated and
    // loader/DB variables stripped on the frontend before they reach here.
    env: Option<std::collections::HashMap<String, String>>,
    on_event: Channel<PtyOutputPayload>,
    state: tauri::State<'_, PtyState>,
) -> Result<(), String> {
    // ── Launch policy ────────────────────────────────────────────────────────
    // Refuse disallowed launches before any resource is acquired: no PTY, no
    // Docker branch, no Job Object. Only agent sessions are vetted — `command`
    // is `None` for a plain shell.
    if let (Some(pol), Some(agent)) = (policy.as_ref(), command.as_ref()) {
        if !pol.permitted_agents.iter().any(|a| a == agent) {
            return Err(format!(
                "`{agent}` is not a permitted agent for this project. \
                 Enable it in Project Settings → Agents."
            ));
        }

        if !pol.allow_skip_permissions {
            if let Some(args) = args.as_ref() {
                if let Some(flag) = args
                    .iter()
                    .find(|a| pol.skip_permission_flags.iter().any(|f| f == *a))
                {
                    return Err(format!(
                        "`{flag}` is blocked for this project. \
                         Enable it in Project Settings → Permissions."
                    ));
                }
            }
        }
    }

    // Resolve (and cache) the shell once. Cheap if already populated; the first
    // call performs the ~100–200ms probe so no individual session pays for it twice.
    SHELL.get_or_init(resolve_shell);

    // DB isolation: spin up a Docker branch of the base image and inject env vars.
    // Silently skipped if no base image exists or Docker is unavailable.
    let db_branch: Option<dbiso::DbBranch> = if db_isolation.unwrap_or(false) {
        if dbiso::get_current_base_image(&cwd).is_some() {
            let branch_name = format!("tempest-{}", &session_id[..8.min(session_id.len())]);
            dbiso::branch_create(&branch_name, &cwd).await.ok()
        } else {
            None
        }
    } else {
        None
    };

    // The environment ID must equal the session ID so isolation state and the
    // PTY session share one key. Cloned because `session_id` is used again after
    // the blocking closure returns.
    let env_id = session_id.clone();

    // The blocking part — opening the PTY and spawning the shell/agent process —
    // runs on a dedicated blocking thread so it never starves Tauri's bounded IPC
    // worker pool. `tauri::State` is not `Send`, so the registry insert happens
    // back on the async side *after* this completes. All owned params move in.
    let db_branch_name_stored = db_branch.as_ref().map(|b| b.name.clone());
    let session_id_log = session_id.clone();
    let (session, reader) = tauri::async_runtime::spawn_blocking(move || {
        let pty_system = native_pty_system();
        let size = PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        };
        let pair = pty_system.openpty(size).map_err(|e| e.to_string())?;

        // Resolve the base program + argument list for the shell invocation.
        // The sandbox (if any) transforms these before the command is built.
        let shell = SHELL.get_or_init(resolve_shell).clone();
        let (program, cmd_args): (String, Vec<String>) = if let Some(ref agent_exe) = command {
            // Agent session: build the full agent invocation as a string, then run it inside
            // an interactive shell with -NoExit / exec so the terminal stays alive after exit.
            // All session/resume flags and the prompt are pre-assembled by the frontend and
            // arrive in `args` — Rust only shell-quotes and joins them onto the binary name.
            // Shell-quote each arg for the target interpreter. The escapes for a
            // literal `'` inside a `'...'` string differ:
            //   PowerShell → `''`  (doubled)
            //   POSIX sh   → `'\''` (close, escaped literal, reopen)
            // The previous `'''` worked for neither and blew up on prompts
            // containing apostrophes (e.g. issue-body checklists like `I'm ...`).
            #[cfg(windows)]
            fn quote_arg(s: &str) -> String {
                format!("'{}'", s.replace('\'', "''"))
            }
            #[cfg(not(windows))]
            fn quote_arg(s: &str) -> String {
                format!("'{}'", s.replace('\'', "'\\''"))
            }
            let mut parts: Vec<String> = vec![agent_exe.clone()];
            if let Some(ref extra) = args {
                for arg in extra {
                    if arg.contains(' ') || arg.contains('\'') || arg.contains('\n') {
                        parts.push(quote_arg(arg));
                    } else {
                        parts.push(arg.clone());
                    }
                }
            }
            let agent_invocation = parts.join(" ");

            #[cfg(windows)]
            {
                (shell.clone(), vec![
                    "-NoLogo".into(),
                    "-NoExit".into(),
                    "-Command".into(),
                    agent_invocation,
                ])
            }
            #[cfg(not(windows))]
            {
                (shell.clone(), agent_shell_args(agent_invocation))
            }
        } else {
            // Bare shell session
            #[cfg(windows)]
            {
                (shell.clone(), Vec::new())
            }
            #[cfg(not(windows))]
            {
                (shell.clone(), interactive_login_shell_args())
            }
        };

        // Optionally provision a Hephaestus isolation environment and rewrite the
        // command through it. `mode == "off"` (or no sandbox at all) keeps the
        // original unsandboxed path. Yields the handle to store for teardown plus
        // the sandbox-transformed command to spawn.
        let sandboxed: Option<(hephaestus::IsolateHandle, hephaestus::SandboxedCommand)> =
            match sandbox {
                Some(ref sb) if sb.mode == "lifecycle" => {
                    // Lifecycle-only isolation: Job Object on Windows, no-op elsewhere.
                    // WindowsIsolate::prepare is a no-op (no command wrapping, no
                    // network/path restrictions) — the Job Object is the sole mechanism.
                    // On Linux/macOS, process groups + PTY teardown provide equivalent
                    // kill-on-close semantics; the lifecycle_job branch below fires too.
                    if cfg!(windows) {
                        let isolate = ISOLATE.get_or_init(hephaestus::platform);
                        let spec = hephaestus::EnvironmentSpec::builder(env_id.as_str(), &cwd)
                            // Explicitly Off. The builder defaults to Enforce with an
                            // empty (deny-all) policy — which, now that the Windows
                            // backend honours network policy, would start a CONNECT
                            // proxy and block every request on a session the user
                            // asked NOT to sandbox. The Job Object is created either
                            // way, so kill-on-close is unaffected.
                            .mode(hephaestus::SandboxMode::Off)
                            // Quotas still apply: they are independent of sandbox mode.
                            .resources(sb.resources.to_limits())
                            .build()
                            .map_err(|e| e.to_string())?;
                        let handle = isolate.create(spec).map_err(|e| e.to_string())?;
                        let prog_os = std::ffi::OsString::from(&program);
                        let args_os: Vec<std::ffi::OsString> =
                            cmd_args.iter().map(std::ffi::OsString::from).collect();
                        let prepared = isolate
                            .prepare(&handle, prog_os.as_os_str(), &args_os)
                            .map_err(|e| e.to_string())?;
                        Some((handle, prepared))
                    } else {
                        None
                    }
                }
                Some(ref sb) if sb.mode != "off" => {
                    let isolate = ISOLATE.get_or_init(hephaestus::platform);
                    let mode = match sb.mode.as_str() {
                        "monitor" => hephaestus::SandboxMode::Monitor,
                        _ => hephaestus::SandboxMode::Enforce,
                    };
                    let mut builder = hephaestus::EnvironmentSpec::builder(env_id.as_str(), &cwd)
                        .mode(mode)
                        .network_default_allow(sb.network_default_allow);
                    for host in &sb.allowed_hosts {
                        builder = builder.allow_host(host.as_str());
                    }
                    for host in &sb.block_hosts {
                        builder = builder.block_host(host.as_str());
                    }
                    for p in &sb.rw_paths {
                        builder = builder.mount(hephaestus::PathMount::rw(p));
                    }
                    for p in &sb.ro_paths {
                        builder = builder.mount(hephaestus::PathMount::ro(p));
                    }

                    builder = builder.resources(sb.resources.to_limits());
                    let spec = builder.build().map_err(|e| e.to_string())?;
                    let handle = isolate.create(spec).map_err(|e| e.to_string())?;

                    let prog_os = std::ffi::OsString::from(&program);
                    let args_os: Vec<std::ffi::OsString> =
                        cmd_args.iter().map(std::ffi::OsString::from).collect();
                    let prepared = isolate
                        .prepare(&handle, prog_os.as_os_str(), &args_os)
                        .map_err(|e| e.to_string())?;
                    Some((handle, prepared))
                }
                _ => None,
            };

        // Build the CommandBuilder from either the sandbox-transformed command or
        // the plain base command.
        let mut cmd = if let Some((_, ref prepared)) = sandboxed {
            let mut c = CommandBuilder::new(&prepared.program);
            for a in &prepared.args {
                c.arg(a);
            }
            for (k, v) in &prepared.env {
                c.env(k, v);
            }
            match prepared.working_dir {
                Some(ref wd) => c.cwd(wd),
                None => c.cwd(&cwd),
            }
            c
        } else {
            let mut c = CommandBuilder::new(&program);
            for a in &cmd_args {
                c.arg(a);
            }
            c.cwd(&cwd);
            c
        };

        #[cfg(not(windows))]
        cmd.env("TERM", "xterm-256color");

        // Project env from tempest.yml. Applied before the DB block below so an
        // isolated session's DATABASE_URL can never be shadowed by the repo.
        if let Some(ref extra) = env {
            for (k, v) in extra {
                cmd.env(k, v);
            }
        }

        // Inject DB isolation env vars so agents see an isolated DATABASE_URL.
        if let Some(ref b) = db_branch {
            cmd.env("DATABASE_URL", &b.connection_string);
            cmd.env("PGHOST", "127.0.0.1");
            cmd.env("PGPORT", b.port.to_string());
            cmd.env("PGUSER", "postgres");
            cmd.env("PGDATABASE", "postgres");
        }

        let child = pair.slave.spawn_command(cmd).map_err(|e| e.to_string())?;

        // Persist the child's OS PID to a sidecar file inside the worktree so the
        // workspace can still be force-killed after an app restart wipes PtyState.
        // Fail silently — a missing PID file must never break PTY creation.
        if let Some(pid) = child.process_id() {
            let _ = std::fs::write(pid_file_path(&cwd), pid.to_string());

            // Assign the freshly-spawned process to its Job Object. On Windows
            // this must happen after spawn (Job Objects have no spawn-time hook);
            // on other platforms `post_spawn` is a no-op.
            if let Some((ref handle, _)) = sandboxed {
                let isolate = ISOLATE.get_or_init(hephaestus::platform);
                isolate.post_spawn(handle, pid).map_err(|e| e.to_string())?;
            }
        }

        let reader = pair.master.try_clone_reader().map_err(|e| e.to_string())?;
        let writer = pair.master.take_writer().map_err(|e| e.to_string())?;

        let isolate_handle = sandboxed.map(|(handle, _)| handle);

        // Provision a lifecycle-only kill-on-close Job Object for sessions that
        // are NOT already covered by the Hephaestus sandbox (which creates its
        // own `KILL_ON_JOB_CLOSE` job). This ensures the shell and its entire
        // `CreateProcess` subtree are killed atomically when the session closes
        // or the app exits — even on a crash — without relying on `taskkill /T`
        // tree-walking, which misses processes reparented via `Start-Process` /
        // ShellExecute brokering (e.g. bare `notepad` typed in the terminal).
        //
        // Failure is best-effort: if the OS refuses assignment (rare — e.g. a
        // restricted launcher already placed the process in an incompatible job),
        // we log to stderr and continue. `taskkill /F /T` remains a fallback.
        let lifecycle_job: Option<hephaestus::LifecycleJob> = if isolate_handle.is_none() {
            match child.process_id() {
                None => {
                    eprintln!("[tempest] lifecycle_job: child.process_id() returned None — no job attached");
                    None
                }
                Some(pid) => {
                    eprintln!("[tempest] lifecycle_job: attaching job for session={session_id_log} pid={pid}");
                    match hephaestus::lifecycle_job(pid) {
                        Ok(job) => {
                            eprintln!("[tempest] lifecycle_job: attached ok for session={session_id_log} pid={pid}");
                            Some(job)
                        }
                        Err(e) => {
                            eprintln!("[tempest] lifecycle_job: FAILED for session={session_id_log} pid={pid}: {e}");
                            None
                        }
                    }
                }
            }
        } else {
            eprintln!("[tempest] lifecycle_job: session={session_id_log} has sandbox — skipping lifecycle job");
            None // sandbox already has its own KILL_ON_JOB_CLOSE job
        };

        Ok::<_, String>((
            PtySession {
                writer: Mutex::new(writer),
                master: Mutex::new(pair.master),
                _slave: Mutex::new(pair.slave),
                child:  Mutex::new(child),
                cwd,
                isolate_handle: Mutex::new(isolate_handle),
                lifecycle_job: Mutex::new(lifecycle_job),
                db_branch_name: Mutex::new(db_branch_name_stored),
            },
            reader,
        ))
    })
    .await
    .map_err(|e| e.to_string())??;

    // Pump PTY output to the frontend on a background thread, through this
    // session's dedicated channel — O(1), no broadcast, no filtering. Reads
    // are coalesced across a 16 ms window (or 64 KiB) so heavy output
    // (`cargo build`, `npm install`, agent stdout floods) fires ~60 IPC events
    // per second instead of thousands. Reader thread stays hot on the PTY;
    // a batcher thread drains the mpsc and does the flushing.
    let sid = session_id.clone();
    let on_event_clone = on_event.clone();
    let mut reader = reader;
    let (tx, rx) = std::sync::mpsc::channel::<Vec<u8>>();
    std::thread::spawn(move || {
        let mut buf = [0u8; 4096];
        loop {
            match reader.read(&mut buf) {
                Ok(0) | Err(_) => break,
                Ok(n) => {
                    if tx.send(buf[..n].to_vec()).is_err() { break; }
                }
            }
        }
    });
    std::thread::spawn(move || {
        use std::time::{Duration, Instant};
        const FLUSH_WINDOW: Duration = Duration::from_millis(16);
        const MAX_BATCH: usize = 64 * 1024;
        loop {
            // Block for the first chunk of this batch.
            let Ok(first) = rx.recv() else { break; };
            let mut pending = first;
            let deadline = Instant::now() + FLUSH_WINDOW;
            while pending.len() < MAX_BATCH {
                let now = Instant::now();
                if now >= deadline { break; }
                match rx.recv_timeout(deadline - now) {
                    Ok(more)                                          => pending.extend_from_slice(&more),
                    Err(std::sync::mpsc::RecvTimeoutError::Timeout)   => break,
                    Err(std::sync::mpsc::RecvTimeoutError::Disconnected) => {
                        let data = String::from_utf8_lossy(&pending).to_string();
                        on_event_clone.send(PtyOutputPayload { session_id: sid.clone(), data }).ok();
                        return;
                    }
                }
            }
            let data = String::from_utf8_lossy(&pending).to_string();
            on_event_clone.send(PtyOutputPayload { session_id: sid.clone(), data }).ok();
        }
    });

    state.0.insert(session_id, Arc::new(session));

    Ok(())
}

#[tauri::command]
fn write_to_pty(
    session_id: String,
    data: Vec<u8>,
    state: tauri::State<'_, PtyState>,
) -> Result<(), String> {
    let session_arc = state.0.get(&session_id).map(|r| Arc::clone(&*r));
    if let Some(session) = session_arc {
        session.writer.lock().unwrap().write_all(&data).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
fn resize_pty(
    session_id: String,
    rows: u16,
    cols: u16,
    state: tauri::State<'_, PtyState>,
) -> Result<(), String> {
    let session_arc = state.0.get(&session_id).map(|r| Arc::clone(&*r));
    if let Some(session) = session_arc {
        session.master.lock().unwrap()
            .resize(PtySize { rows, cols, pixel_width: 0, pixel_height: 0 })
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command(async)]
fn close_pty_session(
    session_id: String,
    state: tauri::State<'_, PtyState>,
) -> Result<(), String> {
    // Atomically remove the session from the map and operate through its Arc.
    let removed = state.0.remove(&session_id).map(|(_, arc)| arc);
    if let Some(session) = removed {
        // Capture the child PID before any killing. Fall back to the persisted
        // sidecar PID if `process_id()` returns `None` (ConPTY can report `None`),
        // so we always have a target for the process-tree kill.
        let child_pid = session
            .child
            .lock()
            .unwrap()
            .process_id()
            .or_else(|| read_pid_file(&session.cwd));

        // Fire-and-forget DB branch cleanup.
        if let Some(branch_name) = session.db_branch_name.lock().unwrap().take() {
            tauri::async_runtime::spawn(async move {
                let _ = dbiso::branch_delete(&branch_name).await;
            });
        }

        // Drop the lifecycle job first: closing the Job Object handle fires
        // JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE and terminates the tree atomically.
        // This reaches children that `taskkill /T` cannot (e.g. processes
        // reparented via Start-Process / ShellExecute brokering).
        let had_job = session.lifecycle_job.lock().unwrap().take().is_some();
        eprintln!("[tempest] close_pty_session: session={session_id} lifecycle_job present={had_job}");

        // Destroy the Hephaestus isolation environment so its Job Object handle
        // is also closed (triggering KILL_ON_JOB_CLOSE for sandboxed sessions).
        // IsolateHandle::drop is a no-op; destroy() is the only path that closes
        // the Win32 handle and fires the process-tree kill.
        if let Some(handle) = session.isolate_handle.lock().unwrap().take() {
            let isolate = ISOLATE.get_or_init(hephaestus::platform);
            let _ = isolate.destroy(handle);
        }

        // Secondary sweep via taskkill /F /T — catches any processes that never
        // joined the Job Object (e.g. spawned before post_spawn ran, or escaped
        // via CREATE_BREAKAWAY_FROM_JOB). `taskkill /T` walks the live
        // parent→child chain, so we run it before killing the PTY child itself;
        // killing the shell first would reparent descendants and let them escape.
        if let Some(pid) = child_pid {
            kill_pid_tree(pid);
        }

        // Kill the PTY child itself.
        let _ = session.child.lock().unwrap().kill();

        // Wait for exit (bounded loop) — without this the command returns while
        // the OS is still tearing the process down, leaving the worktree dir
        // locked (os error 32).
        for _ in 0..40u32 {
            match session.child.lock().unwrap().try_wait() {
                Ok(Some(_)) => break,
                Ok(None) => std::thread::sleep(std::time::Duration::from_millis(25)),
                Err(_) => break,
            }
        }

        // Remove PID sidecar
        let _ = std::fs::remove_file(pid_file_path(&session.cwd));
    }

    Ok(())
}

/// Kill a PTY session (if present) and remove its worktree directory in a
/// single Rust round-trip. Collapsing the two operations avoids the frontend
/// race where React state updates between two separate invokes drop the pending
/// `close_pty_session` callback before Rust finishes killing the process — which
/// left the PowerShell child alive and the worktree dir locked (os error 32).
#[tauri::command(async)]
fn close_and_remove_worktree(
    session_id: String,
    repo_path: String,
    worktree_path: String,
    state: tauri::State<'_, PtyState>,
) -> Result<(), String> {
    // 1-4. Kill the PTY child and wait for it to fully exit, then drop handles.
    //      If the session isn't in the map (already closed), skip straight to
    //      directory removal.
    let removed = state.0.remove(&session_id).map(|(_, arc)| arc);

    // Resolve the child PID to kill: prefer the live session's, fall back to the
    // persisted sidecar (works even after an app restart wiped `PtyState`, and
    // when `process_id()` returns `None`).
    let child_pid = removed
        .as_ref()
        .and_then(|s| s.child.lock().unwrap().process_id())
        .or_else(|| read_pid_file(&worktree_path));

    if let Some(ref session) = removed {
        // Fire-and-forget DB branch cleanup.
        if let Some(branch_name) = session.db_branch_name.lock().unwrap().take() {
            tauri::async_runtime::spawn(async move {
                let _ = dbiso::branch_delete(&branch_name).await;
            });
        }

        // Drop the lifecycle job FIRST: closing the Job Object handle fires
        // JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE and terminates the process tree
        // atomically — including processes reparented via Start-Process /
        // ShellExecute that `taskkill /T` cannot reach.
        let had_job = session.lifecycle_job.lock().unwrap().take().is_some();
        eprintln!("[tempest] close_and_remove_worktree: session={session_id} lifecycle_job present={had_job}");

        // Then destroy the Hephaestus isolation environment (sandboxed sessions).
        // IsolateHandle::drop is a no-op; destroy() is the only path that closes
        // the Win32 handle and fires the kill for sandboxed sessions.
        if let Some(handle) = session.isolate_handle.lock().unwrap().take() {
            let isolate = ISOLATE.get_or_init(hephaestus::platform);
            let _ = isolate.destroy(handle);
        }
    }

    // Secondary sweep via taskkill /F /T — catches processes that never joined
    // the Job Object. Run before killing the PTY child so descendants are still
    // reachable via the live parent→child chain. No sleep needed — the child
    // wait loop and directory-removal retry below absorb any handle-release lag.
    if let Some(pid) = child_pid {
        kill_pid_tree(pid);
    }

    if let Some(ref session) = removed {
        // Kill the child. On Windows portable-pty kills the whole job object
        // (shell + descendants such as the agent CLI) — exactly what holds the
        // CWD lock on the worktree directory.
        let _ = session.child.lock().unwrap().kill();

        // Block until the process has actually exited (up to ~3s). Without this
        // the directory removal below races a process that's still tearing down.
        for _ in 0..60u32 {
            match session.child.lock().unwrap().try_wait() {
                Ok(Some(_)) => break, // exited
                Ok(None) => std::thread::sleep(std::time::Duration::from_millis(50)),
                Err(_) => break, // can't query — stop waiting
            }
        }
    }
    // The sidecar lives inside the worktree, so removing the directory below
    // also removes it — no explicit unlink needed here.

    // 6. Remove the worktree directory.
    #[cfg(windows)]
    let worktree_path = worktree_path.replace('/', "\\");

    // Remove any directory junctions / symlinks we created for DIRS_TO_LINK
    // (node_modules, .venv) BEFORE attempting any directory deletion.
    // git worktree remove and remove_dir_all both follow Windows junctions,
    // which would traverse into — and destroy — the real node_modules.
    remove_dir_links(std::path::Path::new(&worktree_path));

    // Try git's own removal first (handles deregistration + directory delete).
    let out = new_command("git")
        .args(["-C", &repo_path, "worktree", "remove", "--force", &worktree_path])
        .output()
        .map_err(|e| e.to_string())?;

    if !out.status.success() {
        // Git failed — fall back to direct directory removal with a retry loop
        // (6 attempts × 500ms) to ride out any lingering handle lag on Windows.
        let path = std::path::Path::new(&worktree_path);
        if path.exists() {
            let mut last_err = String::new();
            for i in 0..6u32 {
                if i > 0 {
                    std::thread::sleep(std::time::Duration::from_millis(500));
                }
                match std::fs::remove_dir_all(path) {
                    Ok(()) => {
                        last_err = String::new();
                        break;
                    }
                    Err(e) => last_err = format!("Failed to remove directory: {}", e),
                }
            }

            // Last resort (Windows): shell out to `cmd /c rmdir /s /q`, which
            // can succeed where Rust's fs::remove_dir_all hits os error 32.
            #[cfg(windows)]
            if !last_err.is_empty() && path.exists() {
                let out = new_command("cmd")
                    .args(["/c", "rmdir", "/s", "/q", &worktree_path])
                    .output();
                if matches!(out, Ok(ref o) if o.status.success()) || !path.exists() {
                    last_err = String::new();
                }
            }

            if !last_err.is_empty() {
                return Err(last_err);
            }
        }
    }

    // 7. Prune any dangling .git/worktrees/<name> refs left behind.
    let _ = new_command("git")
        .args(["-C", &repo_path, "worktree", "prune"])
        .output();

    Ok(())
}

// ── Co-author hook ───────────────────────────────────────────────────────────

const HOOK_BEGIN: &str = "# Tempest-attribution-begin";
const HOOK_END:   &str = "# Tempest-attribution-end";

/// Write (or append) a `prepare-commit-msg` hook that adds a co-author trailer.
/// Idempotent — calling it twice has no extra effect.
#[tauri::command(async)]
fn write_coauthor_hook(repo_path: String, coauthor_line: String) -> Result<(), String> {
    let hooks_dir = std::path::Path::new(&repo_path).join(".git").join("hooks");
    std::fs::create_dir_all(&hooks_dir).map_err(|e| e.to_string())?;

    let hook_path = hooks_dir.join("prepare-commit-msg");

    // Build the Tempest block (no Rust format specifiers — %s is shell syntax)
    let block = format!(
        "{begin}\nCOAUTHOR=\"{coauthor}\"\nif ! grep -qF \"$COAUTHOR\" \"$1\"; then\n  printf '\\n\\n%s\\n' \"$COAUTHOR\" >> \"$1\"\nfi\n{end}\n",
        begin = HOOK_BEGIN,
        coauthor = coauthor_line,
        end = HOOK_END,
    );

    if hook_path.exists() {
        let existing = std::fs::read_to_string(&hook_path).map_err(|e| e.to_string())?;
        if existing.contains(HOOK_BEGIN) {
            return Ok(()); // already installed
        }
        let new_content = format!("{}\n{}", existing.trim_end(), block);
        std::fs::write(&hook_path, new_content).map_err(|e| e.to_string())?;
    } else {
        std::fs::write(&hook_path, format!("#!/bin/sh\n{}", block))
            .map_err(|e| e.to_string())?;
    }

    // Ensure the hook is executable on Unix/macOS
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let mut perms = std::fs::metadata(&hook_path).map_err(|e| e.to_string())?.permissions();
        perms.set_mode(0o755);
        std::fs::set_permissions(&hook_path, perms).map_err(|e| e.to_string())?;
    }

    Ok(())
}

/// Remove the Tempest co-author block from the `prepare-commit-msg` hook.
/// Deletes the file entirely if nothing else remains.
#[tauri::command(async)]
fn remove_coauthor_hook(repo_path: String) -> Result<(), String> {
    let hook_path = std::path::Path::new(&repo_path)
        .join(".git").join("hooks").join("prepare-commit-msg");

    if !hook_path.exists() { return Ok(()); }

    let content = std::fs::read_to_string(&hook_path).map_err(|e| e.to_string())?;
    if !content.contains(HOOK_BEGIN) { return Ok(()); }

    // Strip lines between (and including) the markers
    let mut out = String::new();
    let mut in_block = false;
    for line in content.lines() {
        if line.trim() == HOOK_BEGIN { in_block = true; continue; }
        if line.trim() == HOOK_END   { in_block = false; continue; }
        if !in_block {
            out.push_str(line);
            out.push('\n');
        }
    }

    let trimmed = out.trim();
    if trimmed.is_empty() || trimmed == "#!/bin/sh" {
        std::fs::remove_file(&hook_path).map_err(|e| e.to_string())?;
    } else {
        std::fs::write(&hook_path, format!("{}\n", out.trim_end()))
            .map_err(|e| e.to_string())?;
    }

    Ok(())
}

// ── Live Preview (child webview) ─────────────────────────────────────────────

#[tauri::command]
async fn embed_ide_panel(
    window: tauri::Window,
    panel_id: String,
    url: String,
    x: f64,
    y: f64,
    width: f64,
    height: f64,
) -> Result<(), String> {
    let parsed = url::Url::parse(&url).map_err(|e| e.to_string())?;
    let webview = tauri::WebviewBuilder::new(&panel_id, tauri::WebviewUrl::External(parsed));
    window
        .add_child(
            webview,
            tauri::LogicalPosition::new(x, y),
            tauri::LogicalSize::new(width, height),
        )
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
async fn resize_ide_panel(
    window: tauri::Window,
    panel_id: String,
    x: f64,
    y: f64,
    width: f64,
    height: f64,
) -> Result<(), String> {
    use tauri::Manager;
    if let Some(webview) = window.get_webview(&panel_id) {
        webview.set_position(tauri::LogicalPosition::new(x, y)).map_err(|e| e.to_string())?;
        webview.set_size(tauri::LogicalSize::new(width, height)).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
async fn destroy_ide_panel(
    window: tauri::Window,
    panel_id: String,
) -> Result<(), String> {
    use tauri::Manager;
    if let Some(webview) = window.get_webview(&panel_id) {
        webview.close().map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
async fn get_ide_panel_url(
    window: tauri::Window,
    panel_id: String,
) -> Result<Option<String>, String> {
    use tauri::Manager;
    if let Some(webview) = window.get_webview(&panel_id) {
        let url = webview.url().map_err(|e| e.to_string())?;
        Ok(Some(url.to_string()))
    } else {
        Ok(None)
    }
}

// ── Host machine identity ────────────────────────────────────────────────────

/// OS hostname, used as the default device name when generating a mobile
/// pairing QR. Falls back to "Tempest desktop" if the platform lookup fails.
#[tauri::command]
fn get_hostname() -> String {
    #[cfg(windows)]
    {
        std::env::var("COMPUTERNAME").unwrap_or_else(|_| "Tempest desktop".into())
    }
    #[cfg(unix)]
    {
        use std::ffi::CStr;
        let mut buf = [0u8; 256];
        // SAFETY: buf is a valid mutable byte buffer of the given length.
        let rc = unsafe { libc::gethostname(buf.as_mut_ptr() as *mut _, buf.len()) };
        if rc == 0 {
            let cstr = unsafe { CStr::from_ptr(buf.as_ptr() as *const _) };
            cstr.to_string_lossy().into_owned()
        } else {
            "Tempest desktop".into()
        }
    }
}

// ── App ──────────────────────────────────────────────────────────────────────

/// Open the webview devtools. Compiled in for release builds via the tauri
/// `devtools` feature, so this works in shipped installers, not just dev.
#[tauri::command]
fn open_devtools(app: tauri::AppHandle) {
    use tauri::Manager;
    if let Some(window) = app.get_webview_window("main") {
        window.open_devtools();
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Sidecar MCP mode: an external CLI agent spawned us as its canvas MCP server
    // (`--canvas-mcp`). Serve stdio and exit *before* touching Tauri/single-instance,
    // so this instance never becomes a second window.
    if canvas_mcp::maybe_serve() {
        return;
    }
    let mut builder = tauri::Builder::default();
    // Single-instance guard MUST be the first plugin. When a second
    // Tempest.exe is launched, its argv is forwarded here and the process
    // exits — no second PTY registry, atlas daemons, or DB scheduler.
    // The callback focuses the existing main window so the user sees the
    // click do something. Skipped in debug builds so a `tauri dev` run can
    // coexist with a production Tempest the user has open for real work.
    #[cfg(not(debug_assertions))]
    {
        builder = builder.plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            use tauri::Manager;
            if let Some(w) = app.get_webview_window("main") {
                let _ = w.unminimize();
                let _ = w.show();
                let _ = w.set_focus();
            }
        }));
    }
    builder
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_notification::init())
        .manage(PtyState(Arc::new(DashMap::new())))
        .manage(ZenState(Mutex::new(std::collections::HashMap::new())))
        .manage(DaemonState(Mutex::new(std::collections::HashMap::new())))
        .manage(RunState(Mutex::new(std::collections::HashMap::new())))
        .manage(AtlasMcpState(Mutex::new(std::collections::HashMap::new())))
        .manage(claude_bridge::ClaudeState(Arc::new(DashMap::new())))
        .setup(|app| {
            use tauri::Manager;
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.set_icon(tauri::include_image!("icons/icon.png"));
            }
            let db_dir = app.handle().path().app_data_dir()
                .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e.to_string()))?;
            let conn = init_db(app.handle())
                .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e))?;
            // Re-allow asset:// scope for every persisted project/branch path.
            // The config now starts closed; without this, images referenced from
            // files in a re-opened project won't load.
            let handle = app.handle().clone();
            let mut worktree_paths: Vec<String> = Vec::new();
            for sql in ["SELECT path FROM projects WHERE archived_at IS NULL", "SELECT path FROM branches"] {
                if let Ok(mut stmt) = conn.prepare(sql) {
                    if let Ok(rows) = stmt.query_map([], |r| r.get::<_, String>(0)) {
                        for p in rows.flatten() {
                            allow_project_asset_scope(&handle, &p);
                            worktree_paths.push(p);
                        }
                    }
                }
            }
            app.manage(DbState(Mutex::new(conn)));
            // Reap PTY shells / atlas daemons leaked by a previous crashed
            // Tempest. Spawned so it never blocks first paint.
            let sweep_handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                sweep_orphan_processes(sweep_handle, worktree_paths);
            });
            automations::start_scheduler(app.handle().clone(), db_dir.join("tempest.db"));
            tauri::async_runtime::spawn(async { let _ = dbiso::sweep_orphans().await; });
            // Loopback receiver for agent lifecycle hooks. Best-effort; a bind
            // failure leaves sessions on PTY-scraped status.
            agent_hooks::start(app.handle().clone());
            // Per-branch dev-server hostname proxy. Best-effort; dormant on port
            // conflict (direct localhost:<port> still works).
            let routes: service_proxy::Routes = Default::default();
            let proxy_up = service_proxy::start(routes.clone());
            app.manage(ServiceRoutes(routes, proxy_up));
            // Phone pairing: local WS router + cloudflared quick tunnel.
            // Lazy-started by the first `start_pairing_relay` invoke.
            app.manage(pairing_relay::PairingRelayState::new());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            create_workspace,
            list_directory,
            create_terminal_worktree,
            git_init,
            get_git_branch,
            git_status,
            git_recent_commits,
            git_remote_url,
            create_pty_session,
            write_to_pty,
            resize_pty,
            close_pty_session,
            close_and_remove_worktree,
            open_zen_window,
            get_zen_config,
            git_worktree_remove,
            git_branch_delete,
            git_diff,
            git_push_branch,
            git_push_current_branch,
            git_create_push_branch,
            git_list_branches,
            git_switch_branch,
            git_delete_branch,
            git_stage,
            git_unstage,
            git_discard,
            git_commit_staged,
            git_diff_file,
            check_branch_merged,
            write_coauthor_hook,
            remove_coauthor_hook,
            check_git_initialized,
            git_add_remote,
            embed_ide_panel,
            resize_ide_panel,
            destroy_ide_panel,
            get_ide_panel_url,
            read_file,
            write_file,
            hooks_write_atomic,
            hooks_paths,
            start_atlas_index,
            download_atlas_model,
            get_atlas_graph,
            atlas_query,
            check_atlas_db,
            check_goose_atlas_config,
            write_goose_atlas_config,
            check_codex_atlas_config,
            write_codex_atlas_config,
            db_check_docker,
            db_check_ready,
            db_build,
            db_list_branches,
            db_sweep_orphans,
            shell_run,
            shell_kill,
            run_hook,
            remove_atlas_index,
            start_atlas_daemon,
            stop_atlas_daemon,
            write_canvas_mcp_config,
            register_service_route,
            git_clone::check_clone_target,
            git_clone::git_clone_repo,
            secrets::secret_get,
            secrets::secret_set,
            secrets::secret_delete,
            tasks::tasks_github_auth,
            tasks::tasks_github_repos,
            tasks::tasks_github_list,
            tasks::tasks_github_thread,
            tasks::tasks_github_pr_files,
            tasks::tasks_github_pr_checks,
            tasks::tasks_linear_bootstrap,
            tasks::tasks_linear_list,
            tasks::tasks_linear_thread,
            tasks::tasks_cache_invalidate,
            atlas_mcp_tools,
            atlas_mcp_call,
            git_ls_files,
            check_program_available,
            get_node_version,
            verify_minisign,
            git_numstat,
            db_load,
            db_ensure_project,
            db_upsert_project,
            db_set_project_atlas_indexed,
            db_upsert_branch,
            db_upsert_session,
            db_delete_session,
            db_delete_branch,
            db_delete_project,
            db_prune_sessions,
            db_load_recents,
            db_upsert_recent,
            db_delete_recent,
            db_load_tabs,
            db_upsert_tab,
            db_delete_tab,
            db_load_app_state,
            db_set_app_state,
            db_list_threads,
            db_upsert_thread,
            db_delete_thread,
            db_list_thread_nodes,
            db_upsert_thread_node,
            db_delete_thread_node,
            db_load_thread_messages,
            db_replace_thread_messages,
            db_list_thread_edges,
            db_upsert_thread_edge,
            db_delete_thread_edge,
            automations::list_automations,
            automations::get_automation,
            automations::create_automation,
            automations::update_automation,
            automations::delete_automation,
            automations::list_automation_runs,
            automations::upsert_automation_run,
            automations::list_prompt_versions,
            automations::save_prompt_version,
            notes::notes_list,
            notes::notes_upsert,
            notes::notes_delete,
            claude_bridge::claude_stream_start,
            claude_bridge::claude_permission_decision,
            claude_bridge::claude_stream_cancel,
            warp_bridge::warp_chat,
            warp_bridge::warp_model_info,
            quota::quota_read_all,
            node_ingest::extract_file_text,
            node_ingest::scrape_url,
            node_ingest::fetch_media_info,
            pairing_relay::start_pairing_relay,
            pairing_relay::stop_pairing_relay,
            open_devtools,
            get_hostname,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app_handle, event| {
            if let tauri::RunEvent::Exit = event {
                use tauri::Manager;

                // Kill all atlas daemons cleanly on app exit. Dropping the
                // LifecycleJob first fires KILL_ON_JOB_CLOSE (belt-and-braces
                // with the explicit kill for platforms without job objects).
                let state = app_handle.state::<DaemonState>();
                let mut map = state.0.lock().unwrap();
                for (_, (mut child, _job)) in map.drain() {
                    let _ = child.kill();
                    let _ = child.wait();
                }
                drop(map);

                // Kill all Atlas MCP bridge processes on app exit.
                let mcp_state = app_handle.state::<AtlasMcpState>();
                let mut mcp_map = mcp_state.0.lock().unwrap();
                for (_, mut proc) in mcp_map.drain() {
                    let _ = proc.child.kill();
                    let _ = proc.child.wait();
                }
                drop(mcp_map);

                // Kill any in-flight Claude Code chat-backend turns.
                claude_bridge::kill_all(app_handle);

                // Kill the cloudflared quick tunnel (if any) so it doesn't
                // outlive the app. shutdown() awaits a Mutex, so block on the
                // async runtime.
                let pr = app_handle.state::<pairing_relay::PairingRelayState>();
                tauri::async_runtime::block_on(pr.shutdown());

                // Tear down every live PTY session so agent subprocesses (e.g.
                // Notepad spawned via `Start-Process`) never outlive the app.
                // Drop each lifecycle job FIRST: closing the Job Object handle
                // fires KILL_ON_JOB_CLOSE and terminates the tree atomically —
                // this works even on a crash because the OS closes all handles
                // when the process dies. Then destroy Hephaestus isolation
                // environments (for sandboxed sessions). Finally, run a
                // `taskkill /F /T` secondary sweep for processes that escaped
                // the job.
                let pty_state = app_handle.state::<PtyState>();
                for entry in pty_state.0.iter() {
                    let sid = entry.key().clone();
                    let session = entry.value();
                    let child_pid = session
                        .child
                        .lock()
                        .unwrap()
                        .process_id()
                        .or_else(|| read_pid_file(&session.cwd));
                    eprintln!("[tempest] RunEvent::Exit: cleaning session={sid} child_pid={child_pid:?}");
                    // 1. Lifecycle job (always-on, unsandboxed sessions).
                    let had_job = session.lifecycle_job.lock().unwrap().take().is_some();
                    eprintln!("[tempest] RunEvent::Exit: session={sid} lifecycle_job present={had_job}");
                    // 2. Hephaestus sandbox job (sandboxed sessions).
                    if let Some(handle) = session.isolate_handle.lock().unwrap().take() {
                        let isolate = ISOLATE.get_or_init(hephaestus::platform);
                        let _ = isolate.destroy(handle);
                    }
                    // 3. Secondary taskkill sweep for escaped processes.
                    if let Some(pid) = child_pid {
                        kill_pid_tree(pid);
                    }
                }
            }
        });
}
