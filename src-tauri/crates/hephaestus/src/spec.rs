use std::path::PathBuf;
use serde::{Deserialize, Serialize};

use crate::HephaestusError;

// ─── SandboxMode ─────────────────────────────────────────────────────────────

/// How the isolation backend handles policy violations.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[non_exhaustive]
pub enum SandboxMode {
    /// Sandbox is disabled. The process runs with full host permissions.
    Off,

    /// Violations are logged to the event stream but never blocked.
    ///
    /// Use this to build an allow-list before switching to [`Enforce`](Self::Enforce).
    Monitor,

    /// All violations are blocked (deny-default policy).
    ///
    /// This is the production mode and the default.
    #[default]
    Enforce,
}

// ─── HostPattern ─────────────────────────────────────────────────────────────

/// A host pattern used by [`NetworkPolicy`] to gate outbound connections.
///
/// # String conversion
///
/// `HostPattern` implements `From<&str>` and `From<String>` with the
/// following conventions:
///
/// | Input              | Parsed as                          |
/// |--------------------|------------------------------------|
/// | `**.example.com`   | `Suffix("example.com")`            |
/// | `*.example.com`    | `Subdomain("example.com")`         |
/// | anything else      | `Exact(value)`                     |
///
/// Use the explicit constructors when you need `Regex`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[non_exhaustive]
pub enum HostPattern {
    /// Case-insensitive exact match against the full hostname.
    Exact(String),

    /// Matches any single-level subdomain of `domain`.
    ///
    /// `Subdomain("example.com")` matches `api.example.com` but not
    /// `deep.api.example.com`.
    Subdomain(String),

    /// Matches `domain` itself and any subdomain at any depth.
    ///
    /// `Suffix("example.com")` matches `example.com`, `api.example.com`,
    /// and `deep.api.example.com`.
    Suffix(String),

    /// An anchored regular expression matched against the full hostname.
    ///
    /// The pattern is implicitly anchored at both ends (`^...$`).
    Regex(String),
}

impl HostPattern {
    /// Exact hostname match.
    pub fn exact(host: impl Into<String>) -> Self {
        Self::Exact(host.into())
    }

    /// Single-level subdomain wildcard (`*.domain`).
    pub fn subdomain(domain: impl Into<String>) -> Self {
        Self::Subdomain(domain.into())
    }

    /// Any-depth suffix match (`**.domain`).
    pub fn suffix(domain: impl Into<String>) -> Self {
        Self::Suffix(domain.into())
    }

    /// Anchored regex pattern.
    pub fn regex(pattern: impl Into<String>) -> Self {
        Self::Regex(pattern.into())
    }
}

impl From<&str> for HostPattern {
    fn from(s: &str) -> Self {
        if let Some(domain) = s.strip_prefix("**.") {
            Self::Suffix(domain.to_string())
        } else if let Some(domain) = s.strip_prefix("*.") {
            Self::Subdomain(domain.to_string())
        } else {
            Self::Exact(s.to_string())
        }
    }
}

impl From<String> for HostPattern {
    fn from(s: String) -> Self {
        Self::from(s.as_str())
    }
}

// ─── NetworkPolicy ────────────────────────────────────────────────────────────

/// Network policy governing outbound connections from an isolation environment.
///
/// The loopback address and the in-process CONNECT proxy are always implicitly
/// reachable regardless of this policy.
///
/// # Example
///
/// ```
/// use hephaestus::{NetworkPolicy, HostPattern};
///
/// let policy = NetworkPolicy::deny_all()
///     .allow(HostPattern::suffix("anthropic.com"))
///     .allow(HostPattern::suffix("github.com"))
///     .allow("registry.npmjs.org");  // From<&str> into HostPattern::Exact
/// ```
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct NetworkPolicy {
    /// Patterns of hosts the sandboxed process may reach.
    ///
    /// An empty list blocks all outbound traffic (except the loopback proxy).
    pub allowed: Vec<HostPattern>,
}

impl NetworkPolicy {
    /// A policy that blocks all outbound traffic.
    pub fn deny_all() -> Self {
        Self { allowed: vec![] }
    }

    /// A policy that allows all outbound traffic.
    ///
    /// Use with care — this gives the process unrestricted network access.
    /// Prefer an explicit allow-list in production.
    pub fn allow_all() -> Self {
        Self { allowed: vec![HostPattern::Regex(".*".into())] }
    }

    /// Add a host pattern to the allow-list.
    ///
    /// Accepts anything that converts to [`HostPattern`], including `&str`
    /// (parsed as exact/subdomain/suffix based on prefix).
    pub fn allow(mut self, pattern: impl Into<HostPattern>) -> Self {
        self.allowed.push(pattern.into());
        self
    }

    /// Returns `true` if this policy would allow the given exact hostname.
    ///
    /// Syntactic check only — `Regex` patterns with non-trivial expressions are
    /// not evaluated. The exception is the `".*"` sentinel produced by
    /// [`allow_all`](Self::allow_all), which is treated as a blanket allow.
    pub fn allows_exact(&self, host: &str) -> bool {
        self.allowed.iter().any(|p| match p {
            HostPattern::Exact(h) => h.eq_ignore_ascii_case(host),
            HostPattern::Subdomain(domain) => {
                host.strip_suffix(domain.as_str())
                    .and_then(|prefix| prefix.strip_suffix('.'))
                    .map(|sub| !sub.contains('.'))
                    .unwrap_or(false)
            }
            HostPattern::Suffix(domain) => {
                host.eq_ignore_ascii_case(domain)
                    || host.ends_with(&format!(".{domain}"))
            }
            // ".*" is the allow-all sentinel from `NetworkPolicy::allow_all()`.
            HostPattern::Regex(r) if r == ".*" => true,
            HostPattern::Regex(_) => false,
        })
    }
}

// ─── PathMount ────────────────────────────────────────────────────────────────

/// A filesystem path exposed inside an isolation environment.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct PathMount {
    /// The host path to expose inside the sandbox.
    pub path: PathBuf,

    /// Whether the sandboxed process may write to this path.
    pub writable: bool,

    /// When `true`, this mount is silently skipped if `path` does not exist
    /// on the host. When `false`, provisioning fails if the path is absent.
    pub optional: bool,
}

impl PathMount {
    /// Mount `path` with read-write access.
    pub fn rw(path: impl Into<PathBuf>) -> Self {
        Self { path: path.into(), writable: true, optional: false }
    }

    /// Mount `path` with read-only access.
    pub fn ro(path: impl Into<PathBuf>) -> Self {
        Self { path: path.into(), writable: false, optional: false }
    }

    /// Mark this mount as optional (silently skipped if the path does not exist).
    #[must_use]
    pub fn optional(mut self) -> Self {
        self.optional = true;
        self
    }
}

// ─── ResourceLimits ──────────────────────────────────────────────────────────

/// Caller-defined resource quotas for an isolation unit.
///
/// All fields are optional. Unset fields are left at OS defaults.
/// Construct via [`ResourceLimits::builder()`] for ergonomic chaining.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[non_exhaustive]
pub struct ResourceLimits {
    /// Maximum resident memory in bytes.
    ///
    /// Maps to cgroups v2 `memory.max` on Linux and
    /// `JOBOBJECT_EXTENDED_LIMIT_INFORMATION.ProcessMemoryLimit` on Windows.
    pub max_memory_bytes: Option<u64>,

    /// CPU scheduling weight (1–10 000). Higher values receive proportionally
    /// more CPU time relative to other cgroups or Job Objects.
    pub cpu_weight: Option<u32>,

    /// Maximum number of concurrent processes in the isolation unit.
    ///
    /// Maps to `RLIMIT_NPROC` on Unix and
    /// `JOBOBJECT_BASIC_LIMIT_INFORMATION.ActiveProcessLimit` on Windows.
    pub max_processes: Option<u32>,

    /// Maximum total bytes the process tree may write to storage during
    /// its lifetime. Platform support varies.
    pub max_disk_write_bytes: Option<u64>,
}

impl ResourceLimits {
    /// Returns a builder for constructing limits ergonomically.
    pub fn builder() -> ResourceLimitsBuilder {
        ResourceLimitsBuilder::default()
    }
}

/// Builder for [`ResourceLimits`].
#[derive(Debug, Default)]
pub struct ResourceLimitsBuilder {
    inner: ResourceLimits,
}

impl ResourceLimitsBuilder {
    /// Set the memory limit in bytes.
    pub fn max_memory_bytes(mut self, bytes: u64) -> Self {
        self.inner.max_memory_bytes = Some(bytes);
        self
    }

    /// Set the CPU scheduling weight (1–10 000).
    pub fn cpu_weight(mut self, weight: u32) -> Self {
        self.inner.cpu_weight = Some(weight);
        self
    }

    /// Set the maximum number of concurrent processes.
    pub fn max_processes(mut self, n: u32) -> Self {
        self.inner.max_processes = Some(n);
        self
    }

    /// Set the maximum bytes the process tree may write to disk.
    pub fn max_disk_write_bytes(mut self, bytes: u64) -> Self {
        self.inner.max_disk_write_bytes = Some(bytes);
        self
    }

    /// Finalize the limits.
    pub fn build(self) -> ResourceLimits {
        self.inner
    }
}

// ─── EnvironmentSpec ─────────────────────────────────────────────────────────

/// Full specification for one isolation environment.
///
/// Construct via [`EnvironmentSpec::builder`]; direct struct construction is
/// intentionally disabled across crate boundaries via `#[non_exhaustive]`.
///
/// # Example
///
/// ```
/// use hephaestus::{EnvironmentSpec, PathMount, SandboxMode};
/// use std::path::PathBuf;
///
/// let spec = EnvironmentSpec::builder("ws-abc", "/home/user/project")
///     .mount(PathMount::rw("/home/user/.cargo").optional())
///     .allow_host("**.anthropic.com")
///     .allow_host("**.github.com")
///     .mode(SandboxMode::Enforce)
///     .build()
///     .unwrap();
/// ```
#[derive(Debug, Clone, Serialize, Deserialize)]
#[non_exhaustive]
pub struct EnvironmentSpec {
    /// Stable identifier for this isolation unit.
    ///
    /// Used as the primary key for all OS-level resources Hephaestus
    /// provisions (profile files, Job Object names, cgroup paths, etc.).
    /// Must be unique within a single backend instance. In Tempest this is
    /// also the Atlas branch ID so the execution environment and the
    /// code-intelligence branch share one key.
    pub id: String,

    /// Root directory of the isolated workspace.
    ///
    /// Always mounted read-write. This is the working directory of the
    /// sandboxed process.
    pub root: PathBuf,

    /// Additional filesystem mounts inside the sandbox.
    pub mounts: Vec<PathMount>,

    /// Network policy governing outbound connections.
    pub network: NetworkPolicy,

    /// Caller-defined resource quotas.
    pub resources: ResourceLimits,

    /// How policy violations are handled.
    pub mode: SandboxMode,
}

impl EnvironmentSpec {
    /// Returns a builder for this spec.
    ///
    /// `id` must be non-empty. `root` must be an absolute path.
    /// These constraints are validated on [`EnvironmentSpecBuilder::build`].
    pub fn builder(
        id: impl Into<String>,
        root: impl Into<PathBuf>,
    ) -> EnvironmentSpecBuilder {
        EnvironmentSpecBuilder {
            id: id.into(),
            root: root.into(),
            mounts: vec![],
            network: NetworkPolicy::deny_all(),
            resources: ResourceLimits::default(),
            mode: SandboxMode::Enforce,
        }
    }
}

// ─── EnvironmentSpecBuilder ──────────────────────────────────────────────────

/// Builder for [`EnvironmentSpec`].
///
/// Obtained via [`EnvironmentSpec::builder`].
#[derive(Debug)]
pub struct EnvironmentSpecBuilder {
    id: String,
    root: PathBuf,
    mounts: Vec<PathMount>,
    network: NetworkPolicy,
    resources: ResourceLimits,
    mode: SandboxMode,
}

impl EnvironmentSpecBuilder {
    /// Add a single filesystem mount.
    pub fn mount(mut self, mount: PathMount) -> Self {
        self.mounts.push(mount);
        self
    }

    /// Add multiple filesystem mounts.
    pub fn mounts(mut self, mounts: impl IntoIterator<Item = PathMount>) -> Self {
        self.mounts.extend(mounts);
        self
    }

    /// Allow a host pattern.
    ///
    /// Accepts anything that converts to [`HostPattern`], including `&str`
    /// with prefix-based parsing (`**.foo.com`, `*.foo.com`, exact).
    pub fn allow_host(mut self, pattern: impl Into<HostPattern>) -> Self {
        self.network.allowed.push(pattern.into());
        self
    }

    /// Replace the entire network policy.
    pub fn network(mut self, policy: NetworkPolicy) -> Self {
        self.network = policy;
        self
    }

    /// Set resource quotas.
    pub fn resources(mut self, limits: ResourceLimits) -> Self {
        self.resources = limits;
        self
    }

    /// Set the sandbox mode.
    pub fn mode(mut self, mode: SandboxMode) -> Self {
        self.mode = mode;
        self
    }

    /// Finalize the spec.
    ///
    /// # Errors
    ///
    /// Returns [`HephaestusError::InvalidSpec`] if:
    /// - `id` is empty, or
    /// - `root` is not an absolute path.
    pub fn build(self) -> Result<EnvironmentSpec, HephaestusError> {
        if self.id.is_empty() {
            return Err(HephaestusError::invalid_spec("environment id must not be empty"));
        }
        if !self.root.is_absolute() {
            return Err(HephaestusError::invalid_spec(format!(
                "root path must be absolute, got: {}",
                self.root.display()
            )));
        }
        Ok(EnvironmentSpec {
            id: self.id,
            root: self.root,
            mounts: self.mounts,
            network: self.network,
            resources: self.resources,
            mode: self.mode,
        })
    }
}

// ─── Backward-compatible alias ────────────────────────────────────────────────

/// Backward-compatible alias for [`EnvironmentSpec`].
pub type BranchSpec = EnvironmentSpec;
