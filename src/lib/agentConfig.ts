// Explicit .ts so this stays node-runnable for agentConfig.check.ts (bundler
// resolution + allowImportingTsExtensions make the extension legal everywhere).
import { envKeyRejection } from "./tempestConfig.ts";

// Per-agent launch defaults — set once for an agent TYPE and applied to every
// session of that type, in every project. Global on purpose: an org sets its
// model gateway / proxy / standard flags once for "claude", "codex", … and every
// repo inherits them. Repo-specific overrides live in that repo's `tempest.yml`.
//
// This module is the PURE half — types plus the text ⇄ struct helpers the
// settings UI needs — kept free of store imports so it stays node-testable (see
// agentConfig.check.ts), mirroring agentManifest.ts. The synchronous accessors
// getAgentConfig / setAgentConfig live in runtimeState.ts, next to the blob.

export interface PerAgentConfig {
  /// Extra CLI flags appended to every launch (after the structured session/model
  /// flags, before the prompt).
  args: string[];
  /// Environment merged into every session. Lowest precedence — a repo's
  /// `tempest.yml` env and the reserved `TEMPEST_SESSION` both win over it.
  env: Record<string, string>;
  /// Working subdirectory entered relative to the session's worktree root.
  /// Empty string means the worktree root itself.
  subdir: string;
  /// Selected provider preset id (see agentProviders.ts) — points this agent at
  /// a third-party endpoint (MiniMax, Z.ai, …) via that vendor's documented env
  /// recipe. Absent/empty = the agent's own credentials, unchanged. The API key
  /// is NOT here: it lives in the OS keychain under `byok/<provider>`.
  provider?: string;
}

export const EMPTY_AGENT_CONFIG: PerAgentConfig = { args: [], env: {}, subdir: "" };

/// True when a config carries nothing — used to drop empty rows from the blob.
export const isEmptyAgentConfig = (c: PerAgentConfig): boolean =>
  !c.args.length && !Object.keys(c.env).length && !c.subdir && !c.provider;

// ── text ⇄ structured, for the settings UI ───────────────────────────────────
// Flags are one argument token per line, so a value that contains spaces stays a
// single arg without any quoting rules to get wrong.
export const parseArgs = (text: string): string[] =>
  text.split("\n").map((l) => l.trim()).filter(Boolean);
export const argsToText = (args: string[]): string => args.join("\n");

/// Parse `KEY=VALUE` lines into an env map, rejecting loader / DB-isolation
/// variables and malformed names — reusing `tempest.yml`'s deny rules so both
/// config surfaces agree on what is dangerous. Blank and `#` lines are skipped.
export function parseEnv(text: string): { env: Record<string, string>; warnings: string[] } {
  const env: Record<string, string> = {};
  const warnings: string[] = [];
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq < 1) { warnings.push(`"${line}" is not KEY=VALUE — ignored.`); continue; }
    const k = line.slice(0, eq).trim();
    const v = line.slice(eq + 1).trim();
    const rej = envKeyRejection(k);
    if (rej) { warnings.push(`${k} ${rej} — ignored.`); continue; }
    env[k] = v;
  }
  return { env, warnings };
}
export const envToText = (env: Record<string, string>): string =>
  Object.entries(env).map(([k, v]) => `${k}=${v}`).join("\n");
