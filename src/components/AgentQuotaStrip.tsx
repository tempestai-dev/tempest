// A compact quota strip that sits next to the Indexed / Isolated badges on the
// right edge of the canvas frame. Three display modes, remembered per user:
//
//   scroll  — a marquee of every available provider (icon + bar + %). Loops
//             infinitely; pauses on hover so a target is readable.
//   all     — every provider inline, compact (icon + %). No scroll.
//   active  — only the current session's agent. Bar or compact via variant.
//
// The existing QuotaIsland still owns the title-bar pill + panel; this is a
// second, quieter surface for glanceable at-a-glance-during-work numbers.

import { useState, useEffect, useRef } from "react";
import { SlidersHorizontal, RefreshCw } from "lucide-react";
import { pct, type ProviderUsage } from "../lib/quota";
import { useQuotas, startQuotaPolling, refreshQuotas } from "../store/quotas";
import { useAgents, type AgentConfig } from "../lib/agentRegistry";
import { useAgentAvailability, checkAgentAvailability } from "../store/agentAvailability";
import { AgentIcon as SharedAgentIcon } from "./NewSessionMenu";
import "./AgentQuotaStrip.css";

type Mode = "scroll" | "all" | "active";
type ActiveVariant = "bar" | "compact";

const MODE_KEY = "tempest.quotaStripMode";
const VARIANT_KEY = "tempest.quotaStripActiveVariant";

function readMode(): Mode {
  const v = typeof localStorage !== "undefined" ? localStorage.getItem(MODE_KEY) : null;
  return v === "all" || v === "active" ? v : "scroll";
}
function readVariant(): ActiveVariant {
  const v = typeof localStorage !== "undefined" ? localStorage.getItem(VARIANT_KEY) : null;
  return v === "compact" ? "compact" : "bar";
}

/// A single row in the strip. `used` is the 0..1 consumed fraction and drives
/// the bar; `null` means the row is a chip — either a plan label ("Business")
/// or a "Sign in" prompt when the agent is installed but we have no data yet.
interface StripItem {
  agent: AgentConfig;
  used: number | null;
  sublabel: string;
  chip?: string;
  /// True when the row is a "please sign in" prompt (no quota data available).
  needsSignIn?: boolean;
}

/// Best usable window/balance/label for a provider, or `null` when the
/// provider has nothing to render. Kept separate from the row builder so
/// missing providers can fall through to a sign-in chip.
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

/// One row per (installed-on-system AND known-fetcher) agent. An agent with no
/// quota fetcher is dropped — the strip only speaks for providers we can
/// actually read; adding phantom rows for uncovered CLIs would misinform the
/// user. Providers whose fetcher runs but returns no data (not signed in)
/// fall through to a "Sign in" chip so the user sees the coverage gap.
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
    if (!p) continue; // no fetcher → don't invent a row
    const resolved = resolveProvider(p);
    if (resolved) { out.push({ agent: a, ...resolved }); continue; }
    out.push({ agent: a, used: null, sublabel: "Sign in", chip: "Sign in", needsSignIn: true });
  }
  return out;
}

function toneClass(used: number): "ok" | "warn" | "crit" {
  return used >= 0.9 ? "crit" : used >= 0.75 ? "warn" : "ok";
}

interface Props {
  /// The hint of the agent driving the active session (e.g. "claude"). Used
  /// only by `active` mode; other modes ignore it.
  activeAgentHint?: string;
}

export function AgentQuotaStrip({ activeAgentHint }: Props) {
  const providers = useQuotas();
  const agents = useAgents();
  const availability = useAgentAvailability();
  useEffect(() => { startQuotaPolling(); checkAgentAvailability(); }, []);

  const [mode, setMode] = useState<Mode>(readMode);
  const [variant, setVariant] = useState<ActiveVariant>(readVariant);
  const [menuOpen, setMenuOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  async function doRefresh() {
    if (refreshing) return;
    setRefreshing(true);
    try { await refreshQuotas(); } finally { setRefreshing(false); }
  }

  useEffect(() => { localStorage.setItem(MODE_KEY, mode); }, [mode]);
  useEffect(() => { localStorage.setItem(VARIANT_KEY, variant); }, [variant]);

  useEffect(() => {
    if (!menuOpen) return;
    function onDown(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setMenuOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [menuOpen]);

  const items = itemsForAgents(agents, providers, availability);
  if (items.length === 0) return null;

  const activeItem =
    mode === "active"
      ? items.find((it) => it.agent.hint === activeAgentHint) ?? null
      : null;

  const controls = (
    <>
      <ModeButton onClick={() => setMenuOpen((v) => !v)} />
      <RefreshButton onClick={doRefresh} refreshing={refreshing} />
      {menuOpen && <ModeMenu mode={mode} setMode={setMode} variant={variant} setVariant={setVariant} />}
    </>
  );

  // active mode + no matching agent → keep controls, drop the row; a stub row
  // reads as broken here since Indexed/Isolated sit next to it.
  if (mode === "active" && !activeItem) return (
    <div className="agent-quota-strip" ref={wrapRef}>{controls}</div>
  );

  return (
    <div className="agent-quota-strip" ref={wrapRef}>
      {mode === "scroll" && <ScrollRow items={items} />}
      {mode === "all" && <AllRow items={items} variant={variant} />}
      {mode === "active" && activeItem && <Item item={activeItem} variant={variant} />}

      {controls}
    </div>
  );
}

function RefreshButton({ onClick, refreshing }: { onClick: () => void; refreshing: boolean }) {
  return (
    <button
      type="button"
      className={`aqs-mode-btn${refreshing ? " aqs-mode-btn--spin" : ""}`}
      onClick={onClick}
      disabled={refreshing}
      aria-label="Refresh agent quotas"
      title="Refresh"
    >
      <RefreshCw size={11} strokeWidth={2} />
    </button>
  );
}

function ModeButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      className="aqs-mode-btn"
      onClick={onClick}
      aria-label="Quota strip display mode"
      title="Display mode"
    >
      <SlidersHorizontal size={11} strokeWidth={2} />
    </button>
  );
}

function ModeMenu({
  mode, setMode, variant, setVariant,
}: {
  mode: Mode; setMode: (m: Mode) => void;
  variant: ActiveVariant; setVariant: (v: ActiveVariant) => void;
}) {
  return (
    <div className="aqs-menu" role="menu">
      <div className="aqs-menu-title">Display</div>
      <MenuRadio label="Scroll all" checked={mode === "scroll"} onSelect={() => setMode("scroll")} />
      <MenuRadio label="Show all" checked={mode === "all"} onSelect={() => setMode("all")} />
      <MenuRadio label="Active only" checked={mode === "active"} onSelect={() => setMode("active")} />
      {(mode === "active" || mode === "all") && (
        <>
          <div className="aqs-menu-title aqs-menu-title--sub">Style</div>
          <MenuRadio label="Bar" checked={variant === "bar"} onSelect={() => setVariant("bar")} />
          <MenuRadio label="Compact" checked={variant === "compact"} onSelect={() => setVariant("compact")} />
        </>
      )}
    </div>
  );
}

function MenuRadio({ label, checked, onSelect }: { label: string; checked: boolean; onSelect: () => void }) {
  return (
    <button
      type="button"
      className={`aqs-menu-item${checked ? " aqs-menu-item--on" : ""}`}
      onClick={onSelect}
      role="menuitemradio"
      aria-checked={checked}
    >
      <span className="aqs-menu-dot" />{label}
    </button>
  );
}

function ScrollRow({ items }: { items: StripItem[] }) {
  // Duplicate the sequence so the translate can loop cleanly; pause on hover
  // via CSS. ponytail: single-track CSS marquee, swap to a virtualized
  // scroller if the roster ever grows past ~30 agents.
  const doubled = [...items, ...items];
  return (
    <div className="aqs-scroll" role="list">
      <div className="aqs-scroll-track" style={{ animationDuration: `${Math.max(12, items.length * 5)}s` }}>
        {doubled.map((it, i) => (
          <Item key={`${it.agent.hint}-${i}`} item={it} variant="bar" />
        ))}
      </div>
    </div>
  );
}

function AllRow({ items, variant }: { items: StripItem[]; variant: ActiveVariant }) {
  return (
    <div className="aqs-compact">
      {items.map((it, i) => (
        <span key={it.agent.hint} className="aqs-compact-cell">
          {i > 0 && <span className="aqs-sep" />}
          <Item item={it} variant={variant} />
        </span>
      ))}
    </div>
  );
}

function AgentIcon({ agent }: { agent: AgentConfig }) {
  return <SharedAgentIcon hint={agent.hint} size={12} className="aqs-icon" />;
}

/// One row — bar or compact for percent items, a small chip for plan-only
/// providers or "Sign in" prompts on installed-but-unfetched agents.
function Item({ item, variant }: { item: StripItem; variant: ActiveVariant }) {
  const { agent, used, sublabel, chip, needsSignIn } = item;
  const displayName = agent.name ?? agent.hint;
  const iconEl = <AgentIcon agent={agent} />;

  if (used == null) {
    return (
      <span
        className={`aqs-item aqs-item--chip${needsSignIn ? " aqs-item--muted" : ""}`}
        title={`${displayName} · ${chip ?? sublabel}`}
      >
        {iconEl}
        <span className="aqs-chip">{chip ?? sublabel}</span>
      </span>
    );
  }

  const p = pct(used);
  const tone = toneClass(used);
  const title = `${displayName} · ${sublabel} · ${p}%`;

  if (variant === "compact") {
    return (
      <span className="aqs-item aqs-item--compact" title={title}>
        {iconEl}
        <span className={`aqs-pct aqs-pct--${tone}`}>{p}% used</span>
      </span>
    );
  }

  return (
    <span className="aqs-item" title={title}>
      {iconEl}
      <span className="aqs-bar-track">
        <span className={`aqs-bar-fill aqs-bar-fill--${tone}`} style={{ width: `${p}%` }} />
      </span>
      <span className={`aqs-pct aqs-pct--${tone}`}>{p}% used</span>
    </span>
  );
}
