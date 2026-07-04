use thiserror::Error;

/// All errors emitted by Hephaestus.
///
/// Marked `#[non_exhaustive]` so adding new variants is not a breaking change.
#[derive(Debug, Error)]
#[non_exhaustive]
pub enum HephaestusError {
    /// This platform does not have an isolation backend, or a required
    /// OS feature / helper binary is absent.
    #[error("isolation is not available on this platform: {reason}")]
    Unsupported { reason: &'static str },

    /// An error occurred while provisioning the isolation environment.
    #[error("provision failed for environment '{id}': {message}")]
    Provision { id: String, message: String },

    /// An error occurred while preparing a command to run inside the sandbox.
    #[error("command preparation failed: {message}")]
    Prepare { message: String },

    /// An error occurred while tearing down an isolation environment.
    #[error("destroy failed for environment '{id}': {message}")]
    Destroy { id: String, message: String },

    /// The proxy could not start or encountered a fatal error.
    #[error("proxy error: {message}")]
    Proxy { message: String },

    /// The supplied [`EnvironmentSpec`](crate::EnvironmentSpec) is invalid.
    #[error("invalid environment spec: {message}")]
    InvalidSpec { message: String },

    /// The handle was not found. Either it was already destroyed, or it was
    /// created by a different backend instance.
    #[error("isolation handle not found (destroyed or wrong backend)")]
    HandleNotFound,

    /// Transparent wrapper around [`std::io::Error`].
    #[error(transparent)]
    Io(#[from] std::io::Error),
}

impl HephaestusError {
    /// Construct a [`Provision`](Self::Provision) error.
    pub fn provision(id: impl Into<String>, message: impl Into<String>) -> Self {
        Self::Provision { id: id.into(), message: message.into() }
    }

    /// Construct a [`Prepare`](Self::Prepare) error.
    pub fn prepare(message: impl Into<String>) -> Self {
        Self::Prepare { message: message.into() }
    }

    /// Construct a [`Destroy`](Self::Destroy) error.
    pub fn destroy(id: impl Into<String>, message: impl Into<String>) -> Self {
        Self::Destroy { id: id.into(), message: message.into() }
    }

    /// Construct a [`Proxy`](Self::Proxy) error.
    pub fn proxy(message: impl Into<String>) -> Self {
        Self::Proxy { message: message.into() }
    }

    /// Construct an [`InvalidSpec`](Self::InvalidSpec) error.
    pub fn invalid_spec(message: impl Into<String>) -> Self {
        Self::InvalidSpec { message: message.into() }
    }
}
