use rusqlite::{params, Connection, Result as DbResult};
use std::path::PathBuf;

use crate::types::{BaseImage, DbBranch, SnapshotMethod};

fn home_dir() -> PathBuf {
    std::env::var(if cfg!(windows) { "USERPROFILE" } else { "HOME" })
        .map(PathBuf::from)
        .unwrap_or_else(|_| PathBuf::from("."))
}

fn db_path() -> PathBuf {
    home_dir().join(".tempest").join("dbiso.db")
}

fn open() -> DbResult<Connection> {
    let path = db_path();
    std::fs::create_dir_all(path.parent().unwrap()).ok();
    let conn = Connection::open(&path)?;
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS base_images (
            id TEXT PRIMARY KEY,
            image_name TEXT NOT NULL,
            pg_version INTEGER NOT NULL,
            method TEXT NOT NULL,
            size_bytes INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL,
            is_current INTEGER NOT NULL DEFAULT 0,
            workspace_path TEXT NOT NULL DEFAULT ''
        );
        CREATE TABLE IF NOT EXISTS branches (
            name TEXT PRIMARY KEY,
            container_id TEXT NOT NULL,
            port INTEGER NOT NULL,
            connection_string TEXT NOT NULL,
            created_at TEXT NOT NULL,
            workspace_path TEXT NOT NULL DEFAULT ''
        );",
    )?;
    // Migrate pre-workspace_path tables (no-op after first run)
    let _ = conn.execute_batch("ALTER TABLE base_images ADD COLUMN workspace_path TEXT NOT NULL DEFAULT '';");
    let _ = conn.execute_batch("ALTER TABLE branches ADD COLUMN workspace_path TEXT NOT NULL DEFAULT '';");
    Ok(conn)
}

fn now_ts() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs().to_string())
        .unwrap_or_else(|_| "0".to_string())
}

pub fn get_current_base_image(workspace_path: &str) -> Option<BaseImage> {
    let conn = open().ok()?;
    conn.query_row(
        "SELECT id, image_name, pg_version, method, size_bytes, created_at \
         FROM base_images WHERE workspace_path = ?1 AND is_current = 1 LIMIT 1",
        params![workspace_path],
        |row| {
            let method_str: String = row.get(3)?;
            Ok(BaseImage {
                id: row.get(0)?,
                image_name: row.get(1)?,
                pg_version: row.get::<_, i64>(2)? as u32,
                method: SnapshotMethod::from_str(&method_str),
                size_bytes: row.get::<_, i64>(4)? as u64,
                created_at: row.get(5)?,
            })
        },
    )
    .ok()
}

pub fn insert_base_image(img: &BaseImage, workspace_path: &str) -> DbResult<()> {
    let conn = open()?;
    conn.execute("UPDATE base_images SET is_current = 0 WHERE workspace_path = ?1", params![workspace_path])?;
    conn.execute(
        "INSERT OR REPLACE INTO base_images \
         (id, image_name, pg_version, method, size_bytes, created_at, is_current, workspace_path) \
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, 1, ?7)",
        params![
            img.id,
            img.image_name,
            img.pg_version as i64,
            img.method.as_str(),
            img.size_bytes as i64,
            img.created_at,
            workspace_path,
        ],
    )?;
    Ok(())
}

pub fn insert_branch(branch: &DbBranch, workspace_path: &str) -> DbResult<()> {
    let conn = open()?;
    conn.execute(
        "INSERT OR REPLACE INTO branches \
         (name, container_id, port, connection_string, created_at, workspace_path) \
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![
            branch.name,
            branch.container_id,
            branch.port as i64,
            branch.connection_string,
            now_ts(),
            workspace_path,
        ],
    )?;
    Ok(())
}

pub fn get_branch(name: &str) -> Option<DbBranch> {
    let conn = open().ok()?;
    conn.query_row(
        "SELECT name, container_id, port, connection_string, created_at FROM branches WHERE name = ?1",
        params![name],
        |row| {
            Ok(DbBranch {
                name: row.get(0)?,
                container_id: row.get(1)?,
                port: row.get::<_, i64>(2)? as u16,
                connection_string: row.get(3)?,
                created_at: row.get(4)?,
            })
        },
    )
    .ok()
}

pub fn all_branches(workspace_path: &str) -> Vec<DbBranch> {
    open()
        .ok()
        .and_then(|conn| {
            let mut stmt = conn
                .prepare("SELECT name, container_id, port, connection_string, created_at FROM branches WHERE workspace_path = ?1 ORDER BY created_at DESC")
                .ok()?;
            let rows = stmt
                .query_map(params![workspace_path], |row| {
                    Ok(DbBranch {
                        name: row.get(0)?,
                        container_id: row.get(1)?,
                        port: row.get::<_, i64>(2)? as u16,
                        connection_string: row.get(3)?,
                        created_at: row.get(4)?,
                    })
                })
                .ok()?
                .flatten()
                .collect();
            Some(rows)
        })
        .unwrap_or_default()
}

pub fn all_branches_global() -> Vec<DbBranch> {
    open()
        .ok()
        .and_then(|conn| {
            let mut stmt = conn
                .prepare("SELECT name, container_id, port, connection_string, created_at FROM branches")
                .ok()?;
            let rows = stmt
                .query_map([], |row| {
                    Ok(DbBranch {
                        name: row.get(0)?,
                        container_id: row.get(1)?,
                        port: row.get::<_, i64>(2)? as u16,
                        connection_string: row.get(3)?,
                        created_at: row.get(4)?,
                    })
                })
                .ok()?
                .flatten()
                .collect();
            Some(rows)
        })
        .unwrap_or_default()
}

pub fn remove_branch(name: &str) -> DbResult<()> {
    let conn = open()?;
    conn.execute("DELETE FROM branches WHERE name = ?1", params![name])?;
    Ok(())
}

pub fn used_ports() -> Vec<u16> {
    open()
        .ok()
        .and_then(|conn| {
            let mut stmt = conn.prepare("SELECT port FROM branches").ok()?;
            let ports = stmt
                .query_map([], |row| row.get::<_, i64>(0))
                .ok()?
                .flatten()
                .map(|p| p as u16)
                .collect();
            Some(ports)
        })
        .unwrap_or_default()
}
