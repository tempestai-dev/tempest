import { useSyncExternalStore } from "react";
import { getRuntimeState, setRuntimeState } from "../lib/runtimeState";

export type ActionId =
  | "toggleTheme"
  | "openSettings"
  | "toggleLeftSidebar"
  | "toggleRightSidebar"
  | "openProject"
  | "newWorkspace"
  | "closeTab"
  | "nextTab"
  | "prevTab"
  | "broadcast"
  | "splitPaneV"
  | "splitPaneH";

export interface Shortcut {
  key: string;   // KeyboardEvent.key (original casing preserved)
  ctrl: boolean;
  shift: boolean;
  alt: boolean;
}

export interface ActionDef {
  id: ActionId;
  label: string;
  group: string;
}

export const ACTION_DEFS: ActionDef[] = [
  { id: "toggleTheme",        label: "Switch Theme",           group: "Appearance"  },
  { id: "openSettings",       label: "Open Settings",          group: "Appearance"  },
  { id: "toggleLeftSidebar",  label: "Toggle Left Sidebar",    group: "Layout"      },
  { id: "toggleRightSidebar", label: "Toggle Right Sidebar",   group: "Layout"      },
  { id: "openProject",        label: "Open Project",           group: "Workspaces"  },
  { id: "newWorkspace",       label: "New Workspace",          group: "Workspaces"  },
  { id: "closeTab",           label: "Close Tab",              group: "Workspaces"  },
  { id: "nextTab",            label: "Next Tab",               group: "Navigation"  },
  { id: "prevTab",            label: "Previous Tab",           group: "Navigation"  },
  { id: "broadcast",          label: "Broadcast to Agents",    group: "Workspaces"  },
  { id: "splitPaneV",         label: "Split Pane Side by Side", group: "Layout"      },
  { id: "splitPaneH",         label: "Split Pane Top / Bottom", group: "Layout"      },
];

export const DEFAULTS: Record<ActionId, Shortcut | null> = {
  toggleTheme:        { key: "T",   ctrl: true,  shift: true,  alt: false },
  openSettings:       { key: ",",   ctrl: true,  shift: false, alt: false },
  toggleLeftSidebar:  { key: "b",   ctrl: true,  shift: false, alt: false },
  toggleRightSidebar: { key: "\\",  ctrl: true,  shift: false, alt: false },
  openProject:        { key: "o",   ctrl: true,  shift: false, alt: false },
  newWorkspace:       { key: "n",   ctrl: true,  shift: false, alt: false },
  closeTab:           { key: "w",   ctrl: true,  shift: false, alt: false },
  nextTab:            { key: "Tab", ctrl: true,  shift: false, alt: false },
  prevTab:            { key: "Tab", ctrl: true,  shift: true,  alt: false },
  broadcast:          { key: "m",   ctrl: true,  shift: true,  alt: false },
  splitPaneV:         { key: "|",   ctrl: true,  shift: true,  alt: false },
  splitPaneH:         { key: "_",   ctrl: true,  shift: true,  alt: false },
};

const listeners = new Set<() => void>();
function notify() { for (const fn of listeners) fn(); }

// Merged cache — lazy init so it reads from runtimeState after loadRuntimeState().
let _bindings: Record<ActionId, Shortcut | null> | null = null;

function merged(): Record<ActionId, Shortcut | null> {
  if (!_bindings) _bindings = { ...DEFAULTS, ...getRuntimeState().keybindings };
  return _bindings;
}

export function getBindings(): Record<ActionId, Shortcut | null> {
  return merged();
}

export function setBinding(action: ActionId, shortcut: Shortcut | null): void {
  setRuntimeState({ keybindings: { ...getRuntimeState().keybindings, [action]: shortcut } });
  _bindings = { ...DEFAULTS, ...getRuntimeState().keybindings };
  notify();
}

export function resetBinding(action: ActionId): void {
  setBinding(action, DEFAULTS[action]);
}

export function resetAllBindings(): void {
  setRuntimeState({ keybindings: {} });
  _bindings = { ...DEFAULTS };
  notify();
}

function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function useKeybindings(): Record<ActionId, Shortcut | null> {
  return useSyncExternalStore(subscribe, () => merged(), () => merged());
}

export function matchesEvent(shortcut: Shortcut | null, e: KeyboardEvent): boolean {
  if (!shortcut) return false;
  return (
    e.key.toLowerCase() === shortcut.key.toLowerCase() &&
    !!e.ctrlKey  === shortcut.ctrl &&
    !!e.shiftKey === shortcut.shift &&
    !!e.altKey   === shortcut.alt
  );
}

const KEY_LABELS: Record<string, string> = {
  " ": "Space",
  "ArrowUp": "↑", "ArrowDown": "↓", "ArrowLeft": "←", "ArrowRight": "→",
  "Backspace": "⌫", "Delete": "Del", "Enter": "↩",
  "Escape": "Esc",
};

export function formatShortcut(shortcut: Shortcut | null): string {
  if (!shortcut) return "—";
  const parts: string[] = [];
  if (shortcut.ctrl)  parts.push("Ctrl");
  if (shortcut.shift) parts.push("Shift");
  if (shortcut.alt)   parts.push("Alt");
  const k = shortcut.key;
  parts.push(KEY_LABELS[k] ?? (k.length === 1 ? k.toUpperCase() : k));
  return parts.join("+");
}

export function shortcutFromEvent(e: KeyboardEvent): Shortcut | null {
  const ignored = new Set(["Control", "Shift", "Alt", "Meta"]);
  if (ignored.has(e.key)) return null;
  return { key: e.key, ctrl: e.ctrlKey, shift: e.shiftKey, alt: e.altKey };
}
