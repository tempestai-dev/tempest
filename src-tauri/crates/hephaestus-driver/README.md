# hephaestus-driver

A lightweight Windows kernel-mode (WDM) driver that closes the one process-isolation
gap the user-mode Hephaestus SDK cannot close by itself.

## What it does and why it's needed

Hephaestus isolates processes on Windows with **Job Objects**. Closing a job with
`JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE` / `TerminateJobObject` tears down the whole
tree — *but only for processes that became `CreateProcess` descendants of the
session root*.

Processes launched through **ShellExecute brokering** never do. PowerShell's
`Start-Process`, COM activation, and WMI all ask `explorer.exe` to create the
process, so the new process's OS parent is `explorer.exe`, not the shell. It never
inherits the session's Job Object, and `TerminateJobObject` cannot reach it. The
user-mode ETW watcher (`Microsoft-Windows-Kernel-Process`) narrows the gap but
fires *after* creation and still sees the brokered parent as `explorer.exe`.

This driver registers **`PsSetCreateProcessNotifyRoutineEx`**, which Windows fires
for *every* process creation on the system — regardless of how it was spawned —
*before* the new process runs a single instruction. For each new process whose
parent is tracked by a session, the driver:

1. Adds the new PID to the session's tracked set.
2. Assigns the new process to the session's Job Object.

So by the time the process executes anything, it is already in the job and dies
with it. Notifications are ordered (parent recorded before child is created), so
tracking the immediate parent catches an entire descendant tree transitively.

Tempest drives the driver through one device (`\Device\HephaestusDriver`, exposed
to user mode as `\\.\HephaestusDriver`) with three IOCTLs:

| IOCTL | Payload | Effect |
|-------|---------|--------|
| `IOCTL_HEPHAESTUS_CREATE_SESSION` | `{ session_id: u64, job_handle: u64, root_pid: u32 }` | Reference the job, seed a session with the root PID |
| `IOCTL_HEPHAESTUS_DESTROY_SESSION` | `{ session_id: u64 }` | Terminate tracked PIDs, release the job reference |
| `IOCTL_HEPHAESTUS_LIST_PIDS` | in: `{ session_id: u64 }`, out: packed `u32[]` | Enumerate tracked PIDs |

The IOCTL codes and `#[repr(C)]` payload structs are defined in the [`abi`] module
of `src/lib.rs` and **duplicated verbatim** in the user-mode
`hephaestus/src/platform/windows.rs`. There is no shared object between a `.sys`
and a `.dll`, so the two copies must stay byte-for-byte identical.

## The SDK works without the driver

**The driver is optional.** The user-mode Hephaestus SDK detects whether
`\\.\HephaestusDriver` is present at runtime:

- **Driver loaded** → ShellExecute-brokered processes are folded into the job at
  the kernel level; teardown kills a complete tree.
- **Driver absent** (not installed, or unsigned on a Secure Boot machine) →
  Hephaestus silently falls back to the existing **ETW-only** approach plus a
  `TerminateProcess` + `CreateToolhelp32Snapshot` tree-walk sweep. No error, no
  degraded API — just best-effort coverage.

Call `hephaestus::windows_kernel_driver_available()` for UI feedback about which
mode is active.

## Build requirements

This crate is a **separate build artifact** and is deliberately *not* a member of
the `tempest` Cargo workspace (a workspace cannot mix a kernel `cdylib` with the
user-mode staticlib/cdylib Tauri links). It is listed under `exclude` in
`src-tauri/Cargo.toml`, and it **will not compile without a WDK toolchain** —
that is expected.

You need:

- **Windows Driver Kit (WDK)** and the matching Windows SDK/EWDK. `wdk-sys`
  regenerates its FFI bindings from the installed WDK headers at build time.
- The **`x86_64-pc-windows-msvc`** Rust target and the MSVC linker (`link.exe`).
- LLVM/Clang (`libclang`) for `bindgen`, used by `wdk-build`.
- Nightly Rust (the `.cargo/config.toml` uses `build-std` for `core`/`alloc`).
- Optionally `cargo-make` (`cargo install cargo-make`) — the windows-drivers-rs
  tooling ships a `Makefile.toml` that automates the package/inf/stamp steps.

> Binding caveat: a few anonymous-union field accessors and exported symbols in
> `src/lib.rs` follow the names `bindgen` currently emits from the WDK headers.
> If a future WDK renames them, those accessors (marked in the source) are where
> to adjust.

## How to build

With the WDK environment configured (run from the WDK/EWDK developer prompt, or
with `WDKContentRoot` and the SDK on `PATH`):

```sh
cd src-tauri/crates/hephaestus-driver
cargo build --release --target x86_64-pc-windows-msvc
```

The output driver is:

```
target/x86_64-pc-windows-msvc/release/hephaestus_driver.sys
```

(If you use `cargo-make`, `cargo make` produces a packaged driver directory with
the `.sys`, a generated `.inf`, and a symbol file.)

## How to sign for development

Kernel drivers must be signed. For local development, enable test signing and use
a self-signed test certificate:

```powershell
# 1. Put Windows in test-signing mode (reboot required).
bcdedit /set testsigning on
# reboot

# 2. Create a one-off test certificate (once).
$cert = New-SelfSignedCertificate -Type CodeSigningCert `
    -Subject "CN=Hephaestus Test" -CertStoreLocation Cert:\CurrentUser\My
Export-Certificate -Cert $cert -FilePath HephaestusTest.cer

# 3. Sign the .sys with signtool (from the Windows SDK).
signtool sign /v /fd SHA256 /a `
    /n "Hephaestus Test" `
    target\x86_64-pc-windows-msvc\release\hephaestus_driver.sys
```

For **production** you need an EV code-signing certificate and attestation/WHQL
signing through the Microsoft Partner Center — test signing must be **off** on end-user
machines, and Secure Boot rejects test-signed drivers.

## How to load

Register and start the driver as a demand-start kernel service (elevated prompt):

```powershell
sc.exe create HephaestusDriver type= kernel start= demand `
    binpath= C:\full\path\to\hephaestus_driver.sys
sc.exe start HephaestusDriver
```

Note the required spaces after `=` in `sc.exe` arguments. Once started, the device
`\\.\HephaestusDriver` becomes available and Hephaestus picks it up automatically
on the next session it creates.

To stop and remove:

```powershell
sc.exe stop HephaestusDriver
sc.exe delete HephaestusDriver
```

## Scope

This driver does **only** process tracking and Job Object assignment — a small
fraction of a full sandbox. It intentionally does not do filesystem or registry
virtualization, DLL injection, token restriction, or network filtering. Those map
to the longer-term Hephaestus roadmap (WFP callouts, `SepFilterToken`, integrity
levels) and can be layered on incrementally.
