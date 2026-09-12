// Explicit .ts on the import so this stays node-runnable for
// agentProviders.check.ts, mirroring agentConfig.ts.
import { envKeyRejection } from "./tempestConfig.ts";

// Provider presets — the one-click "point this agent at someone else's endpoint"
// table. Several vendors (MiniMax, Z.ai/GLM, …) sell a coding plan that is not a
// CLI of their own: you keep using Claude Code / Codex / opencode and redirect it
// with a handful of environment variables. Doing that by hand means pasting four
// to seven exact vars into Settings → Agents → env, per agent, and keeping an API
// key in a plaintext blob. This module turns each documented recipe into a named
// preset the user picks, with the key held in the OS keychain.
//
// ── Why this file is BUNDLE-ONLY ────────────────────────────────────────────
// `remoteConfig.ts` (models.json) is an UNSIGNED patch channel, and says plainly
// that the moment such a channel would carry "endpoints, allowlists, commands"
// it must move to signed delivery. A preset is exactly that: it rewrites an
// agent's API base URL and carries the variable that its API key is exported
// into. An attacker who could edit an unsigned providers.json would redirect
// every user's agent traffic — and their key — to their own endpoint.
//
// So presets ship bundled, imported at build time like agents.json's floor, with
// NO fetch channel. `config/providers.json` is data-not-code for readability and
// review, not a live-update surface. Adding a preset is a release, deliberately.
// If this ever needs to update out-of-band it joins agents.json under minisign,
// never models.json's unsigned tier.

/// One agent's variant of a preset. Kept as an object (rather than the env map
/// inline) so a variant can gain fields — a note, a model list — without
/// reshaping every entry.
export interface ProviderVariant {
  env: Record<string, string>;
}

export interface AgentProvider {
  /// Stable key. Also the keychain slot (`byok/<id>`), so one MiniMax key is
  /// shared by every agent pointed at MiniMax.
  id: string;
  label: string;
  /// Icon filename under config/agent-icons/, same convention as an agent entry.
  icon?: string;
  mono?: boolean;
  /// Where the user gets an API key, and the vendor page the recipe came from.
  keyUrl?: string;
  docsUrl?: string;
  /// Per-agent recipes, keyed by manifest agent id. An agent absent from here
  /// has no verified recipe for this provider and is not offered the preset —
  /// the env vars differ per CLI and a guessed one silently breaks auth.
  agents: Record<string, ProviderVariant>;
}

/// The placeholder substituted with the user's API key. The only one supported:
/// a preset is a fixed vendor recipe, not a template language.
export const API_KEY_TOKEN = "{API_KEY}";

// Bound the table defensively even though it is bundled — these values are
// exported into a spawned process's environment, so a typo that slipped through
// review should degrade to "preset dropped", never to a mangled env.
const MAX_VARS = 32;
const MAX_VALUE = 2048;

/// Env values reach a child process, not a shell, so they need no quoting rules.
/// They must still be printable single-line: a stray newline in an env value is
/// how a well-formed var turns into two.
const envValue = (v: unknown): string | undefined =>
  typeof v === "string" && v.length <= MAX_VALUE && /^[\x20-\x7E]*$/.test(v) ? v : undefined;

function variant(v: unknown): ProviderVariant | null {
  if (!v || typeof v !== "object") return null;
  const raw = (v as Record<string, unknown>).env;
  if (!raw || typeof raw !== "object") return null;
  const env: Record<string, string> = {};
  for (const [k, val] of Object.entries(raw as Record<string, unknown>)) {
    // Reuse tempest.yml's deny rules so every env surface agrees on what is
    // dangerous (loader vars, DB-isolation vars, malformed names).
    if (envKeyRejection(k)) continue;
    const value = envValue(val);
    if (value === undefined) continue;
    env[k] = value;
    if (Object.keys(env).length >= MAX_VARS) break;
  }
  return Object.keys(env).length ? { env } : null;
}

const ID_RE = /^[a-z0-9][a-z0-9_-]*$/i;
const ICON_RE = /^[a-z0-9._-]+$/i;

/// Turn one entry of the bundled table into a provider, or null if malformed.
function sanitizeProvider(p: unknown): AgentProvider | null {
  if (!p || typeof p !== "object") return null;
  const e = p as Record<string, unknown>;
  const { id, label } = e;
  if (typeof id !== "string" || !ID_RE.test(id)) return null;
  if (typeof label !== "string" || !label.trim()) return null;

  const agents: Record<string, ProviderVariant> = {};
  if (e.agents && typeof e.agents === "object") {
    for (const [agentId, v] of Object.entries(e.agents as Record<string, unknown>)) {
      if (!ID_RE.test(agentId)) continue;
      const parsed = variant(v);
      if (parsed) agents[agentId] = parsed;
    }
  }
  // A preset with no usable recipe is inert — drop it rather than show the user
  // a provider that can never apply to anything.
  if (!Object.keys(agents).length) return null;

  const out: AgentProvider = { id, label: label.trim(), agents };
  if (typeof e.icon === "string" && ICON_RE.test(e.icon)) out.icon = e.icon;
  if (e.mono === true) out.mono = true;
  // https only, matching the manifest's downloadUrl rule.
  if (typeof e.keyUrl === "string" && /^https:\/\//i.test(e.keyUrl)) out.keyUrl = e.keyUrl;
  if (typeof e.docsUrl === "string" && /^https:\/\//i.test(e.docsUrl)) out.docsUrl = e.docsUrl;
  return out;
}

export function sanitizeProviders(list: unknown): AgentProvider[] {
  if (!Array.isArray(list)) return [];
  return list.map(sanitizeProvider).filter((p): p is AgentProvider => p !== null);
}

/// The presets that have a verified recipe for `agentId`.
export function providersForAgent(list: AgentProvider[], agentId: string): AgentProvider[] {
  return list.filter((p) => p.agents[agentId]);
}

/// Expand a preset into the env map to merge at spawn.
///
/// Returns `{}` — the preset contributes nothing — when there is no recipe for
/// this agent, or when the recipe needs a key and none is stored. That last case
/// is deliberate: exporting a base URL with an empty auth token would point the
/// agent at the vendor and then fail to authenticate, which reads to the user as
/// "Tempest broke my agent" rather than "I haven't pasted my key". Better to
/// leave the agent on its own credentials until the key is there.
export function resolveProviderEnv(
  provider: AgentProvider,
  agentId: string,
  apiKey: string,
): Record<string, string> {
  const recipe = provider.agents[agentId];
  if (!recipe) return {};
  const needsKey = Object.values(recipe.env).some((v) => v.includes(API_KEY_TOKEN));
  if (needsKey && !apiKey) return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(recipe.env)) {
    out[k] = v.split(API_KEY_TOKEN).join(apiKey);
  }
  return out;
}
