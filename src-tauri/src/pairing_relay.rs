//! Local WebSocket router + cloudflared quick-tunnel launcher for pairing a
//! phone with the desktop.
//!
//! Design is intentionally simple: compute lives on the user's laptop, and
//! traffic to it reaches the phone over a Cloudflare quick tunnel
//! (`cloudflared tunnel --url …`). No hosted relay is involved on this path.
//!
//! Wire model:
//!   phone / laptop → `wss://<random>.trycloudflare.com/ws?session=<id>&role=<r>`
//!                  → cloudflared → `ws://127.0.0.1:<port>/ws?…` → this router.
//!
//! The router is E2EE-blind: it holds at most one laptop + one phone socket
//! per session and forwards every frame between them verbatim. Framing +
//! auth live in the JS handshake above (`src/lib/pairing/`).
//!
//! Lifecycle: `start_pairing_relay` is idempotent. First call binds a
//! localhost TCP port, spawns the accept loop, launches cloudflared, and
//! waits for cloudflared to print its assigned `https://<name>.trycloudflare.com`
//! URL. Subsequent calls return the cached tunnel URL. Everything is torn
//! down on `RunEvent::Exit`.

use futures_util::{SinkExt, StreamExt};
use std::collections::HashMap;
use std::process::Stdio;
use std::sync::Arc;
use tauri::{AppHandle, Manager, State};
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::net::TcpListener;
use tokio::process::{Child, Command};
use tokio::sync::{oneshot, Mutex};
use tokio_tungstenite::tungstenite::Message;
use tokio_tungstenite::WebSocketStream;

type WsStream = WebSocketStream<tokio::net::TcpStream>;
type Peer = futures_util::stream::SplitSink<WsStream, Message>;

const CLOUDFLARED_URL_TIMEOUT_SECS: u64 = 30;
const CLOUDFLARED_READY_TIMEOUT_SECS: u64 = 45;

#[derive(Clone, serde::Serialize)]
pub struct TunnelInfo {
    /// Full `wss://<random>.trycloudflare.com/ws` URL to embed in the QR.
    pub wss_url: String,
    /// Local port the router is bound to. Diagnostic only.
    pub local_port: u16,
}

pub struct PairingRelayState {
    inner: Arc<Mutex<Inner>>,
}

struct Inner {
    tunnel: Option<TunnelInfo>,
    cloudflared: Option<Child>,
    /// Handles per active session. Held only for cleanup on shutdown; the
    /// accept loop otherwise self-cleans on socket close.
    sessions: HashMap<String, SessionSlot>,
}

struct SessionSlot {
    laptop: Option<Arc<Mutex<Peer>>>,
    phone: Option<Arc<Mutex<Peer>>>,
}

impl SessionSlot {
    fn new() -> Self { Self { laptop: None, phone: None } }
}

impl PairingRelayState {
    pub fn new() -> Self {
        Self { inner: Arc::new(Mutex::new(Inner {
            tunnel: None,
            cloudflared: None,
            sessions: HashMap::new(),
        })) }
    }

    /// Best-effort teardown on app exit. Killing the cloudflared child closes
    /// the tunnel; dropping the accept loop's task handle drops all sockets.
    pub async fn shutdown(&self) {
        let mut inner = self.inner.lock().await;
        if let Some(mut child) = inner.cloudflared.take() {
            let _ = child.kill().await;
        }
        inner.sessions.clear();
        inner.tunnel = None;
    }
}

fn parse_query(q: &str) -> HashMap<String, String> {
    use percent_encoding::percent_decode_str;
    let mut out = HashMap::new();
    for pair in q.split('&').filter(|p| !p.is_empty()) {
        let mut it = pair.splitn(2, '=');
        let k = it.next().unwrap_or("");
        let v = it.next().unwrap_or("");
        let kd = percent_decode_str(k).decode_utf8_lossy().to_string();
        let vd = percent_decode_str(v).decode_utf8_lossy().to_string();
        out.insert(kd, vd);
    }
    out
}

async fn send_json(peer: &Arc<Mutex<Peer>>, s: String) {
    let mut p = peer.lock().await;
    let _ = p.send(Message::Text(s)).await;
}

/// Return the peer's sink only if `write` is still the current occupant of
/// its role — evicted-but-still-reading sockets shouldn't leak forwarded
/// messages, which would confuse the surviving pair with duplicates.
async fn resolve_peer_if_current(
    inner: &Arc<Mutex<Inner>>,
    session_id: &str,
    role: &str,
    peer_role: &str,
    write: &Arc<Mutex<Peer>>,
) -> Option<Arc<Mutex<Peer>>> {
    let g = inner.lock().await;
    let slot = g.sessions.get(session_id)?;
    let still_current = match role {
        "laptop" => slot.laptop.as_ref().map_or(false, |c| Arc::ptr_eq(c, write)),
        _        => slot.phone.as_ref().map_or(false, |c|  Arc::ptr_eq(c, write)),
    };
    if !still_current { return None; }
    if peer_role == "phone" { slot.phone.clone() } else { slot.laptop.clone() }
}

async fn handle_socket(
    inner: Arc<Mutex<Inner>>,
    tcp: tokio::net::TcpStream,
) {
    // Peek at the HTTP request line to pull ?session=…&role=… before doing
    // the WS upgrade. tokio-tungstenite's callback pattern makes this the
    // cleanest place for it.
    let mut session_id: Option<String> = None;
    let mut role: Option<String> = None;

    let ws = match tokio_tungstenite::accept_hdr_async(
        tcp,
        |req: &tokio_tungstenite::tungstenite::handshake::server::Request,
         resp: tokio_tungstenite::tungstenite::handshake::server::Response| {
            let uri = req.uri();
            if uri.path() != "/ws" {
                let mut r = tokio_tungstenite::tungstenite::handshake::server::ErrorResponse::new(Some("not found".into()));
                *r.status_mut() = tokio_tungstenite::tungstenite::http::StatusCode::NOT_FOUND;
                return Err(r);
            }
            let q = uri.query().unwrap_or("");
            let params = parse_query(q);
            let s = params.get("session").cloned().unwrap_or_default();
            let r = params.get("role").cloned().unwrap_or_default();
            if s.is_empty() || (r != "laptop" && r != "phone") {
                let mut resp = tokio_tungstenite::tungstenite::handshake::server::ErrorResponse::new(Some("missing session or role".into()));
                *resp.status_mut() = tokio_tungstenite::tungstenite::http::StatusCode::BAD_REQUEST;
                return Err(resp);
            }
            session_id = Some(s);
            role = Some(r);
            Ok(resp)
        },
    ).await {
        Ok(ws) => ws,
        Err(_) => return,
    };

    let session_id = match session_id { Some(s) => s, None => return };
    let role = match role { Some(r) => r, None => return };
    let peer_role = if role == "laptop" { "phone" } else { "laptop" };

    eprintln!("[pairing_relay] accept role={role} session={session_id}");

    let (write, mut read) = ws.split();
    let write = Arc::new(Mutex::new(write));

    // Install this socket into the session slot, evicting any prior socket
    // for the same role (reconnect race). Snapshot the peer's writer so we
    // can send the initial control frames without holding the outer lock.
    let peer_sink: Option<Arc<Mutex<Peer>>>;
    let evicted_existing: bool;
    {
        let mut inner_g = inner.lock().await;
        let slot = inner_g.sessions.entry(session_id.clone()).or_insert_with(SessionSlot::new);
        let existing = if role == "laptop" { slot.laptop.replace(write.clone()) }
                       else                 { slot.phone.replace(write.clone()) };
        peer_sink = if role == "laptop" { slot.phone.clone() } else { slot.laptop.clone() };
        evicted_existing = existing.is_some();
        drop(inner_g);
        if let Some(old) = existing {
            let mut o = old.lock().await;
            let _ = o.close().await;
        }
    }

    // Handshake control frames — mirror the CF Worker DO. Only signal
    // peer_connected on a FIRST connection of this role, so the surviving
    // peer doesn't see spurious re-connects when CF/RN opens ghost origin
    // sockets and each one evicts the prior.
    let peer_present = peer_sink.is_some();
    let attached = serde_json::json!({
        "__relay": "attached",
        "role": role,
        "peer_present": peer_present,
    }).to_string();
    send_json(&write, attached).await;

    if let Some(peer) = &peer_sink {
        if !evicted_existing {
            let peer_connected = serde_json::json!({
                "__relay": "peer_connected",
                "role": role,
            }).to_string();
            send_json(peer, peer_connected).await;
        }
    }

    // Main forward loop.
    while let Some(msg) = read.next().await {
        let msg = match msg {
            Ok(m) => m,
            Err(e) => {
                eprintln!("[pairing_relay] read error role={role} err={e}");
                break;
            }
        };
        match msg {
            Message::Text(ref t) => {
                eprintln!("[pairing_relay] forward role={role}→{peer_role} text_bytes={}", t.len());
                let peer_now = resolve_peer_if_current(&inner, &session_id, &role, peer_role, &write).await;
                if let Some(peer) = peer_now {
                    let mut p = peer.lock().await;
                    let _ = p.send(msg).await;
                }
            }
            Message::Binary(_) => {
                let peer_now = resolve_peer_if_current(&inner, &session_id, &role, peer_role, &write).await;
                if let Some(peer) = peer_now {
                    let mut p = peer.lock().await;
                    let _ = p.send(msg).await;
                }
            }
            Message::Ping(p) => {
                let mut w = write.lock().await;
                let _ = w.send(Message::Pong(p)).await;
            }
            Message::Close(cf) => {
                eprintln!("[pairing_relay] close from role={role} frame={:?}", cf);
                break;
            }
            _ => {}
        }
    }
    eprintln!("[pairing_relay] loop exit role={role}");

    // Cleanup: clear our slot entry only if we're still the current
    // occupant. CF quick tunnels + RN sometimes fan out multiple origin
    // connections for one client WebSocket — each new accept evicts the
    // prior socket, and the prior's read loop lands here after eviction.
    // If we blindly cleared, we'd delete the newer socket's slot entry
    // and false-fire peer_disconnected to the peer.
    let peer_after: Option<Arc<Mutex<Peer>>>;
    let was_current: bool;
    {
        let mut inner_g = inner.lock().await;
        if let Some(slot) = inner_g.sessions.get_mut(&session_id) {
            was_current = match role.as_str() {
                "laptop" => slot.laptop.as_ref().map_or(false, |c| Arc::ptr_eq(c, &write)),
                _        => slot.phone.as_ref().map_or(false, |c|  Arc::ptr_eq(c, &write)),
            };
            if was_current {
                if role == "laptop" { slot.laptop = None; } else { slot.phone = None; }
            }
            peer_after = if role == "laptop" { slot.phone.clone() } else { slot.laptop.clone() };
            if slot.laptop.is_none() && slot.phone.is_none() {
                inner_g.sessions.remove(&session_id);
            }
        } else {
            was_current = false;
            peer_after = None;
        }
    }
    eprintln!("[pairing_relay] cleanup role={role} was_current={was_current}");
    if was_current {
        if let Some(peer) = peer_after {
            let peer_gone = serde_json::json!({
                "__relay": "peer_disconnected",
                "role": role,
            }).to_string();
            send_json(&peer, peer_gone).await;
        }
    }
}

async fn start_router(inner: Arc<Mutex<Inner>>) -> Result<u16, String> {
    let listener = TcpListener::bind("127.0.0.1:0").await
        .map_err(|e| format!("bind localhost: {e}"))?;
    let port = listener.local_addr().map_err(|e| e.to_string())?.port();

    tokio::spawn(async move {
        loop {
            let (tcp, _addr) = match listener.accept().await {
                Ok(v) => v,
                Err(_) => continue,
            };
            let inner_c = inner.clone();
            tokio::spawn(async move { handle_socket(inner_c, tcp).await; });
        }
    });

    Ok(port)
}

fn cloudflared_path(app: &AppHandle) -> Result<std::path::PathBuf, String> {
    // Tauri sidecar convention: `binaries/<name>-<target-triple>[.exe]`.
    // In dev, resource_dir is src-tauri; in release, it's next to the exe.
    let dir = app.path().resource_dir().map_err(|e| e.to_string())?;
    let name = if cfg!(windows) { "cloudflared.exe" } else { "cloudflared" };
    // Try the platform-specific sidecar naming first (release bundle), then
    // the bare name (dev / manual drop-in).
    let target_triple = current_target_triple();
    let sidecar = if cfg!(windows) {
        dir.join("binaries").join(format!("cloudflared-{target_triple}.exe"))
    } else {
        dir.join("binaries").join(format!("cloudflared-{target_triple}"))
    };
    if sidecar.exists() { return Ok(sidecar); }
    let bare = dir.join("binaries").join(name);
    if bare.exists() { return Ok(bare); }
    // Fallback: PATH lookup, so a user who has cloudflared installed
    // globally (via winget / brew) still works even before the postinstall
    // script has run.
    Ok(std::path::PathBuf::from(name))
}

fn current_target_triple() -> &'static str {
    // Match Tauri's sidecar target-triple convention.
    if cfg!(all(target_os = "windows", target_arch = "x86_64")) { "x86_64-pc-windows-msvc" }
    else if cfg!(all(target_os = "windows", target_arch = "aarch64")) { "aarch64-pc-windows-msvc" }
    else if cfg!(all(target_os = "macos", target_arch = "aarch64")) { "aarch64-apple-darwin" }
    else if cfg!(all(target_os = "macos", target_arch = "x86_64")) { "x86_64-apple-darwin" }
    else if cfg!(all(target_os = "linux", target_arch = "x86_64")) { "x86_64-unknown-linux-gnu" }
    else if cfg!(all(target_os = "linux", target_arch = "aarch64")) { "aarch64-unknown-linux-gnu" }
    else { "unknown" }
}

async fn spawn_cloudflared(app: &AppHandle, port: u16) -> Result<(Child, String), String> {
    let bin = cloudflared_path(app)?;

    // Pin the metrics port so we know where /ready lives. Small race between
    // dropping the probe listener and cloudflared binding, but the fallback
    // is a retry — cloudflared will exit and we surface the error.
    // ponytail: `--metrics 127.0.0.1:0` isn't supported; free-port scan avoids the 20241-20245 default range.
    let metrics_port = {
        let l = std::net::TcpListener::bind("127.0.0.1:0")
            .map_err(|e| format!("pick metrics port: {e}"))?;
        l.local_addr().map_err(|e| e.to_string())?.port()
    };

    let mut child = Command::new(&bin)
        .args([
            "tunnel",
            "--url", &format!("http://127.0.0.1:{port}"),
            "--metrics", &format!("127.0.0.1:{metrics_port}"),
            "--no-autoupdate",
        ])
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .kill_on_drop(true)
        .spawn()
        .map_err(|e| format!("spawn cloudflared ({}): {e}", bin.display()))?;

    let stderr = child.stderr.take().ok_or("no cloudflared stderr")?;
    let (url_tx, url_rx) = oneshot::channel::<String>();

    tokio::spawn(async move {
        let mut lines = BufReader::new(stderr).lines();
        let mut url_tx = Some(url_tx);
        while let Ok(Some(line)) = lines.next_line().await {
            if url_tx.is_some() {
                if let Some(url) = extract_trycloudflare_url(&line) {
                    if let Some(tx) = url_tx.take() { let _ = tx.send(url); }
                }
            }
            // Drain stderr past the URL so the pipe never fills.
        }
    });

    let url = tokio::time::timeout(
        std::time::Duration::from_secs(CLOUDFLARED_URL_TIMEOUT_SECS),
        url_rx,
    ).await
     .map_err(|_| "cloudflared did not print a tunnel URL in time".to_string())?
     .map_err(|_| "cloudflared exited before printing a tunnel URL".to_string())?;

    // Wait until cloudflared has registered edge connections — the URL is
    // meaningless until then. We DON'T additionally verify the URL is
    // reachable from THIS machine: some networks block/mangle trycloudflare
    // subdomains, which would falsely fail the check while the phone
    // (different network) is perfectly fine. The phone-side retry handles
    // its own DNS/routing propagation window.
    wait_cloudflared_ready(metrics_port).await?;

    Ok((child, url))
}

async fn wait_cloudflared_ready(metrics_port: u16) -> Result<(), String> {
    let deadline = std::time::Instant::now()
        + std::time::Duration::from_secs(CLOUDFLARED_READY_TIMEOUT_SECS);
    let url = format!("http://127.0.0.1:{metrics_port}/ready");
    let mut attempt = 0u32;
    loop {
        attempt += 1;
        let u = url.clone();
        let ok = tokio::task::spawn_blocking(move || {
            match ureq::get(&u).timeout(std::time::Duration::from_secs(2)).call() {
                Ok(r) => r.status() == 200,
                _ => false,
            }
        }).await.unwrap_or(false);
        eprintln!("[pairing_relay] wait_cloudflared_ready attempt={attempt} ok={ok}");
        if ok { return Ok(()); }
        if std::time::Instant::now() >= deadline {
            return Err("cloudflared /ready did not return 200 in time".into());
        }
        tokio::time::sleep(std::time::Duration::from_millis(500)).await;
    }
}


/// Minimal literal scan for `https://<label>.trycloudflare.com` — the URL
/// cloudflared prints once its quick tunnel is live. Pulling in a regex
/// crate just for this is wasteful.
fn extract_trycloudflare_url(s: &str) -> Option<String> {
    let bytes = s.as_bytes();
    let head = b"https://";
    let tail = b".trycloudflare.com";
    let mut i = 0;
    while i + head.len() <= bytes.len() {
        if &bytes[i..i + head.len()] == head {
            let start = i;
            let mut j = i + head.len();
            while j < bytes.len() && (bytes[j].is_ascii_alphanumeric() || bytes[j] == b'-') {
                j += 1;
            }
            if j + tail.len() <= bytes.len() && &bytes[j..j + tail.len()] == tail {
                return Some(s[start..j + tail.len()].to_string());
            }
        }
        i += 1;
    }
    None
}

#[tauri::command]
pub async fn start_pairing_relay(
    app: AppHandle,
    state: State<'_, PairingRelayState>,
) -> Result<TunnelInfo, String> {
    let inner = state.inner.clone();

    // Fast path: already started.
    {
        let g = inner.lock().await;
        if let Some(t) = &g.tunnel { return Ok(t.clone()); }
    }

    let port = start_router(inner.clone()).await?;
    let (child, https_url) = spawn_cloudflared(&app, port).await?;
    let wss_url = https_url.replacen("https://", "wss://", 1) + "/ws";

    let info = TunnelInfo { wss_url, local_port: port };

    let mut g = inner.lock().await;
    g.cloudflared = Some(child);
    g.tunnel = Some(info.clone());
    Ok(info)
}

#[tauri::command]
pub async fn stop_pairing_relay(state: State<'_, PairingRelayState>) -> Result<(), String> {
    state.shutdown().await;
    Ok(())
}
