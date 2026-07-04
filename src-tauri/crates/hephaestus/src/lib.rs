//! # Hephaestus
//!
//! Platform-native process isolation SDK — mechanism without policy.
//!
//! Hephaestus enforces isolation boundaries defined entirely by the caller
//! through [`EnvironmentSpec`]. It never adds implicit allows or denies beyond
//! what the caller requests, making it suitable for any deny-default workload:
//! AI agent runners, CI sandboxes, code playgrounds, and so on.
//!
//! ## Quick start
//!
//! ```rust,no_run
//! use hephaestus::{platform, EnvironmentSpec, PathMount, SandboxMode};
//!
//! let spec = EnvironmentSpec::builder("branch-abc123", "/workspaces/branch-abc123")
//!     .mount(PathMount::ro("/usr/lib"))
//!     .allow_host("**.anthropic.com")
//!     .allow_host("**.github.com")
//!     .mode(SandboxMode::Enforce)
//!     .build()?;
//!
//! let isolate = platform();
//!
//! // Provision the isolated environment.
//! let handle = isolate.create(spec)?;
//!
//! // Wrap a command for execution inside the sandbox.
//! let sandboxed = isolate.prepare(&handle, "claude".as_ref(), &[])?;
//! sandboxed.into_command().spawn()?;
//!
//! // Tear down when the session ends.
//! isolate.destroy(handle)?;
//! # Ok::<(), hephaestus::HephaestusError>(())
//! ```
//!
//! ## Platform support
//!
//! | Platform | Filesystem       | Process           | Network              | Resource limits                |
//! |----------|-----------------|-------------------|----------------------|-------------------------------|
//! | macOS    | Seatbelt (SBPL) | `posix_spawn`     | CONNECT proxy        | `setrlimit` + libproc         |
//! | Linux    | bubblewrap      | `--unshare-pid`   | `--unshare-net` + proxy | cgroups v2               |
//! | Windows  | Job Objects + ACL | Job Objects     | WFP + proxy          | `JOBOBJECT_EXTENDED_LIMIT_INFORMATION` |
//!
//! Call [`platform()`] once at startup and store the result in an `Arc`.

mod error;
mod spec;
mod platform;
pub mod proxy;

pub use error::HephaestusError;
pub use spec::{
    BranchSpec,
    EnvironmentSpec,
    EnvironmentSpecBuilder,
    HostPattern,
    NetworkPolicy,
    PathMount,
    ResourceLimits,
    ResourceLimitsBuilder,
    SandboxMode,
};

use std::collections::HashMap;
use std::ffi::{OsStr, OsString};
use std::path::PathBuf;
use std::sync::Arc;

// ─── IsolateHandle ───────────────────────────────────────────────────────────

/// Opaque handle representing a provisioned isolation environment.
///
/// Returned by [`Isolate::create`] and consumed by [`Isolate::destroy`].
/// Pass to [`Isolate::prepare`] for every command you want to run inside
/// the environment.
///
/// A handle is coupled to the backend instance that created it. Passing a
/// handle to a different backend returns [`HephaestusError::HandleNotFound`].
pub struct IsolateHandle {
    id: String,
}

impl IsolateHandle {
    /// Create a handle for the given environment ID.
    ///
    /// Only platform backend implementations should call this.
    #[allow(dead_code)] // used by platform backends once implemented
    pub(crate) fn new(id: impl Into<String>) -> Self {
        Self { id: id.into() }
    }

    /// The environment ID this handle was created for.
    pub fn id(&self) -> &str {
        &self.id
    }
}

// ─── SandboxedCommand ────────────────────────────────────────────────────────

/// A command prepared for execution inside an isolation environment.
///
/// Returned by [`Isolate::prepare`]. The struct is pure data — apply it to
/// whatever process spawner your application uses: [`std::process::Command`],
/// `portable_pty::CommandBuilder`, `tokio::process::Command`, etc.
///
/// # Why not `&mut std::process::Command`?
///
/// Sandbox wrappers (bubblewrap, `sandbox-exec`) need to *prepend* their
/// own argv before the user's program and arguments, and they may also need
/// to change the binary being executed. Neither transformation is possible
/// via a `&mut Command` (the program is set at construction and is immutable).
/// Returning plain data lets callers apply it to any spawner.
///
/// # Example
///
/// ```rust,no_run
/// # use hephaestus::SandboxedCommand;
/// # let sandboxed: SandboxedCommand = todo!();
/// // Standard library
/// let mut cmd = sandboxed.into_command();
/// cmd.stdin(std::process::Stdio::null());
/// cmd.spawn().unwrap();
/// ```
#[must_use = "call `into_command()` or apply fields to your process spawner"]
#[derive(Debug, Clone)]
pub struct SandboxedCommand {
    /// The program to execute.
    ///
    /// On wrapping platforms (bubblewrap, `sandbox-exec`) this is the wrapper
    /// binary, not the user's program. The user's program appears in `args`.
    pub program: OsString,

    /// Full argument list, including any sandbox wrapper arguments prepended
    /// before the user's original program and arguments.
    pub args: Vec<OsString>,

    /// Environment variables that MUST be set on the spawned process.
    ///
    /// Merge with your own environment; these take precedence. At minimum,
    /// this contains `http_proxy` / `https_proxy` pointing at the
    /// in-process CONNECT proxy.
    pub env: HashMap<OsString, OsString>,

    /// Working directory for the process. Typically the branch root.
    pub working_dir: Option<PathBuf>,
}

impl SandboxedCommand {
    /// Build a ready-to-spawn `std::process::Command`.
    pub fn into_command(self) -> std::process::Command {
        let mut cmd = std::process::Command::new(&self.program);
        cmd.args(&self.args);
        for (k, v) in &self.env {
            cmd.env(k, v);
        }
        if let Some(dir) = &self.working_dir {
            cmd.current_dir(dir);
        }
        cmd
    }
}

// ─── LifecycleJob ────────────────────────────────────────────────────────────

/// A minimal per-session kill-on-close guard.
///
/// On **Windows** this wraps an anonymous `KILL_ON_JOB_CLOSE` Job Object
/// assigned to a spawned process at PTY-session creation time. Dropping the
/// value closes the Win32 handle, terminating every process still in the job
/// — the shell and all of its `CreateProcess`-descended children — atomically
/// and without relying on `taskkill /T` tree-walking (which misses processes
/// reparented via `Start-Process` / ShellExecute brokering).
///
/// On **every other platform** this is a zero-size no-op: process-group
/// signals and PTY teardown already provide equivalent guarantees.
///
/// Obtain with [`lifecycle_job`]. Store one per PTY session.
pub struct LifecycleJob(
    // Held purely for its Drop side effect: closing the Job Object handle on
    // Windows fires KILL_ON_JOB_CLOSE; on non-Windows it is the unit type.
    #[allow(dead_code)]
    platform::RawLifecycleJob,
);

/// Create a lifecycle-only `KILL_ON_JOB_CLOSE` Job Object for process `pid`.
///
/// On Windows: creates and assigns an anonymous Job Object. Dropping the
/// returned [`LifecycleJob`] terminates the full process tree.
///
/// On other platforms: returns immediately (no-op value).
///
/// # Errors
///
/// Returns an error if the OS refuses to create the job or assign the process
/// (e.g. the process is already in an incompatible job on a pre-Windows 8
/// host). Callers should treat failure as best-effort — propagating with `?`
/// here would break PTY creation for no gain when a degraded environment
/// refuses job assignment. `taskkill /F /T` remains a secondary sweep.
pub fn lifecycle_job(pid: u32) -> Result<LifecycleJob, HephaestusError> {
    platform::create_lifecycle_job(pid).map(LifecycleJob)
}

// ─── Optional Windows kernel driver ──────────────────────────────────────────

/// Returns `true` if the optional Hephaestus Windows kernel driver is loaded.
///
/// The driver registers `PsSetCreateProcessNotifyRoutineEx` and folds
/// ShellExecute-brokered processes (PowerShell `Start-Process`, COM, WMI) into a
/// session's Job Object at the kernel level — coverage the user-mode backend
/// cannot achieve on its own.
///
/// It is **entirely optional**. When it is absent, Windows isolation still works
/// through Job Objects, the ETW watcher, and the teardown kill sweep; this
/// function simply reports which mode is active so callers can surface it in UI.
/// Always returns `false` on non-Windows platforms.
pub fn windows_kernel_driver_available() -> bool {
    platform::is_driver_available()
}

// ─── Isolate ─────────────────────────────────────────────────────────────────

/// Core isolation interface. Each platform ships its own implementation.
///
/// Obtain a backend via [`platform()`] and store it in an `Arc<dyn Isolate>`
/// for shared access across threads.
///
/// All methods are synchronous and may block (they perform I/O). Use
/// `spawn_blocking` or a dedicated thread pool if non-blocking behaviour is
/// required.
///
/// # Object safety
///
/// `Isolate` is object-safe — it can be used as `dyn Isolate` in an `Arc`.
pub trait Isolate: Send + Sync {
    /// Provision an isolated environment from `spec`.
    ///
    /// Allocates all OS-level resources required to enforce the spec:
    /// sandbox profile files, CONNECT proxy threads, Job Objects, cgroup
    /// paths, WFP rules. Returns an opaque handle the caller passes to
    /// [`prepare`](Self::prepare) and [`destroy`](Self::destroy).
    ///
    /// # Errors
    ///
    /// Returns an error if OS resources could not be allocated, the spec is
    /// invalid for this backend, or [`is_available`](Self::is_available)
    /// would return `false`.
    fn create(&self, spec: EnvironmentSpec) -> Result<IsolateHandle, HephaestusError>;

    /// Prepare `program` and `args` to run inside the isolation environment.
    ///
    /// Wraps the command with the platform sandbox envelope (bubblewrap argv,
    /// `sandbox-exec -f`, etc.) and injects required environment variables
    /// (`http_proxy` pointing at the CONNECT proxy, any platform-specific
    /// variables). Returns a [`SandboxedCommand`] the caller applies to
    /// their process spawner.
    ///
    /// Hephaestus never spawns the process itself — this preserves full
    /// caller control over PTY libraries, process groups, and stdio.
    ///
    /// # Errors
    ///
    /// Returns [`HephaestusError::HandleNotFound`] if `handle` is invalid.
    /// Returns [`HephaestusError::Prepare`] if the backend cannot build the
    /// sandbox envelope.
    fn prepare(
        &self,
        handle: &IsolateHandle,
        program: &OsStr,
        args: &[OsString],
    ) -> Result<SandboxedCommand, HephaestusError>;

    /// Called immediately after the sandboxed process has been spawned.
    ///
    /// On Windows this assigns the process to the Job Object provisioned during
    /// [`create`](Self::create). On all other platforms this is a no-op.
    ///
    /// `pid` is the OS process ID returned by your spawner (e.g.
    /// `child.id()` from `std::process::Child`).
    ///
    /// Call this before the process can spawn its own children to avoid
    /// breakout via unjailed child processes.
    fn post_spawn(&self, _handle: &IsolateHandle, _pid: u32) -> Result<(), HephaestusError> {
        Ok(())
    }

    /// Tear down the isolation environment and release all OS-level resources.
    ///
    /// Shuts down the CONNECT proxy, removes temp files, destroys Job Objects,
    /// releases cgroup state, and removes WFP rules. The handle is consumed
    /// and must not be used after this call.
    ///
    /// Resources are released on a best-effort basis even when an error is
    /// returned — a partial failure does not leave the system in an
    /// irrecoverable state.
    ///
    /// # Errors
    ///
    /// Returns an error if one or more OS resources could not be released
    /// cleanly. The handle is still consumed.
    fn destroy(&self, handle: IsolateHandle) -> Result<(), HephaestusError>;

    /// Returns `true` if this backend is functional on the current host.
    ///
    /// A backend may be unavailable because required OS features or helper
    /// binaries are absent (e.g. bubblewrap not installed, unprivileged user
    /// namespaces disabled, `sandbox-exec` removed by a future macOS update).
    ///
    /// Calling [`create`](Self::create) on an unavailable backend returns
    /// [`HephaestusError::Unsupported`] without allocating any resources.
    fn is_available(&self) -> bool {
        true
    }
}

// ─── platform() ──────────────────────────────────────────────────────────────

/// Returns the platform-appropriate [`Isolate`] backend.
///
/// The returned `Arc` is `Send + Sync`. Call once at startup and store:
///
/// ```rust,no_run
/// use std::sync::Arc;
/// use hephaestus::Isolate;
///
/// let isolate: Arc<dyn Isolate> = hephaestus::platform();
/// ```
pub fn platform() -> Arc<dyn Isolate> {
    platform::current()
}
