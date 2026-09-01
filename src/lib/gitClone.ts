// Pure helpers for the "Clone from remote" feature (tempest#97). No Tauri
// invoke, no React — see tests/README.md. The actual `git clone` runs in
// Rust (src-tauri/src/git_clone.rs); this file only parses the URL the user
// pastes and classifies the raw stderr git returns on failure.

export interface CloneUrlInfo {
  valid: boolean;
  /** Last path segment of the URL, ".git" suffix stripped. "" if unparseable. */
  defaultFolderName: string;
}

// https://host/owner/repo(.git), ssh://git@host/owner/repo(.git), and the
// scp-like git@host:owner/repo(.git) form — covers GitHub, GitLab,
// Bitbucket, and self-hosted servers on any of those three shapes.
const HTTP_SSH_URL = /^(?:https?|ssh):\/\/[^/\s]+\/.+$/i;
const SCP_LIKE_URL = /^[\w.-]+@[\w.-]+:.+$/;

function lastSegment(pathPart: string): string {
  const trimmed = pathPart.replace(/\/+$/, "");
  const segment = trimmed.split("/").pop() ?? "";
  return segment.replace(/\.git$/i, "");
}

export function parseCloneUrl(raw: string): CloneUrlInfo {
  const url = raw.trim();
  if (!url) return { valid: false, defaultFolderName: "" };

  if (HTTP_SSH_URL.test(url)) {
    const afterScheme = url.replace(/^[a-z]+:\/\//i, "");
    const slash = afterScheme.indexOf("/");
    if (slash === -1) return { valid: false, defaultFolderName: "" };
    const name = lastSegment(afterScheme.slice(slash + 1));
    return { valid: name.length > 0, defaultFolderName: name };
  }

  if (SCP_LIKE_URL.test(url)) {
    const colon = url.indexOf(":");
    const name = lastSegment(url.slice(colon + 1));
    return { valid: name.length > 0, defaultFolderName: name };
  }

  return { valid: false, defaultFolderName: "" };
}

export function defaultFolderName(url: string): string {
  return parseCloneUrl(url).defaultFolderName;
}

export type CloneErrorCategory = "auth" | "exists" | "network" | "unknown";

export interface ClassifiedCloneError {
  category: CloneErrorCategory;
  message: string;
}

// Order matters: exists/auth are checked before the more generic network
// patterns since some messages could otherwise overlap.
const EXISTS_PATTERNS = ["already exists and is not an empty directory"];
const AUTH_PATTERNS = [
  "permission denied (publickey)",
  "authentication failed",
  "could not read username",
  "could not read password",
  "terminal prompts disabled",
  "403",
  "repository not found",
];
const NETWORK_PATTERNS = [
  "could not resolve host",
  "failed to connect",
  "connection timed out",
  "network is unreachable",
  "could not resolve proxy",
  "ssl certificate problem",
];

function matchesAny(haystack: string, patterns: string[]): boolean {
  return patterns.some((p) => haystack.includes(p));
}

export function classifyCloneError(stderr: string): ClassifiedCloneError {
  const message = stderr.trim();
  const lower = message.toLowerCase();

  let category: CloneErrorCategory = "unknown";
  if (matchesAny(lower, EXISTS_PATTERNS)) category = "exists";
  else if (matchesAny(lower, AUTH_PATTERNS)) category = "auth";
  else if (matchesAny(lower, NETWORK_PATTERNS)) category = "network";

  return { category, message };
}
