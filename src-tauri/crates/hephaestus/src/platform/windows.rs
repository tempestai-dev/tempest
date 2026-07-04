//! Windows isolation via Job Objects.
//!
//! # Architecture
//!
//! Each sandboxed environment gets a **Windows Job Object**
//! ([`CreateJobObjectW`]) that:
//!
//! 1. Groups the sandboxed process and all of its descendants so they can be
//!    torn down atomically.
//! 2. Prevents breakaway: `JOB_OBJECT_LIMIT_BREAKAWAY_OK` is left *unset*, so a
//!    child cannot escape the job via `CREATE_BREAKAWAY_FROM_JOB`.
//! 3. Kills the whole tree when the job handle closes
//!    (`JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE`).
//! 4. Enforces caller-defined CPU/memory/process quotas via
//!    [`JOBOBJECT_EXTENDED_LIMIT_INFORMATION`].
//!
//! Windows Job Objects require the process to be assigned *after* it has been
//! created, so the actual assignment happens in [`WindowsIsolate::post_spawn`],
//! which the caller invokes immediately after spawning the PTY/child process.
//!
//! # The ShellExecute gap and the ETW watcher
//!
//! Job Objects only capture processes created as `CreateProcess` descendants of
//! a process already in the job. Processes launched through ShellExecute
//! brokering — most notably PowerShell's `Start-Process` — are created by
//! `explorer.exe`, so they never inherit job membership and survive
//! `TerminateJobObject`.
//!
//! To close that gap for the lifecycle (kill-on-close) job, [`ProcessWatcher`]
//! subscribes to the `Microsoft-Windows-Kernel-Process` provider via user-mode
//! ETW (Event Tracing for Windows). ETW fires a `ProcessStart` event for every
//! process creation on the system, regardless of how it was spawned. When a new
//! process's parent is one we already track for the session, the watcher assigns
//! the new process to the job before it can do meaningful work. This needs no
//! kernel driver, no signing, and no test mode.
//!
//! # Requirements
//!
//! - Job Objects are a standard user-mode primitive available on every
//!   supported Windows release; administrator rights are not required.
//! - The ETW watcher requires the caller to have permission to start a
//!   real-time trace session (Administrator or the *Performance Log Users*
//!   group). When that permission is absent the watcher is silently skipped and
//!   the plain Job Object still governs `CreateProcess` descendants.

use std::collections::{HashMap, HashSet};
use std::ffi::{OsStr, OsString};
use std::mem::size_of;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::thread::JoinHandle;

use windows::core::{GUID, PCWSTR, PWSTR};
use windows::Win32::Foundation::{
    CloseHandle, ERROR_SUCCESS, FALSE, HANDLE, INVALID_HANDLE_VALUE,
};
use windows::Win32::Storage::FileSystem::{
    CreateFileW, FILE_FLAGS_AND_ATTRIBUTES, FILE_SHARE_READ, FILE_SHARE_WRITE, OPEN_EXISTING,
};
use windows::Win32::System::Diagnostics::Etw::{
    CloseTrace, ControlTraceW, EnableTraceEx2, OpenTraceW, ProcessTrace, StartTraceW,
    CONTROLTRACE_HANDLE, EVENT_RECORD, EVENT_TRACE_CONTROL_STOP, EVENT_TRACE_LOGFILEW,
    EVENT_TRACE_PROPERTIES, EVENT_TRACE_REAL_TIME_MODE, PROCESSTRACE_HANDLE,
    PROCESS_TRACE_MODE_EVENT_RECORD, PROCESS_TRACE_MODE_REAL_TIME, WNODE_FLAG_TRACED_GUID,
};
use windows::Win32::System::Diagnostics::ToolHelp::{
    CreateToolhelp32Snapshot, Process32FirstW, Process32NextW, PROCESSENTRY32W, TH32CS_SNAPPROCESS,
};
use windows::Win32::System::JobObjects::{
    AssignProcessToJobObject, CreateJobObjectW, JobObjectExtendedLimitInformation,
    SetInformationJobObject, TerminateJobObject, JOBOBJECT_EXTENDED_LIMIT_INFORMATION,
    JOB_OBJECT_LIMIT_ACTIVE_PROCESS, JOB_OBJECT_LIMIT_BREAKAWAY_OK,
    JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE, JOB_OBJECT_LIMIT_PROCESS_MEMORY,
};
use windows::Win32::System::Threading::{
    OpenProcess, TerminateProcess, PROCESS_ALL_ACCESS, PROCESS_SET_QUOTA, PROCESS_TERMINATE,
};
use windows::Win32::System::IO::DeviceIoControl;

use crate::{
    EnvironmentSpec, HephaestusError, Isolate, IsolateHandle, SandboxedCommand,
};

// ─── RAII HANDLE wrapper ───────────────────────────────────────────────────────

/// Owns a Win32 Job Object [`HANDLE`] and closes it on drop.
///
/// Closing the job handle terminates every process still assigned to the job,
/// because the job is created with `JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE`.
struct JobHandle(HANDLE);

impl Drop for JobHandle {
    fn drop(&mut self) {
        if !self.0.is_invalid() {
            // SAFETY: `self.0` is a job handle we created and have not closed
            // elsewhere; closing it exactly once here is the documented contract.
            unsafe {
                let _ = CloseHandle(self.0);
            }
        }
    }
}

// SAFETY: a Job Object HANDLE is a plain kernel handle; it is safe to move and
// share across threads. The Win32 APIs that consume it are internally
// synchronized.
unsafe impl Send for JobHandle {}
unsafe impl Sync for JobHandle {}

// ─── Per-environment state ────────────────────────────────────────────────────

struct WindowsEnvState {
    /// The spec this environment was provisioned from. `root` is used as the
    /// working directory in [`WindowsIsolate::prepare`].
    spec: EnvironmentSpec,
    /// The Job Object all processes in this environment are assigned to.
    job: JobHandle,
}

// ─── WindowsIsolate ──────────────────────────────────────────────────────────

/// Windows isolation backend backed by Job Objects.
pub struct WindowsIsolate {
    /// Active environments, keyed by environment ID.
    envs: Arc<Mutex<HashMap<String, WindowsEnvState>>>,
}

impl WindowsIsolate {
    pub(crate) fn new() -> Self {
        Self { envs: Arc::new(Mutex::new(HashMap::new())) }
    }
}

impl Isolate for WindowsIsolate {
    fn create(&self, spec: EnvironmentSpec) -> Result<IsolateHandle, HephaestusError> {
        let id = spec.id.clone();

        // SAFETY: every Win32 call below operates on a handle we create and own
        // in this scope; on any error path we close the handle before returning.
        unsafe {
            // Anonymous Job Object (no security attributes, no name).
            let job = CreateJobObjectW(None, PCWSTR::null()).map_err(|e| {
                HephaestusError::provision(id.clone(), format!("CreateJobObjectW failed: {e}"))
            })?;

            // Always applied basic policy:
            //   * KILL_ON_JOB_CLOSE   — tear down the whole tree with the handle.
            //   * BREAKAWAY_OK unset  — children cannot escape via
            //                           CREATE_BREAKAWAY_FROM_JOB.
            let mut info = JOBOBJECT_EXTENDED_LIMIT_INFORMATION::default();
            let mut flags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;

            if let Some(max_mem) = spec.resources.max_memory_bytes {
                info.ProcessMemoryLimit = max_mem as usize;
                flags |= JOB_OBJECT_LIMIT_PROCESS_MEMORY;
            }
            if let Some(max_proc) = spec.resources.max_processes {
                info.BasicLimitInformation.ActiveProcessLimit = max_proc;
                flags |= JOB_OBJECT_LIMIT_ACTIVE_PROCESS;
            }
            info.BasicLimitInformation.LimitFlags = flags;

            if let Err(e) = SetInformationJobObject(
                job,
                JobObjectExtendedLimitInformation,
                &info as *const _ as *const core::ffi::c_void,
                size_of::<JOBOBJECT_EXTENDED_LIMIT_INFORMATION>() as u32,
            ) {
                let _ = CloseHandle(job);
                return Err(HephaestusError::provision(
                    id,
                    format!("SetInformationJobObject failed: {e}"),
                ));
            }

            self.envs
                .lock()
                .unwrap()
                .insert(id.clone(), WindowsEnvState { spec, job: JobHandle(job) });
        }

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

        // No argv wrapping is needed on Windows: confinement is enforced by
        // assigning the spawned process to the Job Object in `post_spawn`.
        Ok(SandboxedCommand {
            program: program.to_os_string(),
            args: args.to_vec(),
            env: HashMap::new(),
            working_dir: Some(state.spec.root.clone()),
        })
    }

    fn post_spawn(&self, handle: &IsolateHandle, pid: u32) -> Result<(), HephaestusError> {
        let envs = self.envs.lock().unwrap();
        let state = envs.get(handle.id()).ok_or(HephaestusError::HandleNotFound)?;

        // SAFETY: `pid` is opened for the access AssignProcessToJobObject needs
        // and the process handle is closed on every path.
        unsafe {
            let process = OpenProcess(PROCESS_ALL_ACCESS, FALSE, pid).map_err(|e| {
                HephaestusError::prepare(format!("OpenProcess({pid}) failed: {e}"))
            })?;

            let assign = AssignProcessToJobObject(state.job.0, process);
            // Always release the process handle, whether or not assignment worked.
            let _ = CloseHandle(process);

            assign.map_err(|e| {
                HephaestusError::prepare(format!(
                    "AssignProcessToJobObject({pid}) failed: {e}"
                ))
            })?;
        }

        Ok(())
    }

    fn destroy(&self, handle: IsolateHandle) -> Result<(), HephaestusError> {
        // Removing the state drops `WindowsEnvState`, which drops `JobHandle`,
        // which calls `CloseHandle`. Because the job was created with
        // `JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE`, closing the last handle
        // terminates every process still assigned to the job.
        self.envs.lock().unwrap().remove(handle.id());
        Ok(())
    }

    fn is_available(&self) -> bool {
        // Job Objects are always available on Windows.
        true
    }
}

// ─── ETW process watcher ─────────────────────────────────────────────────────

/// `Microsoft-Windows-Kernel-Process` provider GUID.
const KERNEL_PROCESS_PROVIDER: GUID = GUID::from_u128(0x22fb2cd6_0e7b_422b_a0c7_2fad1fd0e716);

/// Keyword bit for process lifetime events (`WINEVENT_KEYWORD_PROCESS`). Limits
/// delivery to process start/stop instead of every event the provider can emit.
const KEYWORD_PROCESS: u64 = 0x10;

/// `EVENT_CONTROL_CODE_ENABLE_PROVIDER` — enable the provider on a session.
const ENABLE_PROVIDER: u32 = 1;

/// ETW event id for `ProcessStart` on the Kernel-Process provider.
const PROCESS_START_EVENT_ID: u16 = 1;

/// Shared state the ETW callback reads while a session is active.
///
/// The callback runs on the watcher thread (the one blocked in [`ProcessTrace`])
/// and never on any other thread, but the state is behind a `Mutex`/atomics so
/// the seed insertion on the creating thread is correctly published.
struct WatcherContext {
    /// PIDs known to belong to this session. Seeded with the root PID and grown
    /// as descendants (including ShellExecute-brokered ones) are observed.
    pids: Mutex<HashSet<u32>>,
    /// The lifecycle job newly-observed processes are assigned to. Held as an
    /// `Arc` so the handle is guaranteed live for the callback's entire life.
    job: Arc<JobHandle>,
    /// Set during teardown so the callback stops touching the job once the
    /// session is being torn down.
    stopping: AtomicBool,
}

/// ETW `EventRecordCallback`. Invoked by [`ProcessTrace`] for each event.
///
/// # Safety
///
/// Called by ETW with a pointer to a valid [`EVENT_RECORD`] whose `UserContext`
/// is the [`WatcherContext`] pointer supplied to [`OpenTraceW`].
unsafe extern "system" fn on_event(record: *mut EVENT_RECORD) {
    if record.is_null() {
        return;
    }
    // SAFETY: ETW guarantees `record` is a valid EVENT_RECORD for the duration
    // of this call.
    let record = &*record;

    // Only ProcessStart carries the ProcessId/ParentProcessId pair we track.
    if record.EventHeader.EventDescriptor.Id != PROCESS_START_EVENT_ID {
        return;
    }

    let ctx = record.UserContext as *const WatcherContext;
    if ctx.is_null() {
        return;
    }
    // SAFETY: `UserContext` is the pointer we handed to OpenTraceW via
    // EVENT_TRACE_LOGFILEW.Context. Its `Box` outlives ProcessTrace, which is
    // joined before the box is dropped, so the pointer is valid here.
    let ctx = &*ctx;

    if ctx.stopping.load(Ordering::SeqCst) {
        return;
    }

    // ProcessStart UserData layout: ProcessId at offset 0, ParentProcessId at 4.
    let data = record.UserData as *const u8;
    let len = record.UserDataLength as usize;
    if data.is_null() || len < 8 {
        return;
    }
    // SAFETY: the 8 bytes read are within the bounds checked above; UserData may
    // be unaligned, so use unaligned reads.
    let new_pid = core::ptr::read_unaligned(data as *const u32);
    let parent_pid = core::ptr::read_unaligned(data.add(4) as *const u32);

    let mut pids = match ctx.pids.lock() {
        Ok(g) => g,
        Err(_) => return,
    };
    if !pids.contains(&parent_pid) {
        return;
    }
    pids.insert(new_pid);
    // Release the lock before the syscalls below; the callback is single
    // threaded, but keeping the critical section tight avoids holding it across
    // kernel transitions.
    drop(pids);

    // SAFETY: open the new process for exactly the rights
    // AssignProcessToJobObject requires and close the handle on every path. A
    // failure (e.g. the process already exited) is intentionally ignored.
    if let Ok(process) = OpenProcess(PROCESS_SET_QUOTA | PROCESS_TERMINATE, FALSE, new_pid) {
        let _ = AssignProcessToJobObject(ctx.job.0, process);
        let _ = CloseHandle(process);
    }
}

/// Round `bytes` up to a `u64` count so a `Vec<u64>` backing store is large
/// enough and correctly aligned for [`EVENT_TRACE_PROPERTIES`].
fn u64_words_for(bytes: usize) -> usize {
    (bytes + 7) / 8
}

/// A running ETW real-time session that assigns ShellExecute-brokered
/// descendants of the session root into the lifecycle job.
///
/// Dropping the watcher stops the ETW session, unblocks and joins the consumer
/// thread, and only then releases its job reference — no thread outlives the
/// value.
struct ProcessWatcher {
    /// Control handle from [`StartTraceW`], used to stop the session.
    control_handle: CONTROLTRACE_HANDLE,
    /// Consumer handle from [`OpenTraceW`], closed to unblock [`ProcessTrace`].
    process_handle: PROCESSTRACE_HANDLE,
    /// NUL-terminated session name. Kept alive for the consumer and for
    /// [`ControlTraceW`] at teardown.
    session_name: Vec<u16>,
    /// Backing store for the [`EVENT_TRACE_PROPERTIES`] passed to start/stop.
    props_buf: Vec<u64>,
    /// The consumer thread blocked in [`ProcessTrace`].
    thread: Option<JoinHandle<()>>,
    /// Shared callback state. Boxed so its address is stable while ETW holds a
    /// raw pointer to it; dropped only after the thread is joined.
    ctx: Box<WatcherContext>,
}

// SAFETY: every field is safe to send across threads — the ETW handles are
// integer newtypes, the context is `Send + Sync`, and the raw pointer ETW holds
// into the context is not exposed through this type.
unsafe impl Send for ProcessWatcher {}
unsafe impl Sync for ProcessWatcher {}

impl ProcessWatcher {
    /// Start an ETW session watching for descendants of `root_pid` and assign
    /// them into `job`.
    ///
    /// Returns `None` if the session cannot be started (most commonly a lack of
    /// trace-session privilege). The caller treats the watcher as a best-effort
    /// enhancement over the plain Job Object.
    fn start(root_pid: u32, job: Arc<JobHandle>) -> Option<ProcessWatcher> {
        // A per-session unique name avoids collisions with any prior session.
        let unique = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_nanos())
            .unwrap_or(0);
        let name = format!("Tempest-Kill-{root_pid}-{unique}");
        let session_name: Vec<u16> = name.encode_utf16().chain(std::iter::once(0)).collect();

        // The properties buffer must hold the struct followed by room for the
        // session name at LoggerNameOffset.
        let props_size = size_of::<EVENT_TRACE_PROPERTIES>();
        let total = props_size + session_name.len() * 2;
        let mut props_buf: Vec<u64> = vec![0u64; u64_words_for(total)];
        let buf_bytes = (props_buf.len() * 8) as u32;

        // SAFETY: the whole start sequence operates on the properties buffer and
        // handles created here. On every failure path we stop the session (if it
        // was created) before returning so no orphaned session leaks.
        unsafe {
            let props = props_buf.as_mut_ptr() as *mut EVENT_TRACE_PROPERTIES;
            (*props).Wnode.BufferSize = buf_bytes;
            (*props).Wnode.Flags = WNODE_FLAG_TRACED_GUID;
            (*props).Wnode.ClientContext = 1; // QPC timestamps
            (*props).LogFileMode = EVENT_TRACE_REAL_TIME_MODE;
            (*props).LoggerNameOffset = props_size as u32;

            let mut control_handle = CONTROLTRACE_HANDLE::default();
            let err = StartTraceW(&mut control_handle, PCWSTR(session_name.as_ptr()), props);
            if err != ERROR_SUCCESS {
                return None;
            }

            let err = EnableTraceEx2(
                control_handle,
                &KERNEL_PROCESS_PROVIDER,
                ENABLE_PROVIDER,
                0xFF, // deliver all levels
                KEYWORD_PROCESS,
                0,
                0,
                None,
            );
            if err != ERROR_SUCCESS {
                stop_session(control_handle, &session_name, &mut props_buf);
                return None;
            }

            // Seed the tracked set with the session root before any event fires.
            let mut pids = HashSet::new();
            pids.insert(root_pid);
            let ctx = Box::new(WatcherContext {
                pids: Mutex::new(pids),
                job: Arc::clone(&job),
                stopping: AtomicBool::new(false),
            });
            let ctx_ptr: *const WatcherContext = &*ctx;

            let mut logfile = EVENT_TRACE_LOGFILEW::default();
            logfile.LoggerName = PWSTR(session_name.as_ptr() as *mut u16);
            logfile.Anonymous1.ProcessTraceMode =
                PROCESS_TRACE_MODE_REAL_TIME | PROCESS_TRACE_MODE_EVENT_RECORD;
            logfile.Anonymous2.EventRecordCallback = Some(on_event);
            logfile.Context = ctx_ptr as *mut core::ffi::c_void;

            let process_handle = OpenTraceW(&mut logfile);
            // OpenTraceW returns INVALID_PROCESSTRACE_HANDLE on failure; that
            // sentinel is 0x0000_0000_FFFF_FFFF on older SDKs and u64::MAX on
            // newer ones, so reject both.
            if process_handle.Value == u64::MAX
                || process_handle.Value == 0x0000_0000_FFFF_FFFF
            {
                stop_session(control_handle, &session_name, &mut props_buf);
                return None;
            }

            let thread = match std::thread::Builder::new()
                .name("tempest-etw-watcher".to_string())
                .spawn(move || {
                    // SAFETY: `process_handle` is a valid consumer handle;
                    // ProcessTrace blocks until CloseTrace / session stop.
                    let _ = ProcessTrace(&[process_handle], None, None);
                }) {
                Ok(t) => t,
                Err(_) => {
                    let _ = CloseTrace(process_handle);
                    stop_session(control_handle, &session_name, &mut props_buf);
                    return None;
                }
            };

            Some(ProcessWatcher {
                control_handle,
                process_handle,
                session_name,
                props_buf,
                thread: Some(thread),
                ctx,
            })
        }
    }

    /// Snapshot the PIDs the watcher currently tracks (root plus every observed
    /// descendant). Used at teardown to drive the explicit kill sweep before the
    /// watcher — and its `pids` set — is dropped.
    fn tracked_pids(&self) -> Vec<u32> {
        match self.ctx.pids.lock() {
            Ok(pids) => pids.iter().copied().collect(),
            Err(_) => Vec::new(),
        }
    }
}

impl Drop for ProcessWatcher {
    fn drop(&mut self) {
        // Tell the callback to stop assigning processes before we tear down.
        self.ctx.stopping.store(true, Ordering::SeqCst);

        // SAFETY: `control_handle`/`process_handle` are the handles created in
        // `start` and closed exactly once here. Stopping the session flushes its
        // buffers and, together with CloseTrace, unblocks ProcessTrace.
        unsafe {
            stop_session(self.control_handle, &self.session_name, &mut self.props_buf);
            // If ProcessTrace is still running this returns ERROR_CTX_CLOSE_PENDING
            // and ProcessTrace returns shortly after.
            let _ = CloseTrace(self.process_handle);
        }

        // Guarantee the consumer thread is gone before we return; the context it
        // referenced is dropped afterwards, so no dangling pointer remains.
        if let Some(thread) = self.thread.take() {
            let _ = thread.join();
        }
    }
}

/// Stop an ETW session by name. Best-effort — used on error and teardown paths.
///
/// # Safety
///
/// `control_handle` and `session_name` must refer to a session started by
/// [`StartTraceW`]; `props_buf` must be the properties buffer allocated for it.
unsafe fn stop_session(
    control_handle: CONTROLTRACE_HANDLE,
    session_name: &[u16],
    props_buf: &mut [u64],
) {
    let buf_bytes = (props_buf.len() * 8) as u32;
    let props = props_buf.as_mut_ptr() as *mut EVENT_TRACE_PROPERTIES;
    (*props).Wnode.BufferSize = buf_bytes;
    let _ = ControlTraceW(
        control_handle,
        PCWSTR(session_name.as_ptr()),
        props,
        EVENT_TRACE_CONTROL_STOP,
    );
}

// ─── Kernel driver (optional, best-effort) ───────────────────────────────────

/// IOCTL ABI shared with the `hephaestus-driver` kernel crate.
///
/// These constants and `#[repr(C)]` structs are duplicated — *not linked* — from
/// that crate's `abi` module. A `.sys` and a `.dll` share no object, so both
/// copies must stay byte-for-byte identical.
mod kernel_abi {
    const FILE_DEVICE_UNKNOWN: u32 = 0x0000_0022;
    const METHOD_BUFFERED: u32 = 0;
    const FILE_ANY_ACCESS: u32 = 0;

    const fn ctl_code(device_type: u32, function: u32, method: u32, access: u32) -> u32 {
        (device_type << 16) | (access << 14) | (function << 2) | method
    }

    pub(super) const IOCTL_CREATE_SESSION: u32 =
        ctl_code(FILE_DEVICE_UNKNOWN, 0x800, METHOD_BUFFERED, FILE_ANY_ACCESS);
    pub(super) const IOCTL_DESTROY_SESSION: u32 =
        ctl_code(FILE_DEVICE_UNKNOWN, 0x801, METHOD_BUFFERED, FILE_ANY_ACCESS);
    pub(super) const IOCTL_LIST_PIDS: u32 =
        ctl_code(FILE_DEVICE_UNKNOWN, 0x802, METHOD_BUFFERED, FILE_ANY_ACCESS);

    #[repr(C)]
    #[derive(Clone, Copy)]
    pub(super) struct CreateSessionInput {
        pub session_id: u64,
        pub job_handle: u64,
        pub root_pid: u32,
        pub _pad: u32,
    }

    #[repr(C)]
    #[derive(Clone, Copy)]
    pub(super) struct SessionIdInput {
        pub session_id: u64,
    }
}

/// A best-effort connection to the Hephaestus kernel driver.
///
/// When the driver is loaded it assigns ShellExecute-brokered processes to the
/// session job at the kernel level — coverage user mode cannot achieve. When it
/// is absent, [`KernelDriver::open`] returns `None` and the SDK relies on the ETW
/// watcher plus the teardown kill sweep. No method ever surfaces an error;
/// integration is purely additive.
struct KernelDriver {
    device: HANDLE,
}

// SAFETY: a device HANDLE is a plain kernel handle and `DeviceIoControl` is
// internally synchronized, so the wrapper is safe to move and share across
// threads.
unsafe impl Send for KernelDriver {}
unsafe impl Sync for KernelDriver {}

impl KernelDriver {
    /// Try to open `\\.\HephaestusDriver`. Returns `None` when the driver is not
    /// loaded — the caller treats that as "fall back to ETW-only".
    fn open() -> Option<KernelDriver> {
        const GENERIC_READ: u32 = 0x8000_0000;
        const GENERIC_WRITE: u32 = 0x4000_0000;

        let path: Vec<u16> = r"\\.\HephaestusDriver"
            .encode_utf16()
            .chain(std::iter::once(0))
            .collect();

        // SAFETY: `path` is a valid NUL-terminated wide string; the returned
        // handle is owned by the struct and closed on drop.
        let handle = unsafe {
            CreateFileW(
                PCWSTR(path.as_ptr()),
                GENERIC_READ | GENERIC_WRITE,
                FILE_SHARE_READ | FILE_SHARE_WRITE,
                None,
                OPEN_EXISTING,
                FILE_FLAGS_AND_ATTRIBUTES(0),
                HANDLE::default(),
            )
        };

        match handle {
            Ok(device) if !device.is_invalid() && device != INVALID_HANDLE_VALUE => {
                Some(KernelDriver { device })
            }
            Ok(device) => {
                // Defensive: close a technically-Ok INVALID sentinel.
                // SAFETY: closing a handle we just received, exactly once.
                unsafe {
                    let _ = CloseHandle(device);
                }
                None
            }
            Err(_) => None,
        }
    }

    /// Issue a `METHOD_BUFFERED` IOCTL. Returns bytes written to `output`, or
    /// `None` if the call failed.
    fn ioctl(&self, code: u32, input: &[u8], output: Option<&mut [u8]>) -> Option<u32> {
        let mut returned: u32 = 0;
        let (out_ptr, out_len): (*mut core::ffi::c_void, u32) = match output {
            Some(buf) => (buf.as_mut_ptr() as *mut core::ffi::c_void, buf.len() as u32),
            None => (core::ptr::null_mut(), 0),
        };

        // SAFETY: both buffers outlive this synchronous call and their
        // pointer/length pairs are consistent. METHOD_BUFFERED copies through the
        // kernel's own SystemBuffer, so alignment of the user buffers is
        // irrelevant.
        let result = unsafe {
            DeviceIoControl(
                self.device,
                code,
                Some(input.as_ptr() as *const core::ffi::c_void),
                input.len() as u32,
                if out_ptr.is_null() { None } else { Some(out_ptr) },
                out_len,
                Some(&mut returned),
                None,
            )
        };
        result.ok().map(|_| returned)
    }

    /// View a `#[repr(C)] + Copy` value as its raw bytes for an IOCTL input.
    fn as_bytes<T: Copy>(value: &T) -> &[u8] {
        // SAFETY: `T` is `#[repr(C)]` and `Copy`; reading its own bytes is sound.
        unsafe { core::slice::from_raw_parts(value as *const T as *const u8, size_of::<T>()) }
    }

    /// Register a session seeded with `root_pid`, adopting `job` at the kernel
    /// level. Returns `true` on success.
    fn create_session(&self, session_id: u64, job: HANDLE, root_pid: u32) -> bool {
        let input = kernel_abi::CreateSessionInput {
            session_id,
            job_handle: job.0 as u64,
            root_pid,
            _pad: 0,
        };
        self.ioctl(kernel_abi::IOCTL_CREATE_SESSION, Self::as_bytes(&input), None)
            .is_some()
    }

    /// Destroy a session: the driver terminates its tracked PIDs and releases the
    /// referenced job object.
    fn destroy_session(&self, session_id: u64) -> bool {
        let input = kernel_abi::SessionIdInput { session_id };
        self.ioctl(kernel_abi::IOCTL_DESTROY_SESSION, Self::as_bytes(&input), None)
            .is_some()
    }

    /// Enumerate the PIDs the driver currently tracks for `session_id`.
    fn list_pids(&self, session_id: u64) -> Vec<u32> {
        let input = kernel_abi::SessionIdInput { session_id };
        // Room for a generous number of tracked PIDs.
        let mut out = vec![0u8; 4096 * size_of::<u32>()];
        let written =
            match self.ioctl(kernel_abi::IOCTL_LIST_PIDS, Self::as_bytes(&input), Some(&mut out)) {
                Some(n) => n as usize,
                None => return Vec::new(),
            };
        out[..written]
            .chunks_exact(size_of::<u32>())
            .map(|c| u32::from_ne_bytes([c[0], c[1], c[2], c[3]]))
            .collect()
    }
}

impl Drop for KernelDriver {
    fn drop(&mut self) {
        if !self.device.is_invalid() {
            // SAFETY: `device` is our owned handle, closed exactly once here.
            unsafe {
                let _ = CloseHandle(self.device);
            }
        }
    }
}

/// Whether the Hephaestus kernel driver is currently loaded.
///
/// Callers use this for UI feedback ("kernel-level isolation active"); it never
/// errors and is safe to call at any time.
pub(crate) fn is_driver_available() -> bool {
    KernelDriver::open().is_some()
}

// ─── Teardown kill helpers ────────────────────────────────────────────────────

/// Force-terminate a single PID. Best-effort — a failure (already exited, access
/// denied) is intentionally ignored.
fn terminate_pid(pid: u32) {
    // SAFETY: open for terminate only and close the handle on every path.
    unsafe {
        if let Ok(process) = OpenProcess(PROCESS_TERMINATE, FALSE, pid) {
            let _ = TerminateProcess(process, 1);
            let _ = CloseHandle(process);
        }
    }
}

/// Snapshot the live process table and return every descendant of `roots`
/// reachable through parent links (excluding the roots themselves).
///
/// Best-effort: `th32ParentProcessID` can be stale after PID reuse, so this is a
/// belt-and-suspenders sweep layered on top of the job and the tracked set, not
/// an authoritative tree. The snapshot is taken *before* any kill so parent links
/// are still intact.
fn collect_descendants(roots: &HashSet<u32>) -> HashSet<u32> {
    let mut descendants = HashSet::new();
    if roots.is_empty() {
        return descendants;
    }

    // SAFETY: the snapshot handle is created here and closed before returning;
    // `PROCESSENTRY32W.dwSize` is set before every enumeration call as required.
    unsafe {
        let snapshot = match CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0) {
            Ok(h) => h,
            Err(_) => return descendants,
        };

        let mut pairs: Vec<(u32, u32)> = Vec::new();
        let mut entry = PROCESSENTRY32W::default();
        entry.dwSize = size_of::<PROCESSENTRY32W>() as u32;
        if Process32FirstW(snapshot, &mut entry).is_ok() {
            loop {
                pairs.push((entry.th32ProcessID, entry.th32ParentProcessID));
                entry.dwSize = size_of::<PROCESSENTRY32W>() as u32;
                if Process32NextW(snapshot, &mut entry).is_err() {
                    break;
                }
            }
        }
        let _ = CloseHandle(snapshot);

        // BFS over parent links starting from the roots.
        let mut frontier: Vec<u32> = roots.iter().copied().collect();
        while let Some(parent) = frontier.pop() {
            for &(pid, ppid) in &pairs {
                if ppid == parent && !roots.contains(&pid) && descendants.insert(pid) {
                    frontier.push(pid);
                }
            }
        }
    }

    descendants
}

// ─── Lifecycle job (kill-on-close, no sandbox policy) ────────────────────────

/// RAII wrapper for a lifecycle-only Job Object plus its ETW watcher.
///
/// Holds a single anonymous Win32 Job Object created with
/// `JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE | JOB_OBJECT_LIMIT_BREAKAWAY_OK` and,
/// when trace privileges allow, a [`ProcessWatcher`] that folds
/// ShellExecute-brokered descendants back into the job. Dropping this value
/// stops the watcher, terminates the job, and closes the handle — the spawned
/// shell and all of its descendants die with it.
///
/// Obtain via [`create_lifecycle_job`].
pub(crate) struct RawLifecycleJob {
    /// Stopped and joined first on drop so no background thread races teardown.
    watcher: Option<ProcessWatcher>,
    /// The lifecycle job. Shared with the watcher via `Arc` so the handle
    /// outlives the watcher thread.
    job: Arc<JobHandle>,
    /// Optional kernel-driver connection. `Some` only when the driver is loaded;
    /// it assigns ShellExecute-brokered processes to the job at the kernel level.
    driver: Option<KernelDriver>,
    /// Session id registered with the driver — also used to query and destroy it.
    session_id: u64,
}

impl Drop for RawLifecycleJob {
    fn drop(&mut self) {
        // 1. Gather every PID believed to belong to this session, from both the
        //    ETW watcher and (when present) the kernel driver, before tearing
        //    anything down.
        let mut tracked: HashSet<u32> = HashSet::new();
        if let Some(watcher) = self.watcher.as_ref() {
            tracked.extend(watcher.tracked_pids());
        }
        if let Some(driver) = self.driver.as_ref() {
            tracked.extend(driver.list_pids(self.session_id));
        }

        // 2. While the process table still has intact parent links, compute any
        //    live descendants of tracked PIDs that never made it into our set
        //    (ShellExecute escapes on a host without the driver).
        let descendants = collect_descendants(&tracked);

        // 3. Stop and join the ETW watcher so no assignment races the kill.
        self.watcher.take();

        // 4. Terminate every process still in the job. Kill-on-close would also
        //    fire when the last handle closes, but terminating explicitly makes
        //    teardown synchronous regardless of outstanding handle references.
        // SAFETY: `self.job.0` is a live job handle we created; TerminateJobObject
        // simply kills all assigned processes and does not consume the handle.
        unsafe {
            let _ = TerminateJobObject(self.job.0, 1);
        }

        // 5. Belt-and-suspenders: explicitly terminate every tracked PID and
        //    every descendant found above, catching any that escaped the job.
        for &pid in tracked.iter().chain(descendants.iter()) {
            terminate_pid(pid);
        }

        // 6. Tell the kernel driver to drop the session: it dereferences the job
        //    object and sweeps any PIDs it still tracks.
        if let Some(driver) = self.driver.as_ref() {
            let _ = driver.destroy_session(self.session_id);
        }
    }
}

/// Create an anonymous kill-on-close Job Object, assign `pid` to it, and start a
/// best-effort ETW watcher for ShellExecute-brokered descendants.
///
/// Returns a RAII guard; dropping it stops the watcher and kills the tree.
/// Errors from job creation/assignment are surfaced; the ETW watcher is optional
/// and its absence is not an error. `taskkill /F /T` remains a secondary sweep.
pub(crate) fn create_lifecycle_job(pid: u32) -> Result<RawLifecycleJob, HephaestusError> {
    // SAFETY: each Win32 call operates on a handle we create and own. The job is
    // wrapped in `JobHandle`/`Arc` immediately so any early return closes it.
    unsafe {
        // Create an anonymous job (no security attributes, no name).
        let job = CreateJobObjectW(None, PCWSTR::null()).map_err(|e| {
            HephaestusError::provision(
                format!("pid:{pid}"),
                format!("CreateJobObjectW failed: {e}"),
            )
        })?;

        // Wrap immediately so `?` will close the handle on any subsequent error.
        let job = Arc::new(JobHandle(job));

        // Kill-on-close plus BREAKAWAY_OK so a child in a nested job context can
        // still be (re)assigned to this job on Windows 8+.
        let mut info = JOBOBJECT_EXTENDED_LIMIT_INFORMATION::default();
        info.BasicLimitInformation.LimitFlags =
            JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE | JOB_OBJECT_LIMIT_BREAKAWAY_OK;

        SetInformationJobObject(
            job.0,
            JobObjectExtendedLimitInformation,
            &info as *const _ as *const core::ffi::c_void,
            size_of::<JOBOBJECT_EXTENDED_LIMIT_INFORMATION>() as u32,
        )
        .map_err(|e| {
            HephaestusError::provision(
                format!("pid:{pid}"),
                format!("SetInformationJobObject failed: {e}"),
            )
        })?;

        // Open the target process so we can assign it to the job.
        let process = OpenProcess(PROCESS_ALL_ACCESS, FALSE, pid).map_err(|e| {
            HephaestusError::prepare(format!("OpenProcess({pid}) failed: {e}"))
        })?;

        // Assign; always close the process handle regardless of outcome.
        let assign = AssignProcessToJobObject(job.0, process);
        let _ = CloseHandle(process);
        assign.map_err(|e| {
            HephaestusError::prepare(format!(
                "AssignProcessToJobObject({pid}) failed: {e}"
            ))
        })?;

        // Best-effort ETW watcher to catch ShellExecute-brokered escapes.
        let watcher = ProcessWatcher::start(pid, Arc::clone(&job));

        // Best-effort kernel driver: when loaded, it assigns even ShellExecute-
        // brokered processes to the job at the kernel level. A unique session id
        // ties the driver session to this job (root PID in the high bits, a
        // nanosecond nonce in the low bits).
        let session_id = ((pid as u64) << 32)
            | (std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|d| d.as_nanos() as u64)
                .unwrap_or(0)
                & 0xFFFF_FFFF);
        let driver = KernelDriver::open();
        if let Some(driver) = driver.as_ref() {
            // Ignore the result: a failure here just means we degrade to the ETW
            // watcher and teardown sweep, exactly as if the driver were absent.
            driver.create_session(session_id, job.0, pid);
        }

        Ok(RawLifecycleJob { watcher, job, driver, session_id })
    }
}
