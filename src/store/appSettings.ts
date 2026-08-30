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
  // Semantic (vector) code search. Opt-in: requires downloading a ~25 MB
  // embedding model. When on, Tempest passes --semantic to Atlas so it embeds
  // symbols and serves hybrid retrieval; off keeps Atlas FTS-only, no download.
  atlasSemantic: boolean;
  // Optional context compression (issue #94). Off by default. When on, bulky
  // lineage bodies and older chat turns are held out of the outgoing context and
  // replaced by stubs that name their own retrieval call — the model pulls back
  // only what a turn needs (read_canvas_node / read_thread_history, and the Atlas
  // graph for indexed code). Nothing is summarized away; see lib/contextCompression.
  contextCompression: boolean;
  isolateAgents: boolean;
  autoApprove: boolean;
  // Install lifecycle hooks into supported agents' configs for precise
  // working/waiting/done status. Off uninstalls them and falls back to the
  // PTY-scraping heuristic. See src/lib/agentHooks.
  preciseAgentStatus: boolean;
  // OS desktop notifications when an agent finishes or asks for permission
  // while the Tempest window is unfocused. Suppressed while focused.
  desktopNotifications: boolean;
  // Anonymous usage telemetry (PostHog). Default false — nothing is loaded or
  // sent until the user explicitly opts in. Flip only via setTelemetryEnabled
  // in src/lib/telemetry.ts, never updateSetting directly.
  telemetryEnabled: boolean;
  // Experimental: Warp (warpllm) chat backend on canvas chat nodes. Off by
  // default; when on, a "Warp" row appears in a chat node's Agents picker.
  experimentalWarp: boolean;
  // Override for the `claude` CLI the Claude Code chat bridge invokes. Empty →
  // bridge falls back to `where`/`which claude` on PATH. Corporate/offline
  // users can point this at their pinned install.
  claudeCliPath: string;
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
  atlasSemantic: false,
  contextCompression: false,
  isolateAgents: true,
  autoApprove: true,
  preciseAgentStatus: true,
  desktopNotifications: true,
  telemetryEnabled: false,
  experimentalWarp: false,
  claudeCliPath: "",
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
