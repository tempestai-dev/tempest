import { useState, useEffect, useLayoutEffect, useMemo, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useAgentAvailability } from "../store/agentAvailability";
import { UiIcon } from "../icons/UiIcon";
const TerminalSquare = (p: any) => <UiIcon name="terminal-square" {...p} />;
const Globe = (p: any) => <UiIcon name="globe" {...p} />;
const Waypoints = (p: any) => <UiIcon name="waypoints" {...p} />;
const Download = (p: any) => <UiIcon name="download" {...p} />;
const ChevronDown = (p: any) => <UiIcon name="chevron-down" {...p} />;
const GitBranch = (p: any) => <UiIcon name="git-branch" {...p} />;
const ArrowRight = (p: any) => <UiIcon name="arrow-right" {...p} />;
const Terminal = (p: any) => <UiIcon name="terminal" {...p} />;
const Bot = (p: any) => <UiIcon name="bot" {...p} />;
const Code2 = (p: any) => <UiIcon name="code-2" {...p} />;
const Command = (p: any) => <UiIcon name="command" {...p} />;
const Cpu = (p: any) => <UiIcon name="cpu" {...p} />;
const Zap = (p: any) => <UiIcon name="zap" {...p} />;
const Sparkles = (p: any) => <UiIcon name="sparkles" {...p} />;
const Package = (p: any) => <UiIcon name="package" {...p} />;
const Rocket = (p: any) => <UiIcon name="rocket" {...p} />;
const Wrench = (p: any) => <UiIcon name="wrench" {...p} />;
const Ghost = (p: any) => <UiIcon name="ghost" {...p} />;
const Play = (p: any) => <UiIcon name="play" {...p} />;
import { useAgents, getAgent, getIconDataUrl, remoteIconUrl, type AgentConfig } from "../lib/agentRegistry";

// Curated Lucide icon set for user-added agents. A closed set (not free text)
// so the picker stays scannable and CSP-safe — no runtime dynamic import into
// the full ~1400-icon bundle. Reference by `lucide:<name>` in `AgentConfig.icon`.
const LUCIDE_ICONS: Record<string, React.ComponentType<{ size?: number; className?: string }>> = {
  terminal: Terminal,
  bot: Bot,
  code: Code2,
  command: Command,
  cpu: Cpu,
  zap: Zap,
  sparkles: Sparkles,
  package: Package,
  rocket: Rocket,
  wrench: Wrench,
  ghost: Ghost,
  play: Play,
};
export const LUCIDE_ICON_NAMES = Object.keys(LUCIDE_ICONS);
import type { BranchInfo } from "../types/git";
import "./NewSessionMenu.css";

// The agent type and list live in the registry now (bundled ⊕ verified remote
// manifest). Re-exported here so existing importers keep working unchanged.
export { AGENT_CONFIGS } from "../lib/agentRegistry";
export type { AgentConfig } from "../lib/agentRegistry";

export function AgentIcon({ hint, size, className }: { hint?: string; size: number; className?: string }) {
  useAgents(); // re-render when an icon finishes downloading (setIconDataUrl notifies)
  const [failedSrc, setFailedSrc] = useState<string>();
  const config = getAgent(hint ?? "");
  // Lucide icons for user-added agents render inline (no fetch, no data URL).
  // Checked before the download pipeline so `lucide:*` never looks like a bare
  // filename to `remoteIconUrl`.
  if (config?.icon?.startsWith("lucide:")) {
    const Comp = LUCIDE_ICONS[config.icon.slice("lucide:".length)];
    if (Comp) return <Comp size={size} className={className} />;
  }
  // Prefer a cached (downloaded) icon, then a bundled asset, then the repo URL.
  const src = config
    ? (getIconDataUrl(config.id) ?? (config.iconSrc || remoteIconUrl(config.icon)))
    : undefined;
  // Fall back to Bot only for the src that actually failed. A remote icon is
  // fetched in the background on first run, so an early render can hit the
  // still-downloading URL and error; when the cached data URL lands it is a new
  // src, so we retry it instead of staying stuck on the Bot glyph.
  if (!config || !src || src === failedSrc) return <TerminalSquare size={size} className={className} />;
  const monoClass = config.mono ? "agent-icon--mono" : undefined;
  const combinedClass = [className, monoClass].filter(Boolean).join(" ") || undefined;
  return (
    <img
      key={src}
      src={src}
      width={size}
      height={size}
      className={combinedClass}
      style={{ objectFit: "contain", display: "block", flexShrink: 0 }}
      alt={config.name}
      onError={() => setFailedSrc(src)}
    />
  );
}

export type NewSessionPlacement = "right" | "below";
type Tab = "main" | "branch";

// One row in the Terminal+agents list. Terminal is always first; the rest are
// the agent registry, flattened (no submenu).
type Row = { kind: "terminal" } | { kind: "agent"; agent: AgentConfig; available: boolean };

export interface BranchLaunch {
  agent: AgentConfig | null;
  prompt?: string;
  // The branch to create (new) — ignored when `existingBranch` is set.
  name: string;
  // Present when the user picked an already-existing branch instead of a new one.
  existingBranch?: BranchInfo;
}

interface Props {
  open: boolean;
  anchorRect: DOMRect | null;
  placement?: NewSessionPlacement;
  // Whether the target project is a git repo. Gates the Branch tab and the footer.
  isGitRepo: boolean;
  // Branches available for "Use existing" (fetched by the caller when the menu opens).
  existingBranches: BranchInfo[];
  // Prefix applied to new branch names (from settings), shown as a hint.
  branchPrefix?: string;
  onClose: () => void;
  // Main tab: spawn immediately in the project root. `agent` null = bare terminal.
  onLaunchMain: (agent: AgentConfig | null, prompt?: string) => void;
  // Branch tab: create/use a worktree, then spawn there.
  onLaunchBranch: (launch: BranchLaunch) => void;
  // Workspace-level, tab-agnostic.
  onThread?: () => void;
  onLivePreview?: () => void;
  // Footer: turn the project into a git repo so the Branch tab unlocks.
  onInitGit?: () => void;
}

export function NewSessionMenu({
  open,
  anchorRect,
  placement = "below",
  isGitRepo,
  existingBranches,
  branchPrefix,
  onClose,
  onLaunchMain,
  onLaunchBranch,
  onThread,
  onLivePreview,
  onInitGit,
}: Props) {
  const available = useAgentAvailability();
  const agents = useAgents();

  const [tab, setTab] = useState<Tab>("main");
  const [prompt, setPrompt] = useState("");
  const [useExisting, setUseExisting] = useState(false);
  const [branchName, setBranchName] = useState("");
  const [existingBranchName, setExistingBranchName] = useState("");
  const [dropOpen, setDropOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);

  const menuRef = useRef<HTMLDivElement>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);
  const [clamped, setClamped] = useState<{ top: number; left: number } | null>(null);

  // Terminal first, then the agent registry — one flat list, no submenu.
  const rows = useMemo<Row[]>(() => {
    const agentRows: Row[] = agents
      // Disabled entries (user hid them in Settings → Agents) don't belong in
      // the launcher; existing sessions bound to them keep working. A custom
      // entry mid-edit with no command yet is also skipped — there's nothing
      // to spawn until the user fills it in.
      .filter((agent) => !agent.disabled && !!agent.hint)
      .map((agent) => ({
        kind: "agent" as const,
        agent,
        available: available[agent.hint] !== false, // true until confirmed absent
      }));
    return [{ kind: "terminal" }, ...agentRows];
  }, [agents, available]);

  // Indices arrow-nav is allowed to land on (unavailable agents render but skip).
  const navigable = useMemo(
    () => rows.map((r, i) => (r.kind === "agent" && !r.available ? -1 : i)).filter((i) => i >= 0),
    [rows]
  );

  // Reset to a clean state each time the menu opens.
  useEffect(() => {
    if (!open) return;
    setTab("main");
    setPrompt("");
    setUseExisting(false);
    setBranchName("");
    setExistingBranchName("");
    setDropOpen(false);
    setActiveIdx(navigable[0] ?? 0);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  // The Branch tab needs a target before it can launch.
  const branchReady = useExisting ? !!existingBranchName : !!branchName.trim();
  const pickableBranches = existingBranches.filter((b) => !b.is_current);

  const activate = useCallback(
    (row: Row) => {
      const agent = row.kind === "agent" ? row.agent : null;
      if (row.kind === "agent" && !row.available) return;
      const p = prompt.trim() || undefined;
      if (tab === "main") {
        onClose();
        onLaunchMain(agent, p);
        return;
      }
      // Branch tab.
      if (!isGitRepo) return;
      if (!branchReady) { nameInputRef.current?.focus(); return; }
      const existingBranch = useExisting ? existingBranches.find((b) => b.name === existingBranchName) : undefined;
      onClose();
      onLaunchBranch({ agent, prompt: p, name: branchName.trim(), existingBranch });
    },
    [tab, prompt, isGitRepo, branchReady, useExisting, existingBranches, existingBranchName, branchName, onClose, onLaunchMain, onLaunchBranch]
  );

  // Keyboard: arrow nav over the list (only when focus isn't in a field), Enter
  // activates, Escape closes (or steps a piece back).
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        if (dropOpen) { setDropOpen(false); return; }
        onClose();
        return;
      }
      const target = e.target as HTMLElement;
      const inField = target.tagName === "INPUT" || target.tagName === "TEXTAREA";
      if (inField) return;
      if (!navigable.length) return;
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        const pos = navigable.indexOf(activeIdx);
        const delta = e.key === "ArrowDown" ? 1 : -1;
        const next = (pos + delta + navigable.length) % navigable.length;
        setActiveIdx(navigable[next]);
      } else if (e.key === "Enter") {
        e.preventDefault();
        const row = rows[activeIdx];
        if (row) activate(row);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, dropOpen, navigable, activeIdx, rows, activate, onClose]);

  // Close the existing-branch dropdown on an outside click.
  useEffect(() => {
    if (!dropOpen) return;
    const handler = (e: MouseEvent) => {
      if (dropRef.current && !dropRef.current.contains(e.target as Node)) setDropOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [dropOpen]);

  // Anchor-derived starting position (before viewport clamping).
  const basePos = anchorRect
    ? placement === "right"
      ? { top: anchorRect.top, left: anchorRect.right + 4 }
      : { top: anchorRect.bottom + 2, left: anchorRect.left }
    : { top: 0, left: 0 };

  // Measure the rendered menu and shift it so it never overflows the viewport.
  // Re-runs when tab / branch controls change the height.
  useLayoutEffect(() => {
    if (!open || !anchorRect) { setClamped(null); return; }
    const el = menuRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const margin = 8;
    let { top, left } = basePos;
    if (left + rect.width > window.innerWidth - margin) {
      const flipped = anchorRect.left - rect.width - 4;
      left = flipped >= margin ? flipped : window.innerWidth - rect.width - margin;
    }
    if (top + rect.height > window.innerHeight - margin) {
      top = window.innerHeight - rect.height - margin;
    }
    left = Math.max(margin, left);
    top = Math.max(margin, top);
    if (top !== clamped?.top || left !== clamped?.left) setClamped({ top, left });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, anchorRect, placement, tab, useExisting, isGitRepo, rows.length]);

  if (!open || !anchorRect) return null;

  const pos = clamped ?? basePos;
  // On the Branch tab, dim the launch list until there's a target branch.
  const listDim = tab === "branch" && isGitRepo && !branchReady;

  return createPortal(
    <div className="nsm-overlay" onMouseDown={onClose}>
      <div ref={menuRef} className="nsm" style={pos} onMouseDown={(e) => e.stopPropagation()}>

        {/* Tabs — control where Terminal + agents spawn. */}
        <div className="nsm-tabs" role="tablist">
          <button
            role="tab"
            className={`nsm-tab${tab === "main" ? " nsm-tab--active" : ""}`}
            onClick={() => setTab("main")}
          >
            Main
          </button>
          <button
            role="tab"
            className={`nsm-tab${tab === "branch" ? " nsm-tab--active" : ""}${!isGitRepo ? " nsm-tab--disabled" : ""}`}
            disabled={!isGitRepo}
            title={!isGitRepo ? "Initialize git to open in a branch" : undefined}
            onClick={() => setTab("branch")}
          >
            Branch
          </button>
        </div>

        {/* Branch controls — only meaningful on the Branch tab. */}
        {tab === "branch" && isGitRepo && (
          <div className="nsm-branch">
            <div className="nsm-branch-toggle">
              <button
                className={`nsm-branch-opt${!useExisting ? " nsm-branch-opt--active" : ""}`}
                onClick={() => setUseExisting(false)}
              >New branch</button>
              <button
                className={`nsm-branch-opt${useExisting ? " nsm-branch-opt--active" : ""}${pickableBranches.length === 0 ? " nsm-branch-opt--disabled" : ""}`}
                disabled={pickableBranches.length === 0}
                title={pickableBranches.length === 0 ? "No other branches exist" : undefined}
                onClick={() => setUseExisting(true)}
              >Use existing</button>
            </div>
            {useExisting ? (
              <div className="nsm-drop" ref={dropRef}>
                <button
                  type="button"
                  className={`nsm-input nsm-drop-btn${dropOpen ? " nsm-drop-btn--open" : ""}`}
                  onClick={() => setDropOpen((v) => !v)}
                >
                  <span className={existingBranchName ? "" : "nsm-drop-placeholder"}>
                    {existingBranchName || "Select a branch…"}
                  </span>
                  <ChevronDown size={12} className={`nsm-drop-chevron${dropOpen ? " nsm-drop-chevron--open" : ""}`} />
                </button>
                {dropOpen && (
                  <div className="nsm-drop-menu">
                    {pickableBranches.map((b) => (
                      <button
                        key={b.name}
                        type="button"
                        className={`nsm-drop-item${b.name === existingBranchName ? " nsm-drop-item--active" : ""}`}
                        onClick={() => { setExistingBranchName(b.name); setDropOpen(false); }}
                      >
                        <span className="nsm-drop-item-name">{b.name}</span>
                        {b.is_worktree && <span className="nsm-drop-badge">open</span>}
                        {b.is_remote && <span className="nsm-drop-badge">remote</span>}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="nsm-name-wrap">
                {branchPrefix && <span className="nsm-name-prefix">{branchPrefix}</span>}
                <input
                  ref={nameInputRef}
                  className="nsm-input nsm-name"
                  type="text"
                  placeholder="branch name — e.g. my-feature"
                  value={branchName}
                  onChange={(e) => setBranchName(e.target.value)}
                  autoFocus
                />
              </div>
            )}
          </div>
        )}

        {/* Shared prompt box — sent to the agent on start; ignored for a bare terminal. */}
        <textarea
          className="nsm-prompt"
          placeholder="Optional prompt — sent to the agent on start"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={2}
        />

        {/* Terminal + agents — the launch list. */}
        <div className={`nsm-list${listDim ? " nsm-list--dim" : ""}`}>
          {rows.map((row, i) => {
            const isActive = i === activeIdx;
            if (row.kind === "terminal") {
              return (
                <button
                  key="terminal"
                  className={`nsm-row${isActive ? " nsm-row--active" : ""}`}
                  onMouseMove={() => setActiveIdx(i)}
                  onClick={() => activate(row)}
                >
                  <TerminalSquare size={14} className="nsm-row-icon" />
                  <span className="nsm-row-label">Terminal</span>
                </button>
              );
            }
            const { agent, available: isAvailable } = row;
            return (
              <div
                key={agent.id}
                className={`nsm-row nsm-row--agent${isActive ? " nsm-row--active" : ""}${isAvailable ? "" : " nsm-row--unavailable"}`}
                onMouseMove={() => { if (isAvailable) setActiveIdx(i); }}
              >
                <button className="nsm-row-main" disabled={!isAvailable} onClick={() => activate(row)}>
                  <AgentIcon hint={agent.hint} size={14} className="nsm-row-icon" />
                  <span className="nsm-row-label">{agent.name}</span>
                </button>
                {!isAvailable && agent.downloadUrl && (
                  <button
                    className="nsm-row-dl"
                    title={`Install ${agent.name}`}
                    onClick={(e) => { e.stopPropagation(); openUrl(agent.downloadUrl!).catch(() => {}); }}
                  >
                    <Download size={11} />
                    <span>Install</span>
                  </button>
                )}
              </div>
            );
          })}
        </div>

        {/* Workspace-level actions — tab-agnostic, one row each. */}
        <div className="nsm-sep" />
        <div className="nsm-list">
          <button
            className="nsm-row"
            disabled={!onThread}
            onClick={() => { onThread?.(); onClose(); }}
          >
            <Waypoints size={14} className="nsm-row-icon" />
            <span className="nsm-row-label">Thread</span>
          </button>
          <button
            className="nsm-row"
            disabled={!onLivePreview}
            onClick={() => { onLivePreview?.(); onClose(); }}
          >
            <Globe size={14} className="nsm-row-icon" />
            <span className="nsm-row-label">Live Preview</span>
          </button>
        </div>

        {/* Footer — only when the project isn't a git repo yet. */}
        {!isGitRepo && (
          <div className="nsm-footer">
            <GitBranch size={13} className="nsm-footer-icon" />
            <span className="nsm-footer-text">Not a git repository</span>
            <button className="nsm-footer-btn" disabled={!onInitGit} onClick={() => onInitGit?.()}>
              Initialize <ArrowRight size={11} />
            </button>
          </div>
        )}

      </div>
    </div>,
    document.body
  );
}
