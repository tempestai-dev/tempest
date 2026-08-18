// Title-bar quota island. Below WARN it is a small dot; at WARN or higher it
// opens up and names the fullest window. Hovering (in either state) reveals
// the panel that lists every provider Tempest knows how to read — including
// the ones with no live window (Copilot's plan, Cursor's USD balance), so the
// user always sees the full picture without leaving the title bar.

import { useEffect, useRef, useState } from "react";
import { Loader2, Pin } from "lucide-react";
import {
  CRIT, WARN, formatReset, levelOf, peakQuota, pct,
  windowsFromProviders,
  type Balance, type ProviderUsage, type QuotaWindow, type Window,
} from "../lib/quota";
import { refreshQuotas, startQuotaPolling, useQuotas } from "../store/quotas";
import "./QuotaIsland.css";

const PIN_KEY = "tempest.quotaPin";

export function QuotaIsland() {
  const providers = useQuotas();
  useEffect(() => { startQuotaPolling(); }, []);

  const [pinned, setPinned] = useState<string | null>(
    () => (typeof localStorage !== "undefined" ? localStorage.getItem(PIN_KEY) : null),
  );
  function togglePin(providerId: string) {
    setPinned((cur) => {
      const next = cur === providerId ? null : providerId;
      if (next) localStorage.setItem(PIN_KEY, next); else localStorage.removeItem(PIN_KEY);
      return next;
    });
  }

  const [hover, setHover] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  async function doRefresh() {
    if (refreshing) return;
    setRefreshing(true);
    try { await refreshQuotas(); } finally { setRefreshing(false); }
  }
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Debounced close so the pointer can bridge the ~4px gap between the pill and
  // the popup without collapsing it (same trick the notification island uses).
  function scheduleClose() {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => setHover(false), 120);
  }
  function cancelClose() {
    if (closeTimer.current) { clearTimeout(closeTimer.current); closeTimer.current = null; }
  }

  const windows = windowsFromProviders(providers);
  const pinnedWin = pinned ? peakQuota(windows.filter((w: QuotaWindow) => w.id.startsWith(`${pinned}:`))) : null;
  const peak = pinnedWin ?? peakQuota(windows);
  const level = peak ? levelOf(peak.used) : null;
  const anyProvider = providers.some((p) => p.status !== "unavailable");

  // Nothing signed in and no data on hand → don't render at all. An empty pill
  // reads as broken; absence reads as "no quota providers configured".
  if (!anyProvider) return null;

  const expanded = hover || (level && level !== "ok") || !!pinnedWin;

  return (
    <div className="quota-island-wrap"
         onMouseEnter={() => { cancelClose(); setHover(true); }}
         onMouseLeave={scheduleClose}>
      <button
        type="button"
        className={`quota-island quota-island--${level ?? "idle"}${expanded ? " quota-island--open" : ""}`}
        aria-label="Agent quota"
        onClick={() => { setHover((v) => !v); void doRefresh(); }}
      >
        <span className={`quota-dot quota-dot--${level ?? "idle"}`} />
        {expanded && peak && (
          <>
            <span className="quota-label">{peak.label}</span>
            <span className="quota-pct">{pct(peak.used)}%</span>
          </>
        )}
      </button>
      {hover && (
        <div className="quota-panel"
             onMouseEnter={cancelClose}
             onMouseLeave={scheduleClose}>
          <div className="quota-panel-head">
            <span>Agent quotas</span>
            <button className="quota-refresh" onClick={() => void doRefresh()} type="button" disabled={refreshing}>
              {refreshing && <Loader2 size={11} className="quota-refresh-spin" />}
              {refreshing ? "Refreshing" : "Refresh"}
            </button>
          </div>
          {providers.map((p) => (
            <ProviderRow key={p.providerId} p={p} pinned={pinned === p.providerId} onPin={() => togglePin(p.providerId)} />
          ))}
        </div>
      )}
    </div>
  );
}

function ProviderRow({ p, pinned, onPin }: { p: ProviderUsage; pinned: boolean; onPin: () => void }) {
  const canPin = p.status === "available" && p.windows.some((w) => w.used != null);
  return (
    <div className={`quota-row quota-row--${p.status}`}>
      <div className="quota-row-head">
        <span className="quota-row-name">{p.displayName}</span>
        {canPin && (
          <button
            type="button"
            className={`quota-pin${pinned ? " quota-pin--on" : ""}`}
            aria-label={pinned ? "Unpin from title bar" : "Pin to title bar"}
            aria-pressed={pinned}
            title={pinned ? "Unpin from title bar" : "Pin to title bar"}
            onClick={onPin}
          >
            <Pin size={11} fill={pinned ? "currentColor" : "none"} strokeWidth={1.75} />
          </button>
        )}
        {p.planLabel && <span className="quota-row-plan">{p.planLabel}</span>}
        <StatusChip p={p} />
      </div>
      {p.error && <div className="quota-row-err">{p.error}</div>}
      {p.windows.map((w) => <WindowBar key={w.id} w={w} />)}
      {p.balances.map((b) => <BalanceLine key={b.id} b={b} />)}
      {p.details.map((d, i) => (
        <div key={i} className="quota-row-detail">
          <span>{d.label}</span><span>{d.value}</span>
        </div>
      ))}
    </div>
  );
}

function StatusChip({ p }: { p: ProviderUsage }) {
  if (p.status === "available") return null;
  return <span className={`quota-chip quota-chip--${p.status}`}>
    {p.status === "unavailable" ? "not signed in" : "error"}
  </span>;
}

function WindowBar({ w }: { w: Window }) {
  const used = w.used ?? 0;
  return (
    <div className="quota-bar-wrap">
      <div className="quota-bar-line">
        <span className="quota-bar-label">{w.label}</span>
        <span className="quota-bar-meta">
          {w.used != null && <span className={`quota-bar-pct quota-bar-pct--${toneClass(used)}`}>{pct(used)}%</span>}
          {w.resetsAt != null && <span className="quota-bar-reset">{formatReset(w.resetsAt)}</span>}
        </span>
      </div>
      <div className="quota-bar-track">
        <div className={`quota-bar-fill quota-bar-fill--${toneClass(used)}`}
             style={{ width: `${pct(used)}%` }} />
      </div>
    </div>
  );
}

function BalanceLine({ b }: { b: Balance }) {
  const parts: string[] = [];
  if (b.used != null) parts.push(`used ${formatAmount(b.used, b.unit)}`);
  if (b.remaining != null) parts.push(`${formatAmount(b.remaining, b.unit)} left`);
  if (b.limit != null) parts.push(`of ${formatAmount(b.limit, b.unit)}`);
  return (
    <div className="quota-row-detail">
      <span>{b.label}</span>
      <span>
        {parts.join(" · ") || "—"}
        {b.resetsAt != null && <span className="quota-bar-reset"> · {formatReset(b.resetsAt)}</span>}
      </span>
    </div>
  );
}

function formatAmount(n: number, unit: string): string {
  if (unit === "usd") return `$${n.toFixed(2)}`;
  return `${Math.round(n).toLocaleString()} ${unit}`;
}

function toneClass(used: number): "ok" | "warn" | "crit" {
  return used >= CRIT ? "crit" : used >= WARN ? "warn" : "ok";
}
