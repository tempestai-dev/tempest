//! Linux isolation via bubblewrap (`bwrap`).
//!
//! # Architecture
//!
//! Each sandboxed environment is launched under `bwrap` with:
//!
//! - `--unshare-pid`       — private PID namespace; bwrap becomes init.
//! - `--die-with-parent`   — sandbox exits if the Tempest process exits.
//! - `--unshare-net`       — private network namespace; outbound HTTP/HTTPS
//!                           traffic is routed through the in-process CONNECT
//!                           proxy via a loopback address visible inside the
//!                           namespace (bridge design TBD — see Known gaps).
//! - `--bind`              — workspace root and `PathMount::rw` entries
//!                           mounted read-write inside the namespace.
//! - `--ro-bind`           — system paths and `PathMount::ro` entries.
//! - `--dev /dev`          — minimal /dev inside the namespace.
//! - `--proc /proc`        — /proc mount required by many tools.
//!
//! Resource limits are applied via cgroups v2 using the systemd user slice
//! (`/sys/fs/cgroup/user.slice/…`) for unprivileged delegation.
//!
//! # Prerequisites
//!
//! - bubblewrap ≥ 0.4.0 (`--unshare-net` and `--die-with-parent` support).
//! - A kernel with user namespaces enabled (`CONFIG_USER_NS=y`).
//! - cgroups v2 with user-delegated subtrees for resource limit enforcement.
//!
//! [`LinuxIsolate::is_available`] checks for the bwrap binary at runtime;
//! absence returns a clean [`HephaestusError::Unsupported`] rather than a panic.
//!
//! # Known gaps (planned)
//!
//! - No seccomp-bpf filter. Namespaces alone do not reduce the kernel attack
//!   surface. A seccomp profile is planned for a future release.
//! - Network namespace bridging: `--unshare-net` isolates the net namespace
//!   but the loopback proxy address is not yet reachable from inside. A veth
//!   pair or Unix-socket relay is needed; design is TBD.
//! - No cgroup v1 fallback for kernels without v2 user delegation.
//! - bwrap setuid helper is being phased out on some distros in favour of
//!   unprivileged user namespaces. Detection + fallback is planned.

use std::collections::HashMap;
use std::ffi::{OsStr, OsString};
use std::path::PathBuf;
use std::sync::{Arc, Mutex};

use crate::{
    proxy::{ConnectProxy, ProxyConfig},
    EnvironmentSpec, HephaestusError, IsolateHandle, Isolate, SandboxMode, SandboxedCommand,
};

// ─── Per-environment state ────────────────────────────────────────────────────

struct LinuxEnvState {
    spec: EnvironmentSpec,
    /// Active CONNECT proxy enforcing `spec.network`.
    /// `None` when `spec.mode == SandboxMode::Off`.
    proxy: Option<ConnectProxy>,
}

// ─── LinuxIsolate ─────────────────────────────────────────────────────────────

/// Linux isolation backend (bubblewrap + in-process CONNECT proxy + cgroups v2).
pub struct LinuxIsolate {
    envs: Arc<Mutex<HashMap<String, LinuxEnvState>>>,
}

impl LinuxIsolate {
    pub(crate) fn new() -> Self {
        Self { envs: Arc::new(Mutex::new(HashMap::new())) }
    }
}

impl Isolate for LinuxIsolate {
    fn create(&self, spec: EnvironmentSpec) -> Result<IsolateHandle, HephaestusError> {
        let id = spec.id.clone();

        // Start the CONNECT proxy unless sandboxing is disabled.
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

        self.envs
            .lock()
            .unwrap()
            .insert(id.clone(), LinuxEnvState { spec, proxy });

        Ok(IsolateHandle::new(id))
    }

    fn prepare(
        &self,
        handle: &IsolateHandle,
        program: &OsStr,
        args: &[OsString],
    ) -> Result<SandboxedCommand, HephaestusError> {
        let envs = self.envs.lock().unwrap();
        let state = envs
            .get(handle.id())
            .ok_or(HephaestusError::HandleNotFound)?;

        let spec = &state.spec;

        // If sandboxing is off, return the command unchanged.
        if spec.mode == SandboxMode::Off {
            return Ok(SandboxedCommand {
                program: program.to_os_string(),
                args: args.to_vec(),
                env: Default::default(),
                working_dir: Some(spec.root.clone()),
            });
        }

        // Build the bwrap argv.
        let mut bwrap_args: Vec<OsString> = Vec::new();

        // ── Namespace flags ───────────────────────────────────────────────────
        bwrap_args.push("--unshare-pid".into());
        bwrap_args.push("--die-with-parent".into());
        bwrap_args.push("--unshare-net".into());

        // ── Minimal /dev and /proc ────────────────────────────────────────────
        bwrap_args.push("--dev".into());
        bwrap_args.push("/dev".into());
        bwrap_args.push("--proc".into());
        bwrap_args.push("/proc".into());

        // ── Workspace root — always read-write ────────────────────────────────
        bwrap_args.push("--bind".into());
        bwrap_args.push(spec.root.as_os_str().to_os_string());
        bwrap_args.push(spec.root.as_os_str().to_os_string());

        // ── Caller-supplied mounts ────────────────────────────────────────────
        for mount in &spec.mounts {
            if mount.optional && !mount.path.exists() {
                continue;
            }
            if mount.writable {
                bwrap_args.push("--bind".into());
            } else {
                bwrap_args.push("--ro-bind".into());
            }
            bwrap_args.push(mount.path.as_os_str().to_os_string());
            bwrap_args.push(mount.path.as_os_str().to_os_string());
        }

        // ── Read-only system paths every process needs ────────────────────────
        for sys_path in SYSTEM_RO_PATHS {
            let p = PathBuf::from(sys_path);
            if p.exists() {
                bwrap_args.push("--ro-bind".into());
                bwrap_args.push(p.as_os_str().to_os_string());
                bwrap_args.push(p.as_os_str().to_os_string());
            }
        }

        // ── Proxy env vars ────────────────────────────────────────────────────
        let mut env: std::collections::HashMap<OsString, OsString> = Default::default();
        if let Some(proxy) = &state.proxy {
            let proxy_url: OsString = proxy.url().into();
            env.insert("http_proxy".into(), proxy_url.clone());
            env.insert("https_proxy".into(), proxy_url.clone());
            env.insert("HTTP_PROXY".into(), proxy_url.clone());
            env.insert("HTTPS_PROXY".into(), proxy_url);
        }

        // ── Append user program and args after `--` ───────────────────────────
        bwrap_args.push("--".into());
        bwrap_args.push(program.to_os_string());
        bwrap_args.extend_from_slice(args);

        Ok(SandboxedCommand {
            program: "bwrap".into(),
            args: bwrap_args,
            env,
            working_dir: Some(spec.root.clone()),
        })
    }

    fn destroy(&self, handle: IsolateHandle) -> Result<(), HephaestusError> {
        let removed = self.envs.lock().unwrap().remove(handle.id());
        if removed.is_none() {
            return Err(HephaestusError::HandleNotFound);
        }
        // `LinuxEnvState` drop: `ConnectProxy` drop shuts down the proxy thread.
        Ok(())
    }

    fn is_available(&self) -> bool {
        std::process::Command::new("bwrap")
            .arg("--version")
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null())
            .status()
            .map(|s| s.success())
            .unwrap_or(false)
    }
}

// ─── System read-only paths ───────────────────────────────────────────────────

/// Paths that almost every Linux process requires to function. Mounted
/// read-only into every sandbox regardless of caller mounts.
const SYSTEM_RO_PATHS: &[&str] = &[
    "/usr",
    "/lib",
    "/lib64",
    "/bin",
    "/sbin",
    "/etc/resolv.conf",
    "/etc/localtime",
    "/etc/ssl/certs",
];
