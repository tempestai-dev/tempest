import { invoke } from "@tauri-apps/api/core";

// Thin wrappers over the rusqlite-backed Tauri commands (src-tauri/src/lib.rs).
// Field names mirror the serde structs (camelCase via #[serde(rename)]).

export interface DbProject {
  id: string;
  name: string;
  path: string;
  expanded: boolean;
  worktreeOrder: string | null; // JSON array
  atlasIndexed: boolean;
  contextTokens: number | null;
  systemPrompt: string | null;
}

export interface DbBranch {
  id: string;
  projectId: string;
  name: string;
  path: string;
}

export interface DbSession {
  id: string;
  projectId: string;
  branchId: string | null;
  parentSessionId: string | null;
  name: string;
  agent: string | null;
  conversationId: string | null;
  noGit: boolean;
  closed: boolean;
}

export interface DbSnapshot {
  projects: DbProject[];
  branches: DbBranch[];
  sessions: DbSession[];
}

export interface DbRecent {
  id: string;
  name: string;
  path: string;
  lastOpened: string;
}

export interface DbTab {
  id: string;
  projectId: string;
  kind: string;
  cwd: string;
  name: string;
  previewUrl: string | null;
}

export interface DbChatMessage {
  id: string;
  role: string;
  parts: string; // JSON MessagePart[]
}

// Three independent stores (sessions, projects, chat) each hydrate from the full
// snapshot at boot. Share one in-flight request between concurrent callers so the
// projects+branches+sessions query set runs once instead of three times. The
// promise is dropped as soon as it settles, so later callers always get fresh data.
let _snapshotInFlight: Promise<DbSnapshot> | null = null;
export const dbLoad = (): Promise<DbSnapshot> => {
  if (!_snapshotInFlight) {
    _snapshotInFlight = invoke<DbSnapshot>("db_load");
    _snapshotInFlight.finally(() => { _snapshotInFlight = null; }).catch(() => {});
  }
  return _snapshotInFlight;
};

export const dbEnsureProject = (id: string, name: string, path: string): Promise<void> =>
  invoke("db_ensure_project", { id, name, path });

export const dbUpsertProject = (project: DbProject): Promise<void> =>
  invoke("db_upsert_project", { project });

export const dbSetProjectAtlasIndexed = (id: string, indexed: boolean): Promise<void> =>
  invoke("db_set_project_atlas_indexed", { id, indexed });

export const dbSetProjectContextTokens = (id: string, tokens: number | null): Promise<void> =>
  invoke("db_set_project_context_tokens", { id, tokens });

export const dbSetProjectSystemPrompt = (id: string, prompt: string | null): Promise<void> =>
  invoke("db_set_project_system_prompt", { id, prompt });

export const dbLoadRecents = (): Promise<DbRecent[]> => invoke("db_load_recents");
export const dbUpsertRecent = (recent: DbRecent): Promise<void> => invoke("db_upsert_recent", { recent });
export const dbDeleteRecent = (path: string): Promise<void> => invoke("db_delete_recent", { path });

export const dbLoadTabs = (): Promise<DbTab[]> => invoke("db_load_tabs");
export const dbUpsertTab = (tab: DbTab): Promise<void> => invoke("db_upsert_tab", { tab });
export const dbDeleteTab = (id: string): Promise<void> => invoke("db_delete_tab", { id });

export const dbLoadAppState = (): Promise<[string, string][]> => invoke("db_load_app_state");
export const dbSetAppState = (key: string, value: string): Promise<void> =>
  invoke("db_set_app_state", { key, value });

export const dbLoadChat = (projectId: string): Promise<DbChatMessage[]> =>
  invoke("db_load_chat", { projectId });
export const dbReplaceChat = (projectId: string, messages: DbChatMessage[]): Promise<void> =>
  invoke("db_replace_chat", { projectId, messages });

export const dbUpsertBranch = (branch: DbBranch): Promise<void> =>
  invoke("db_upsert_branch", { branch });

export const dbUpsertSession = (session: DbSession): Promise<void> =>
  invoke("db_upsert_session", { session });

export const dbDeleteSession = (id: string): Promise<void> =>
  invoke("db_delete_session", { id });

export const dbDeleteBranch = (id: string): Promise<void> =>
  invoke("db_delete_branch", { id });

export const dbDeleteProject = (id: string): Promise<void> =>
  invoke("db_delete_project", { id });

export const dbPruneSessions = (validIds: string[]): Promise<void> =>
  invoke("db_prune_sessions", { validIds });
