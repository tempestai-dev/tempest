//! Tasks tab backend: GitHub via `gh` CLI, Linear via GraphQL POST.
//!
//! Design: `gh` is the source of truth for GitHub auth (users
//! already have it, and it handles keyring + hosts + refresh). Linear uses
//! the user's personal API key from the OS keyring (same slot as BYOK keys).
//!
//! All commands return plain JSON-serializable structs shaped for the frontend
//! (Vec<GhItem>, Vec<LinearItem>, ...). A 60s in-process cache keyed by the
//! query args lives here so the frontend can call freely without hammering
//! `gh` or Linear.

use std::collections::HashMap;
use std::process::Command;
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant};

use serde::Serialize;
use serde_json::Value;

// ────────────────────────────────────────────────────────────────────────
// Shared types (mirrored on the TS side in src/components/tasks/types.ts)
// ────────────────────────────────────────────────────────────────────────

#[derive(Serialize, Clone, Debug)]
pub struct Label {
    pub n: String,
    pub c: String,
}

#[derive(Serialize, Clone, Debug)]
pub struct GhRepo {
    pub id: String,
    pub full: String,
    pub favorite: bool,
}

#[derive(Serialize, Clone, Debug)]
pub struct GhItem {
    pub kind: &'static str, // "issue" | "pr"
    pub number: i64,
    pub repo: String,        // owner/repo
    pub state: String,       // "open" | "closed"
    pub draft: bool,
    pub title: String,
    pub author: String,
    pub assignees: Vec<String>,
    pub labels: Vec<Label>,
    pub comments: i64,
    pub updated: String,     // ISO8601; frontend formats
    pub url: String,
    pub body: String,
}

#[derive(Serialize, Clone, Debug)]
pub struct LinearItem {
    pub id: String,          // e.g. ENG-88
    pub title: String,
    pub status: String,      // "backlog" | "todo" | "inprog" | "review" | "done" | "cancel"
    pub priority: String,    // "urgent" | "high" | "med" | "low" | "none"
    pub assignee: Option<String>,
    pub labels: Vec<Label>,
    pub project: Option<String>,
    pub cycle: Option<String>,
    pub team: String,
    pub updated: String,
    pub url: String,
    pub body: String,
}

#[derive(Serialize, Clone, Debug)]
pub struct LinearTeam {
    pub id: String,
    pub name: String,
    pub color: String,
}

#[derive(Serialize, Clone, Debug)]
pub struct LinearProject {
    pub id: String,
    pub name: String,
    pub team: String,
}

#[derive(Serialize, Clone, Debug)]
pub struct LinearView {
    pub id: String,
    pub name: String,
    pub builtin: bool,
}

#[derive(Serialize, Clone, Debug)]
pub struct LinearBootstrap {
    pub viewer_name: String,
    pub teams: Vec<LinearTeam>,
    pub projects: Vec<LinearProject>,
    pub views: Vec<LinearView>,
}

#[derive(Serialize, Clone, Debug)]
pub struct GhAuthState {
    pub available: bool,      // `gh` binary on PATH
    pub authenticated: bool,  // `gh auth status` succeeds
    pub host: Option<String>,
    pub user: Option<String>,
    pub message: Option<String>, // error text when not authenticated
}

// ────────────────────────────────────────────────────────────────────────
// Cache (60s TTL, keyed by (kind, args) string)
// ────────────────────────────────────────────────────────────────────────

static CACHE: OnceLock<Mutex<HashMap<String, (Instant, Value)>>> = OnceLock::new();
fn cache() -> &'static Mutex<HashMap<String, (Instant, Value)>> {
    CACHE.get_or_init(|| Mutex::new(HashMap::new()))
}

const TTL: Duration = Duration::from_secs(60);

fn cache_get(key: &str) -> Option<Value> {
    let mut c = cache().lock().ok()?;
    if let Some((at, v)) = c.get(key) {
        if at.elapsed() < TTL {
            return Some(v.clone());
        }
        c.remove(key);
    }
    None
}

fn cache_put(key: String, v: Value) {
    if let Ok(mut c) = cache().lock() {
        c.insert(key, (Instant::now(), v));
    }
}

/// Frontend-facing: drop everything so a Refresh button forces a re-fetch.
#[tauri::command(async)]
pub fn tasks_cache_invalidate() {
    if let Ok(mut c) = cache().lock() {
        c.clear();
    }
}

// ────────────────────────────────────────────────────────────────────────
// GitHub
// ────────────────────────────────────────────────────────────────────────

fn gh_cmd() -> Command {
    // Windows/macOS/Linux all resolve `gh` from PATH. If the user installed via
    // brew/scoop/apt, it's on PATH by the time Tempest launches from a shell —
    // or from Finder/Start via login shell PATH inheritance.
    Command::new("gh")
}

fn run_gh(args: &[&str]) -> Result<String, String> {
    let out = gh_cmd()
        .args(args)
        .output()
        .map_err(|e| format!("gh: {e}. Install from https://cli.github.com/"))?;
    if !out.status.success() {
        let stderr = String::from_utf8_lossy(&out.stderr).trim().to_string();
        return Err(if stderr.is_empty() {
            format!("gh exited {}", out.status)
        } else {
            stderr
        });
    }
    Ok(String::from_utf8_lossy(&out.stdout).into_owned())
}

/// Detect `gh` presence + auth. UI surfaces this as an inline hint in place
/// of the list body when there is no live source.
#[tauri::command(async)]
pub fn tasks_github_auth() -> GhAuthState {
    let probe = gh_cmd().arg("--version").output();
    let available = matches!(&probe, Ok(o) if o.status.success());
    if !available {
        return GhAuthState {
            available: false,
            authenticated: false,
            host: None,
            user: None,
            message: Some("gh CLI not found. Install from https://cli.github.com/ and run `gh auth login`.".into()),
        };
    }
    // `gh auth status` writes to stderr for both success and failure; parse both.
    let out = gh_cmd().args(["auth", "status"]).output();
    match out {
        Ok(o) if o.status.success() => {
            let text = format!(
                "{}{}",
                String::from_utf8_lossy(&o.stdout),
                String::from_utf8_lossy(&o.stderr)
            );
            let host = text
                .lines()
                .find(|l| l.trim_start().starts_with("github.com") || l.contains("Logged in to"))
                .map(|l| l.trim().to_string());
            GhAuthState {
                available: true,
                authenticated: true,
                host,
                user: parse_gh_user(&text),
                message: None,
            }
        }
        Ok(o) => GhAuthState {
            available: true,
            authenticated: false,
            host: None,
            user: None,
            message: Some(String::from_utf8_lossy(&o.stderr).trim().to_string()),
        },
        Err(e) => GhAuthState {
            available: true,
            authenticated: false,
            host: None,
            user: None,
            message: Some(e.to_string()),
        },
    }
}

fn parse_gh_user(text: &str) -> Option<String> {
    // "  ✓ Logged in to github.com as harsha (keyring)"
    for line in text.lines() {
        if let Some((_, after)) = line.split_once("as ") {
            let user: String = after
                .chars()
                .take_while(|c| !c.is_whitespace() && *c != '(')
                .collect();
            if !user.is_empty() {
                return Some(user);
            }
        }
    }
    None
}

/// `gh repo list --json nameWithOwner,isFork` → GhRepo[]. Cached 60s.
#[tauri::command(async)]
pub fn tasks_github_repos() -> Result<Vec<GhRepo>, String> {
    let key = "gh:repos".to_string();
    if let Some(v) = cache_get(&key) {
        return serde_json::from_value(v).map_err(|e| e.to_string());
    }
    let raw = run_gh(&["repo", "list", "--json", "nameWithOwner,isFork", "--limit", "100"])?;
    let parsed: Value = serde_json::from_str(&raw).map_err(|e| e.to_string())?;
    let repos: Vec<GhRepo> = parsed
        .as_array()
        .map(|arr| {
            arr.iter()
                .filter_map(|v| {
                    let full = v.get("nameWithOwner")?.as_str()?.to_string();
                    let id = full.split('/').last()?.to_string();
                    Some(GhRepo { id, full, favorite: false })
                })
                .collect()
        })
        .unwrap_or_default();
    cache_put(key, serde_json::to_value(&repos).unwrap_or(Value::Null));
    Ok(repos)
}

/// preset ∈ {assigned, created, mentioned, review, open, closed}
/// kind   ∈ {both, issues, prs}
/// repo   = "all" or owner/repo slug (from tasks_github_repos)
#[tauri::command(async)]
pub fn tasks_github_list(
    preset: String,
    repo: String,
    kind: String,
) -> Result<Vec<GhItem>, String> {
    let key = format!("gh:list:{preset}:{repo}:{kind}");
    if let Some(v) = cache_get(&key) {
        return serde_json::from_value(v).map_err(|e| e.to_string());
    }

    let mut items: Vec<GhItem> = Vec::new();
    if kind == "both" || kind == "issues" {
        items.extend(gh_search("issues", &preset, &repo)?);
    }
    if kind == "both" || kind == "prs" {
        items.extend(gh_search("prs", &preset, &repo)?);
    }
    // Newest first.
    items.sort_by(|a, b| b.updated.cmp(&a.updated));
    cache_put(key, serde_json::to_value(&items).unwrap_or(Value::Null));
    Ok(items)
}

fn preset_qualifier(preset: &str, kind: &str) -> Vec<String> {
    // gh search issues/prs takes GitHub search qualifiers.
    let mut q: Vec<String> = Vec::new();
    match preset {
        "assigned" => q.push("assignee:@me".into()),
        "created" => q.push("author:@me".into()),
        "mentioned" => q.push("mentions:@me".into()),
        "review" => {
            // Only meaningful for PRs; for issues fall back to mentioned.
            if kind == "prs" {
                q.push("review-requested:@me".into());
            } else {
                q.push("mentions:@me".into());
            }
        }
        "open" => q.push("state:open".into()),
        "closed" => q.push("state:closed".into()),
        _ => {}
    }
    // For involvement presets default to open; user can override with 'closed' preset.
    if matches!(preset, "assigned" | "created" | "mentioned" | "review") {
        q.push("state:open".into());
    }
    q
}

fn gh_search(kind: &str, preset: &str, repo: &str) -> Result<Vec<GhItem>, String> {
    let mut q_parts = preset_qualifier(preset, kind);
    if repo != "all" {
        // repo id can be "owner/repo" (dropdown value) or just repo slug.
        if repo.contains('/') {
            q_parts.push(format!("repo:{repo}"));
        }
    }
    let query = q_parts.join(" ");
    let fields = if kind == "prs" {
        "number,title,state,isDraft,url,repository,author,assignees,labels,commentsCount,updatedAt,body"
    } else {
        "number,title,state,url,repository,author,assignees,labels,commentsCount,updatedAt,body"
    };
    let out = run_gh(&[
        "search", kind, &query, "--json", fields, "--limit", "50",
    ])?;
    let parsed: Value = serde_json::from_str(&out).map_err(|e| e.to_string())?;
    let arr = parsed.as_array().cloned().unwrap_or_default();
    Ok(arr
        .into_iter()
        .filter_map(|v| gh_item_from(v, kind))
        .collect())
}

fn gh_item_from(v: Value, kind_str: &str) -> Option<GhItem> {
    let number = v.get("number")?.as_i64()?;
    let title = v.get("title")?.as_str()?.to_string();
    let state_raw = v.get("state").and_then(|s| s.as_str()).unwrap_or("open").to_lowercase();
    let state = if state_raw == "closed" || state_raw == "merged" { "closed" } else { "open" }.to_string();
    let draft = v.get("isDraft").and_then(|b| b.as_bool()).unwrap_or(false);
    let url = v.get("url").and_then(|s| s.as_str()).unwrap_or("").to_string();
    let repo = v
        .get("repository")
        .and_then(|r| r.get("nameWithOwner"))
        .and_then(|s| s.as_str())
        .unwrap_or("")
        .to_string();
    let author = v
        .get("author")
        .and_then(|a| a.get("login"))
        .and_then(|s| s.as_str())
        .unwrap_or("")
        .to_string();
    let assignees = v
        .get("assignees")
        .and_then(|a| a.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|u| u.get("login").and_then(|s| s.as_str()).map(String::from))
                .collect()
        })
        .unwrap_or_default();
    let labels = v
        .get("labels")
        .and_then(|a| a.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|l| {
                    let n = l.get("name").and_then(|s| s.as_str())?.to_string();
                    let c = l
                        .get("color")
                        .and_then(|s| s.as_str())
                        .map(|s| if s.starts_with('#') { s.to_string() } else { format!("#{s}") })
                        .unwrap_or_else(|| "#6b7280".into());
                    Some(Label { n, c })
                })
                .collect()
        })
        .unwrap_or_default();
    let comments = v.get("commentsCount").and_then(|n| n.as_i64()).unwrap_or(0);
    let updated = v
        .get("updatedAt")
        .and_then(|s| s.as_str())
        .unwrap_or("")
        .to_string();
    let body = v.get("body").and_then(|s| s.as_str()).unwrap_or("").to_string();
    Some(GhItem {
        kind: if kind_str == "prs" { "pr" } else { "issue" },
        number,
        repo,
        state,
        draft,
        title,
        author,
        assignees,
        labels,
        comments,
        updated,
        url,
        body,
    })
}

// ────────────────────────────────────────────────────────────────────────
// Linear (personal API key in OS keyring under "byok/linear")
// ────────────────────────────────────────────────────────────────────────

fn linear_key() -> Result<String, String> {
    let entry = keyring::Entry::new("tempest-byok", "byok/linear")
        .map_err(|e| e.to_string())?;
    match entry.get_password() {
        Ok(v) => Ok(v),
        Err(keyring::Error::NoEntry) => Err(
            "Linear API key not set. Add it under Settings → API Keys → Linear.".into(),
        ),
        Err(e) => Err(e.to_string()),
    }
}

fn linear_post(query: &str, variables: Value) -> Result<Value, String> {
    let key = linear_key()?;
    let body = serde_json::json!({ "query": query, "variables": variables });
    let resp = ureq::post("https://api.linear.app/graphql")
        .set("Authorization", &key) // Linear personal keys are sent raw, no "Bearer".
        .set("Content-Type", "application/json")
        .send_string(&body.to_string());
    let text = match resp {
        Ok(r) => r.into_string().map_err(|e| e.to_string())?,
        Err(ureq::Error::Status(code, r)) => {
            let msg = r.into_string().unwrap_or_default();
            return Err(format!("Linear API {code}: {msg}"));
        }
        Err(e) => return Err(format!("Linear: {e}")),
    };
    let v: Value = serde_json::from_str(&text).map_err(|e| e.to_string())?;
    if let Some(errs) = v.get("errors").and_then(|e| e.as_array()) {
        let joined: Vec<String> = errs
            .iter()
            .filter_map(|e| e.get("message").and_then(|m| m.as_str()).map(String::from))
            .collect();
        return Err(joined.join("; "));
    }
    Ok(v.get("data").cloned().unwrap_or(Value::Null))
}

const BOOTSTRAP_QUERY: &str = r#"
query Bootstrap {
  viewer { id name }
  teams(first: 50) { nodes { id name key color } }
  projects(first: 100) { nodes { id name teams { nodes { key } } } }
  customViews(first: 50) { nodes { id name } }
}
"#;

#[tauri::command(async)]
pub fn tasks_linear_bootstrap() -> Result<LinearBootstrap, String> {
    let key = "linear:bootstrap".to_string();
    if let Some(v) = cache_get(&key) {
        return serde_json::from_value(v).map_err(|e| e.to_string());
    }
    let data = linear_post(BOOTSTRAP_QUERY, Value::Object(Default::default()))?;
    let viewer_name = data
        .get("viewer")
        .and_then(|v| v.get("name"))
        .and_then(|s| s.as_str())
        .unwrap_or("")
        .to_string();
    let teams: Vec<LinearTeam> = data
        .get("teams")
        .and_then(|t| t.get("nodes"))
        .and_then(|a| a.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|t| {
                    Some(LinearTeam {
                        id: t.get("key")?.as_str()?.to_string(),
                        name: t.get("name")?.as_str()?.to_string(),
                        color: t.get("color").and_then(|s| s.as_str()).unwrap_or("#62a6ff").to_string(),
                    })
                })
                .collect()
        })
        .unwrap_or_default();
    let projects: Vec<LinearProject> = data
        .get("projects")
        .and_then(|p| p.get("nodes"))
        .and_then(|a| a.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|p| {
                    let id = p.get("id")?.as_str()?.to_string();
                    let name = p.get("name")?.as_str()?.to_string();
                    let team = p
                        .get("teams")
                        .and_then(|t| t.get("nodes"))
                        .and_then(|a| a.as_array())
                        .and_then(|arr| arr.first())
                        .and_then(|t0| t0.get("key"))
                        .and_then(|s| s.as_str())
                        .unwrap_or("")
                        .to_string();
                    Some(LinearProject { id, name, team })
                })
                .collect()
        })
        .unwrap_or_default();
    let builtin = vec![
        LinearView { id: "v-my".into(), name: "My issues".into(), builtin: true },
        LinearView { id: "v-active".into(), name: "Active".into(), builtin: true },
        LinearView { id: "v-back".into(), name: "Backlog".into(), builtin: true },
    ];
    let mut views = builtin;
    if let Some(arr) = data
        .get("customViews")
        .and_then(|c| c.get("nodes"))
        .and_then(|a| a.as_array())
    {
        for v in arr {
            if let (Some(id), Some(name)) = (
                v.get("id").and_then(|s| s.as_str()),
                v.get("name").and_then(|s| s.as_str()),
            ) {
                views.push(LinearView {
                    id: id.to_string(),
                    name: name.to_string(),
                    builtin: false,
                });
            }
        }
    }
    let bootstrap = LinearBootstrap { viewer_name, teams, projects, views };
    cache_put(key, serde_json::to_value(&bootstrap).unwrap_or(Value::Null));
    Ok(bootstrap)
}

const ISSUES_QUERY: &str = r#"
query Issues($filter: IssueFilter, $first: Int) {
  issues(filter: $filter, first: $first, orderBy: updatedAt) {
    nodes {
      identifier
      title
      priority
      updatedAt
      url
      description
      assignee { name }
      state { name type }
      team { key }
      project { id name }
      cycle { name }
      labels { nodes { name color } }
    }
  }
}
"#;

#[tauri::command(async)]
pub fn tasks_linear_list(
    scope_kind: String,
    scope_id: String,
) -> Result<Vec<LinearItem>, String> {
    let key = format!("linear:list:{scope_kind}:{scope_id}");
    if let Some(v) = cache_get(&key) {
        return serde_json::from_value(v).map_err(|e| e.to_string());
    }

    // Build filter from the scope. Custom views by id go through a separate
    // customView() lookup — but a scoped filter over issues() is sufficient
    // for the built-ins the UI ships.
    let mut filter = serde_json::Map::new();
    match (scope_kind.as_str(), scope_id.as_str()) {
        ("view", "v-my") => {
            filter.insert("assignee".into(), serde_json::json!({ "isMe": { "eq": true } }));
        }
        ("view", "v-active") => {
            filter.insert(
                "state".into(),
                serde_json::json!({ "type": { "in": ["started", "unstarted"] } }),
            );
        }
        ("view", "v-back") => {
            filter.insert("state".into(), serde_json::json!({ "type": { "eq": "backlog" } }));
        }
        ("team", id) => {
            filter.insert("team".into(), serde_json::json!({ "key": { "eq": id } }));
        }
        ("project", id) => {
            filter.insert("project".into(), serde_json::json!({ "id": { "eq": id } }));
        }
        _ => {} // "all" or unknown → no filter
    }

    let variables = serde_json::json!({
        "filter": Value::Object(filter),
        "first": 50,
    });

    let data = linear_post(ISSUES_QUERY, variables)?;
    let items: Vec<LinearItem> = data
        .get("issues")
        .and_then(|i| i.get("nodes"))
        .and_then(|a| a.as_array())
        .map(|arr| arr.iter().filter_map(linear_item_from).collect())
        .unwrap_or_default();
    cache_put(key, serde_json::to_value(&items).unwrap_or(Value::Null));
    Ok(items)
}

fn linear_item_from(v: &Value) -> Option<LinearItem> {
    let id = v.get("identifier")?.as_str()?.to_string();
    let title = v.get("title")?.as_str()?.to_string();
    let priority = match v.get("priority").and_then(|p| p.as_i64()).unwrap_or(0) {
        1 => "urgent",
        2 => "high",
        3 => "med",
        4 => "low",
        _ => "none",
    }
    .to_string();
    let updated = v.get("updatedAt").and_then(|s| s.as_str()).unwrap_or("").to_string();
    let url = v.get("url").and_then(|s| s.as_str()).unwrap_or("").to_string();
    let body = v.get("description").and_then(|s| s.as_str()).unwrap_or("").to_string();
    let assignee = v
        .get("assignee")
        .and_then(|a| a.get("name"))
        .and_then(|s| s.as_str())
        .map(String::from);
    let state_type = v
        .get("state")
        .and_then(|s| s.get("type"))
        .and_then(|s| s.as_str())
        .unwrap_or("unstarted");
    let status = match state_type {
        "backlog" => "backlog",
        "unstarted" => "todo",
        "started" => "inprog",
        "completed" => "done",
        "canceled" => "cancel",
        // Linear treats "in review" as a workflow-state name, not a type; guess by name.
        _ => {
            let name = v
                .get("state")
                .and_then(|s| s.get("name"))
                .and_then(|s| s.as_str())
                .unwrap_or("")
                .to_lowercase();
            if name.contains("review") { "review" } else { "todo" }
        }
    }
    .to_string();
    let team = v
        .get("team")
        .and_then(|t| t.get("key"))
        .and_then(|s| s.as_str())
        .unwrap_or("")
        .to_string();
    let project = v
        .get("project")
        .and_then(|p| p.get("id"))
        .and_then(|s| s.as_str())
        .map(String::from);
    let cycle = v
        .get("cycle")
        .and_then(|c| c.get("name"))
        .and_then(|s| s.as_str())
        .map(String::from);
    let labels = v
        .get("labels")
        .and_then(|l| l.get("nodes"))
        .and_then(|a| a.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|l| {
                    let n = l.get("name")?.as_str()?.to_string();
                    let c = l
                        .get("color")
                        .and_then(|s| s.as_str())
                        .unwrap_or("#6b7280")
                        .to_string();
                    Some(Label { n, c })
                })
                .collect()
        })
        .unwrap_or_default();
    Some(LinearItem {
        id,
        title,
        status,
        priority,
        assignee,
        labels,
        project,
        cycle,
        team,
        updated,
        url,
        body,
    })
}

// ────────────────────────────────────────────────────────────────────────
// Sanity check (cargo test)
// ────────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn preset_shapes() {
        // Presets add the expected search qualifier plus state:open by default.
        let q = preset_qualifier("assigned", "issues");
        assert!(q.iter().any(|s| s == "assignee:@me"));
        assert!(q.iter().any(|s| s == "state:open"));
        // 'review' on issues degrades to mentions (issues have no review flag).
        let q = preset_qualifier("review", "issues");
        assert!(q.iter().any(|s| s == "mentions:@me"));
        let q = preset_qualifier("review", "prs");
        assert!(q.iter().any(|s| s == "review-requested:@me"));
        // 'closed' only sets state:closed (no default state override).
        let q = preset_qualifier("closed", "issues");
        assert_eq!(q, vec!["state:closed".to_string()]);
    }

    #[test]
    fn cache_ttl_returns_and_expires() {
        let k = "test:cache-key".to_string();
        cache_put(k.clone(), Value::String("hi".into()));
        assert_eq!(cache_get(&k), Some(Value::String("hi".into())));
        // Simulate stale by clearing manually — we can't fast-forward Instant.
        tasks_cache_invalidate();
        assert_eq!(cache_get(&k), None);
    }
}
