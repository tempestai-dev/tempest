import { useState, useEffect, useLayoutEffect, useMemo, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useAgentAvailability } from "../store/agentAvailability";
import { AGENT_CONFIGS, type AgentConfig } from "./NewSessionMenu";
import type { NewSessionPlacement } from "./NewSessionMenu";
import { TerminalSquare, MessageSquare, Globe, Download, CornerDownLeft, ArrowLeft } from "lucide-react";
import "./BranchSessionMenu.css";

// ─────────────────────────────────────────────────────────────────────────────
// BranchSessionMenu — the branch-level "+" dropdown.
//
// Unlike NewSessionMenu (project-level), this menu already knows WHICH worktree
// the session belongs to, so picking an item spawns immediately in that branch —
// no worktree-creation / "new branch vs existing" modal. The only secondary step
// is an optional initial prompt for agent sessions, handled inline by the
// composable <AgentPromptPanel> below.
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
  onChat: () => void;
  onLivePreview: () => void;
}

// One navigable row in the flat keyboard list.
type NavItem =
  | { kind: "terminal" }
  | { kind: "agent"; agent: AgentConfig; available: boolean }
  | { kind: "chat" }
  | { kind: "preview" };

export function BranchSessionMenu({
  open,
  anchorRect,
  placement = "right",
  branchLabel,
  onClose,
  onTerminal,
  onAgent,
  onChat,
  onLivePreview,
}: Props) {
  const available = useAgentAvailability();
  const [view, setView] = useState<"menu" | "prompt">("menu");
  const [promptAgent, setPromptAgent] = useState<AgentConfig | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const menuRef = useRef<HTMLDivElement>(null);
  // Final on-screen position, clamped into the viewport after measuring the
  // rendered menu. Starts from the anchor-derived guess and is corrected in a
  // layout effect (before paint) so the menu never overflows the edges.
  const [clamped, setClamped] = useState<{ top: number; left: number } | null>(null);

  // Flat list of every row, in render order. Unavailable agents stay in the list
  // (so they render) but are skipped by keyboard navigation.
  const items = useMemo<NavItem[]>(() => {
    const agentItems: NavItem[] = AGENT_CONFIGS.map((agent) => ({
      kind: "agent" as const,
      agent,
      available: available[agent.hint] !== false, // true until confirmed absent
    }));
    return [{ kind: "terminal" }, ...agentItems, { kind: "chat" }, { kind: "preview" }];
  }, [available]);

  // Indices that Arrow navigation is allowed to land on.
  const navigable = useMemo(
    () => items.map((it, i) => (it.kind === "agent" && !it.available ? -1 : i)).filter((i) => i >= 0),
    [items]
  );

  // Reset to a clean state every time the menu opens.
  useEffect(() => {
    if (open) {
      setView("menu");
      setPromptAgent(null);
      setActiveIndex(navigable[0] ?? 0);
      setClamped(null); // re-measure against the new anchor before paint
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const activate = useCallback(
    (item: NavItem) => {
      switch (item.kind) {
        case "terminal":
          onClose();
          onTerminal();
          break;
        case "agent":
          if (!item.available) return;
          // Transition to the inline prompt step rather than closing.
          setPromptAgent(item.agent);
          setView("prompt");
          break;
        case "chat":
          onClose();
          onChat();
          break;
        case "preview":
          onClose();
          onLivePreview();
          break;
      }
    },
    [onClose, onTerminal, onChat, onLivePreview]
  );

  // Keyboard: arrow navigation within the menu view; Escape closes (or, in the
  // prompt view, steps back). The prompt view owns its own key handling.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        if (view === "prompt") { setView("menu"); return; }
        onClose();
        return;
      }
      if (view !== "menu") return;
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
  }, [open, view, activeIndex, navigable, items, activate, onClose]);

  // Anchor-derived starting position (before viewport clamping).
  const basePos = anchorRect
    ? placement === "right"
      ? { top: anchorRect.top, left: anchorRect.right + 4 }
      : { top: anchorRect.bottom + 2, left: anchorRect.left }
    : { top: 0, left: 0 };

  // Measure the rendered menu and shift it so it never overflows the viewport.
  // Runs before paint, and re-runs when the view switches (the prompt panel is
  // taller/wider than the list) so the corrected position is what the user sees.
  useLayoutEffect(() => {
    if (!open || !anchorRect) { setClamped(null); return; }
    const el = menuRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const margin = 8;
    let { top, left } = basePos;
    if (left + rect.width > window.innerWidth - margin) {
      // Prefer flipping to the anchor's left side; otherwise pin to the right edge.
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
  }, [open, anchorRect, placement, view, promptAgent, items]);

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
        {view === "prompt" && promptAgent ? (
          <AgentPromptPanel
            agent={promptAgent}
            branchLabel={branchLabel}
            onBack={() => setView("menu")}
            onSpawn={(prompt) => {
              onClose();
              onAgent(promptAgent, prompt);
            }}
          />
        ) : (
          <>
            {branchLabel && (
              <div className="bsm-header">
                <span className="bsm-header-label">New session in</span>
                <span className="bsm-header-branch">{branchLabel}</span>
              </div>
            )}

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
                    key={agent.name}
                    className={`bsm-item bsm-item--agent${isActive ? " bsm-item--active" : ""}${isAvailable ? "" : " bsm-item--unavailable"}`}
                    onMouseEnter={() => { if (isAvailable) setActiveIndex(i); }}
                  >
                    <button
                      className="bsm-item-main"
                      disabled={!isAvailable}
                      onClick={() => activate(item)}
                    >
                      <img
                        src={agent.iconSrc}
                        width={14}
                        height={14}
                        className={`bsm-item-icon${agent.mono ? " agent-icon--mono" : ""}`}
                        style={{ objectFit: "contain", flexShrink: 0 }}
                        alt={agent.name}
                      />
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
              if (item.kind === "chat") {
                return (
                  <button
                    key="chat"
                    className={`bsm-item${isActive ? " bsm-item--active" : ""}`}
                    onMouseEnter={() => setActiveIndex(i)}
                    onClick={() => activate(item)}
                  >
                    <MessageSquare size={14} className="bsm-item-icon" />
                    <span className="bsm-item-label">Chat</span>
                    <span className="bsm-item-hint">companion</span>
                  </button>
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
          </>
        )}
      </div>
    </div>,
    document.body
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// AgentPromptPanel — composable secondary step. Lets the user optionally attach
// an initial message before the agent spawns. Empty prompt is valid (just spawn).
// ─────────────────────────────────────────────────────────────────────────────

function AgentPromptPanel({
  agent,
  branchLabel,
  onBack,
  onSpawn,
}: {
  agent: AgentConfig;
  branchLabel?: string;
  onBack: () => void;
  onSpawn: (prompt?: string) => void;
}) {
  const [prompt, setPrompt] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  function spawn() {
    onSpawn(prompt.trim() || undefined);
  }

  return (
    <div className="bsm-prompt">
      <div className="bsm-prompt-head">
        <button className="bsm-prompt-back" onClick={onBack} title="Back">
          <ArrowLeft size={13} />
        </button>
        <img
          src={agent.iconSrc}
          width={16}
          height={16}
          className={`bsm-prompt-icon${agent.mono ? " agent-icon--mono" : ""}`}
          style={{ objectFit: "contain", flexShrink: 0 }}
          alt={agent.name}
        />
        <div className="bsm-prompt-titles">
          <span className="bsm-prompt-name">{agent.name}</span>
          {branchLabel && <span className="bsm-prompt-branch">in {branchLabel}</span>}
        </div>
      </div>

      <textarea
        ref={textareaRef}
        className="bsm-prompt-textarea"
        placeholder="Send an initial message to the agent (optional)"
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        onKeyDown={(e) => {
          // Cmd/Ctrl+Enter or plain Enter (without Shift) spawns; Shift+Enter = newline.
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            spawn();
          }
        }}
        rows={3}
      />

      <div className="bsm-prompt-actions">
        <button className="bsm-prompt-btn bsm-prompt-btn--ghost" onClick={onBack}>
          Back
        </button>
        <button className="bsm-prompt-btn bsm-prompt-btn--primary" onClick={spawn}>
          <span>Start {agent.name}</span>
          <CornerDownLeft size={12} className="bsm-prompt-btn-kbd" />
        </button>
      </div>
    </div>
  );
}
