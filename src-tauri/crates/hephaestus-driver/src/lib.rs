//! # Hephaestus kernel driver
//!
//! A lightweight WDM kernel driver that closes the one gap the user-mode
//! Hephaestus Windows backend cannot close on its own: processes spawned through
//! ShellExecute brokering (PowerShell's `Start-Process`, COM activation, WMI,
//! `explorer.exe` reparenting) never become `CreateProcess` descendants of the
//! session root, so they never inherit the session's Job Object and survive
//! `TerminateJobObject`.
//!
//! The driver registers [`PsSetCreateProcessNotifyRoutineEx`], which Windows
//! fires for **every** process creation on the system regardless of how it was
//! spawned, *before* the new process runs a single instruction. For each new
//! process whose parent belongs to a tracked session, the driver assigns the new
//! process to that session's Job Object and records its PID. Teardown then kills
//! a complete tree.
//!
//! Tempest talks to the driver over a single device (`\Device\HephaestusDriver`,
//! user-visible as `\\.\HephaestusDriver`) via three IOCTLs — see [`abi`].
//!
//! ## Design notes
//!
//! * `#![no_std]`. Kernel drivers have no `std`; collections come from `alloc`,
//!   which routes through the non-paged-pool [`wdk_alloc::WdkAllocator`]. There
//!   is no `HashMap`/`HashSet` in `alloc`, so the session table is a
//!   [`BTreeMap`] and each session's PID set is a [`BTreeSet`]. The naming
//!   `SESSION_MAP` is kept for parity with the design doc.
//! * Every shared structure is guarded by a [`SpinLock`]. Process-notify
//!   callbacks and IOCTL dispatch both run at `PASSIVE_LEVEL`, and the
//!   non-paged allocator is safe to call while the lock has raised IRQL to
//!   `DISPATCH_LEVEL`.
//! * Job assignment holds only *referenced object pointers* (obtained with
//!   `ObReferenceObjectByHandle` in the caller's context); user-mode `HANDLE`
//!   values are never stored, because they are only valid in Tempest's handle
//!   table.
//!
//! ## Binding caveat
//!
//! `wdk-sys` regenerates its FFI bindings from the *locally installed* WDK
//! headers at build time. A few anonymous-union/-struct field names below
//! (e.g. the IRP stack-location accessor, `IO_STATUS_BLOCK.Anonymous.Status`)
//! and a handful of exported symbols follow the names bindgen currently emits;
//! if a future WDK renames them, these accessors are the spots to adjust. This
//! crate does **not** build without a WDK toolchain — that is by design.

#![no_std]
#![allow(non_snake_case)]

extern crate alloc;

// The panic handler and the alloc-error handler for the kernel come from these
// crates; linking them (even unused) installs the required lang items.
use wdk_panic as _;

use alloc::collections::{BTreeMap, BTreeSet};
use alloc::vec::Vec;
use core::ffi::c_void;
use core::ptr;
use core::sync::atomic::{AtomicU64, Ordering};

use wdk_sys::{
    DEVICE_OBJECT, DRIVER_OBJECT, HANDLE, IRP, IO_STACK_LOCATION, NTSTATUS, PEPROCESS,
    PS_CREATE_NOTIFY_INFO, UNICODE_STRING,
};

/// Non-paged-pool allocator so `alloc` collections work in kernel mode.
#[global_allocator]
static GLOBAL_ALLOCATOR: wdk_alloc::WdkAllocator = wdk_alloc::WdkAllocator;

// ─── Shared ABI (mirrored verbatim by the user-mode side) ─────────────────────

/// The wire contract between Tempest (user mode) and this driver.
///
/// These constants and `#[repr(C)]` structs are duplicated — *not linked* —
/// in `hephaestus/src/platform/windows.rs`. There is no shared object between a
/// `.sys` and a `.dll`, so the two copies must be kept byte-for-byte identical.
pub mod abi {
    /// `FILE_DEVICE_UNKNOWN`.
    pub const FILE_DEVICE_UNKNOWN: u32 = 0x0000_0022;
    /// `METHOD_BUFFERED` — the I/O manager copies in/out through
    /// `Irp->AssociatedIrp.SystemBuffer`.
    pub const METHOD_BUFFERED: u32 = 0;
    /// `FILE_ANY_ACCESS`.
    pub const FILE_ANY_ACCESS: u32 = 0;

    /// `CTL_CODE` macro, reproduced as a `const fn`.
    pub const fn ctl_code(device_type: u32, function: u32, method: u32, access: u32) -> u32 {
        (device_type << 16) | (access << 14) | (function << 2) | method
    }

    /// Create a tracked session: seed it with `root_pid` and adopt `job_handle`.
    pub const IOCTL_HEPHAESTUS_CREATE_SESSION: u32 =
        ctl_code(FILE_DEVICE_UNKNOWN, 0x800, METHOD_BUFFERED, FILE_ANY_ACCESS);
    /// Destroy a session: terminate its tracked PIDs and release the job object.
    pub const IOCTL_HEPHAESTUS_DESTROY_SESSION: u32 =
        ctl_code(FILE_DEVICE_UNKNOWN, 0x801, METHOD_BUFFERED, FILE_ANY_ACCESS);
    /// Enumerate the PIDs currently tracked for a session.
    pub const IOCTL_HEPHAESTUS_LIST_PIDS: u32 =
        ctl_code(FILE_DEVICE_UNKNOWN, 0x802, METHOD_BUFFERED, FILE_ANY_ACCESS);

    /// Input for [`IOCTL_HEPHAESTUS_CREATE_SESSION`].
    ///
    /// `job_handle` is a Tempest-owned Job Object handle. It is valid because
    /// `DeviceIoControl` dispatch runs in the calling thread's context, so the
    /// driver can reference it against the caller's handle table.
    #[repr(C)]
    #[derive(Clone, Copy)]
    pub struct CreateSessionInput {
        pub session_id: u64,
        pub job_handle: u64,
        pub root_pid: u32,
        pub _pad: u32,
    }

    /// Input for [`IOCTL_HEPHAESTUS_DESTROY_SESSION`] and, as the leading field
    /// of the shared buffer, for [`IOCTL_HEPHAESTUS_LIST_PIDS`].
    #[repr(C)]
    #[derive(Clone, Copy)]
    pub struct SessionIdInput {
        pub session_id: u64,
    }
}

// ─── Kernel FFI not covered by, or renamed across, wdk-sys versions ───────────
//
// These externs mirror the WDK prototypes directly. `wdk-sys` exposes most of
// them; declaring the thin set we rely on here keeps the driver readable and
// resilient to minor binding churn.

// Object / process / job primitives.
//
// `POBJECT_TYPE` is `*OBJECT_TYPE`. The exported symbols `PsProcessType` /
// `PsJobType` are declared in the WDK as `POBJECT_TYPE *` — a *pointer to* the
// object-type pointer — so callers pass `*PsProcessType`. The `object_type`
// accessors below encapsulate that dereference.
type POBJECT_TYPE = *mut c_void;
extern "C" {
    /// Exported object-type pointers (`POBJECT_TYPE *`) — dereference to obtain
    /// the `POBJECT_TYPE` that `ObReferenceObjectByHandle` expects.
    static mut PsProcessType: *mut POBJECT_TYPE;
    static mut PsJobType: *mut POBJECT_TYPE;

    fn ObReferenceObjectByHandle(
        Handle: HANDLE,
        DesiredAccess: u32,
        ObjectType: POBJECT_TYPE,
        AccessMode: i8,
        Object: *mut *mut c_void,
        HandleInformation: *mut c_void,
    ) -> NTSTATUS;
    fn ObOpenObjectByPointer(
        Object: *mut c_void,
        HandleAttributes: u32,
        PassedAccessState: *mut c_void,
        DesiredAccess: u32,
        ObjectType: POBJECT_TYPE,
        AccessMode: i8,
        Handle: *mut HANDLE,
    ) -> NTSTATUS;
    fn ObfDereferenceObject(Object: *mut c_void);

    fn ZwAssignProcessToJobObject(JobHandle: HANDLE, ProcessHandle: HANDLE) -> NTSTATUS;
    fn ZwOpenProcess(
        ProcessHandle: *mut HANDLE,
        DesiredAccess: u32,
        ObjectAttributes: *mut OBJECT_ATTRIBUTES,
        ClientId: *mut CLIENT_ID,
    ) -> NTSTATUS;
    fn ZwTerminateProcess(ProcessHandle: HANDLE, ExitStatus: NTSTATUS) -> NTSTATUS;
    fn ZwClose(Handle: HANDLE) -> NTSTATUS;

    fn PsSetCreateProcessNotifyRoutineEx(
        NotifyRoutine: PcreateProcessNotifyRoutineEx,
        Remove: u8,
    ) -> NTSTATUS;

    fn IoCreateDevice(
        DriverObject: *mut DRIVER_OBJECT,
        DeviceExtensionSize: u32,
        DeviceName: *mut UNICODE_STRING,
        DeviceType: u32,
        DeviceCharacteristics: u32,
        Exclusive: u8,
        DeviceObject: *mut *mut DEVICE_OBJECT,
    ) -> NTSTATUS;
    fn IoDeleteDevice(DeviceObject: *mut DEVICE_OBJECT);
    fn IoCreateSymbolicLink(
        SymbolicLinkName: *mut UNICODE_STRING,
        DeviceName: *mut UNICODE_STRING,
    ) -> NTSTATUS;
    fn IoDeleteSymbolicLink(SymbolicLinkName: *mut UNICODE_STRING) -> NTSTATUS;
    fn IofCompleteRequest(Irp: *mut IRP, PriorityBoost: i8);

    fn KeInitializeSpinLock(SpinLock: *mut usize);
    fn KeAcquireSpinLockRaiseToDpc(SpinLock: *mut usize) -> u8;
    fn KeReleaseSpinLock(SpinLock: *mut usize, NewIrql: u8);
}

type PcreateProcessNotifyRoutineEx =
    Option<unsafe extern "C" fn(process: PEPROCESS, process_id: HANDLE, create_info: *mut PS_CREATE_NOTIFY_INFO)>;

#[repr(C)]
struct CLIENT_ID {
    UniqueProcess: HANDLE,
    UniqueThread: HANDLE,
}

#[repr(C)]
struct OBJECT_ATTRIBUTES {
    Length: u32,
    RootDirectory: HANDLE,
    ObjectName: *mut UNICODE_STRING,
    Attributes: u32,
    SecurityDescriptor: *mut c_void,
    SecurityQualityOfService: *mut c_void,
}

// ─── Numeric constants (stable NT ABI values, independent of bindings) ────────

const STATUS_SUCCESS: NTSTATUS = 0;
const STATUS_UNSUCCESSFUL: NTSTATUS = 0xC000_0001u32 as NTSTATUS;
const STATUS_INVALID_PARAMETER: NTSTATUS = 0xC000_000Du32 as NTSTATUS;
const STATUS_BUFFER_TOO_SMALL: NTSTATUS = 0xC000_0023u32 as NTSTATUS;

const IRP_MJ_CREATE: usize = 0x00;
const IRP_MJ_CLOSE: usize = 0x02;
const IRP_MJ_DEVICE_CONTROL: usize = 0x0E;

const KERNEL_MODE: i8 = 0;
const USER_MODE: i8 = 1;
const OBJ_KERNEL_HANDLE: u32 = 0x0000_0200;

const PROCESS_TERMINATE: u32 = 0x0001;
const PROCESS_ALL_ACCESS: u32 = 0x001F_0FFF;
const JOB_OBJECT_ALL_ACCESS: u32 = 0x001F_003F;

/// Fatal exit code delivered to swept processes.
const KILL_EXIT_CODE: NTSTATUS = 1;

/// The `POBJECT_TYPE` for processes (`*PsProcessType`).
///
/// # Safety
/// Reads the exported `PsProcessType` symbol; valid any time after driver load.
unsafe fn process_type() -> POBJECT_TYPE {
    *PsProcessType
}

/// The `POBJECT_TYPE` for job objects (`*PsJobType`).
///
/// # Safety
/// Reads the exported `PsJobType` symbol; valid any time after driver load.
unsafe fn job_type() -> POBJECT_TYPE {
    *PsJobType
}

// ─── SpinLock primitive ───────────────────────────────────────────────────────

/// A minimal `KSPIN_LOCK`-backed mutual-exclusion cell.
///
/// `KSPIN_LOCK` is pointer-sized; the value type lives beside it in an
/// `UnsafeCell`. Acquiring raises IRQL to `DISPATCH_LEVEL` and returns the old
/// IRQL, which the guard restores on drop.
struct SpinLock<T> {
    lock: core::cell::UnsafeCell<usize>,
    data: core::cell::UnsafeCell<T>,
}

// SAFETY: access to `data` is serialized by the `KSPIN_LOCK`; the whole point of
// the type is safe cross-thread (cross-CPU) sharing in the single kernel address
// space.
unsafe impl<T> Sync for SpinLock<T> {}
unsafe impl<T> Send for SpinLock<T> {}

impl<T> SpinLock<T> {
    const fn new(value: T) -> Self {
        Self {
            lock: core::cell::UnsafeCell::new(0),
            data: core::cell::UnsafeCell::new(value),
        }
    }

    /// One-time `KeInitializeSpinLock`. Called from `DriverEntry`.
    ///
    /// # Safety
    /// Must be called exactly once before any [`lock`](Self::lock).
    unsafe fn init(&self) {
        KeInitializeSpinLock(self.lock.get());
    }

    fn lock(&self) -> SpinGuard<'_, T> {
        // SAFETY: `lock` was initialized in DriverEntry; acquire returns the old
        // IRQL which the guard restores.
        let irql = unsafe { KeAcquireSpinLockRaiseToDpc(self.lock.get()) };
        SpinGuard { parent: self, irql }
    }
}

struct SpinGuard<'a, T> {
    parent: &'a SpinLock<T>,
    irql: u8,
}

impl<T> core::ops::Deref for SpinGuard<'_, T> {
    type Target = T;
    fn deref(&self) -> &T {
        // SAFETY: exclusive access is guaranteed while the guard is held.
        unsafe { &*self.parent.data.get() }
    }
}

impl<T> core::ops::DerefMut for SpinGuard<'_, T> {
    fn deref_mut(&mut self) -> &mut T {
        // SAFETY: exclusive access is guaranteed while the guard is held.
        unsafe { &mut *self.parent.data.get() }
    }
}

impl<T> Drop for SpinGuard<'_, T> {
    fn drop(&mut self) {
        // SAFETY: releases the same lock acquired in `lock`, restoring IRQL.
        unsafe { KeReleaseSpinLock(self.parent.parent_lock(), self.irql) };
    }
}

impl<T> SpinLock<T> {
    fn parent_lock(&self) -> *mut usize {
        self.lock.get()
    }
}

// ─── Session state ────────────────────────────────────────────────────────────

/// One tracked isolation session.
struct Session {
    /// Referenced `PEJOB` pointer (from `ObReferenceObjectByHandle`). Held with
    /// a reference so it stays valid regardless of Tempest's own handle; released
    /// with `ObfDereferenceObject` when the session is destroyed.
    job_object: *mut c_void,
    /// Every PID known to belong to this session: the root plus all descendants
    /// observed by the process-notify callback (including ShellExecute-brokered
    /// ones).
    pids: BTreeSet<u32>,
}

/// `session_id → Session`. The name mirrors the design doc; `BTreeMap` is used
/// because `alloc` provides no hash map (see the crate-level design notes).
static SESSION_MAP: SpinLock<BTreeMap<u64, Session>> = SpinLock::new(BTreeMap::new());

/// Set once the notify routine is registered, so `DriverUnload` only tries to
/// remove it when it was installed.
static NOTIFY_REGISTERED: AtomicU64 = AtomicU64::new(0);

/// The device object, kept so `DriverUnload` can delete it.
static DEVICE: AtomicPtr = AtomicPtr::new();

/// Tiny atomic pointer cell (avoids pulling `core::sync::atomic::AtomicPtr`
/// generics into a `static` with a non-`Send` target type).
struct AtomicPtr(core::sync::atomic::AtomicUsize);
impl AtomicPtr {
    const fn new() -> Self {
        Self(core::sync::atomic::AtomicUsize::new(0))
    }
    fn store(&self, p: *mut DEVICE_OBJECT) {
        self.0.store(p as usize, Ordering::SeqCst);
    }
    fn load(&self) -> *mut DEVICE_OBJECT {
        self.0.load(Ordering::SeqCst) as *mut DEVICE_OBJECT
    }
}

// ─── Device / symlink names ───────────────────────────────────────────────────

/// Convert an ASCII `&str` to a NUL-padded UTF-16 array at compile time.
const fn wide<const N: usize>(s: &str) -> [u16; N] {
    let bytes = s.as_bytes();
    let mut out = [0u16; N];
    let mut i = 0;
    while i < bytes.len() {
        out[i] = bytes[i] as u16;
        i += 1;
    }
    out
}

// `\Device\HephaestusDriver` is 24 chars, `\DosDevices\HephaestusDriver` is 28;
// each array reserves one extra slot for the trailing NUL.
static DEVICE_NAME_BUF: [u16; 25] = wide::<25>("\\Device\\HephaestusDriver");
static SYMLINK_NAME_BUF: [u16; 29] = wide::<29>("\\DosDevices\\HephaestusDriver");

/// Build a `UNICODE_STRING` view over a NUL-terminated wide buffer.
fn unicode_string(buf: &[u16]) -> UNICODE_STRING {
    let chars = buf.len() - 1; // exclude trailing NUL
    UNICODE_STRING {
        Length: (chars * 2) as u16,
        MaximumLength: (buf.len() * 2) as u16,
        Buffer: buf.as_ptr() as *mut u16,
    }
}

// ─── Kernel helpers ───────────────────────────────────────────────────────────

/// Assign `process` (an `EPROCESS`) to the job referenced by `job_object`.
///
/// Opens short-lived kernel handles to both objects (user-mode handles would be
/// meaningless here) and closes them before returning. Best-effort: a failure —
/// e.g. the process exited between the notify callback and here — is ignored.
///
/// # Safety
/// `process` must be a valid `EPROCESS` and `job_object` a referenced `PEJOB`.
unsafe fn assign_process_to_job(process: PEPROCESS, job_object: *mut c_void) {
    let mut job_handle: HANDLE = ptr::null_mut();
    let mut proc_handle: HANDLE = ptr::null_mut();

    // Kernel handle to the job.
    let s = ObOpenObjectByPointer(
        job_object,
        OBJ_KERNEL_HANDLE,
        ptr::null_mut(),
        JOB_OBJECT_ALL_ACCESS,
        job_type(),
        KERNEL_MODE,
        &mut job_handle,
    );
    if s != STATUS_SUCCESS {
        return;
    }

    // Kernel handle to the new process.
    let s = ObOpenObjectByPointer(
        process as *mut c_void,
        OBJ_KERNEL_HANDLE,
        ptr::null_mut(),
        PROCESS_ALL_ACCESS,
        process_type(),
        KERNEL_MODE,
        &mut proc_handle,
    );
    if s != STATUS_SUCCESS {
        let _ = ZwClose(job_handle);
        return;
    }

    let _ = ZwAssignProcessToJobObject(job_handle, proc_handle);
    let _ = ZwClose(proc_handle);
    let _ = ZwClose(job_handle);
}

/// Force-terminate a process by PID. Best-effort — used in the destroy sweep.
///
/// # Safety
/// Calls documented Zw* routines at `PASSIVE_LEVEL`.
unsafe fn terminate_pid(pid: u32) {
    let mut oa = OBJECT_ATTRIBUTES {
        Length: core::mem::size_of::<OBJECT_ATTRIBUTES>() as u32,
        RootDirectory: ptr::null_mut(),
        ObjectName: ptr::null_mut(),
        Attributes: OBJ_KERNEL_HANDLE,
        SecurityDescriptor: ptr::null_mut(),
        SecurityQualityOfService: ptr::null_mut(),
    };
    let mut cid = CLIENT_ID {
        UniqueProcess: pid as usize as HANDLE,
        UniqueThread: ptr::null_mut(),
    };
    let mut handle: HANDLE = ptr::null_mut();
    if ZwOpenProcess(&mut handle, PROCESS_TERMINATE, &mut oa, &mut cid) == STATUS_SUCCESS {
        let _ = ZwTerminateProcess(handle, KILL_EXIT_CODE);
        let _ = ZwClose(handle);
    }
}

// ─── Process-creation notify callback ─────────────────────────────────────────

/// Registered with `PsSetCreateProcessNotifyRoutineEx`; fires at `PASSIVE_LEVEL`
/// for every process create *and* exit on the system.
///
/// On create (`create_info != null`): if the new process's parent is tracked by
/// any session, add the new PID to that session and fold it into the session's
/// Job Object. Because notifications are ordered — the parent is always recorded
/// before its child is created — checking the immediate parent is sufficient to
/// catch a whole descendant tree transitively, including ShellExecute brokering.
///
/// On exit (`create_info == null`): drop the PID from whichever session held it.
///
/// # Safety
/// Signature and calling convention are dictated by the WDK contract.
unsafe extern "C" fn process_notify_callback(
    process: PEPROCESS,
    process_id: HANDLE,
    create_info: *mut PS_CREATE_NOTIFY_INFO,
) {
    let pid = process_id as usize as u32;

    if create_info.is_null() {
        // Process exit: prune the PID so the set does not grow unbounded.
        let mut map = SESSION_MAP.lock();
        for session in map.values_mut() {
            session.pids.remove(&pid);
        }
        return;
    }

    // SAFETY: non-null create_info is a valid PS_CREATE_NOTIFY_INFO for this call.
    let parent_pid = (*create_info).ParentProcessId as usize as u32;

    // Find the (single) session whose tracked set contains the parent, add the
    // new PID, and capture the job pointer to assign outside the lock.
    let job_object = {
        let mut map = SESSION_MAP.lock();
        let mut found: *mut c_void = ptr::null_mut();
        for session in map.values_mut() {
            if session.pids.contains(&parent_pid) {
                session.pids.insert(pid);
                found = session.job_object;
                break;
            }
        }
        found
    };

    if !job_object.is_null() {
        assign_process_to_job(process, job_object);
    }
}

// ─── IRP dispatch ─────────────────────────────────────────────────────────────

/// Mirror of the inline `IoGetCurrentIrpStackLocation` macro.
///
/// # Safety
/// `irp` must be a valid IRP with at least one stack location.
unsafe fn current_stack_location(irp: *mut IRP) -> *mut IO_STACK_LOCATION {
    // IRP.Tail.Overlay.CurrentStackLocation. bindgen flattens the nested unions;
    // this accessor is the primary spot to adjust if a WDK update renames them.
    (*irp)
        .Tail
        .Overlay
        .__bindgen_anon_2
        .__bindgen_anon_1
        .CurrentStackLocation
}

/// Complete an IRP with `status` and `information` bytes transferred.
///
/// # Safety
/// `irp` must be a valid, owned IRP that has not yet been completed.
unsafe fn complete(irp: *mut IRP, status: NTSTATUS, information: usize) -> NTSTATUS {
    (*irp).IoStatus.__bindgen_anon_1.Status = status;
    (*irp).IoStatus.Information = information;
    IofCompleteRequest(irp, 0);
    status
}

/// `IRP_MJ_CREATE` / `IRP_MJ_CLOSE`: succeed so `CreateFileW`/`CloseHandle` work.
unsafe extern "C" fn dispatch_create_close(
    _device: *mut DEVICE_OBJECT,
    irp: *mut IRP,
) -> NTSTATUS {
    complete(irp, STATUS_SUCCESS, 0)
}

/// `IRP_MJ_DEVICE_CONTROL`: the three Hephaestus IOCTLs.
unsafe extern "C" fn dispatch_device_control(
    _device: *mut DEVICE_OBJECT,
    irp: *mut IRP,
) -> NTSTATUS {
    let stack = current_stack_location(irp);
    let ioc = (*stack).Parameters.DeviceIoControl;
    let code = ioc.IoControlCode;
    let in_len = ioc.InputBufferLength as usize;
    let out_len = ioc.OutputBufferLength as usize;

    // METHOD_BUFFERED: input and output share SystemBuffer.
    let system_buffer = (*irp).AssociatedIrp.SystemBuffer as *mut u8;
    if system_buffer.is_null() {
        return complete(irp, STATUS_INVALID_PARAMETER, 0);
    }

    match code {
        abi::IOCTL_HEPHAESTUS_CREATE_SESSION => {
            if in_len < core::mem::size_of::<abi::CreateSessionInput>() {
                return complete(irp, STATUS_INVALID_PARAMETER, 0);
            }
            let input = ptr::read_unaligned(system_buffer as *const abi::CreateSessionInput);
            let status = create_session(input);
            complete(irp, status, 0)
        }
        abi::IOCTL_HEPHAESTUS_DESTROY_SESSION => {
            if in_len < core::mem::size_of::<abi::SessionIdInput>() {
                return complete(irp, STATUS_INVALID_PARAMETER, 0);
            }
            let input = ptr::read_unaligned(system_buffer as *const abi::SessionIdInput);
            destroy_session(input.session_id);
            complete(irp, STATUS_SUCCESS, 0)
        }
        abi::IOCTL_HEPHAESTUS_LIST_PIDS => {
            if in_len < core::mem::size_of::<abi::SessionIdInput>() {
                return complete(irp, STATUS_INVALID_PARAMETER, 0);
            }
            let input = ptr::read_unaligned(system_buffer as *const abi::SessionIdInput);
            list_pids(input.session_id, system_buffer, out_len, irp)
        }
        _ => complete(irp, STATUS_INVALID_PARAMETER, 0),
    }
}

// ─── IOCTL handlers ───────────────────────────────────────────────────────────

/// Reference the caller's job handle and register a new session seeded with the
/// root PID. Runs in the caller's process context, so `job_handle` is valid.
unsafe fn create_session(input: abi::CreateSessionInput) -> NTSTATUS {
    let mut job_object: *mut c_void = ptr::null_mut();
    // AccessMode = UserMode: validate the handle against Tempest's handle table.
    let status = ObReferenceObjectByHandle(
        input.job_handle as usize as HANDLE,
        JOB_OBJECT_ALL_ACCESS,
        job_type(),
        USER_MODE,
        &mut job_object,
        ptr::null_mut(),
    );
    if status != STATUS_SUCCESS {
        return status;
    }

    let mut pids = BTreeSet::new();
    pids.insert(input.root_pid);

    let mut map = SESSION_MAP.lock();
    if let Some(old) = map.insert(input.session_id, Session { job_object, pids }) {
        // Replacing an existing id: drop the old reference to avoid a leak.
        ObfDereferenceObject(old.job_object);
    }
    STATUS_SUCCESS
}

/// Remove a session: terminate every tracked PID (belt-and-suspenders alongside
/// the user-mode `TerminateJobObject`) and release the referenced job object.
unsafe fn destroy_session(session_id: u64) {
    let session = {
        let mut map = SESSION_MAP.lock();
        map.remove(&session_id)
    };
    if let Some(session) = session {
        for &pid in &session.pids {
            terminate_pid(pid);
        }
        ObfDereferenceObject(session.job_object);
    }
}

/// Write the session's tracked PIDs into the shared buffer as a packed `u32`
/// array. `Information` is set to the number of bytes written.
unsafe fn list_pids(
    session_id: u64,
    buffer: *mut u8,
    out_len: usize,
    irp: *mut IRP,
) -> NTSTATUS {
    let pids: Vec<u32> = {
        let map = SESSION_MAP.lock();
        match map.get(&session_id) {
            Some(s) => s.pids.iter().copied().collect(),
            None => Vec::new(),
        }
    };

    let needed = pids.len() * core::mem::size_of::<u32>();
    if out_len < needed {
        return complete(irp, STATUS_BUFFER_TOO_SMALL, 0);
    }
    let dst = buffer as *mut u32;
    for (i, &pid) in pids.iter().enumerate() {
        ptr::write_unaligned(dst.add(i), pid);
    }
    complete(irp, STATUS_SUCCESS, needed)
}

// ─── DriverEntry / DriverUnload ───────────────────────────────────────────────

/// Driver unload: remove the notify routine, delete the symlink and device, and
/// release any sessions still referenced.
unsafe extern "C" fn driver_unload(_driver: *mut DRIVER_OBJECT) {
    if NOTIFY_REGISTERED.load(Ordering::SeqCst) != 0 {
        // Remove = TRUE (1) unregisters the routine.
        let _ = PsSetCreateProcessNotifyRoutineEx(Some(process_notify_callback), 1);
    }

    // Release any job references still held by live sessions.
    {
        let mut map = SESSION_MAP.lock();
        for (_, session) in core::mem::take(&mut *map) {
            ObfDereferenceObject(session.job_object);
        }
    }

    let mut symlink = unicode_string(&SYMLINK_NAME_BUF);
    let _ = IoDeleteSymbolicLink(&mut symlink);

    let device = DEVICE.load();
    if !device.is_null() {
        IoDeleteDevice(device);
    }
}

/// Kernel entry point. Creates the control device, publishes the DOS symlink,
/// wires up the dispatch table, and registers the process-notify callback.
///
/// # Safety
/// Called once by the I/O manager with a valid driver object.
#[export_name = "DriverEntry"]
pub unsafe extern "system" fn driver_entry(
    driver: *mut DRIVER_OBJECT,
    _registry_path: *mut UNICODE_STRING,
) -> NTSTATUS {
    SESSION_MAP.init();

    // Create the control device.
    let mut device_name = unicode_string(&DEVICE_NAME_BUF);
    let mut device: *mut DEVICE_OBJECT = ptr::null_mut();
    let status = IoCreateDevice(
        driver,
        0,
        &mut device_name,
        abi::FILE_DEVICE_UNKNOWN,
        0,
        0, // not exclusive
        &mut device,
    );
    if status != STATUS_SUCCESS {
        return status;
    }
    DEVICE.store(device);

    // Publish \DosDevices\HephaestusDriver → \Device\HephaestusDriver.
    let mut symlink = unicode_string(&SYMLINK_NAME_BUF);
    let status = IoCreateSymbolicLink(&mut symlink, &mut device_name);
    if status != STATUS_SUCCESS {
        IoDeleteDevice(device);
        DEVICE.store(ptr::null_mut());
        return status;
    }

    // Dispatch table.
    (*driver).MajorFunction[IRP_MJ_CREATE] = Some(dispatch_create_close);
    (*driver).MajorFunction[IRP_MJ_CLOSE] = Some(dispatch_create_close);
    (*driver).MajorFunction[IRP_MJ_DEVICE_CONTROL] = Some(dispatch_device_control);
    (*driver).DriverUnload = Some(driver_unload);

    // Register the system-wide process-creation callback — the whole point.
    let status = PsSetCreateProcessNotifyRoutineEx(Some(process_notify_callback), 0);
    if status != STATUS_SUCCESS {
        // Roll back: PsSetCreateProcessNotifyRoutineEx commonly fails without the
        // `/integritycheck` link flag, so surface it rather than half-loading.
        let _ = IoDeleteSymbolicLink(&mut symlink);
        IoDeleteDevice(device);
        DEVICE.store(ptr::null_mut());
        return STATUS_UNSUCCESSFUL;
    }
    NOTIFY_REGISTERED.store(1, Ordering::SeqCst);

    STATUS_SUCCESS
}
