use portable_pty::{native_pty_system, CommandBuilder, PtySize};
use std::io::{Read, Write};
use std::sync::{Arc, Mutex};
use dashmap::DashMap;
use tauri::ipc::Channel;
use tauri::Emitter;

#[tauri::command]
fn create_workspace(location: String, name: String) -> Result<String, String> {
    let path = std::path::Path::new(&location).join(&name);
    std::fs::create_dir_all(&path).map_err(|e| e.to_string())?;
    Ok(path.to_string_lossy().to_string())
}

#[derive(serde::Serialize)]
struct DirEntry {
    name: String,
    path: String,
    is_dir: bool,
}

#[tauri::command]
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

#[tauri::command]
fn read_file(path: String) -> Result<String, String> {
    std::fs::read_to_string(&path).map_err(|e| e.to_string())
}

#[tauri::command]
fn write_file(path: String, content: String) -> Result<(), String> {
    std::fs::write(&path, content).map_err(|e| e.to_string())
}

/// Returns the atlas resource directory: in dev builds uses the cargo manifest
/// path (src-tauri/resources/atlas/) so the dev-mode binary finds the files
/// that bundle-atlas.mjs copies there; in release builds uses the standard
/// Tauri resource dir where the bundle copies them.
fn atlas_resource_dir(app: &tauri::AppHandle) -> Result<std::path::PathBuf, String> {
    #[cfg(debug_assertions)]
    {
        let _ = app;
        Ok(std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("resources")
            .join("atlas"))
    }
    #[cfg(not(debug_assertions))]
    {
        use tauri::Manager;
        Ok(app.path().resource_dir().map_err(|e| e.to_string())?.join("atlas"))
    }
}

/// Spawn `node .../atlas/dist/mcp/server-entry.js --init --path <project>` in the
/// background. The Node process initialises the .atlas/ directory and builds the
/// first full code-graph index, then exits. Fire-and-forget — any errors are
/// written to stderr by the Node process itself.
#[tauri::command]
fn start_atlas_index(app: tauri::AppHandle, project_path: String) -> Result<(), String> {
    let entry = atlas_resource_dir(&app)?
        .join("dist")
        .join("mcp")
        .join("server-entry.js");
    if !entry.exists() {
        return Err("Atlas not bundled — run npm run build:atlas first".to_string());
    }

    let mut child = new_command("node")
        .arg("--liftoff-only") // prevents V8 turboshaft Zone OOM on tree-sitter WASM grammars (Node >=22)
        .arg(&entry)
        .arg("--init")
        .arg("--path")
        .arg(&project_path)
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
    write_atlas_mcp_config(&project_path, &entry)?;

    Ok(())
}

fn write_atlas_mcp_config(project_path: &str, entry: &std::path::Path) -> Result<(), String> {
    let entry_str = entry.to_string_lossy().replace('\\', "/");
    let proj_str  = project_path.replace('\\', "/");
    let root = std::path::Path::new(project_path);

    // Shared helper: read existing JSON, merge `mcpServers.atlas`, write back.
    // Used by Claude Code, Gemini CLI, Cursor, and Kiro — all use the same shape.
    let upsert_mcp_servers = |file: &std::path::Path| -> Result<(), String> {
        let existing = std::fs::read_to_string(file).unwrap_or_default();
        let mut v: serde_json::Value = serde_json::from_str(&existing)
            .unwrap_or_else(|_| serde_json::json!({}));
        v["mcpServers"]["atlas"] = serde_json::json!({
            "type": "stdio",
            "command": "node",
            "args": ["--liftoff-only", &entry_str, "--path", &proj_str]
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
        v["mcp"]["atlas"] = serde_json::json!({
            "type": "local",
            "command": ["node", "--liftoff-only", &entry_str, "--path", &proj_str],
            "enabled": true
        });
        let out = serde_json::to_string_pretty(&v).map_err(|e| e.to_string())?;
        std::fs::write(&oc_path, out + "\n").map_err(|e| e.to_string())?;
    }

    // All config files contain absolute machine-specific paths — keep out of git.
    ensure_atlas_mcp_gitignore(project_path);

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

#[tauri::command]
fn check_atlas_db(project_path: String) -> bool {
    std::path::Path::new(&project_path)
        .join(".tempest")
        .join("atlas")
        .join("atlas.db")
        .exists()
}

#[tauri::command]
fn read_runtime_state(app: tauri::AppHandle) -> Result<String, String> {
    use tauri::Manager;
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let file = dir.join("runtime-state.json");
    if !file.exists() {
        return Ok("{}".to_string());
    }
    std::fs::read_to_string(&file).map_err(|e| e.to_string())
}

#[tauri::command]
fn write_runtime_state(app: tauri::AppHandle, data: String) -> Result<(), String> {
    use tauri::Manager;
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let file = dir.join("runtime-state.json");
    let tmp = dir.join("runtime-state.json.tmp");
    std::fs::write(&tmp, data.as_bytes()).map_err(|e| e.to_string())?;
    std::fs::rename(&tmp, &file).map_err(|e| e.to_string())?;
    Ok(())
}

/// Build a `Command` that never opens a console window on Windows.
/// On every other platform this is identical to `std::process::Command::new`.
fn new_command(program: &str) -> std::process::Command {
    let mut cmd = std::process::Command::new(program);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
    cmd
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

#[tauri::command]
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

#[tauri::command]
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

#[tauri::command]
fn git_add_remote(repo_path: String, remote_url: String) -> Result<(), String> {
    let path = std::path::Path::new(&repo_path);
    let out = run_git(path, &["remote", "add", "origin", &remote_url])?;
    if !out.status.success() {
        return Err(git_stderr(&out));
    }
    Ok(())
}

#[tauri::command]
async fn create_terminal_worktree(project_path: String, name: String) -> Result<String, String> {
    // The body is pure blocking work (git subprocesses + file ops). Run it on a
    // dedicated blocking thread so a slow worktree creation never starves Tauri's
    // bounded IPC worker pool. Both params are owned, so they move in cleanly.
    tauri::async_runtime::spawn_blocking(move || {
    let project = std::path::Path::new(&project_path);
    let tempest_dir = project.join(".tempest");
    std::fs::create_dir_all(&tempest_dir).map_err(|e| e.to_string())?;

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

    let worktree_path = tempest_dir.join(&name);

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
    let output = new_command("git")
        .args([
            "worktree",
            "add",
            &worktree_path.to_string_lossy(),
            "-b",
            &name,
        ])
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
        let git_wt_dir = project.join(".git").join("worktrees").join(&name);
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

#[derive(serde::Serialize)]
struct BranchInfo {
    name: String,
    is_current: bool,
}

#[tauri::command]
fn git_status(path: String) -> Result<Vec<GitStatusEntry>, String> {
    let output = new_command("git")
        .args(["status", "--short"])
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

#[tauri::command]
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

#[tauri::command]
fn git_list_branches(repo_path: String) -> Result<Vec<BranchInfo>, String> {
    let dir = std::path::Path::new(&repo_path);
    let out = run_git(dir, &["branch"])?;
    if !out.status.success() {
        return Err(git_stderr(&out));
    }
    let branches = String::from_utf8_lossy(&out.stdout)
        .lines()
        .filter(|l| l.len() >= 2 && !l.starts_with("+ "))
        .map(|l| {
            let is_current = l.starts_with("* ");
            let name = l[2..].trim().to_string();
            BranchInfo { name, is_current }
        })
        .filter(|b| !b.name.is_empty())
        .collect();
    Ok(branches)
}

#[tauri::command]
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

#[tauri::command]
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

#[tauri::command]
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

#[tauri::command]
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

#[tauri::command]
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

#[tauri::command]
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

#[tauri::command]
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

#[tauri::command]
fn git_stage(repo_path: String, file_path: String) -> Result<(), String> {
    let dir = std::path::Path::new(&repo_path);
    let out = run_git(dir, &["add", "--", &file_path])?;
    if out.status.success() { Ok(()) } else { Err(git_stderr(&out)) }
}

#[tauri::command]
fn git_unstage(repo_path: String, file_path: String) -> Result<(), String> {
    let dir = std::path::Path::new(&repo_path);
    let out = run_git(dir, &["restore", "--staged", "--", &file_path])?;
    if out.status.success() { Ok(()) } else { Err(git_stderr(&out)) }
}

#[tauri::command]
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

#[tauri::command]
fn git_commit_staged(repo_path: String, message: String) -> Result<(), String> {
    if message.trim().is_empty() {
        return Err("Commit message cannot be empty".to_string());
    }
    let dir = std::path::Path::new(&repo_path);
    let out = run_git(dir, &["commit", "-m", message.trim()])?;
    if out.status.success() { Ok(()) } else { Err(git_stderr(&out)) }
}

#[tauri::command]
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

struct PtySession {
    writer: Mutex<Box<dyn Write + Send>>,
    master: Mutex<Box<dyn portable_pty::MasterPty + Send>>,
    _slave: Mutex<Box<dyn portable_pty::SlavePty + Send>>,
    child:  Mutex<Box<dyn portable_pty::Child + Send + Sync>>,
    /// Working directory (worktree path) this session was spawned in. Used to
    /// locate the `.tempest-pid` sidecar file on close so it can be cleaned up.
    cwd: String,
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

/// Read `<worktree_path>/.tempest-pid`, and if it contains a valid PID, kill
/// that process tree. Waits ~500ms afterward so the OS releases the directory
/// handle before any removal attempt. No-op (silent) if the file is missing or
/// the process is already dead. Handles the orphaned-process case after restart.
fn kill_persisted_pid(worktree_path: &str) {
    let pid_path = pid_file_path(worktree_path);
    let Ok(contents) = std::fs::read_to_string(&pid_path) else {
        return;
    };
    if let Ok(pid) = contents.trim().parse::<u32>() {
        kill_pid_tree(pid);
        std::thread::sleep(std::time::Duration::from_millis(500));
    }
}

pub struct PtyState(pub(crate) Arc<DashMap<String, Arc<PtySession>>>);

pub struct ZenState(pub Mutex<std::collections::HashMap<String, (String, String)>>);

#[tauri::command]
fn open_zen_window(
    app: tauri::AppHandle,
    state: tauri::State<ZenState>,
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
    state: tauri::State<ZenState>,
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

#[tauri::command]
async fn create_pty_session(
    session_id: String,
    cwd: String,
    rows: u16,
    cols: u16,
    command: Option<String>,
    args: Option<Vec<String>>,
    on_event: Channel<PtyOutputPayload>,
    state: tauri::State<'_, PtyState>,
) -> Result<(), String> {
    // Resolve (and cache) the shell once. Cheap if already populated; the first
    // call performs the ~100–200ms probe so no individual session pays for it twice.
    SHELL.get_or_init(resolve_shell);

    // The blocking part — opening the PTY and spawning the shell/agent process —
    // runs on a dedicated blocking thread so it never starves Tauri's bounded IPC
    // worker pool. `tauri::State` is not `Send`, so the registry insert happens
    // back on the async side *after* this completes. All owned params move in.
    let (session, reader) = tauri::async_runtime::spawn_blocking(move || {
        let pty_system = native_pty_system();
        let size = PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        };
        let pair = pty_system.openpty(size).map_err(|e| e.to_string())?;

        let cmd = if let Some(ref agent_exe) = command {
            // Agent session: build the full agent invocation as a string, then run it inside
            // an interactive shell with -NoExit / exec so the terminal stays alive after exit.
            // All session/resume flags and the prompt are pre-assembled by the frontend and
            // arrive in `args` — Rust only shell-quotes and joins them onto the binary name.
            let mut parts: Vec<String> = vec![agent_exe.clone()];
            if let Some(ref extra) = args {
                for arg in extra {
                    if arg.contains(' ') || arg.contains('\'') {
                        // Single-quote-escape for PowerShell / POSIX sh
                        parts.push(format!("'{}'", arg.replace('\'', "'''")));
                    } else {
                        parts.push(arg.clone());
                    }
                }
            }
            let agent_invocation = parts.join(" ");

            let shell = SHELL.get_or_init(resolve_shell).clone();

            #[cfg(windows)]
            {
                let mut c = CommandBuilder::new(&shell);
                c.cwd(&cwd);
                c.arg("-NoLogo");
                c.arg("-NoExit");
                c.arg("-Command");
                c.arg(agent_invocation);
                c
            }
            #[cfg(not(windows))]
            {
                let mut c = CommandBuilder::new(&shell);
                c.cwd(&cwd);
                c.arg("-c");
                c.arg(format!("{}; exec $SHELL -i", agent_invocation));
                c
            }
        } else {
            // Bare shell session
            let shell = SHELL.get_or_init(resolve_shell).clone();
            let mut c = CommandBuilder::new(&shell);
            c.cwd(&cwd);
            c
        };

        let child = pair.slave.spawn_command(cmd).map_err(|e| e.to_string())?;

        // Persist the child's OS PID to a sidecar file inside the worktree so the
        // workspace can still be force-killed after an app restart wipes PtyState.
        // Fail silently — a missing PID file must never break PTY creation.
        if let Some(pid) = child.process_id() {
            let _ = std::fs::write(pid_file_path(&cwd), pid.to_string());
        }

        let reader = pair.master.try_clone_reader().map_err(|e| e.to_string())?;
        let writer = pair.master.take_writer().map_err(|e| e.to_string())?;

        Ok::<_, String>((
            PtySession {
                writer: Mutex::new(writer),
                master: Mutex::new(pair.master),
                _slave: Mutex::new(pair.slave),
                child:  Mutex::new(child),
                cwd,
            },
            reader,
        ))
    })
    .await
    .map_err(|e| e.to_string())??;

    // Pump PTY output to the frontend on a background thread, directly through
    // this session's dedicated channel — O(1), no broadcast, no filtering.
    let sid = session_id.clone();
    let on_event_clone = on_event.clone();
    let mut reader = reader;
    std::thread::spawn(move || {
        let mut buf = [0u8; 4096];
        loop {
            match reader.read(&mut buf) {
                Ok(0) | Err(_) => break,
                Ok(n) => {
                    let data = String::from_utf8_lossy(&buf[..n]).to_string();
                    on_event_clone.send(PtyOutputPayload {
                        session_id: sid.clone(),
                        data,
                    }).ok();
                }
            }
        }
    });

    state.0.insert(session_id, Arc::new(session));

    Ok(())
}

#[tauri::command]
fn write_to_pty(
    session_id: String,
    data: Vec<u8>,
    state: tauri::State<PtyState>,
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
    state: tauri::State<PtyState>,
) -> Result<(), String> {
    let session_arc = state.0.get(&session_id).map(|r| Arc::clone(&*r));
    if let Some(session) = session_arc {
        session.master.lock().unwrap()
            .resize(PtySize { rows, cols, pixel_width: 0, pixel_height: 0 })
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
fn close_pty_session(
    session_id: String,
    state: tauri::State<PtyState>,
) -> Result<(), String> {
    // Atomically remove the session from the map and operate through its Arc.
    let removed = state.0.remove(&session_id).map(|(_, arc)| arc);
    if let Some(session) = removed {
        // Kill the child process. On Windows portable-pty kills the whole job
        // object (the shell *and* its descendants — e.g. the agent CLI), which
        // is exactly what holds the CWD lock.
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
#[tauri::command]
fn close_and_remove_worktree(
    session_id: String,
    repo_path: String,
    worktree_path: String,
    state: tauri::State<PtyState>,
) -> Result<(), String> {
    // 1-4. Kill the PTY child and wait for it to fully exit, then drop handles.
    //      If the session isn't in the map (already closed), skip straight to
    //      directory removal.
    let removed = state.0.remove(&session_id).map(|(_, arc)| arc);
    if let Some(session) = removed {
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

    // 5. Belt-and-suspenders: read the persisted PID sidecar and force-kill that
    //    process tree via `taskkill /F /T` (Windows) / `kill -9` (Unix). This
    //    handles the orphan case where the app was restarted and PtyState no
    //    longer tracks the still-running shell that holds the directory handle.
    //    Runs whether or not a tracked session was found above. Waits ~500ms so
    //    the OS releases the dir handle. Silent if the file/process is gone.
    kill_persisted_pid(&worktree_path);
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
#[tauri::command]
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
#[tauri::command]
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

// ── App ──────────────────────────────────────────────────────────────────────

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .manage(PtyState(Arc::new(DashMap::new())))
        .manage(ZenState(Mutex::new(std::collections::HashMap::new())))
        .setup(|app| {
            use tauri::Manager;
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.set_icon(tauri::include_image!("icons/icon.png"));
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            create_workspace,
            list_directory,
            create_terminal_worktree,
            git_init,
            get_git_branch,
            git_status,
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
            read_runtime_state,
            write_runtime_state,
            start_atlas_index,
            check_atlas_db,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
