// Runtime mirror of WorkspaceView's disk scan (`.tempest/*` per project) +
// git-repo hint per project. The mobile projector reads from here so the
// phone sidebar matches the desktop sidebar even for worktrees with no
// persisted sessions. Populated from WorkspaceView; never re-scanned here.

import type { WorktreeSummary } from "@tempest/core";

interface ProjectMeta {
  worktrees: WorktreeSummary[];
  isGit: boolean;
}

const _byProjectId = new Map<string, ProjectMeta>();
const _listeners = new Set<() => void>();

export function subscribeWorktrees(fn: () => void): () => void {
  _listeners.add(fn);
  return () => { _listeners.delete(fn); };
}

function sameList(a: WorktreeSummary[], b: WorktreeSummary[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i].path !== b[i].path || a[i].name !== b[i].name) return false;
  }
  return true;
}

export function setProjectWorktreeMeta(
  projectId: string,
  worktrees: WorktreeSummary[],
  isGit: boolean,
): void {
  const prev = _byProjectId.get(projectId);
  if (prev && prev.isGit === isGit && sameList(prev.worktrees, worktrees)) return;
  _byProjectId.set(projectId, { worktrees, isGit });
  for (const fn of _listeners) { try { fn(); } catch (e) { console.error("[worktrees] listener", e); } }
}

export function getProjectWorktreeMeta(projectId: string): ProjectMeta {
  return _byProjectId.get(projectId) ?? { worktrees: [], isGit: false };
}
