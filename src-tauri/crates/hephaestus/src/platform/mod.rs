#[cfg(target_os = "macos")]
mod macos;
#[cfg(target_os = "linux")]
mod linux;
#[cfg(target_os = "windows")]
mod windows;

use crate::Isolate;
use std::sync::Arc;

/// Returns the platform-appropriate [`Isolate`] backend.
pub(crate) fn current() -> Arc<dyn Isolate> {
    #[cfg(target_os = "macos")]
    { Arc::new(macos::MacosIsolate::new()) }

    #[cfg(target_os = "linux")]
    { Arc::new(linux::LinuxIsolate::new()) }

    #[cfg(target_os = "windows")]
    { Arc::new(windows::WindowsIsolate::new()) }

    #[cfg(not(any(target_os = "macos", target_os = "linux", target_os = "windows")))]
    { Arc::new(UnsupportedIsolate) }
}

// ─── Fallback for unsupported platforms ──────────────────────────────────────

#[cfg(not(any(target_os = "macos", target_os = "linux", target_os = "windows")))]
struct UnsupportedIsolate;

#[cfg(not(any(target_os = "macos", target_os = "linux", target_os = "windows")))]
impl Isolate for UnsupportedIsolate {
    fn create(
        &self,
        _spec: crate::EnvironmentSpec,
    ) -> Result<crate::IsolateHandle, crate::HephaestusError> {
        Err(crate::HephaestusError::Unsupported {
            reason: "no isolation backend on this platform",
        })
    }

    fn prepare(
        &self,
        _handle: &crate::IsolateHandle,
        _program: &std::ffi::OsStr,
        _args: &[std::ffi::OsString],
    ) -> Result<crate::SandboxedCommand, crate::HephaestusError> {
        Err(crate::HephaestusError::Unsupported {
            reason: "no isolation backend on this platform",
        })
    }

    fn destroy(
        &self,
        _handle: crate::IsolateHandle,
    ) -> Result<(), crate::HephaestusError> {
        Err(crate::HephaestusError::Unsupported {
            reason: "no isolation backend on this platform",
        })
    }

    fn is_available(&self) -> bool {
        false
    }
}

// ─── Lifecycle job dispatch ───────────────────────────────────────────────────

/// Platform-specific storage for a lifecycle-only kill-on-close job.
/// On Windows this is a RAII Job Object handle. On every other platform it is
/// the zero-size unit type — creation and drop are both no-ops.
#[cfg(target_os = "windows")]
pub(crate) use windows::{create_lifecycle_job, is_driver_available, RawLifecycleJob};

#[cfg(not(target_os = "windows"))]
pub(crate) type RawLifecycleJob = ();

#[cfg(not(target_os = "windows"))]
pub(crate) fn create_lifecycle_job(_pid: u32) -> Result<RawLifecycleJob, crate::HephaestusError> {
    Ok(())
}

/// Whether the optional Windows kernel driver is loaded. Always `false` off
/// Windows, where no such driver exists.
#[cfg(not(target_os = "windows"))]
pub(crate) fn is_driver_available() -> bool {
    false
}
