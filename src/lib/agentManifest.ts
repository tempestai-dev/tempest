// Pure types + validation/merge for the agent registry, kept free of React and
// asset imports so it is unit-testable on its own (see agentManifest.check.ts).
//
// `agents.json` is the single source of truth for every agent — the same file is
// imported at build time as the always-present floor AND re-downloaded (signed)
// at runtime to override it. This module turns manifest entries into the
// AgentConfig shape the rest of the app already consumes. It is the boundary an
// untrusted-until-verified manifest crosses before it can influence a spawn, so
// the parsing is defensive.

export interface CaptureSpec {
  /// Regex source that pulls a session id out of raw PTY output.
  pattern: string;
  /// Optional flags, restricted to the standard set.
  flags?: string;
  /// Resume args once the id is captured; "{UUID}" is substituted.
  resume?: string[];
}

export interface AgentConfig {
  /// Stable key (manifest `id`). Keys the icon cache and the merge-by-id.
  id: string;
  name: string;
  hint: string; // CLI command (may be multi-token, e.g. "gh copilot")
  /// Resolved bundled-asset URL, filled by the registry from the icon key. Empty
  /// when the icon is a remote URL (then `icon` holds it) or absent.
  iconSrc: string;
  /// Raw manifest icon reference: a bundled-asset key (e.g. "claude") or an https
  /// URL. The registry resolves keys to bundled assets; URLs are downloaded.
  icon?: string;
  mono?: boolean; // true = monochrome SVG; AgentIcon inverts it in dark mode
  // Args used the FIRST time an agent spawns. "{UUID}" → a freshly minted session
  // id so the exact conversation can be resumed. null when the agent has none.
  sessionIdArgs: string[] | null;
  // Args used when RESUMING. "{UUID}" → the stored conversation id. null when the
  // agent cannot be resumed by id (it manages sessions internally).
  resumeArgs: string[] | null;
  // Args carrying the chosen model. "{MODEL}" is substituted. null/absent when the
  // agent takes no model flag.
  modelArgs?: string[] | null;
  // For agents that mint their own session id and print it to PTY output (e.g.
  // opencode). Compiled by `mergeAgents` from a manifest `capture` spec; kept as a
  // RegExp because that is what the spawn path consumes.
  capturePattern?: RegExp;
  captureResumeArgs?: string[] | null;
  // CLI flags appended when the user's local Auto setting is on. The manifest
  // supplies only the syntax; agentArgs.ts decides application — a manifest can
  // never force Auto on.
  autoApproveArgs?: string[];
  // Headless / print flags for one-shot non-interactive runs (e.g. claude -p
  // "prompt"). Automations require this — an interactive-only agent has no safe
  // way to receive a prompt without a TTY. "{PROMPT}" is substituted.
  printArgs?: string[];
  // URL to download/install the agent when it isn't on PATH.
  downloadUrl?: string;
  // User-added local agent (Settings → Agents → Add). Bundled + signed-remote
  // entries have this false/absent. Only custom entries are removable from
  // the UI and only their fields are freely editable.
  custom?: boolean;
  // User toggle: hide from launchers and pickers without deleting. Absent = shown.
  disabled?: boolean;
  // Informational: id of the agent this one was cloned from. No behavior; just
  // shown in the settings header so the lineage is visible.
  extends?: string;
  // Text sent to the agent's PTY to reset its conversation context (e.g.
  // "/clear" for Claude Code, "/new" for agents that start a fresh chat). Used
  // by the Message Queue's Add-clear button to be agent-aware. Omit to hide the
  // button. Sourced from each agent's documented slash-command set — the REPL
  // commands the binary's own `--help` describes, or the /help output.
  clearCommand?: string;
}

/// A validated manifest entry. It PATCHES an agent of the same id (so an override
/// keeps unspecified bundled fields) or defines a new one. Carries the capture
/// SPEC (serializable) rather than a compiled RegExp so it survives the cache.
export type RemotePatch = Partial<Omit<AgentConfig, "capturePattern">> & {
  id: string;
  name: string;
  hint: string;
  capture?: CaptureSpec;
};

// The `command` reaches a shell UNQUOTED in the spawn path (create_pty_session),
// so it must be a bare token — or a few space-separated tokens like "gh copilot"
// — with no shell metacharacters. Signing gates who can change the manifest; this
// stops an honest typo from becoming a shell injection.
export const CMD_RE = /^[A-Za-z0-9_.-]+( [A-Za-z0-9_.-]+)*$/;

const strList = (v: unknown): string[] | null =>
  Array.isArray(v) && v.every((x) => typeof x === "string") ? (v as string[]) : null;

// Icon is a bare filename or key — a bundled-asset key (e.g. "claude") or a file
// committed to the Tempest repo (e.g. "amp.svg"). No scheme or slash, so an icon
// can never point at a third-party host: the registry resolves it to a bundled
// asset or a jsDelivr URL into Tempest's own repo.
const iconRef = (v: unknown): string | undefined =>
  typeof v === "string" && /^[a-z0-9._-]+$/i.test(v) ? v : undefined;

function captureSpec(v: unknown): CaptureSpec | undefined {
  if (!v || typeof v !== "object") return undefined;
  const o = v as Record<string, unknown>;
  // Cap the source length — a signed regex is trusted, but a bounded one can't
  // be a runaway either.
  if (typeof o.pattern !== "string" || o.pattern.length > 2000) return undefined;
  const spec: CaptureSpec = { pattern: o.pattern };
  if (typeof o.flags === "string" && /^[gimsuy]*$/.test(o.flags)) spec.flags = o.flags;
  const resume = strList(o.resume);
  if (resume) spec.resume = resume;
  return spec;
}

/// Compile a capture spec to a RegExp, or undefined if it doesn't compile.
function compileCapture(spec: CaptureSpec): RegExp | undefined {
  try {
    return new RegExp(spec.pattern, spec.flags ?? "");
  } catch {
    return undefined;
  }
}

/// Turn one untrusted manifest entry into a `RemotePatch`, or `null` if malformed
/// or asking for an unknown adapter. Only the generic "cli" adapter is accepted —
/// a new execution model needs a bundled adapter shipped via release.
function sanitizeEntry(a: unknown): RemotePatch | null {
  if (!a || typeof a !== "object") return null;
  const e = a as Record<string, unknown>;
  const { id, name, command } = e;
  if (typeof id !== "string" || typeof name !== "string" || typeof command !== "string") return null;
  if (!CMD_RE.test(command)) return null;
  if (e.adapter !== undefined && e.adapter !== "cli") return null;

  const f = (e.flags && typeof e.flags === "object" ? e.flags : {}) as Record<string, unknown>;
  const patch: RemotePatch = { id, name, hint: command };
  const icon = iconRef(e.icon);
  if (icon) patch.icon = icon;
  if (e.mono === true) patch.mono = true;
  const session = strList(f.session);
  if (session) patch.sessionIdArgs = session;
  const resume = strList(f.resume);
  if (resume) patch.resumeArgs = resume;
  const model = strList(f.model);
  if (model) patch.modelArgs = model;
  const autoApprove = strList(f.autoApprove);
  if (autoApprove) patch.autoApproveArgs = autoApprove;
  const print = strList(f.print);
  if (print) patch.printArgs = print;
  const dl = typeof e.downloadUrl === "string" && /^https:\/\//i.test(e.downloadUrl) ? e.downloadUrl : undefined;
  if (dl) patch.downloadUrl = dl;
  const capture = captureSpec(e.capture);
  if (capture) patch.capture = capture;
  const clear = clearCmd(e.clearCommand);
  if (clear) patch.clearCommand = clear;
  return patch;
}

// A clear command reaches the agent's PTY verbatim followed by a carriage
// return. Bounded and printable so a stray manifest value can't smuggle
// control sequences.
const clearCmd = (v: unknown): string | undefined => {
  if (typeof v !== "string") return undefined;
  const s = v.trim();
  if (!s || s.length > 64) return undefined;
  // Printable ASCII only — no controls, no newlines.
  return /^[\x20-\x7E]+$/.test(s) ? s : undefined;
};

export function sanitizeManifestAgents(list: unknown): RemotePatch[] {
  if (!Array.isArray(list)) return [];
  return list.map(sanitizeEntry).filter((a): a is RemotePatch => a !== null);
}

// Icons for user-added agents may also be a "lucide:name" reference — a bundled
// icon-set key that AgentIcon renders as an inline SVG. Keeps user icons offline
// and CSP-clean without any download step. Never accepted from the signed
// manifest so remote entries always resolve through the standard icon pipeline.
const iconRefLocal = (v: unknown): string | undefined => {
  if (typeof v !== "string") return undefined;
  if (/^lucide:[a-z0-9-]+$/i.test(v)) return v;
  return iconRef(v);
};

/// Sanitize a single user-added agent. Same validation as the signed manifest,
/// with two extras: `lucide:*` icon refs are allowed, and the `custom: true`
/// marker is always stamped on so the merge path can tell local entries apart
/// from bundled/remote ones.
export function sanitizeCustomAgent(a: unknown): RemotePatch | null {
  if (!a || typeof a !== "object") return null;
  const e = a as Record<string, unknown>;
  const { id, name, hint } = e;
  if (typeof id !== "string" || !/^[a-z0-9][a-z0-9_-]*$/i.test(id)) return null;
  if (typeof name !== "string" || !name.trim()) return null;
  // Custom entries may be saved with an empty `hint` while the user is still
  // filling in the form; the launcher hides them until it validates. A
  // NON-empty hint that fails CMD_RE is still a spawn-injection risk → drop.
  if (typeof hint !== "string") return null;
  if (hint !== "" && !CMD_RE.test(hint)) return null;

  const patch: RemotePatch & { custom: true } = { id, name: name.trim(), hint, custom: true };
  const icon = iconRefLocal(e.icon);
  if (icon) patch.icon = icon;
  if (e.mono === true) patch.mono = true;
  const session = strList(e.sessionIdArgs);
  if (session) patch.sessionIdArgs = session;
  const resume = strList(e.resumeArgs);
  if (resume) patch.resumeArgs = resume;
  const model = strList(e.modelArgs);
  if (model) patch.modelArgs = model;
  const autoApprove = strList(e.autoApproveArgs);
  if (autoApprove) patch.autoApproveArgs = autoApprove;
  const print = strList(e.printArgs);
  if (print) patch.printArgs = print;
  const dl = typeof e.downloadUrl === "string" && /^https:\/\//i.test(e.downloadUrl) ? e.downloadUrl : undefined;
  if (dl) patch.downloadUrl = dl;
  const capture = captureSpec(e.capture);
  if (capture) patch.capture = capture;
  if (e.disabled === true) patch.disabled = true;
  if (typeof e.extends === "string" && e.extends) patch.extends = e.extends;
  const clear = clearCmd(e.clearCommand);
  if (clear) patch.clearCommand = clear;
  return patch;
}

/// Sanitize the whole custom-agents array read out of persisted state.
export function sanitizeCustomAgents(list: unknown): RemotePatch[] {
  if (!Array.isArray(list)) return [];
  return list.map(sanitizeCustomAgent).filter((a): a is RemotePatch => a !== null);
}

/// Re-guard patches loaded from the local cache: identity + `hint` shape. Capture
/// stays as a spec (it round-trips as JSON; the RegExp is compiled at merge).
export function sanitizeCachedPatches(raw: unknown): RemotePatch[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((a) => a && typeof a.id === "string" && typeof a.name === "string"
      && typeof a.hint === "string" && CMD_RE.test(a.hint))
    .map((a) => a as RemotePatch);
}

// Defaults for a brand-new agent (no base to inherit from).
const NEW_AGENT_DEFAULTS = {
  iconSrc: "",
  sessionIdArgs: null,
  resumeArgs: null,
  captureResumeArgs: null,
} as const;

/// Overlay patches onto a base list by id, compiling capture specs to RegExps.
/// A patch keeps the base's unspecified fields, so an override needn't re-supply
/// the icon or capture. Used both to build the bundled floor (base `[]`) and to
/// apply the downloaded manifest over it.
export function mergeAgents(base: AgentConfig[], patches: RemotePatch[]): AgentConfig[] {
  const byId = new Map<string, AgentConfig>(base.map((a) => [a.id, a]));
  for (const patch of patches) {
    const prev = byId.get(patch.id);
    const { capture, ...rest } = patch;
    const capturePattern = capture ? compileCapture(capture) : prev?.capturePattern;
    const captureResumeArgs = capture?.resume ?? prev?.captureResumeArgs ?? null;
    byId.set(patch.id, {
      ...(prev ?? NEW_AGENT_DEFAULTS),
      ...rest,
      capturePattern,
      captureResumeArgs,
    } as AgentConfig);
  }
  return [...byId.values()];
}

/// `a >= b` for dotted numeric versions (e.g. "0.1.6"). Non-numeric or missing
/// segments compare as 0, so "0.2" >= "0.1.9". Good enough to gate minAppVersion.
export function versionGte(a: string, b: string): boolean {
  const pa = a.split(".").map((n) => parseInt(n, 10) || 0);
  const pb = b.split(".").map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d > 0;
  }
  return true;
}
