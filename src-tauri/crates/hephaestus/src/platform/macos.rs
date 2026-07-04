//! macOS isolation via Seatbelt (`sandbox-exec` / SBPL).
//!
//! # Architecture
//!
//! Each sandboxed environment gets:
//!
//! 1. A deny-default SBPL profile generated from the [`EnvironmentSpec`] and
//!    written to a per-environment temp file under `$TMPDIR`.
//! 2. An in-process HTTPS CONNECT proxy ([`ConnectProxy`]) that enforces
//!    `spec.network` on the loopback address the SBPL profile allows through.
//!
//! | Mode      | SBPL profile    | CONNECT proxy           |
//! |-----------|-----------------|-------------------------|
//! | `Off`     | none (passthrough) | none                 |
//! | `Monitor` | allow-all       | Monitor mode (log only) |
//! | `Enforce` | deny-default    | Enforce mode (block)    |
//!
//! # Deprecation note
//!
//! `sandbox-exec` / SBPL is Apple-deprecated as of macOS 14 Sonoma but remains
//! functional through macOS 15. There is currently no notarizable replacement
//! — the Endpoint Security framework requires a privileged system extension and
//! Apple entitlements. [`MacosIsolate::is_available`] detects absence at
//! runtime and returns [`HephaestusError::Unsupported`] rather than a panic.

use std::collections::HashMap;
use std::ffi::{OsStr, OsString};
use std::path::PathBuf;
use std::sync::{Arc, Mutex};

use crate::{
    proxy::{ConnectProxy, ProxyConfig},
    EnvironmentSpec, HephaestusError, IsolateHandle, Isolate, SandboxMode, SandboxedCommand,
};

// ─── Per-environment state ────────────────────────────────────────────────────

struct MacosEnvState {
    spec: EnvironmentSpec,
    /// Absolute path of the rendered SBPL profile under `$TMPDIR`.
    profile_path: PathBuf,
    /// Active CONNECT proxy enforcing `spec.network`.
    /// `None` when `spec.mode == SandboxMode::Off`.
    proxy: Option<ConnectProxy>,
}

// ─── MacosIsolate ─────────────────────────────────────────────────────────────

/// macOS isolation backend (Seatbelt SBPL + in-process CONNECT proxy).
pub struct MacosIsolate {
    envs: Arc<Mutex<HashMap<String, MacosEnvState>>>,
}

impl MacosIsolate {
    pub(crate) fn new() -> Self {
        Self { envs: Arc::new(Mutex::new(HashMap::new())) }
    }
}

impl Isolate for MacosIsolate {
    fn create(&self, spec: EnvironmentSpec) -> Result<IsolateHandle, HephaestusError> {
        let id = spec.id.clone();

        // Start the CONNECT proxy unless sandboxing is off.
        let proxy = if spec.mode != SandboxMode::Off {
            let cfg = match spec.mode {
                SandboxMode::Monitor => ProxyConfig::monitor(spec.network.clone()),
                _ => ProxyConfig::enforce(spec.network.clone()),
            };
            Some(
                ConnectProxy::start(cfg)
                    .map_err(|e| HephaestusError::provision(&id, e.to_string()))?,
            )
        } else {
            None
        };

        // Render the SBPL profile and write it to a temp file.
        let proxy_port = proxy.as_ref().map(|p| p.port());
        let profile = render_sbpl(&spec, proxy_port);
        let profile_path = std::env::temp_dir().join(format!("hephaestus-{id}.sbpl"));
        std::fs::write(&profile_path, profile.as_bytes()).map_err(|e| {
            HephaestusError::provision(&id, format!("write SBPL profile: {e}"))
        })?;

        self.envs
            .lock()
            .unwrap()
            .insert(id.clone(), MacosEnvState { spec, profile_path, proxy });

        Ok(IsolateHandle::new(id))
    }

    fn prepare(
        &self,
        handle: &IsolateHandle,
        program: &OsStr,
        args: &[OsString],
    ) -> Result<SandboxedCommand, HephaestusError> {
        let envs = self.envs.lock().unwrap();
        let state = envs.get(handle.id()).ok_or(HephaestusError::HandleNotFound)?;
        let spec = &state.spec;

        // In Off mode pass the command through unchanged.
        if spec.mode == SandboxMode::Off {
            return Ok(SandboxedCommand {
                program: program.to_os_string(),
                args: args.to_vec(),
                env: HashMap::new(),
                working_dir: Some(spec.root.clone()),
            });
        }

        // sandbox-exec -f <profile> <program> [args…]
        let mut sandbox_args: Vec<OsString> = vec![
            "-f".into(),
            state.profile_path.as_os_str().to_os_string(),
            program.to_os_string(),
        ];
        sandbox_args.extend_from_slice(args);

        // Inject proxy environment variables so the agent routes through it.
        let mut env: HashMap<OsString, OsString> = HashMap::new();
        if let Some(proxy) = &state.proxy {
            let url: OsString = proxy.url().into();
            env.insert("http_proxy".into(), url.clone());
            env.insert("https_proxy".into(), url.clone());
            env.insert("HTTP_PROXY".into(), url.clone());
            env.insert("HTTPS_PROXY".into(), url);
        }

        Ok(SandboxedCommand {
            program: "/usr/bin/sandbox-exec".into(),
            args: sandbox_args,
            env,
            working_dir: Some(spec.root.clone()),
        })
    }

    fn destroy(&self, handle: IsolateHandle) -> Result<(), HephaestusError> {
        match self.envs.lock().unwrap().remove(handle.id()) {
            Some(state) => {
                // Remove the SBPL profile temp file; ignore errors (already gone, read-only fs, etc.).
                let _ = std::fs::remove_file(&state.profile_path);
                // `state.proxy` drops here, signalling the proxy thread to stop and joining it.
                Ok(())
            }
            None => Err(HephaestusError::HandleNotFound),
        }
    }

    fn is_available(&self) -> bool {
        std::path::Path::new("/usr/bin/sandbox-exec").exists()
    }
}

// ─── SBPL profile renderer ───────────────────────────────────────────────────

/// System paths mounted read-only inside every Seatbelt sandbox.
///
/// These are the macOS equivalents of the Linux `SYSTEM_RO_PATHS`. They cover
/// the minimum needed for dynamic linking (`/System`), standard tools (`/usr`,
/// `/bin`), SSL roots, timezone data, and dyld's shared cache.
const SYSTEM_RO: &[&str] = &[
    "/usr",
    "/bin",
    "/sbin",
    "/System",
    "/Library/Frameworks",
    "/Library/Apple",
    "/private/etc",
    "/private/var/db/timezone",
    "/private/var/db/dyld",
    "/private/var/folders",
    "/dev",
    "/tmp",
    "/private/tmp",
];

/// Escape a path for inclusion inside an SBPL double-quoted string literal.
fn escape_sbpl(s: &str) -> String {
    s.replace('\\', "\\\\").replace('"', "\\\"")
}

/// Render a Seatbelt SBPL profile for the given spec and proxy port.
///
/// - `Off` / `Monitor` → `(allow default)` (no file/process restrictions;
///   network monitoring is handled by the proxy, not the profile).
/// - `Enforce` → deny-default with explicit allow rules for system paths,
///   the workspace root, caller-supplied mounts, and the loopback proxy port.
fn render_sbpl(spec: &EnvironmentSpec, proxy_port: Option<u16>) -> String {
    let mut p = String::with_capacity(2048);

    p.push_str("(version 1)\n");

    if spec.mode != SandboxMode::Enforce {
        // Allow-all profile: Seatbelt imposes no restriction; the proxy handles
        // network enforcement for Monitor mode.
        p.push_str("(allow default)\n");
        return p;
    }

    // ── Deny-default enforcement ──────────────────────────────────────────────

    p.push_str("(deny default)\n");

    // Process lifecycle: must be explicitly allowed or nothing can fork/exec.
    p.push_str("(allow process-exec*)\n");
    p.push_str("(allow process-fork)\n");
    p.push_str("(allow signal)\n");

    // Mach IPC: required by dyld, CoreFoundation, XPC, and most toolchains.
    // Without this, even basic executables fail before reaching main().
    p.push_str("(allow mach-lookup)\n");
    p.push_str("(allow mach-register)\n");

    // IOKit: queried by system frameworks for hardware/display/power info.
    p.push_str("(allow iokit-open)\n");

    // sysctl reads: used by libc startup, `uname`, CPU detection, etc.
    p.push_str("(allow sysctl-read)\n");

    // POSIX IPC: semaphores and shared memory used by multiprocess toolchains
    // (e.g. node cluster, Python multiprocessing).
    p.push_str("(allow ipc-posix*)\n");

    // ── System read-only paths ────────────────────────────────────────────────

    p.push_str("(allow file-read*\n");
    for sys in SYSTEM_RO {
        p.push_str(&format!("    (subpath \"{}\")\n", escape_sbpl(sys)));
    }
    p.push_str(")\n");

    // ── Temp write paths ──────────────────────────────────────────────────────

    p.push_str("(allow file-write*\n");
    p.push_str("    (subpath \"/tmp\")\n");
    p.push_str("    (subpath \"/private/tmp\")\n");
    // /private/var/folders is the per-user temp space macOS uses internally.
    p.push_str("    (subpath \"/private/var/folders\")\n");
    p.push_str(")\n");

    // ── Workspace root — always read-write ────────────────────────────────────

    let root = spec.root.to_string_lossy();
    p.push_str(&format!(
        "(allow file-read* (subpath \"{}\"))\n",
        escape_sbpl(&root)
    ));
    p.push_str(&format!(
        "(allow file-write* (subpath \"{}\"))\n",
        escape_sbpl(&root)
    ));

    // ── Caller-supplied mounts ────────────────────────────────────────────────

    for mount in &spec.mounts {
        if mount.optional && !mount.path.exists() {
            continue;
        }
        let path = mount.path.to_string_lossy();
        p.push_str(&format!(
            "(allow file-read* (subpath \"{}\"))\n",
            escape_sbpl(&path)
        ));
        if mount.writable {
            p.push_str(&format!(
                "(allow file-write* (subpath \"{}\"))\n",
                escape_sbpl(&path)
            ));
        }
    }

    // ── Network — loopback to CONNECT proxy only ──────────────────────────────

    if let Some(port) = proxy_port {
        // Allow outbound to the in-process CONNECT proxy; all other outbound
        // connections are denied. The proxy enforces the NetworkPolicy allow-list.
        p.push_str(&format!(
            "(allow network-outbound (remote ip \"127.0.0.1:{port}\"))\n"
        ));
    }
    // Unix domain sockets are needed for local IPC (Mach bootstrap, XPC, etc.).
    p.push_str("(allow network-outbound (remote unix-socket))\n");
    p.push_str("(allow network-inbound (local unix-socket))\n");

    p
}
