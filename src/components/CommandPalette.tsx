import { createPortal } from "react-dom";
import { useState, useMemo, useEffect, useRef } from "react";
import {
  ChevronRight, ChevronLeft, PanelLeft, PanelRight, Columns,
  Rows, FolderOpen, Plus, X, Radio, List, Settings, SunMoon,
} from "lucide-react";
import type { ActionId } from "../store/keybindings";
import { getBindings, formatShortcut } from "../store/keybindings";
import "./CommandPalette.css";

type Section = "Navigation" | "Layout" | "Workspaces" | "Appearance";

interface Cmd {
  id: string;
  section: Section;
  label: string;
  keywords?: string;
  icon: React.ReactNode;
  actionId?: ActionId;
  run: () => void;
}

export interface CommandPaletteProps {
  onClose: () => void;
  onToggleLeftSidebar: () => void;
  onToggleRightSidebar: () => void;
  onOpenSettings: () => void;
  onOpenProject: () => void;
  onNewWorkspace: () => void;
  onCloseTab: () => void;
  onNextTab: () => void;
  onPrevTab: () => void;
  onBroadcast: () => void;
  onSplitV: () => void;
  onSplitH: () => void;
  onOpenQueue: () => void;
  onToggleTheme: () => void;
}

function fuzzyScore(q: string, target: string): number | null {
  if (!q) return 0;
  const ql = q.toLowerCase(), tl = target.toLowerCase();
  const idx = tl.indexOf(ql);
  if (idx !== -1) return idx;
  let qi = 0, score = 0;
  for (let i = 0; i < tl.length && qi < ql.length; i++) {
    if (tl[i] === ql[qi]) { score += i; qi++; }
  }
  return qi === ql.length ? score + 1000 : null;
}

const SECTION_ORDER: Section[] = ["Navigation", "Layout", "Workspaces", "Appearance"];

export function CommandPalette({
  onClose, onToggleLeftSidebar, onToggleRightSidebar, onOpenSettings,
  onOpenProject, onNewWorkspace, onCloseTab, onNextTab, onPrevTab,
  onBroadcast, onSplitV, onSplitH, onOpenQueue, onToggleTheme,
}: CommandPaletteProps) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const bindings = getBindings();

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const commands: Cmd[] = useMemo(() => [
    { id: "next-tab",             section: "Navigation", label: "Next Tab",                icon: <ChevronRight size={14} />, actionId: "nextTab",            run: () => { onNextTab(); onClose(); } },
    { id: "prev-tab",             section: "Navigation", label: "Previous Tab",            icon: <ChevronLeft size={14} />,  actionId: "prevTab",            run: () => { onPrevTab(); onClose(); } },
    { id: "toggle-left-sidebar",  section: "Layout",     label: "Toggle Left Sidebar",     icon: <PanelLeft size={14} />,    actionId: "toggleLeftSidebar",  run: () => { onToggleLeftSidebar(); onClose(); } },
    { id: "toggle-right-sidebar", section: "Layout",     label: "Toggle Right Sidebar",    icon: <PanelRight size={14} />,   actionId: "toggleRightSidebar", run: () => { onToggleRightSidebar(); onClose(); } },
    { id: "split-v",              section: "Layout",     label: "Split Pane Side by Side", icon: <Columns size={14} />,      actionId: "splitPaneV",         run: () => { onSplitV(); onClose(); } },
    { id: "split-h",              section: "Layout",     label: "Split Pane Top / Bottom", icon: <Rows size={14} />,         actionId: "splitPaneH",         run: () => { onSplitH(); onClose(); } },
    { id: "open-project",         section: "Workspaces", label: "Open Project",            icon: <FolderOpen size={14} />,   actionId: "openProject",        run: () => { onOpenProject(); onClose(); } },
    { id: "new-workspace",        section: "Workspaces", label: "New Workspace",           icon: <Plus size={14} />,         actionId: "newWorkspace",       run: () => { onNewWorkspace(); onClose(); } },
    { id: "close-tab",            section: "Workspaces", label: "Close Tab",               icon: <X size={14} />,            actionId: "closeTab",           run: () => { onCloseTab(); onClose(); } },
    { id: "broadcast",            section: "Workspaces", label: "Broadcast to Agents",     icon: <Radio size={14} />,        actionId: "broadcast",          run: () => { onBroadcast(); onClose(); } },
    { id: "open-queue",           section: "Workspaces", label: "Open Message Queue",      icon: <List size={14} />,         actionId: "openQueue",          run: () => { onOpenQueue(); onClose(); } },
    { id: "settings",             section: "Appearance", label: "Open Settings",           icon: <Settings size={14} />,     actionId: "openSettings",       keywords: "preferences config keyboard", run: () => { onOpenSettings(); onClose(); } },
    { id: "toggle-theme",         section: "Appearance", label: "Switch Theme",            icon: <SunMoon size={14} />,      actionId: "toggleTheme",        keywords: "dark light color scheme",     run: () => { onToggleTheme(); onClose(); } },
  ], []);

  const filtered = useMemo(() => {
    const q = query.trim();
    if (!q) return commands;
    return commands
      .map((cmd) => {
        const ls = fuzzyScore(q, cmd.label);
        const ks = cmd.keywords ? fuzzyScore(q, cmd.keywords) : null;
        const score = ls !== null ? ls : ks;
        return score !== null ? { cmd, score } : null;
      })
      .filter((x): x is { cmd: Cmd; score: number } => x !== null)
      .sort((a, b) => a.score - b.score)
      .map((x) => x.cmd);
  }, [query, commands]);

  const groupedWithIdx = useMemo(() => {
    const map = new Map<Section, Cmd[]>();
    for (const cmd of filtered) {
      if (!map.has(cmd.section)) map.set(cmd.section, []);
      map.get(cmd.section)!.push(cmd);
    }
    let idx = 0;
    return SECTION_ORDER.flatMap((s) => {
      const cmds = map.get(s);
      if (!cmds) return [];
      return [{ section: s, cmds: cmds.map((cmd) => ({ cmd, idx: idx++ })) }];
    });
  }, [filtered]);

  const flat = useMemo(
    () => groupedWithIdx.flatMap((g) => g.cmds.map((c) => c.cmd)),
    [groupedWithIdx]
  );

  useEffect(() => { setSelected(0); }, [query]);
  useEffect(() => { inputRef.current?.focus(); }, []);
  useEffect(() => {
    listRef.current
      ?.querySelector<HTMLElement>(`[data-idx="${selected}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [selected]);

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown")       { e.preventDefault(); setSelected((i) => Math.min(i + 1, flat.length - 1)); }
    else if (e.key === "ArrowUp")    { e.preventDefault(); setSelected((i) => Math.max(i - 1, 0)); }
    else if (e.key === "Enter")      { e.preventDefault(); flat[selected]?.run(); }
    else if (e.key === "Escape")     { e.preventDefault(); onClose(); }
  }

  const hasQuery = query.trim().length > 0;

  return createPortal(
    <div className="cp-overlay" onMouseDown={onClose}>
      <div className="cp-panel" onMouseDown={(e) => e.stopPropagation()} onKeyDown={onKeyDown}>
        <input
          ref={inputRef}
          className="cp-input"
          placeholder="Search commands…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoComplete="off"
          spellCheck={false}
        />
        <div ref={listRef} className="cp-list">
          {flat.length === 0 && <div className="cp-empty">No commands match</div>}
          {groupedWithIdx.map(({ section, cmds }) => (
            <div key={section} className="cp-group">
              {!hasQuery && <div className="cp-section-label">{section}</div>}
              {cmds.map(({ cmd, idx }) => {
                const shortcut = cmd.actionId ? formatShortcut(bindings[cmd.actionId]) : null;
                return (
                  <button
                    key={cmd.id}
                    data-idx={idx}
                    className={`cp-row${idx === selected ? " cp-row--active" : ""}`}
                    onMouseEnter={() => setSelected(idx)}
                    onClick={cmd.run}
                  >
                    <span className="cp-icon">{cmd.icon}</span>
                    <span className="cp-label">{cmd.label}</span>
                    {shortcut && shortcut !== "—" && <kbd className="cp-shortcut">{shortcut}</kbd>}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>,
    document.body
  );
}
