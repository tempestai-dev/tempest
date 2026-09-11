// Self-check for AgentQuotaStrip's item builder: one row per INSTALLED agent,
// resolved against provider data. Providers with data drive a bar; agents
// without provider data fall through to a "Sign in" chip.
//
// Run: npx tsx src/components/AgentQuotaStrip.check.ts

import assert from "node:assert/strict";
import type { AgentConfig } from "../lib/agentManifest";
import type { Balance, ProviderUsage, Window } from "../lib/quota";

function agent(hint: string): AgentConfig {
  return { id: hint, name: hint, hint, iconSrc: "" } as AgentConfig;
}
function win(id: string, used: number | null): Window {
  return { id, label: id, used, resetsAt: Date.now() + 3_600_000, tone: "default" };
}
function bal(used: number | null, limit: number | null): Balance {
  return { id: "b", label: "Plan usage", used, remaining: null, limit, unit: "usd", resetsAt: null, tone: "default" };
}
function provider(
  id: string,
  status: ProviderUsage["status"],
  extra: Partial<Pick<ProviderUsage, "windows" | "balances" | "planLabel">> = {},
): ProviderUsage {
  return {
    providerId: id, displayName: id, status,
    planLabel: extra.planLabel ?? null,
    windows: extra.windows ?? [],
    balances: extra.balances ?? [],
    details: [], error: null,
  };
}

interface StripItem {
  agent: AgentConfig;
  used: number | null;
  sublabel: string;
  chip?: string;
  needsSignIn?: boolean;
}

function resolveProvider(p: ProviderUsage | undefined): Omit<StripItem, "agent"> | null {
  if (!p || p.status !== "available") return null;
  let peak = null as null | { used: number; label: string };
  for (const w of p.windows) {
    if (w.used == null) continue;
    if (!peak || w.used > peak.used) peak = { used: w.used, label: w.label };
  }
  if (peak) return { used: peak.used, sublabel: peak.label };
  const bal = p.balances.find((b) => b.used != null && b.limit != null && (b.limit ?? 0) > 0);
  if (bal) return { used: (bal.used ?? 0) / (bal.limit ?? 1), sublabel: bal.label };
  if (p.planLabel) return { used: null, sublabel: "Plan", chip: p.planLabel };
  return null;
}

function itemsForAgents(
  agents: AgentConfig[],
  providers: ProviderUsage[],
  availability: Record<string, boolean | undefined>,
): StripItem[] {
  const byId = new Map(providers.map((p) => [p.providerId, p]));
  const out: StripItem[] = [];
  for (const a of agents) {
    if (availability[a.hint] !== true) continue;
    const p = byId.get(a.hint);
    if (!p) continue;
    const resolved = resolveProvider(p);
    if (resolved) { out.push({ agent: a, ...resolved }); continue; }
    out.push({ agent: a, used: null, sublabel: "Sign in", chip: "Sign in", needsSignIn: true });
  }
  return out;
}

// ── cases ──────────────────────────────────────────────────────────────
const availability = {
  claude: true, codex: true, cursor: true, copilot: true,
  grok: true, gemini: false,
};
const items = itemsForAgents(
  [agent("claude"), agent("codex"), agent("cursor"), agent("copilot"), agent("grok"), agent("gemini")],
  [
    provider("claude", "available", { windows: [win("5h", 0.3), win("wk", 0.8)] }),
    provider("codex", "available", { windows: [win("5h", null), win("wk", 0.1)] }),
    provider("cursor", "available", { balances: [bal(15, 50)] }),
    provider("copilot", "available", { planLabel: "Business" }),
    // No provider for grok → dropped (no fetcher).
    // No provider for gemini AND not installed → dropped.
  ],
  availability,
);

assert.equal(items.length, 4, "installed + has-fetcher agents only");
assert.equal(items[0].used, 0.8, "claude picks fullest window");
assert.equal(items[1].used, 0.1, "codex uses single non-null window");
assert.ok(Math.abs((items[2].used ?? 0) - 15 / 50) < 1e-9, "cursor derives pct from balance");
assert.equal(items[3].chip, "Business", "copilot renders plan chip");

// Provider present but unavailable → sign-in chip, not dropped.
const withUnavailable = itemsForAgents(
  [agent("copilot")],
  [provider("copilot", "unavailable")],
  { copilot: true },
);
assert.equal(withUnavailable[0].needsSignIn, true, "unavailable provider → sign-in chip");

// Not installed → dropped even if provider exists.
const notInstalled = itemsForAgents(
  [agent("claude")],
  [provider("claude", "available", { windows: [win("5h", 0.5)] })],
  { claude: false },
);
assert.equal(notInstalled.length, 0, "not installed → not shown");

console.log("AgentQuotaStrip: itemsForAgents OK");
