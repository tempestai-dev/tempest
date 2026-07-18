import { dbLoadAppState, dbSetAppState } from "./db";
import type { AppSettings } from "../store/appSettings";
import type { ActionId, Shortcut } from "../store/keybindings";

// App-global preferences. Persisted as a single JSON row in the `app_state`
// table (key = "runtime"). Entity collections (projects, sessions, branches,
// tabs, recents, chat) live in their own relational tables, not here.
export interface RuntimeState {
  settings: Partial<AppSettings>;
  keybindings: Partial<Record<ActionId, Shortcut | null>>;
  attribution: boolean;
  onboardingComplete: boolean;
  sessionOrder: string[];          // session ids in tab-bar order
  activeInstanceId: string | null; // id of the last focused session
  prompts: Array<{ id: string; title: string; body: string; enabled: boolean; isBuiltin: boolean }>;
  atlasProjects: Record<string, boolean>; // projectPath → indexed? (Token Intelligence decision)
  theme?: string;         // active theme name
  chatProvider?: string;  // last selected chat provider id
  chatModel?: string;     // last selected chat model id
}

const DEFAULT_STATE: RuntimeState = {
  settings: {},
  keybindings: {},
  attribution: false,
  onboardingComplete: false,
  sessionOrder: [],
  activeInstanceId: null,
  prompts: [],
  atlasProjects: {},
};

const KEY = "runtime";
let _state: RuntimeState = { ...DEFAULT_STATE };

export async function loadAppState(): Promise<void> {
  try {
    const rows = await dbLoadAppState();
    const raw = new Map(rows).get(KEY);
    if (raw) _state = { ...DEFAULT_STATE, ...(JSON.parse(raw) as Partial<RuntimeState>) };
  } catch (e) {
    console.error("[appState] load failed:", e);
  }
}

export function getRuntimeState(): RuntimeState {
  return _state;
}

export function setRuntimeState(patch: Partial<RuntimeState>): void {
  _state = { ..._state, ...patch };
  dbSetAppState(KEY, JSON.stringify(_state)).catch((e) => console.error("[appState] persist failed:", e));
}
