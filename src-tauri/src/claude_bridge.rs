//! Claude Code chat backend — the CLI-agent harness for chat nodes.
//!
//! A chat node with `backend: "cli"` drives Claude Code through the official
//! `@anthropic-ai/claude-agent-sdk`, which is Node-only. Rather than a daemon we
//! run a per-turn Node sidecar (`resources/claude-bridge/bridge.mjs`, via system
//! `node` — same self-contained-resource shape as atlas). The bridge maps each
//! SDKMessage to NDJSON on stdout; we forward every line to the frontend as a
//! `claude://{stream_id}` event. Permission decisions + cancel travel back over
//! the child's stdin. One process per user turn; continuity is the SDK's `resume`.
//!
//! We never modify PTY infra — this is a plain piped child process, separate from
//! `create_pty_session`.

use dashmap::DashMap;
use serde_json::{json, Value};
use std::io::{BufRead, Write};
use std::sync::Arc;
use tauri::{Emitter, Manager};

/// One live turn: the sidecar child (for cancel) + its stdin (for decisions).
pub struct ClaudeProc {
    child: std::process::Child,
    stdin: std::process::ChildStdin,
}

pub struct ClaudeState(pub Arc<DashMap<String, ClaudeProc>>);

/// Dev: src-tauri/resources/<agent>-bridge/bridge.mjs
/// Release: <exe>/resources/<agent>-bridge/bridge.mjs
///
/// `agent` is one of "claude" | "codex" | "opencode" | "gemini". Anything else
/// is rejected — no silent fallback so a typo in a chat node is visible.
fn bridge_entry(_app: &tauri::AppHandle, agent: &str) -> Result<std::path::PathBuf, String> {
    let dir_name = match agent {
        "claude"   => "claude-bridge",
        "codex"    => "codex-bridge",
        "opencode" => "opencode-bridge",
        "gemini"   => "gemini-bridge",
        other      => return Err(format!("Unknown agent: {other}")),
    };
    #[cfg(debug_assertions)]
    {
        Ok(std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("resources")
            .join(dir_name)
            .join("bridge.mjs"))
    }
    #[cfg(not(debug_assertions))]
    {
        // current_exe(), not resource_dir(): on Windows resource_dir() can return a
        // drive-relative path that breaks Node script resolution (see atlas).
        let exe = std::env::current_exe().map_err(|e| e.to_string())?;
        let dir = exe.parent().ok_or_else(|| "no exe dir".to_string())?;
        Ok(dir.join("resources").join(dir_name).join("bridge.mjs"))
    }
}

/// Start a Claude Code turn. `stream_id` is minted by the frontend and is also the
/// event channel (`claude://{stream_id}`). `config` carries `{ prompt, cwd, resume?,
/// systemPrompt?, project? }`; when `project` is set we inject the tempest-canvas
/// MCP server (our own exe in `--canvas-mcp` mode) so Claude can read the canvas.
#[tauri::command(async)]
pub fn claude_stream_start(
    app: tauri::AppHandle,
    state: tauri::State<ClaudeState>,
    stream_id: String,
    mut config: Value,
) -> Result<(), String> {
    let agent = config.get("agent").and_then(Value::as_str).unwrap_or("claude").to_string();
    let entry = bridge_entry(&app, &agent)?;
    if !entry.exists() {
        return Err(format!("{agent} bridge not staged — not found at {}", entry.display()));
    }

    // Inject the canvas MCP server (mirrors write_canvas_mcp_config's wiring).
    if let Some(project) = config.get("project").and_then(Value::as_str).map(String::from) {
        let db = app.path().app_data_dir().map_err(|e| e.to_string())?.join("tempest.db");
        let db_str = db.to_string_lossy().replace('\\', "/");
        let exe = std::env::current_exe().map_err(|e| e.to_string())?;
        let exe_str = exe.to_string_lossy().replace('\\', "/");
        config["mcp"] = json!({ "exe": exe_str, "db": db_str, "project": project });
    }

    let cwd = config.get("cwd").and_then(Value::as_str).unwrap_or(".").to_string();

    let mut child = crate::new_command("node")
        .arg(&entry)
        .current_dir(&cwd)
        .stdin(std::process::Stdio::piped())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to spawn Claude bridge: {e}"))?;

    let mut stdin = child.stdin.take().ok_or("no stdin")?;
    let stdout = child.stdout.take().ok_or("no stdout")?;
    let stderr = child.stderr.take();

    // First line = the turn config; the bridge starts querying on receipt.
    writeln!(stdin, "{config}").map_err(|e| format!("Failed to write config: {e}"))?;
    stdin.flush().ok();

    // Forward every NDJSON line the bridge prints as a `claude://{id}` event.
    let map = state.0.clone();
    let app_out = app.clone();
    let id_out = stream_id.clone();
    std::thread::spawn(move || {
        let channel = format!("claude://{id_out}");
        for line in std::io::BufReader::new(stdout).lines().map_while(Result::ok) {
            let line = line.trim();
            if line.is_empty() {
                continue;
            }
            if let Ok(v) = serde_json::from_str::<Value>(line) {
                let _ = app_out.emit(&channel, v);
            }
        }
        // Stdout closed → turn is over. Tell the UI and drop the process handle.
        let _ = app_out.emit(&channel, json!({ "t": "closed" }));
        if let Some((_, mut proc)) = map.remove(&id_out) {
            let _ = proc.child.wait();
        }
    });

    // Surface the claude subprocess's own stderr as log events (debugging only).
    if let Some(stderr) = stderr {
        let app_err = app.clone();
        let channel = format!("claude://{stream_id}");
        std::thread::spawn(move || {
            for line in std::io::BufReader::new(stderr).lines().map_while(Result::ok) {
                let _ = app_err.emit(&channel, json!({ "t": "log", "text": line }));
            }
        });
    }

    state.0.insert(stream_id, ClaudeProc { child, stdin });
    Ok(())
}

/// Answer a pending `permission` request for a live turn.
#[tauri::command(async)]
pub fn claude_permission_decision(
    state: tauri::State<ClaudeState>,
    stream_id: String,
    id: String,
    behavior: String,
    message: Option<String>,
) -> Result<(), String> {
    let mut proc = state.0.get_mut(&stream_id).ok_or("no such claude stream")?;
    let line = json!({ "t": "permission_decision", "id": id, "behavior": behavior, "message": message });
    writeln!(proc.stdin, "{line}").map_err(|e| e.to_string())?;
    proc.stdin.flush().map_err(|e| e.to_string())
}

/// Cancel a live turn — kill the sidecar (which tree-kills its claude subprocess).
#[tauri::command(async)]
pub fn claude_stream_cancel(state: tauri::State<ClaudeState>, stream_id: String) -> Result<(), String> {
    if let Some((_, mut proc)) = state.0.remove(&stream_id) {
        let _ = proc.child.kill();
        let _ = proc.child.wait();
    }
    Ok(())
}

/// Kill any still-running turns on app exit.
pub fn kill_all(app: &tauri::AppHandle) {
    let state = app.state::<ClaudeState>();
    for mut entry in state.0.iter_mut() {
        let _ = entry.value_mut().child.kill();
    }
    state.0.clear();
}
