//! Persistent backing store for the Tasks tab cache.
//!
//! The in-memory 60s map in tasks.rs only lives for the process; this module
//! mirrors it into SQLite (`~/.tempest/tasks-cache.db`) so lists/threads
//! survive restarts and get served instantly (stale-while-revalidate) on the
//! next open. Schema/open/sweep pattern follows crates/dbiso/src/db.rs.
//!
//! Rows are tagged with an `owner` (gh login / hash of the Linear key) so
//! switching accounts never serves one account's cached data to another.

use rusqlite::{params, Connection, Result as DbResult};
use serde_json::Value;
use std::path::PathBuf;

const MAX_AGE_SECS: i64 = 7 * 24 * 3600; // hard eviction: 7 days
const MAX_ROWS: i64 = 500;

fn db_path() -> PathBuf {
    let home = std::env::var(if cfg!(windows) { "USERPROFILE" } else { "HOME" })
        .map(PathBuf::from)
        .unwrap_or_else(|_| PathBuf::from("."));
    home.join(".tempest").join("tasks-cache.db")
}

fn open() -> DbResult<Connection> {
    open_at(&db_path())
}

fn open_at(path: &std::path::Path) -> DbResult<Connection> {
    std::fs::create_dir_all(path.parent().unwrap()).ok();
    let conn = Connection::open(path)?;
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS task_cache (
            key TEXT PRIMARY KEY,
            payload TEXT NOT NULL,
            fetched_at INTEGER NOT NULL,
            owner TEXT NOT NULL DEFAULT ''
        );",
    )?;
    Ok(conn)
}

static SWEPT: std::sync::OnceLock<()> = std::sync::OnceLock::new();

/// Best-effort housekeeping, once per process: drop rows older than
/// MAX_AGE_SECS and keep the table under MAX_ROWS (newest win).
fn sweep(conn: &Connection) {
    if SWEPT.get().is_some() {
        return;
    }
    let _ = conn.execute(
        "DELETE FROM task_cache WHERE fetched_at < ?1",
        params![now_secs() - MAX_AGE_SECS],
    );
    let _ = conn.execute(
        "DELETE FROM task_cache WHERE key NOT IN \
         (SELECT key FROM task_cache ORDER BY fetched_at DESC LIMIT ?1)",
        params![MAX_ROWS],
    );
    let _ = SWEPT.set(());
}

fn now_secs() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

// ────────────────────────────────────────────────────────────────────────
// Public API (open prod db) + *_on variants over an injected connection so
// tests can exercise the exact same statements against a temp database.
// ────────────────────────────────────────────────────────────────────────

/// Persisted payload whose `owner` matches and that is younger than
/// `max_age_secs` — safe to serve as-is without touching the network.
pub fn get_fresh(key: &str, max_age_secs: u64, owner: &str) -> Option<Value> {
    let conn = open().ok()?;
    sweep(&conn);
    get_fresh_on(&conn, key, max_age_secs, owner)
}

fn get_fresh_on(conn: &Connection, key: &str, max_age_secs: u64, owner: &str) -> Option<Value> {
    let (payload, at): (String, i64) = conn
        .query_row(
            "SELECT payload, fetched_at FROM task_cache \
             WHERE key = ?1 AND owner = ?2",
            params![key, owner],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .ok()?;
    if now_secs() - at >= max_age_secs as i64 {
        return None;
    }
    serde_json::from_str(&payload).ok()
}

/// Persisted payload of any age (owner must match) — served immediately while
/// a background revalidation runs. None when nothing usable is stored or the
/// row belongs to a different account.
pub fn get_stale(key: &str, owner: &str) -> Option<Value> {
    let conn = open().ok()?;
    sweep(&conn);
    get_stale_on(&conn, key, owner)
}

fn get_stale_on(conn: &Connection, key: &str, owner: &str) -> Option<Value> {
    let payload: String = conn
        .query_row(
            "SELECT payload FROM task_cache WHERE key = ?1 AND owner = ?2",
            params![key, owner],
            |r| r.get(0),
        )
        .ok()?;
    serde_json::from_str(&payload).ok()
}

pub fn put(key: &str, v: &Value, owner: &str) {
    if let Ok(conn) = open() {
        put_on(&conn, key, v, owner);
    }
}

fn put_on(conn: &Connection, key: &str, v: &Value, owner: &str) {
    let _ = conn.execute(
        "INSERT OR REPLACE INTO task_cache (key, payload, fetched_at, owner) \
         VALUES (?1, ?2, ?3, ?4)",
        params![key, v.to_string(), now_secs(), owner],
    );
}

/// Drop every row whose key starts with `prefix` ("gh:" / "linear:"). Exact
/// prefix compare rather than LIKE so `_`/`%` in repo names can't act as
/// wildcards.
pub fn delete_prefix(prefix: &str) {
    if let Ok(conn) = open() {
        delete_prefix_on(&conn, prefix);
    }
}

fn delete_prefix_on(conn: &Connection, prefix: &str) {
    let _ = conn.execute(
        "DELETE FROM task_cache WHERE substr(key, 1, length(?1)) = ?1",
        params![prefix],
    );
}

/// Stable, non-secret tag identifying the data's account. FNV-1a 64-bit —
/// deterministic across restarts (std's DefaultHasher is seeded per process).
pub fn hash_owner(secret_or_name: &str) -> String {
    let mut h: u64 = 0xcbf29ce484222325;
    for b in secret_or_name.as_bytes() {
        h ^= *b as u64;
        h = h.wrapping_mul(0x100000001b3);
    }
    format!("{h:016x}")
}

#[cfg(test)]
mod tests {
    use super::*;

    fn tmp_conn(name: &str) -> Connection {
        let dir = std::env::temp_dir().join(format!(
            "tempest-tasks-store-test-{}-{name}",
            std::process::id()
        ));
        let _ = std::fs::remove_dir_all(&dir);
        open_at(&dir.join("tasks-cache.db")).unwrap()
    }

    #[test]
    fn fresh_get_respects_owner_and_age() {
        let conn = tmp_conn("fresh");
        put_on(&conn, "gh:x", &serde_json::json!([1, 2]), "alice");
        assert_eq!(
            get_fresh_on(&conn, "gh:x", 60, "alice"),
            Some(serde_json::json!([1, 2]))
        );

        // Rows are keyed per cache entry — one owner at a time. A different
        // account overwriting the same key must lock the previous account out.
        put_on(&conn, "gh:x", &serde_json::json!([9]), "bob");
        assert_eq!(get_fresh_on(&conn, "gh:x", 60, "alice"), None);
        assert_eq!(get_fresh_on(&conn, "gh:x", 60, "bob"), Some(serde_json::json!([9])));
        assert_eq!(get_stale_on(&conn, "gh:x", "alice"), None);
        // Unknown owner → nothing.
        assert_eq!(get_stale_on(&conn, "gh:x", "carol"), None);

        // Backdate past max_age → no longer fresh, but stale retrieval still
        // finds it for its own owner.
        conn.execute(
            "UPDATE task_cache SET fetched_at = ?1 WHERE key='gh:x'",
            params![now_secs() - 3600],
        )
        .unwrap();
        assert_eq!(get_fresh_on(&conn, "gh:x", 60, "bob"), None);
        assert_eq!(
            get_stale_on(&conn, "gh:x", "bob"),
            Some(serde_json::json!([9]))
        );
    }

    #[test]
    fn delete_prefix_is_exact_and_scoped() {
        let conn = tmp_conn("delete-prefix");
        put_on(&conn, "gh:list:a_b:c", &serde_json::json!(1), "o");
        put_on(&conn, "linear:list:v", &serde_json::json!(2), "o");
        delete_prefix_on(&conn, "gh:");
        let gh_left: i64 = conn
            .query_row("SELECT COUNT(*) FROM task_cache WHERE key LIKE 'gh:%'", [], |r| r.get(0))
            .unwrap();
        assert_eq!(gh_left, 0); // underscore in the deleted key didn't act as a wildcard
        let total: i64 =
            conn.query_row("SELECT COUNT(*) FROM task_cache", [], |r| r.get(0)).unwrap();
        assert_eq!(total, 1);
    }

    #[test]
    fn corrupt_payload_reads_as_none() {
        let conn = tmp_conn("corrupt");
        conn.execute(
            "INSERT OR REPLACE INTO task_cache (key, payload, fetched_at, owner) \
             VALUES ('bad', 'not-json{{', ?1, 'o')",
            params![now_secs()],
        )
        .unwrap();
        assert_eq!(get_stale_on(&conn, "bad", "o"), None);
        assert_eq!(get_fresh_on(&conn, "bad", 60, "o"), None);
    }

    #[test]
    fn hash_owner_is_deterministic() {
        assert_eq!(hash_owner("lin_api_x"), hash_owner("lin_api_x"));
        assert_ne!(hash_owner("lin_api_x"), hash_owner("lin_api_y"));
    }
}
