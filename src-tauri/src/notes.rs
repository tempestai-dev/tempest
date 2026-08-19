use serde::{Serialize, Deserialize};

// Notes are stored locally in the app SQLite DB (tempest.db). Bodies are plain
// markdown; pasted images live inline as `data:` URLs, so a note is a single
// self-contained string that can be copied elsewhere without losing its images.

#[derive(Serialize, Deserialize, Clone)]
pub struct Note {
    pub id: String,
    pub title: Option<String>,
    pub body: String,
    pub scope: String, // "global" | project path
    #[serde(rename = "updatedAt")]
    pub updated_at: i64,
}

#[derive(Deserialize)]
pub struct UpsertNoteReq {
    pub id: String,
    pub title: Option<String>,
    pub body: String,
    pub scope: String,
    #[serde(rename = "updatedAt")]
    pub updated_at: i64,
}

fn map_row(r: &rusqlite::Row) -> rusqlite::Result<Note> {
    Ok(Note {
        id:         r.get(0)?,
        title:      r.get(1)?,
        body:       r.get(2)?,
        scope:      r.get(3)?,
        updated_at: r.get(4)?,
    })
}

#[tauri::command(async)]
pub fn notes_list(state: tauri::State<'_, super::DbState>) -> Result<Vec<Note>, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare("SELECT id, title, body, scope, updated_at FROM notes ORDER BY updated_at DESC")
        .map_err(|e| e.to_string())?;
    let rows = stmt.query_map([], map_row).map_err(|e| e.to_string())?;
    rows.collect::<rusqlite::Result<Vec<_>>>().map_err(|e| e.to_string())
}

#[tauri::command(async)]
pub fn notes_upsert(state: tauri::State<'_, super::DbState>, req: UpsertNoteReq) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO notes (id, title, body, scope, updated_at) VALUES (?1, ?2, ?3, ?4, ?5)
         ON CONFLICT(id) DO UPDATE SET
           title = excluded.title,
           body = excluded.body,
           scope = excluded.scope,
           updated_at = excluded.updated_at",
        rusqlite::params![req.id, req.title, req.body, req.scope, req.updated_at],
    ).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command(async)]
pub fn notes_delete(state: tauri::State<'_, super::DbState>, id: String) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM notes WHERE id = ?1", rusqlite::params![id])
        .map_err(|e| e.to_string())?;
    Ok(())
}
