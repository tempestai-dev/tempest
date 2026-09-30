import { useState, useEffect, useLayoutEffect, useMemo, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useAgentAvailability } from "../store/agentAvailability";
import { AgentIcon, type AgentConfig } from "./NewSessionMenu";
import type { NewSessionPlacement } from "./NewSessionMenu";
import { useAgents } from "../lib/agentRegistry";
import { UiIcon } from "../icons/UiIcon";
const TerminalSquare = (p: any) => <UiIcon name="terminal-square" {...p} />;
const Globe = (p: any) => <UiIcon name="globe" {...p} />;
const Download = (p: any) => <UiIcon name="download" {...p} />;
import "./BranchSessionMenu.css";

// ─────────────────────────────────────────────────────────────────────────────
// BranchSessionMenu — the branch-level "+" dropdown.
//
// Same flat shape as NewSessionMenu (project dropdown): a shared optional
// prompt textarea at the top; clicking an agent spawns immediately with that
// prompt. No second-step panel — the branch is already known.
// ─────────────────────────────────────────────────────────────────────────────

interface Props {
  open: boolean;
  anchorRect: DOMRect | null;
  placement?: NewSessionPlacement;
  // Label of the branch these sessions spawn into (e.g. "main", "feature-x").
  branchLabel?: string;
  onClose: () => void;
  onTerminal: () => void;
  onAgent: (agent: AgentConfig, prompt?: string) => void;
  onLivePreview: () => void;
}

type NavItem =
  | { kind: "terminal" }
  | { kind: "agent"; agent: AgentConfig; available: boolean }
  | { kind: "preview" };

export function BranchSessionMenu({
  open,
  anchorRect,
  placement = "right",
  branchLabel,
  onClose,
  onTerminal,
  onAgent,
  onLivePreview,
}: Props) {
  const available = useAgentAvailability();
  const agents = useAgents();
  const [prompt, setPrompt] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const menuRef = useRef<HTMLDivElement>(null);
  const [clamped, setClamped] = useState<{ top: number; left: number } | null>(null);

  const items = useMemo<NavItem[]>(() => {
    const agentItems: NavItem[] = agents
      .filter((a) => !a.disabled && !!a.hint)
      .map((agent) => ({
        kind: "agent" as const,
        agent,
        available: available[agent.hint] !== false,
      }));
    return [{ kind: "terminal" }, ...agentItems, { kind: "preview" }];
  }, [agents, available]);

  const navigable = useMemo(
    () => items.map((it, i) => (it.kind === "agent" && !it.available ? -1 : i)).filter((i) => i >= 0),
    [items]
  );

  useEffect(() => {
    if (open) {
      setPrompt("");
      setActiveIndex(navigable[0] ?? 0);
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const activate = useCallback(
    (item: NavItem) => {
      const p = prompt.trim() || undefined;
      switch (item.kind) {
        case "terminal":
          onClose();
          onTerminal();
          break;
        case "agent":
          if (!item.available) return;
          onClose();
          onAgent(item.agent, p);
          break;
        case "preview":
          onClose();
          onLivePreview();
          break;
      }
    },
    [prompt, onClose, onTerminal, onAgent, onLivePreview]
  );

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      const target = e.target as HTMLElement;
      const inField = target.tagName === "INPUT" || target.tagName === "TEXTAREA";
      if (inField) return;
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        const pos = navigable.indexOf(activeIndex);
        const delta = e.key === "ArrowDown" ? 1 : -1;
        const nextPos = (pos + delta + navigable.length) % navigable.length;
        setActiveIndex(navigable[nextPos]);
      } else if (e.key === "Enter") {
        e.preventDefault();
        const item = items[activeIndex];
        if (item) activate(item);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, activeIndex, navigable, items, activate, onClose]);

  const basePos = anchorRect
    ? placement === "right"
      ? { top: anchorRect.top, left: anchorRect.right + 4 }
      : { top: anchorRect.bottom + 2, left: anchorRect.left }
    : { top: 0, left: 0 };

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
  }, [open, anchorRect, placement, items]);

  if (!open || !anchorRect) return null;

  const pos = clamped ?? basePos;

  return createPortal(
    <div className="bsm-overlay" onMouseDown={onClose}>
      <div
        ref={menuRef}
        className="bsm"
        style={pos}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {branchLabel && (
          <div className="bsm-header">
            <span className="bsm-header-label">New session in</span>
            <span className="bsm-header-branch">{branchLabel}</span>
          </div>
        )}

        <textarea
          className="bsm-prompt"
          placeholder="Optional prompt — sent to the agent on start"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={2}
        />

        {items.map((item, i) => {
          const isActive = i === activeIndex;
          if (item.kind === "terminal") {
            return (
              <button
                key="terminal"
                className={`bsm-item${isActive ? " bsm-item--active" : ""}`}
                onMouseEnter={() => setActiveIndex(i)}
                onClick={() => activate(item)}
              >
                <TerminalSquare size={14} className="bsm-item-icon" />
                <span className="bsm-item-label">Terminal</span>
                <span className="bsm-item-hint">shell</span>
              </button>
            );
          }
          if (item.kind === "agent") {
            const { agent, available: isAvailable } = item;
            return (
              <div
                key={agent.id}
                className={`bsm-item bsm-item--agent${isActive ? " bsm-item--active" : ""}${isAvailable ? "" : " bsm-item--unavailable"}`}
                onMouseEnter={() => { if (isAvailable) setActiveIndex(i); }}
              >
                <button
                  className="bsm-item-main"
                  disabled={!isAvailable}
                  onClick={() => activate(item)}
                >
                  <AgentIcon hint={agent.hint} size={14} className="bsm-item-icon" />
                  <span className="bsm-item-label">{agent.name}</span>
                  <span className="bsm-item-hint">{agent.hint}</span>
                </button>
                {!isAvailable && agent.downloadUrl && (
                  <button
                    className="bsm-item-dl"
                    title={`Install ${agent.name}`}
                    onClick={(e) => { e.stopPropagation(); openUrl(agent.downloadUrl!).catch(() => {}); }}
                  >
                    <Download size={11} />
                  </button>
                )}
              </div>
            );
          }
          return (
            <button
              key="preview"
              className={`bsm-item${isActive ? " bsm-item--active" : ""}`}
              onMouseEnter={() => setActiveIndex(i)}
              onClick={() => activate(item)}
            >
              <Globe size={14} className="bsm-item-icon" />
              <span className="bsm-item-label">Live Preview</span>
              <span className="bsm-item-hint">browser</span>
            </button>
          );
        })}
      </div>
    </div>,
    document.body
  );
}
