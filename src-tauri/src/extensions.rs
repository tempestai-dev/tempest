use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use tauri::Manager;

/// Contribution manifest. Keep it open (serde_json::Value) so new contribution
/// types (themes, keybinds, language packs) do not require a Rust change here.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
pub struct ExtensionManifest {
    pub id: String,
    #[serde(default)]
    pub display_name: Option<String>,
    #[serde(default)]
    pub description: Option<String>,
    pub version: String,
    #[serde(default)]
    pub publisher: Option<String>,
    #[serde(default)]
    pub author: Option<String>,
    #[serde(default)]
    pub license: Option<String>,
    #[serde(default)]
    pub homepage: Option<String>,
    #[serde(default)]
    pub engines: serde_json::Value,
    #[serde(default)]
    pub contributes: serde_json::Value,
}

#[derive(Debug, Clone, Serialize)]
pub struct Extension {
    pub id: String,
    pub dir: String,
    pub builtin: bool,
    pub manifest: ExtensionManifest,
}

fn user_extensions_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let d = app.path().app_data_dir().map_err(|e| e.to_string())?.join("extensions");
    fs::create_dir_all(&d).map_err(|e| e.to_string())?;
    Ok(d)
}

/// Bundled extensions folder shipped as a Tauri resource. Mirrors the quirks
/// documented on `atlas_resource_dir`: on Windows, `resource_dir()` can be
/// drive-relative — resolve via `current_exe()` instead.
fn bundled_extensions_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    #[cfg(debug_assertions)]
    {
        let _ = app;
        Ok(PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("resources")
            .join("extensions"))
    }
    #[cfg(not(debug_assertions))]
    {
        let exe = std::env::current_exe().map_err(|e| e.to_string())?;
        let exe_dir = exe
            .parent()
            .ok_or_else(|| "Cannot determine executable directory".to_string())?;
        #[cfg(target_os = "macos")]
        let base = {
            let _ = app;
            exe_dir
                .parent()
                .ok_or_else(|| "Cannot determine Contents directory".to_string())?
                .join("Resources")
        };
        #[cfg(target_os = "linux")]
        let base = {
            let _ = exe_dir;
            app.path().resource_dir().map_err(|e| e.to_string())?
        };
        #[cfg(all(not(target_os = "macos"), not(target_os = "linux")))]
        let base = {
            let _ = app;
            exe_dir.to_path_buf()
        };
        Ok(base.join("resources").join("extensions"))
    }
}

fn read_manifest(dir: &Path) -> Result<ExtensionManifest, String> {
    let path = dir.join("extension.json");
    let raw = fs::read_to_string(&path)
        .map_err(|e| format!("read {}: {}", path.display(), e))?;
    serde_json::from_str(&raw).map_err(|e| format!("parse {}: {}", path.display(), e))
}

fn copy_dir_recursive(src: &Path, dst: &Path) -> Result<(), String> {
    fs::create_dir_all(dst).map_err(|e| e.to_string())?;
    for entry in fs::read_dir(src).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let ft = entry.file_type().map_err(|e| e.to_string())?;
        let from = entry.path();
        let to = dst.join(entry.file_name());
        if ft.is_dir() {
            copy_dir_recursive(&from, &to)?;
        } else if ft.is_file() {
            fs::copy(&from, &to).map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

/// Seed built-in extensions into the user's extensions dir on first launch and
/// whenever the bundled version differs from what's on disk. Idempotent.
#[tauri::command]
pub fn seed_extensions(app: tauri::AppHandle) -> Result<Vec<String>, String> {
    let user_dir = user_extensions_dir(&app)?;
    let src_dir = bundled_extensions_dir(&app)?;
    if !src_dir.exists() {
        return Ok(vec![]);
    }
    let mut seeded = Vec::new();
    for entry in fs::read_dir(&src_dir).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        if !entry.file_type().map_err(|e| e.to_string())?.is_dir() {
            continue;
        }
        let name = entry.file_name();
        let from = entry.path();
        let src_manifest = match read_manifest(&from) {
            Ok(m) => m,
            Err(_) => continue,
        };
        let to = user_dir.join(&name);
        let needs_copy = match read_manifest(&to) {
            Ok(existing) => existing.version != src_manifest.version,
            Err(_) => true,
        };
        if needs_copy {
            if to.exists() {
                fs::remove_dir_all(&to).map_err(|e| e.to_string())?;
            }
            copy_dir_recursive(&from, &to)?;
            seeded.push(src_manifest.id);
        }
    }
    Ok(seeded)
}

#[tauri::command]
pub fn list_extensions(app: tauri::AppHandle) -> Result<Vec<Extension>, String> {
    let user_dir = user_extensions_dir(&app)?;
    let bundled = bundled_extensions_dir(&app).ok();
    let mut out = Vec::new();
    for entry in fs::read_dir(&user_dir).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        if !entry.file_type().map_err(|e| e.to_string())?.is_dir() {
            continue;
        }
        let dir = entry.path();
        let manifest = match read_manifest(&dir) {
            Ok(m) => m,
            Err(_) => continue,
        };
        let builtin = bundled
            .as_ref()
            .map(|b| b.join(entry.file_name()).exists())
            .unwrap_or(false);
        out.push(Extension {
            id: manifest.id.clone(),
            dir: dir.to_string_lossy().to_string(),
            builtin,
            manifest,
        });
    }
    Ok(out)
}

/// Read a UTF-8 file (typically an SVG or JSON) from within an installed
/// extension. Path is scoped: the resolved absolute path MUST stay inside the
/// extension's directory, blocking `..` traversal.
#[tauri::command]
pub fn read_extension_file(
    app: tauri::AppHandle,
    extension_id: String,
    relative_path: String,
) -> Result<String, String> {
    let user_dir = user_extensions_dir(&app)?;
    // Extension id is used as folder name — reject separators so a crafted id
    // cannot escape the extensions dir.
    if extension_id.contains('/') || extension_id.contains('\\') || extension_id.contains("..") {
        return Err("invalid extension id".to_string());
    }
    let ext_dir = user_dir.join(&extension_id);
    let canonical_ext = ext_dir.canonicalize().map_err(|e| e.to_string())?;
    let requested = ext_dir.join(&relative_path);
    let canonical_req = requested.canonicalize().map_err(|e| e.to_string())?;
    if !canonical_req.starts_with(&canonical_ext) {
        return Err("path escapes extension dir".to_string());
    }
    fs::read_to_string(&canonical_req).map_err(|e| e.to_string())
}
