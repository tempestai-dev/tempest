// Grok quota reader.
//
// Reads Grok CLI's `auth.json` (at `$GROK_HOME` or `~/.grok`) and calls xAI's
// billing endpoint. Emits a weekly-credits window when the account has one,
// otherwise falls back to a monthly-budget window derived from the money-value
// pair the same response often carries. Ported from orca's grok-fetcher; the
// mapping choices track that file, minus the second billing-URL fallback and
// the proto3-explicit-zero heuristic — bring those back if a real account hits
// the gap.
//
// Auth is refreshed by the Grok CLI itself; we never call `grok login`. If the
// stored token has visibly expired we surface a clear error rather than
// pretending it works.

use super::{tone_from_used, Detail, ProviderUsage, ProviderStatus, Window};
use serde::Deserialize;
use serde_json::Value;

const ID: &str = "grok";
const NAME: &str = "Grok";
const BILLING_CREDITS_URL: &str = "https://cli-chat-proxy.grok.com/v1/billing?format=credits";
const AUTH_HEADER: &str = "xai-grok-cli";
const PREFERRED_ISSUER: &str = "https://auth.x.ai";
const TOKEN_SKEW_MS: i64 = 5 * 60 * 1000;

#[derive(Debug, Deserialize)]
struct RawAuthEntry {
    key: Option<String>,
    user_id: Option<String>,
    email: Option<String>,
    #[allow(dead_code)]
    team_id: Option<String>,
    expires_at: Option<String>,
}

struct AuthSession {
    access_token: String,
    user_id: Option<String>,
    email: Option<String>,
    expires_at_ms: Option<i64>,
}

enum AuthRead {
    Ok(AuthSession),
    Missing,
    Error(String),
}

pub fn fetch() -> ProviderUsage {
    match read_auth() {
        AuthRead::Missing => ProviderUsage::unavailable(ID, NAME),
        AuthRead::Error(e) => ProviderUsage::errored(ID, NAME, e),
        AuthRead::Ok(session) => {
            if !is_token_fresh(&session) {
                // Grok CLI refreshes on its next run — don't tell users to
                // re-login, just say the token needs a bump.
                return ProviderUsage::errored(
                    ID, NAME,
                    "Grok sign-in expired — run `grok` once to refresh the token",
                );
            }
            match call_billing(&session) {
                Ok(v) => parse_billing(&v, &session),
                Err(e) => ProviderUsage::errored(ID, NAME, e),
            }
        }
    }
}

// ── auth ────────────────────────────────────────────────────────────────

fn grok_home() -> std::path::PathBuf {
    if let Ok(dir) = std::env::var("GROK_HOME") {
        let trimmed = dir.trim();
        if !trimmed.is_empty() { return std::path::PathBuf::from(trimmed); }
    }
    super::home_dir().join(".grok")
}

fn read_auth() -> AuthRead {
    let path = grok_home().join("auth.json");
    if !path.exists() { return AuthRead::Missing; }
    let text = match std::fs::read_to_string(&path) {
        Ok(t) => t,
        Err(_) => return AuthRead::Error("Unable to read Grok auth file".into()),
    };
    let map: std::collections::BTreeMap<String, Value> = match serde_json::from_str(&text) {
        Ok(v) => v,
        Err(_) => return AuthRead::Error("Grok auth file is invalid".into()),
    };

    let mut preferred_seen = false;
    let mut expired_preferred: Option<AuthSession> = None;
    let mut fallback: Option<AuthSession> = None;

    for (issuer_key, raw) in map.into_iter() {
        let entry: RawAuthEntry = match serde_json::from_value(raw) {
            Ok(e) => e,
            Err(_) => continue,
        };
        let Some(access) = entry.key.filter(|k| !k.is_empty()) else { continue; };
        let session = AuthSession {
            access_token: access,
            user_id: entry.user_id,
            email: entry.email,
            expires_at_ms: entry.expires_at.as_deref().and_then(parse_iso_ms),
        };
        let is_preferred = issuer_key == PREFERRED_ISSUER
            || issuer_key.starts_with(&format!("{PREFERRED_ISSUER}::"));
        preferred_seen |= is_preferred;
        if is_preferred {
            if is_token_fresh(&session) {
                return AuthRead::Ok(session);
            }
            if expired_preferred.is_none() { expired_preferred = Some(session); }
        } else if fallback.is_none() {
            fallback = Some(session);
        }
    }

    // Alternate issuers are compatibility fallbacks only when no preferred
    // entry exists — match orca's precedence.
    if let Some(s) = expired_preferred { return AuthRead::Ok(s); }
    if !preferred_seen {
        if let Some(s) = fallback { return AuthRead::Ok(s); }
    }
    AuthRead::Missing
}

fn is_token_fresh(session: &AuthSession) -> bool {
    match session.expires_at_ms {
        None => true, // auth.json may lack expiry; a bad token surfaces as 401
        Some(ms) => ms - now_ms() > TOKEN_SKEW_MS,
    }
}

fn now_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

/// Parse an RFC-3339 UTC timestamp to epoch ms. Reuses the same shape handler
/// as the shared `to_epoch_ms` for consistency; wraps it via a JSON string.
fn parse_iso_ms(iso: &str) -> Option<i64> {
    super::to_epoch_ms(&Value::String(iso.to_string()))
}

// ── billing call ─────────────────────────────────────────────────────────

fn call_billing(session: &AuthSession) -> Result<Value, String> {
    let mut req = ureq::get(BILLING_CREDITS_URL)
        .set("Authorization", &format!("Bearer {}", session.access_token))
        .set("X-XAI-Token-Auth", AUTH_HEADER)
        .set("Accept", "application/json");
    if let Some(uid) = &session.user_id {
        req = req.set("x-userid", uid);
    }
    match req.call() {
        Ok(r) => r.into_json::<Value>().map_err(|e| e.to_string()),
        Err(ureq::Error::Status(code @ (401 | 403), _)) => {
            Err(format!("Grok usage request unauthorized (HTTP {code})"))
        }
        Err(ureq::Error::Status(code, _)) => Err(format!("Grok usage request failed (HTTP {code})")),
        Err(e) => Err(e.to_string()),
    }
}

// ── parse ────────────────────────────────────────────────────────────────

/// The billing response is either `{config: {...}}` or a flat object with the
/// config fields at the top level. Pick whichever is present.
fn resolve_config(root: &Value) -> Option<&Value> {
    if let Some(c) = root.get("config") { return Some(c); }
    for field in ["creditUsagePercent", "currentPeriod", "billingPeriodStart",
                  "billingPeriodEnd", "subscriptionTier", "monthlyLimit", "used",
                  "onDemandCap", "onDemandUsed", "prepaidBalance"] {
        if root.get(field).is_some() { return Some(root); }
    }
    None
}

fn money(v: Option<&Value>) -> Option<f64> {
    let val = v?.get("val")?;
    if let Some(n) = val.as_f64() { return Some(n); }
    if let Some(s) = val.as_str() { return s.parse::<f64>().ok(); }
    None
}

fn period_end_ms(config: &Value) -> Option<i64> {
    let end = config.get("currentPeriod").and_then(|p| p.get("end"))
        .or_else(|| config.get("billingPeriodEnd"))?;
    super::to_epoch_ms(end)
}

fn parse_billing(root: &Value, session: &AuthSession) -> ProviderUsage {
    let Some(config) = resolve_config(root) else {
        return ProviderUsage::errored(ID, NAME, "Grok billing response missing config");
    };

    let mut windows = vec![];

    // 1) Weekly credit usage — explicit percent on the response.
    if let Some(pct) = config.get("creditUsagePercent").and_then(|v| v.as_f64()) {
        let used = (pct / 100.0).clamp(0.0, 1.0);
        windows.push(Window {
            id: "weekly".into(),
            label: "Weekly credits".into(),
            used: Some(used),
            resets_at: period_end_ms(config),
            tone: tone_from_used(used),
        });
    }

    // 2) Monthly budget — computable from used/limit money pair (proto3 style).
    if let (Some(used), Some(limit)) = (money(config.get("used")), money(config.get("monthlyLimit"))) {
        if limit > 0.0 {
            let frac = (used / limit).clamp(0.0, 1.0);
            windows.push(Window {
                id: "monthly".into(),
                label: "Monthly budget".into(),
                used: Some(frac),
                resets_at: period_end_ms(config),
                tone: tone_from_used(frac),
            });
        }
    }

    let plan_label = config.get("subscriptionTier").and_then(|v| v.as_str()).map(str::to_string);
    let mut details = vec![];
    if let Some(email) = session.email.as_deref().filter(|s| !s.is_empty()) {
        details.push(Detail { label: "Account".into(), value: email.into() });
    }

    ProviderUsage {
        provider_id: ID.into(),
        display_name: NAME.into(),
        status: ProviderStatus::Available,
        plan_label,
        windows,
        balances: vec![],
        details,
        error: None,
    }
}
