import { useSyncExternalStore } from "react";
import { getRuntimeState, setRuntimeState } from "../lib/runtimeState";

export interface AppSettings {
  terminalFontSize: number;
  terminalFontFamily: string;
  terminalCursorStyle: "block" | "bar" | "underline";
  terminalCursorBlink: boolean;
  terminalScrollback: number;
  sidebarFontSize: number;
  branchPrefix: string;
  commitMessageTemplate: string;
  atlasEnabled: boolean;
  atlasAutoIndex: boolean;
}

export const SETTINGS_DEFAULTS: AppSettings = {
  terminalFontSize: 13,
  terminalFontFamily: "Geist Mono",
  terminalCursorStyle: "block",
  terminalCursorBlink: true,
  terminalScrollback: 1000,
  sidebarFontSize: 14,
  branchPrefix: "",
  commitMessageTemplate: "Agent work",
  atlasEnabled: false,
  atlasAutoIndex: false,
};

export const FONT_FAMILY_OPTIONS: { label: string; value: string }[] = [
  { label: "Geist Mono", value: "Geist Mono" },
  { label: "JetBrains Mono", value: "JetBrains Mono" },
  { label: "Fira Code", value: "Fira Code" },
  { label: "Cascadia Code", value: "Cascadia Code" },
  { label: "Consolas", value: "Consolas" },
  { label: "Menlo", value: "Menlo" },
  { label: "monospace", value: "monospace" },
];

type Listener = () => void;
const listeners = new Set<Listener>();

// Merged cache so useSyncExternalStore gets a stable reference between writes.
// Initialized lazily on first access (after loadRuntimeState has run).
let _merged: AppSettings | null = null;

function merged(): AppSettings {
  if (!_merged) _merged = { ...SETTINGS_DEFAULTS, ...getRuntimeState().settings };
  return _merged;
}

export function getSettings(): AppSettings {
  return merged();
}

export function updateSetting<K extends keyof AppSettings>(key: K, value: AppSettings[K]): void {
  setRuntimeState({ settings: { ...getRuntimeState().settings, [key]: value } });
  _merged = { ...SETTINGS_DEFAULTS, ...getRuntimeState().settings };
  listeners.forEach((l) => l());
}

export function useSettings(): AppSettings {
  return useSyncExternalStore(
    (cb) => { listeners.add(cb); return () => listeners.delete(cb); },
    () => merged(),
  );
}
