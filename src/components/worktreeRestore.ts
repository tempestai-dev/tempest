// Boot-restore decisions for saved branches and sessions, kept free of Tauri
// and React so they can be checked in isolation (worktreeRestore.check.ts).

interface SavedBranch { projectId: string; path: string }
interface SavedSession { id: string; projectId: string; branchId?: string }

// Saved branches of an open project that the `.tempest/` scan didn't find —
// worktrees the user opened directly from an existing checkout elsewhere on
// disk. Their folders still need an existence check before they're restored.
export function externalBranchCandidates<B extends SavedBranch>(
  branches: B[],
  openProjectIds: ReadonlySet<string>,
  scannedWorktreePaths: ReadonlySet<string>,
): B[] {
  return branches.filter((b) => openProjectIds.has(b.projectId) && !scannedWorktreePaths.has(b.path));
}

// Ids of the sessions that are still anchored: a branch session whose worktree
// folder was found (by the `.tempest/` scan or the external existence check),
// or a root session whose project is still open. Everything else is pruned.
export function anchoredSessionIds(
  sessions: SavedSession[],
  lookup: {
    branchPath: (branchId: string) => string | undefined;
    projectPath: (projectId: string) => string | undefined;
  },
  liveWorktreePaths: ReadonlySet<string>,
  openProjectPaths: ReadonlySet<string>,
): Set<string> {
  const ids = new Set<string>();
  for (const s of sessions) {
    const branchPath = s.branchId ? lookup.branchPath(s.branchId) : undefined;
    const ok = s.branchId
      ? (branchPath !== undefined && liveWorktreePaths.has(branchPath))
      : openProjectPaths.has(lookup.projectPath(s.projectId) ?? "");
    if (ok) ids.add(s.id);
  }
  return ids;
}
