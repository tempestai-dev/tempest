import { getRuntimeState, setRuntimeState } from "../lib/runtimeState";

export interface WorktreeSession {
  name: string;
  agent?: string;           // CLI command e.g. "claude"
  conversationId?: string;  // Claude conversation UUID — set once, used for all --resume calls
  instanceId?: string;      // permanent canonical identity = the root PTY session's original id
  projectId: string;
  closed?: boolean;
  isRootSession?: boolean;  // true when session opens in project root (no worktree)
  noGit?: boolean;          // true when user chose to continue without initializing git
}

type Store = Record<string, WorktreeSession>;

function getStore(): Store {
  return getRuntimeState().sessions;
}

function saveStore(store: Store): void {
  setRuntimeState({ sessions: store });
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

// Recover the session-id portion of a root-session store key so a restored
// session can reuse its original PTY id (keeping storeKey stable across launches).
export function rootSessionIdFromKey(key: string): string {
  const idx = key.indexOf(ROOT_SESSION_PREFIX);
  return idx === -1 ? "" : key.slice(idx + ROOT_SESSION_PREFIX.length);
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

// Collapse duplicate root-session entries that accumulated from the pre-fix restore
// bug, where each restart re-saved every root session under a brand-new key. Entries
// sharing a logical identity (an agent's conversation, or a named terminal) are merged
// to one survivor; the survivor stays open if any of its duplicates was open.
export function dedupeRootSessions(projectPath: string): void {
  const store = { ...getStore() };
  const prefix = `${projectPath}${ROOT_SESSION_PREFIX}`;
  const survivors = new Map<string, string>(); // logical signature -> surviving key
  let changed = false;
  for (const key of Object.keys(store)) {
    if (!key.startsWith(prefix)) continue;
    const s = store[key];
    // Agent sessions only: key on agent + conversationId so two distinct conversations
    // both survive. Stale duplicates from the old restore bug share the same
    // conversationId (it was passed back as originalId each time), so they collapse.
    // Terminal sessions are skipped — their keys are already unique by UUID, so no
    // two entries can share a sig and the branch would be a permanent no-op.
    if (!s.agent) continue;
    const sig = `agent::${s.agent}::${s.conversationId ?? ""}`;
    const survivorKey = survivors.get(sig);
    if (survivorKey === undefined) {
      survivors.set(sig, key);
      continue;
    }
    // Keep the better of the two: prefer an open entry over a closed one; on a tie,
    // keep the later (higher) key so the most recently created session wins.
    const survivorOpen = store[survivorKey].closed !== true;
    const incomingOpen = s.closed !== true;
    const keepIncoming =
      incomingOpen !== survivorOpen ? incomingOpen : key > survivorKey;
    if (keepIncoming) {
      delete store[survivorKey];
      survivors.set(sig, key);
    } else {
      delete store[key];
    }
    changed = true;
  }
  if (changed) saveStore(store);
}

export function saveWorktreeSession(worktreePath: string, session: WorktreeSession): void {
  const store = { ...getStore() };
  store[worktreePath] = session;
  saveStore(store);
}

export function removeWorktreeSession(worktreePath: string): void {
  const store = { ...getStore() };
  delete store[worktreePath];
  saveStore(store);
}

export function markWorktreeSessionClosed(worktreePath: string): void {
  const store = { ...getStore() };
  const session = store[worktreePath];
  if (!session) return;
  store[worktreePath] = { ...session, closed: true };
  saveStore(store);
}

export function markWorktreeSessionOpen(worktreePath: string): void {
  const store = { ...getStore() };
  const session = store[worktreePath];
  if (!session) return;
  store[worktreePath] = { ...session, closed: false };
  saveStore(store);
}

// Remove any session entries whose paths are not in the provided valid set.
// Called on startup after all projects have been scanned so stale entries
// from deleted/removed projects can't re-appear on the next launch.
export function pruneOrphanedSessions(validPaths: Set<string>): void {
  const store = { ...getStore() };
  let changed = false;
  for (const key of Object.keys(store)) {
    if (!validPaths.has(key)) {
      delete store[key];
      changed = true;
    }
  }
  if (changed) saveStore(store);
}
