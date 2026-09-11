// Live quota readers for the title-bar island. One file per provider; each
// exposes `fetch() -> ProviderUsage`. The Tauri command runs them all and hands
// the frontend a stable, uniform shape — the island never has to know which
// providers exist or what shape their APIs return.

pub mod claude;
pub mod codex;
pub mod copilot;
pub mod cursor;
pub mod grok;

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ProviderStatus {
    /// Reader ran, data returned.
    Available,
    /// No credentials on disk / user not signed in — expected, not an error.
    Unavailable,
    /// Credentials found but the fetch failed (network, auth, parse). `error`
    /// is set. The island shows the row so the user knows it exists.
    Error,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, Default)]
#[serde(rename_all = "lowercase")]
pub enum Tone {
    #[default]
    Default,
    Ok,
    Warning,
    Danger,
}

/// A percent-based limit that resets on a rolling window.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Window {
    pub id: String,
    pub label: String,
    /// 0.0–1.0. `None` when the provider reports a window but not its usage
    /// (e.g. Copilot's "quota_reset_date" alone).
    pub used: Option<f64>,
    /// Epoch ms.
    pub resets_at: Option<i64>,
    pub tone: Tone,
}

/// A running balance the user is charged against (USD, credits, tokens).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Balance {
    pub id: String,
    pub label: String,
    pub used: Option<f64>,
    pub remaining: Option<f64>,
    pub limit: Option<f64>,
    /// "usd" | "credits" | "requests" | "tokens".
    pub unit: String,
    pub resets_at: Option<i64>,
    pub tone: Tone,
}

/// Free-form metadata that has no bar (plan name, reset date, tier).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Detail {
    pub label: String,
    pub value: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderUsage {
    /// Stable id — matches the agent hint (`claude`, `codex`, `copilot`, `cursor`).
    pub provider_id: String,
    pub display_name: String,
    pub status: ProviderStatus,
    pub plan_label: Option<String>,
    pub windows: Vec<Window>,
    pub balances: Vec<Balance>,
    pub details: Vec<Detail>,
    pub error: Option<String>,
}

impl ProviderUsage {
    pub fn unavailable(provider_id: &str, display_name: &str) -> Self {
        Self {
            provider_id: provider_id.into(),
            display_name: display_name.into(),
            status: ProviderStatus::Unavailable,
            plan_label: None,
            windows: vec![],
            balances: vec![],
            details: vec![],
            error: None,
        }
    }

    pub fn errored(provider_id: &str, display_name: &str, msg: impl Into<String>) -> Self {
        Self {
            provider_id: provider_id.into(),
            display_name: display_name.into(),
            status: ProviderStatus::Error,
            plan_label: None,
            windows: vec![],
            balances: vec![],
            details: vec![],
            error: Some(msg.into()),
        }
    }
}

// ── shared helpers ───────────────────────────────────────────────────────────

/// Tone thresholds match the front-end's `quota.ts` (WARN=0.75, CRIT=0.9) so a
/// window classified `danger` here is the same one the island opens up for.
pub fn tone_from_used(used: f64) -> Tone {
    if used >= 0.9 { Tone::Danger }
    else if used >= 0.75 { Tone::Warning }
    else { Tone::Ok }
}

pub(crate) fn home_dir() -> std::path::PathBuf {
    #[cfg(windows)]
    let key = "USERPROFILE";
    #[cfg(not(windows))]
    let key = "HOME";
    std::env::var(key).map(std::path::PathBuf::from).unwrap_or_else(|_| std::path::PathBuf::from("."))
}

/// Convert an ISO-8601 string OR a numeric epoch (seconds or ms) into epoch ms.
/// Providers return whichever they feel like — normalize once here so the UI
/// never sees the mess.
pub(crate) fn to_epoch_ms(v: &serde_json::Value) -> Option<i64> {
    if let Some(n) = v.as_i64() {
        // Heuristic: > 10^12 is already ms; otherwise seconds.
        return Some(if n > 1_000_000_000_000 { n } else { n * 1000 });
    }
    if let Some(f) = v.as_f64() {
        let n = f as i64;
        return Some(if n > 1_000_000_000_000 { n } else { n * 1000 });
    }
    if let Some(s) = v.as_str() {
        // RFC 3339 without a full parser: `time` isn't in deps and adding it
        // for this one call is overkill. Handle the shape all four providers
        // actually emit (`YYYY-MM-DDTHH:MM:SS(.fff)?Z` or `+00:00`).
        return parse_rfc3339_utc(s);
    }
    None
}

fn parse_rfc3339_utc(s: &str) -> Option<i64> {
    // Trim fractional seconds and timezone suffix, then parse the fixed shape.
    let s = s.trim();
    let (date, rest) = s.split_once('T')?;
    let time_part = rest.split(&['.', 'Z', '+', '-'][..]).next()?;
    let mut d = date.split('-');
    let year: i64 = d.next()?.parse().ok()?;
    let month: i64 = d.next()?.parse().ok()?;
    let day: i64 = d.next()?.parse().ok()?;
    let mut t = time_part.split(':');
    let hour: i64 = t.next()?.parse().ok()?;
    let min: i64 = t.next()?.parse().ok()?;
    let sec: i64 = t.next().unwrap_or("0").parse().ok()?;
    // Days-from-civil (Howard Hinnant). Handles all Gregorian dates without a
    // calendar dep. Every reset time we receive is UTC so no offset math.
    let y = if month <= 2 { year - 1 } else { year };
    let era = if y >= 0 { y } else { y - 399 } / 400;
    let yoe = (y - era * 400) as i64;
    let m = month as i64;
    let doy = (153 * (if m > 2 { m - 3 } else { m + 9 }) + 2) / 5 + day as i64 - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    let days = era * 146097 + doe - 719468;
    Some((days * 86400 + hour * 3600 + min * 60 + sec) * 1000)
}

// ── Tauri command ────────────────────────────────────────────────────────────

#[tauri::command(async)]
pub fn quota_read_all() -> Vec<ProviderUsage> {
    // Sequential: 4 blocking HTTPS calls total, worst-case ~2s. Parallelizing
    // would need a runtime we don't need to boot for this. If poll time ever
    // becomes user-visible, `std::thread::spawn` a scope here.
    vec![
        claude::fetch(),
        codex::fetch(),
        copilot::fetch(),
        cursor::fetch(),
        grok::fetch(),
    ]
}
