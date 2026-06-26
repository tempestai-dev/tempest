const KEY = "tempest-worktree-sessions";

export interface WorktreeSession {
  name: string;
  agent?: string;           // CLI command e.g. "claude"
  conversationId?: string;  // Claude conversation UUID — set once, used for all --resume calls
  projectId: string;
  closed?: boolean;
  isRootSession?: boolean;  // true when session opens in project root (no worktree)
  noGit?: boolean;          // true when user chose to continue without initializing git
}

type Store = Record<string, WorktreeSession>;

function getStore(): Store {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "{}");
  } catch {
    return {};
  }
}

export function getWorktreeSession(worktreePath: string): WorktreeSession | null {
  return getStore()[worktreePath] ?? null;
}

// Root sessions (terminal or agent) open in the project root and have no worktree
// directory to anchor them. They are persisted under a per-session unique key so
// that an agent root session and a plain terminal root session — which share the
// same project.path cwd — do not overwrite each other.
export const ROOT_SESSION_PREFIX = "::root::";

export function rootSessionKey(projectPath: string, sessionId: string): string {
  return `${projectPath}${ROOT_SESSION_PREFIX}${sessionId}`;
}

export function isRootSessionKey(key: string): boolean {
  return key.includes(ROOT_SESSION_PREFIX);
}

// Returns every root-session entry stored for a project, keyed by its unique
// store key. Used by the sidebar (to render ghosts) and the startup restore loop.
export function getRootSessionsForProject(
  projectPath: string
): { key: string; session: WorktreeSession }[] {
  const prefix = `${projectPath}${ROOT_SESSION_PREFIX}`;
  const store = getStore();
  return Object.entries(store)
    .filter(([key]) => key.startsWith(prefix))
    .map(([key, session]) => ({ key, session }));
}

export function saveWorktreeSession(worktreePath: string, session: WorktreeSession): void {
  const store = getStore();
  store[worktreePath] = session;
  localStorage.setItem(KEY, JSON.stringify(store));
}

export function removeWorktreeSession(worktreePath: string): void {
  const store = getStore();
  delete store[worktreePath];
  localStorage.setItem(KEY, JSON.stringify(store));
}

export function markWorktreeSessionClosed(worktreePath: string): void {
  const store = getStore();
  const session = store[worktreePath];
  if (!session) return;
  store[worktreePath] = { ...session, closed: true };
  localStorage.setItem(KEY, JSON.stringify(store));
}

export function markWorktreeSessionOpen(worktreePath: string): void {
  const store = getStore();
  const session = store[worktreePath];
  if (!session) return;
  store[worktreePath] = { ...session, closed: false };
  localStorage.setItem(KEY, JSON.stringify(store));
}

// Remove any session entries whose paths are not in the provided valid set.
// Called on startup after all projects have been scanned so stale entries
// from deleted/removed projects can't re-appear on the next launch.
export function pruneOrphanedSessions(validPaths: Set<string>): void {
  const store = getStore();
  let changed = false;
  for (const key of Object.keys(store)) {
    if (!validPaths.has(key)) {
      delete store[key];
      changed = true;
    }
  }
  if (changed) localStorage.setItem(KEY, JSON.stringify(store));
}
