import { invoke } from "@tauri-apps/api/core";
import type { WorktreeSession } from "../store/sessions";
import type { StoredProject } from "../store/openProjects";
import type { RecentWorkspace } from "../store/recents";
import type { AppSettings } from "../store/appSettings";
import type { ActionId, Shortcut } from "../store/keybindings";

// A non-terminal tab (diff, preview, editor) that survives app restarts.
export interface PersistedTab {
  instanceId: string;                         // stable UUID minted once when tab is first opened
  kind: "diff" | "preview" | "editor";
  projectId: string;
  cwd: string;                                // worktree path (diff), file path (editor), "" (preview)
  name: string;
  previewUrl?: string;
}

export interface RuntimeState {
  version: number;
  sessions: Record<string, WorktreeSession>;
  openProjects: StoredProject[];
  recents: RecentWorkspace[];
  settings: Partial<AppSettings>;
  keybindings: Partial<Record<ActionId, Shortcut | null>>;
  attribution: boolean;
  onboardingComplete: boolean;
  migrations: Record<string, boolean>;
  tabs: PersistedTab[];           // non-terminal tabs (diff, preview, editor)
  sessionOrder: string[];         // instanceIds in tab-bar order
  activeInstanceId: string | null; // instanceId of the last focused session
  prompts: Array<{ id: string; title: string; body: string; enabled: boolean; isBuiltin: boolean }>;
  atlasProjects: Record<string, boolean>; // path → true (index) | false (skip); absent = not yet decided
}

const DEFAULT_STATE: RuntimeState = {
  version: 1,
  sessions: {},
  openProjects: [],
  recents: [],
  settings: {},
  keybindings: {},
  attribution: false,
  onboardingComplete: false,
  migrations: {},
  tabs: [],
  sessionOrder: [],
  activeInstanceId: null,
  prompts: [],
  atlasProjects: {},
};

let _state: RuntimeState = { ...DEFAULT_STATE };

function migrateLS<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export async function loadRuntimeState(): Promise<void> {
  try {
    const raw = await invoke<string>("read_runtime_state");
    const parsed = JSON.parse(raw) as Partial<RuntimeState>;
    _state = {
      version:          parsed.version          ?? 1,
      sessions:         parsed.sessions         ?? migrateLS("tempest-worktree-sessions", {}),
      openProjects:     parsed.openProjects     ?? migrateLS("tempest-open-projects", []),
      recents:          parsed.recents          ?? migrateLS("tempest-recents", []),
      settings:         parsed.settings         ?? migrateLS("tempest-app-settings", {}),
      keybindings:      parsed.keybindings      ?? migrateLS("tempest-keybindings", {}),
      attribution:      parsed.attribution      ?? (localStorage.getItem("tempest-attribution") === "true"),
      onboardingComplete: parsed.onboardingComplete ?? (localStorage.getItem("tempest-onboarding-complete") === "true"),
      migrations:       parsed.migrations       ?? {},
      tabs:             parsed.tabs             ?? [],
      sessionOrder:     parsed.sessionOrder     ?? [],
      activeInstanceId: parsed.activeInstanceId ?? null,
      prompts:          parsed.prompts          ?? [],
      atlasProjects:    parsed.atlasProjects    ?? {},
    };
  } catch {
    // File doesn't exist yet — import whatever is in localStorage.
    _state = {
      version:          1,
      sessions:         migrateLS("tempest-worktree-sessions", {}),
      openProjects:     migrateLS("tempest-open-projects", []),
      recents:          migrateLS("tempest-recents", []),
      settings:         migrateLS("tempest-app-settings", {}),
      keybindings:      migrateLS("tempest-keybindings", {}),
      attribution:      localStorage.getItem("tempest-attribution") === "true",
      onboardingComplete: localStorage.getItem("tempest-onboarding-complete") === "true",
      migrations:       {},
      tabs:             [],
      sessionOrder:     [],
      activeInstanceId: null,
      prompts:          [],
      atlasProjects:    {},
    };
  }
  persist();
}

export function getRuntimeState(): RuntimeState {
  return _state;
}

export function setRuntimeState(patch: Partial<RuntimeState>): void {
  _state = { ..._state, ...patch };
  persist();
}

function persist(): void {
  invoke("write_runtime_state", { data: JSON.stringify(_state) }).catch(() => {});
}
