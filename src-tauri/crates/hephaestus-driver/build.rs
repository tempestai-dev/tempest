//! Build script for the Hephaestus kernel driver.
//!
//! `wdk_build::configure_wdk_binary_build` locates the installed WDK, generates
//! the `wdk-sys` bindings against its headers, and emits the linker arguments
//! that turn the crate's `cdylib` into a bootable `.sys` (native subsystem,
//! `DriverEntry` entry point, `/NODEFAULTLIB`, kernel import libraries, etc.).
//!
//! This requires the WDK and matching EWDK/SDK to be installed and discoverable.
//! Without them the build fails fast with a `ConfigError` — that is expected on
//! machines that only build the user-mode SDK.
fn main() -> Result<(), wdk_build::ConfigError> {
    wdk_build::configure_wdk_binary_build()
}
