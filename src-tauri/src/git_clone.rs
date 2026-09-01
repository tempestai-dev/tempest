//! Clone a remote git repository into a local folder, streaming progress to
//! the frontend as it runs. Registration of the cloned folder as a project
//! happens on the frontend via the same `openProjectByPath` path "Add
//! project" already uses — this module only runs `git clone` and reports
//! what happened.

use crate::new_command;
use std::io::BufRead;
use std::process::Stdio;
use tauri::Emitter;

/// Cheap pre-flight: does `parent_dir/folder_name` already exist and contain
/// files? Non-authoritative — git's own error on the real clone is still the
/// source of truth; this just lets the UI show an early warning before the
/// user clicks Clone.
#[tauri::command(async)]
pub fn check_clone_target(parent_dir: String, folder_name: String) -> Result<bool, String> {
    let target = std::path::Path::new(&parent_dir).join(&folder_name);
    match std::fs::read_dir(&target) {
        Ok(mut entries) => Ok(entries.next().is_some()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(false),
        Err(e) => Err(e.to_string()),
    }
}

/// Clone `url` into `<parent_dir>/<folder_name>`, streaming `git clone
/// --progress` stderr lines (git writes both progress and errors there) to
/// the frontend as `git-clone:log` events tagged with `request_id`. Returns
/// the cloned path on success; on failure returns the raw joined stderr —
/// classifying it (auth / already-exists / network) is the frontend's job,
/// see `src/lib/gitClone.ts::classifyCloneError`, so this stays a dumb
/// passthrough like every other git command in `lib.rs`.
#[tauri::command(async)]
pub fn git_clone_repo(
    app: tauri::AppHandle,
    request_id: String,
    url: String,
    parent_dir: String,
    folder_name: String,
) -> Result<String, String> {
    std::fs::create_dir_all(&parent_dir).map_err(|e| e.to_string())?;
    let target = std::path::Path::new(&parent_dir).join(&folder_name);

    let mut child = new_command("git")
        .args(["clone", "--progress", &url, &target.to_string_lossy()])
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to spawn git: {e}"))?;

    let stderr = child.stderr.take();
    let app_evt = app.clone();
    let req_evt = request_id.clone();
    let handle = std::thread::spawn(move || {
        let mut lines = Vec::new();
        if let Some(h) = stderr {
            for line in std::io::BufReader::new(h).lines().map_while(Result::ok) {
                let _ = app_evt.emit(
                    "git-clone:log",
                    serde_json::json!({ "requestId": req_evt, "line": &line }),
                );
                lines.push(line);
            }
        }
        lines
    });

    let status = child.wait().map_err(|e| e.to_string())?;
    let lines = handle.join().unwrap_or_default();

    if !status.success() {
        return Err(lines.join("\n"));
    }
    Ok(target.to_string_lossy().to_string())
}
