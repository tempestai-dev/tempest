import {
  dbLoad, dbEnsureProject, dbUpsertBranch, dbUpsertSession,
  dbDeleteSession, dbDeleteBranch, dbPruneSessions,
  type DbBranch, type DbProject, type DbSession,
} from "../lib/db";
import { getOpenProjects } from "./openProjects";

// A persisted session, keyed by its stable cuid `id` (Phase 1: relational model,
// docs/session-migration-to-sql.md). Identity is UUID-based, not path-based:
// `branchId`/`parentSessionId` are foreign keys, paths are attributes on the
// project/branch rows. `isRootSession` is derived (`!branchId && !parentSessionId`);
// `cwd` is derived from the branch (branch sessions) or project (root sessions).
export interface WorktreeSession {
  id:               string;
  name:             string;
  agent?:           string;   // CLI command e.g. "claude"; undefined = plain terminal
  conversationId?:  string;   // agent conversation UUID, passed to --resume
  projectId:        string;   // FK -> projects.id
  branchId?:        string;   // FK -> branches.id; undefined = root session
  parentSessionId?: string;   // FK -> sessions.id; set for sub-sessions only
  closed?:          boolean;  // true = ghost; false/absent = open
  noGit?:           boolean;
}

// ── In-memory mirror ─────────────────────────────────────────────────────────
// Hydrated once from SQLite at startup (loadSessions). Reads are synchronous
// against these maps — the same contract runtimeState.ts uses — so WorkspaceView's
// synchronous restore/render code needs no async plumbing. Writes update the
// mirror synchronously and flush to SQLite asynchronously.
const _sessions = new Map<string, WorktreeSession>();
const _projects = new Map<string, DbProject>();
const _branchById = new Map<string, DbBranch>();
const _branchByPath = new Map<string, DbBranch>();

function basename(p: string): string {
  return p.split(/[\\/]/).filter(Boolean).pop() ?? p;
}

function logErr(op: string) {
  return (e: unknown) => console.error(`[sessions] ${op} failed:`, e);
}

export async function loadSessions(): Promise<void> {
  const snap = await dbLoad();
  _sessions.clear(); _projects.clear(); _branchById.clear(); _branchByPath.clear();
  for (const p of snap.projects) _projects.set(p.id, p);
  for (const b of snap.branches) { _branchById.set(b.id, b); _branchByPath.set(b.path, b); }
  for (const s of snap.sessions) {
    _sessions.set(s.id, {
      id: s.id,
      name: s.name,
      agent: s.agent ?? undefined,
      conversationId: s.conversationId ?? undefined,
      projectId: s.projectId,
      branchId: s.branchId ?? undefined,
      parentSessionId: s.parentSessionId ?? undefined,
      closed: s.closed,
      noGit: s.noGit,
    });
  }
}

// ── Path helpers ─────────────────────────────────────────────────────────────
export function getBranchPath(branchId: string): string | undefined {
  return _branchById.get(branchId)?.path;
}
export function getProjectPath(projectId: string): string | undefined {
  return _projects.get(projectId)?.path;
}

// ── Reads (synchronous, against the mirror) ──────────────────────────────────
export function getAllSessions(): WorktreeSession[] {
  return [..._sessions.values()];
}

export function getSession(id: string): WorktreeSession | null {
  return _sessions.get(id) ?? null;
}

// All non-sub sessions living in the worktree at `worktreePath` (the branch's
// primary agent plus any extra agents/terminals). Replaces the old cwd-keyed
// getWorktreeSession + getTermSessionsForWorktree pair.
export function getBranchSessions(worktreePath: string): WorktreeSession[] {
  const branch = _branchByPath.get(worktreePath);
  if (!branch) return [];
  return [..._sessions.values()].filter(
    (s) => s.branchId === branch.id && !s.parentSessionId
  );
}

// The primary agent session for a worktree (sidebar meta / zen). null if none.
export function getWorktreeAgentSession(worktreePath: string): WorktreeSession | null {
  return getBranchSessions(worktreePath).find((s) => s.agent) ?? null;
}

// Root sessions (no branch) for a project, keyed by the project's path.
export function getRootSessionsForProject(projectPath: string): WorktreeSession[] {
  const project = [..._projects.values()].find((p) => p.path === projectPath);
  if (!project) return [];
  return [..._sessions.values()].filter(
    (s) => s.projectId === project.id && !s.branchId && !s.parentSessionId
  );
}

export function getSubSessions(parentSessionId: string): WorktreeSession[] {
  return [..._sessions.values()].filter((s) => s.parentSessionId === parentSessionId);
}

// ── Writes (sync mirror + async SQLite) ──────────────────────────────────────

// Resolve the owning project row, ensuring it exists in the DB (FK prerequisite).
// Falls back to a longest-prefix path match so callers that only know the cwd
// (e.g. zen windows passing projectId "") still resolve. Returns undefined only
// when no project owns the path — the session is then left session-scoped.
function ensureProject(projectId: string, cwd: string): DbProject | undefined {
  let proj = _projects.get(projectId);
  if (!proj) {
    const open = getOpenProjects();
    const byId = open.find((p) => p.id === projectId);
    const byPath = open
      .filter((p) => cwd === p.path || cwd.startsWith(p.path + "/") || cwd.startsWith(p.path + "\\"))
      .sort((a, b) => b.path.length - a.path.length)[0];
    const src = byId ?? byPath;
    if (!src) return undefined;
    proj = { id: src.id, name: src.name, path: src.path,
             expanded: true, worktreeOrder: null, atlasIndexed: false,
             contextTokens: null, systemPrompt: null };
    _projects.set(proj.id, proj);
  }
  return proj;
}

// Ensure a branch row exists in the mirror for `worktreePath`, minting one on
// first sight. The DB row is written by persistSession's ordered chain.
function ensureBranch(projectId: string, worktreePath: string): DbBranch {
  const existing = _branchByPath.get(worktreePath);
  if (existing) return existing;
  const branch: DbBranch = {
    id: crypto.randomUUID(),
    projectId,
    name: basename(worktreePath),
    path: worktreePath,
  };
  _branchById.set(branch.id, branch);
  _branchByPath.set(branch.path, branch);
  return branch;
}

// Persist a session and its parent rows in FK order (project → branch → session)
// as a single promise chain. The upserts are idempotent, so re-writing the
// project/branch on every session change is harmless and guarantees the parents
// always land before the child — the three commands otherwise acquire the Rust
// connection mutex in unspecified order and the session FK could be rejected.
function persistSession(s: WorktreeSession): void {
  const proj = _projects.get(s.projectId);
  const branch = s.branchId ? _branchById.get(s.branchId) : undefined;
  const row: DbSession = {
    id: s.id,
    projectId: s.projectId,
    branchId: s.branchId ?? null,
    parentSessionId: s.parentSessionId ?? null,
    name: s.name,
    agent: s.agent ?? null,
    conversationId: s.conversationId ?? null,
    noGit: !!s.noGit,
    closed: !!s.closed,
  };
  let chain: Promise<unknown> = proj
    ? dbEnsureProject(proj.id, proj.name, proj.path)
    : Promise.resolve();
  if (branch) chain = chain.then(() => dbUpsertBranch(branch));
  chain.then(() => dbUpsertSession(row)).catch(logErr("save session"));
}

export interface SaveSessionInput {
  id:               string;
  name:             string;
  agent?:           string;
  conversationId?:  string;
  projectId:        string;
  cwd:              string;    // worktree path (branch session) or project path (root)
  isRootSession?:   boolean;
  parentSessionId?: string;
  noGit?:           boolean;
  closed?:          boolean;
}

// Persist a session, creating its project/branch rows first so the FKs hold.
// Chained (project → branch → session) because the writes execute independently
// on the Rust side and the child rows must land after their parents.
export function saveSession(input: SaveSessionInput): void {
  const proj = ensureProject(input.projectId, input.cwd);
  if (!proj) {
    // No owning project — cannot satisfy the NOT NULL FK. Leave session-scoped
    // (no cross-restart restore), matching the pre-migration "no store key" case.
    console.warn(`[sessions] no project for session ${input.id} at ${input.cwd}; not persisted`);
    return;
  }
  const branch = input.isRootSession ? undefined : ensureBranch(proj.id, input.cwd);

  const session: WorktreeSession = {
    id: input.id,
    name: input.name,
    agent: input.agent,
    conversationId: input.conversationId,
    projectId: proj.id,
    branchId: branch?.id,
    parentSessionId: input.parentSessionId,
    closed: input.closed,
    noGit: input.noGit,
  };
  _sessions.set(session.id, session);
  persistSession(session);
}

// Update only the captured conversation id (agents that mint their own id from
// PTY output). No-op if the session isn't persisted.
export function setSessionConversationId(id: string, conversationId: string): void {
  const s = _sessions.get(id);
  if (!s) return;
  s.conversationId = conversationId;
  persistSession(s);
}

export function markSessionClosed(id: string): void {
  const s = _sessions.get(id);
  if (!s || s.closed === true) return;
  s.closed = true;
  persistSession(s);
}

export function markSessionOpen(id: string): void {
  const s = _sessions.get(id);
  if (!s || s.closed !== true) return;
  s.closed = false;
  persistSession(s);
}

export function removeSession(id: string): void {
  if (!_sessions.delete(id)) return;
  dbDeleteSession(id).catch(logErr("delete session"));
}

// Delete a worktree's branch and all its sessions (worktree removed from disk).
// DB cascade handles the sessions; the mirror is updated to match.
export function removeBranchByPath(worktreePath: string): void {
  const branch = _branchByPath.get(worktreePath);
  if (!branch) return;
  _branchById.delete(branch.id);
  _branchByPath.delete(branch.path);
  for (const [id, s] of _sessions) if (s.branchId === branch.id) _sessions.delete(id);
  dbDeleteBranch(branch.id).catch(logErr("delete branch"));
}

// Delete every session whose id is not in `validIds` (startup orphan sweep).
export function pruneSessions(validIds: Set<string>): void {
  let changed = false;
  for (const id of [..._sessions.keys()]) {
    if (!validIds.has(id)) { _sessions.delete(id); changed = true; }
  }
  if (changed) dbPruneSessions([...validIds]).catch(logErr("prune sessions"));
}
