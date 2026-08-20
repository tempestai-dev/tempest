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

use serde::{Deserialize, Serialize};
use serde_json::Value;

// ────────────────────────────────────────────────────────────────────────
// Shared types (mirrored on the TS side in src/components/tasks/types.ts)
// ────────────────────────────────────────────────────────────────────────

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct Label {
    pub n: String,
    pub c: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct GhRepo {
    pub id: String,
    pub full: String,
    pub favorite: bool,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct GhItem {
    pub kind: String, // "issue" | "pr"
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

#[derive(Serialize, Deserialize, Clone, Debug)]
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

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct LinearTeam {
    pub id: String,
    pub name: String,
    pub color: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct LinearProject {
    pub id: String,
    pub name: String,
    pub team: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct LinearView {
    pub id: String,
    pub name: String,
    pub builtin: bool,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct LinearBootstrap {
    pub viewer_name: String,
    pub teams: Vec<LinearTeam>,
    pub projects: Vec<LinearProject>,
    pub views: Vec<LinearView>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct TaskComment {
    pub id: String,
    pub author: String,
    pub body: String,
    pub created: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct TaskActivity {
    pub id: String,
    pub author: String,
    pub kind: String,    // "labeled" | "closed" | "assigned" | ...
    pub detail: String,  // human-readable one-liner
    pub created: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct TaskThread {
    pub comments: Vec<TaskComment>,
    pub activity: Vec<TaskActivity>,
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

/// preset ∈ {all, assigned, created, mentioned, review, open, closed}
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

/// Turn a preset into `gh search` FLAGS (not query qualifiers). GitHub's
/// search API expands `@me` for the `assignee:` / `author:` / `mentions:` /
/// `review-requested:` FLAGS gh forwards, but treats `@me` inside the raw
/// positional query as a literal username — which fails with "listed users
/// cannot be searched." So we pass through flags exclusively.
fn preset_flags(preset: &str, kind: &str) -> Vec<String> {
    let mut f: Vec<String> = Vec::new();
    match preset {
        // Union of author + assignee + mentions + review-requested for @me.
        "all" => f.push("--involves=@me".into()),
        "assigned" => f.push("--assignee=@me".into()),
        "created" => f.push("--author=@me".into()),
        "mentioned" => f.push("--mentions=@me".into()),
        "review" => {
            // Only meaningful for PRs; for issues fall back to mentioned.
            if kind == "prs" {
                f.push("--review-requested=@me".into());
            } else {
                f.push("--mentions=@me".into());
            }
        }
        _ => {}
    }
    // Involvement presets default to open; explicit open/closed set that state.
    let state = match preset {
        "closed" => "closed",
        _ => "open",
    };
    f.push(format!("--state={state}"));
    f
}

fn gh_search(kind: &str, preset: &str, repo: &str) -> Result<Vec<GhItem>, String> {
    let mut args: Vec<String> = vec!["search".into(), kind.into()];
    args.extend(preset_flags(preset, kind));
    if repo != "all" && repo.contains('/') {
        args.push(format!("--repo={repo}"));
    }
    let fields = if kind == "prs" {
        "number,title,state,isDraft,url,repository,author,assignees,labels,commentsCount,updatedAt,body"
    } else {
        "number,title,state,url,repository,author,assignees,labels,commentsCount,updatedAt,body"
    };
    args.push("--json".into());
    args.push(fields.into());
    args.push("--limit".into());
    args.push("50".into());
    let arg_refs: Vec<&str> = args.iter().map(String::as_str).collect();
    let out = run_gh(&arg_refs)?;
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
        kind: if kind_str == "prs" { "pr".into() } else { "issue".into() },
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

/// Comments + timeline for one issue/PR. Timeline events with `event == "commented"`
/// duplicate comments so we drop them; everything else is folded into Activity.
#[tauri::command(async)]
pub fn tasks_github_thread(repo: String, number: i64) -> Result<TaskThread, String> {
    let key = format!("gh:thread:{repo}:{number}");
    if let Some(v) = cache_get(&key) {
        return serde_json::from_value(v).map_err(|e| e.to_string());
    }

    let comments_path = format!("/repos/{repo}/issues/{number}/comments?per_page=100");
    let raw = run_gh(&["api", &comments_path])?;
    let comments: Vec<TaskComment> = serde_json::from_str::<Vec<Value>>(&raw)
        .unwrap_or_default()
        .into_iter()
        .map(|v| TaskComment {
            id: v.get("id").and_then(|n| n.as_i64()).map(|n| n.to_string()).unwrap_or_default(),
            author: v.get("user").and_then(|u| u.get("login")).and_then(|s| s.as_str()).unwrap_or("").to_string(),
            body: v.get("body").and_then(|s| s.as_str()).unwrap_or("").to_string(),
            created: v.get("created_at").and_then(|s| s.as_str()).unwrap_or("").to_string(),
        })
        .collect();

    let timeline_path = format!("/repos/{repo}/issues/{number}/timeline?per_page=100");
    let raw = run_gh(&["api", &timeline_path])?;
    let activity: Vec<TaskActivity> = serde_json::from_str::<Vec<Value>>(&raw)
        .unwrap_or_default()
        .into_iter()
        .filter_map(gh_event_from)
        .collect();

    let thread = TaskThread { comments, activity };
    cache_put(key, serde_json::to_value(&thread).unwrap_or(Value::Null));
    Ok(thread)
}

fn gh_event_from(v: Value) -> Option<TaskActivity> {
    let event = v.get("event").and_then(|s| s.as_str())?.to_string();
    if event == "commented" { return None; } // dedup with comments list
    let author = v.get("actor").and_then(|a| a.get("login")).and_then(|s| s.as_str()).unwrap_or("").to_string();
    let created = v.get("created_at").and_then(|s| s.as_str()).unwrap_or("").to_string();
    let id = v.get("id")
        .and_then(|n| n.as_i64())
        .map(|n| n.to_string())
        .or_else(|| v.get("node_id").and_then(|s| s.as_str()).map(String::from))
        .unwrap_or_else(|| format!("{event}-{created}"));
    let detail = match event.as_str() {
        "labeled" | "unlabeled" => {
            let name = v.get("label").and_then(|l| l.get("name")).and_then(|s| s.as_str()).unwrap_or("");
            let verb = if event == "labeled" { "added label" } else { "removed label" };
            format!("{verb} {name}")
        }
        "assigned" | "unassigned" => {
            let name = v.get("assignee").and_then(|a| a.get("login")).and_then(|s| s.as_str()).unwrap_or("");
            format!("{event} {name}")
        }
        "renamed" => {
            let to = v.get("rename").and_then(|r| r.get("to")).and_then(|s| s.as_str()).unwrap_or("");
            format!("renamed to \"{to}\"")
        }
        "closed" => "closed this".into(),
        "reopened" => "reopened this".into(),
        "merged" => "merged".into(),
        "review_requested" => {
            let who = v.get("requested_reviewer").and_then(|r| r.get("login")).and_then(|s| s.as_str()).unwrap_or("");
            format!("requested review from {who}")
        }
        "reviewed" => {
            let st = v.get("state").and_then(|s| s.as_str()).unwrap_or("reviewed");
            format!("review {st}")
        }
        "referenced" | "cross-referenced" => "referenced this".into(),
        _ => event.replace('_', " "),
    };
    Some(TaskActivity { id, author, kind: event, detail, created })
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

const THREAD_QUERY: &str = r#"
query Thread($team: String!, $number: Float!) {
  issues(filter: { team: { key: { eq: $team } }, number: { eq: $number } }, first: 1) {
    nodes {
      comments(first: 100) {
        nodes { id body createdAt user { name } }
      }
      history(first: 100) {
        nodes {
          id createdAt
          actor { name }
          fromState { name } toState { name }
          fromAssignee { name } toAssignee { name }
          addedLabels { name } removedLabels { name }
          fromPriority toPriority
        }
      }
    }
  }
}
"#;

#[tauri::command(async)]
pub fn tasks_linear_thread(id: String) -> Result<TaskThread, String> {
    let key = format!("linear:thread:{id}");
    if let Some(v) = cache_get(&key) {
        return serde_json::from_value(v).map_err(|e| e.to_string());
    }
    let (team, number) = id
        .split_once('-')
        .ok_or_else(|| format!("bad linear identifier: {id}"))?;
    let number: i64 = number
        .parse()
        .map_err(|_| format!("bad linear number in: {id}"))?;
    let variables = serde_json::json!({ "team": team, "number": number });
    let data = linear_post(THREAD_QUERY, variables)?;

    let node = data
        .get("issues")
        .and_then(|i| i.get("nodes"))
        .and_then(|a| a.as_array())
        .and_then(|arr| arr.first())
        .cloned()
        .unwrap_or(Value::Null);

    let comments: Vec<TaskComment> = node
        .get("comments")
        .and_then(|c| c.get("nodes"))
        .and_then(|a| a.as_array())
        .map(|arr| {
            arr.iter()
                .map(|v| TaskComment {
                    id: v.get("id").and_then(|s| s.as_str()).unwrap_or("").to_string(),
                    author: v.get("user").and_then(|u| u.get("name")).and_then(|s| s.as_str()).unwrap_or("").to_string(),
                    body: v.get("body").and_then(|s| s.as_str()).unwrap_or("").to_string(),
                    created: v.get("createdAt").and_then(|s| s.as_str()).unwrap_or("").to_string(),
                })
                .collect()
        })
        .unwrap_or_default();

    let activity: Vec<TaskActivity> = node
        .get("history")
        .and_then(|h| h.get("nodes"))
        .and_then(|a| a.as_array())
        .map(|arr| arr.iter().filter_map(linear_event_from).collect())
        .unwrap_or_default();

    let thread = TaskThread { comments, activity };
    cache_put(key, serde_json::to_value(&thread).unwrap_or(Value::Null));
    Ok(thread)
}

fn linear_event_from(v: &Value) -> Option<TaskActivity> {
    let id = v.get("id").and_then(|s| s.as_str())?.to_string();
    let created = v.get("createdAt").and_then(|s| s.as_str()).unwrap_or("").to_string();
    let author = v.get("actor").and_then(|a| a.get("name")).and_then(|s| s.as_str()).unwrap_or("").to_string();

    let mut parts: Vec<String> = Vec::new();
    if let (Some(from), Some(to)) = (
        v.get("fromState").and_then(|s| s.get("name")).and_then(|s| s.as_str()),
        v.get("toState").and_then(|s| s.get("name")).and_then(|s| s.as_str()),
    ) {
        parts.push(format!("state {from} → {to}"));
    } else if let Some(to) = v.get("toState").and_then(|s| s.get("name")).and_then(|s| s.as_str()) {
        parts.push(format!("state → {to}"));
    }
    if let Some(to) = v.get("toAssignee").and_then(|a| a.get("name")).and_then(|s| s.as_str()) {
        parts.push(format!("assigned {to}"));
    } else if v.get("fromAssignee").is_some() && v.get("toAssignee").map(Value::is_null).unwrap_or(false) {
        parts.push("unassigned".into());
    }
    let added: Vec<String> = v.get("addedLabels").and_then(|a| a.as_array()).map(|arr| {
        arr.iter().filter_map(|l| l.get("name").and_then(|s| s.as_str()).map(String::from)).collect()
    }).unwrap_or_default();
    if !added.is_empty() { parts.push(format!("added label {}", added.join(", "))); }
    let removed: Vec<String> = v.get("removedLabels").and_then(|a| a.as_array()).map(|arr| {
        arr.iter().filter_map(|l| l.get("name").and_then(|s| s.as_str()).map(String::from)).collect()
    }).unwrap_or_default();
    if !removed.is_empty() { parts.push(format!("removed label {}", removed.join(", "))); }
    if let (Some(from), Some(to)) = (
        v.get("fromPriority").and_then(|n| n.as_i64()),
        v.get("toPriority").and_then(|n| n.as_i64()),
    ) {
        if from != to {
            let label = |p: i64| match p { 1 => "Urgent", 2 => "High", 3 => "Med", 4 => "Low", _ => "None" };
            parts.push(format!("priority {} → {}", label(from), label(to)));
        }
    }
    if parts.is_empty() { return None; } // silent history rows aren't worth showing
    Some(TaskActivity {
        id,
        author,
        kind: "changed".into(),
        detail: parts.join(", "),
        created,
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
        // Presets translate to gh flags — never raw query qualifiers, since
        // gh expands @me for the flags but not inside the positional query.
        let f = preset_flags("assigned", "issues");
        assert!(f.iter().any(|s| s == "--assignee=@me"));
        assert!(f.iter().any(|s| s == "--state=open"));
        // 'review' on issues degrades to --mentions (issues have no review flag).
        let f = preset_flags("review", "issues");
        assert!(f.iter().any(|s| s == "--mentions=@me"));
        let f = preset_flags("review", "prs");
        assert!(f.iter().any(|s| s == "--review-requested=@me"));
        // 'closed' sets --state=closed.
        let f = preset_flags("closed", "issues");
        assert!(f.iter().any(|s| s == "--state=closed"));
    }

    #[test]
    fn gh_event_folds_and_drops_commented() {
        assert!(gh_event_from(serde_json::json!({ "event": "commented" })).is_none());
        let e = gh_event_from(serde_json::json!({
            "event": "labeled",
            "actor": { "login": "octo" },
            "label": { "name": "bug" },
            "created_at": "2026-01-01T00:00:00Z"
        })).unwrap();
        assert_eq!(e.author, "octo");
        assert!(e.detail.contains("bug"));
    }

    #[test]
    fn linear_event_skips_silent_history() {
        // A history row with no state/assignee/label/priority change should be dropped.
        let none = linear_event_from(&serde_json::json!({
            "id": "h1", "createdAt": "2026-01-01T00:00:00Z", "actor": { "name": "x" }
        }));
        assert!(none.is_none());
        // A state change produces a rendered detail.
        let some = linear_event_from(&serde_json::json!({
            "id": "h2",
            "createdAt": "2026-01-01T00:00:00Z",
            "actor": { "name": "x" },
            "toState": { "name": "In Progress" }
        })).unwrap();
        assert!(some.detail.contains("In Progress"));
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
