import { useSyncExternalStore } from "react";

const KEY = "tempest-app-settings";

export interface AppSettings {
  terminalFontSize: number;
  terminalFontFamily: string;
  terminalCursorStyle: "block" | "bar" | "underline";
  terminalCursorBlink: boolean;
  terminalScrollback: number;
  sidebarFontSize: number;
  branchPrefix: string;
  commitMessageTemplate: string;
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

function load(): AppSettings {
  try {
    return { ...SETTINGS_DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) ?? "{}") };
  } catch {
    return { ...SETTINGS_DEFAULTS };
  }
}

let _settings: AppSettings = load();

export function getSettings(): AppSettings {
  return _settings;
}

export function updateSetting<K extends keyof AppSettings>(key: K, value: AppSettings[K]): void {
  _settings = { ..._settings, [key]: value };
  localStorage.setItem(KEY, JSON.stringify(_settings));
  listeners.forEach((l) => l());
}

export function useSettings(): AppSettings {
  return useSyncExternalStore(
    (cb) => { listeners.add(cb); return () => listeners.delete(cb); },
    () => _settings,
  );
}
