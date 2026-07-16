import { GitBranch } from "lucide-react";
import type { BranchInfo } from "../../types/git";

type ProjectLite = { id: string; name: string; path: string };

type Props<P extends ProjectLite> = {
  projects: P[];
  branches: Record<string, BranchInfo[]>;
  loading: boolean;
  onPick: (project: P, branch: BranchInfo) => void;
};

export function DiffPickerModal<P extends ProjectLite>({ projects, branches, loading, onPick }: Props<P>) {
  return (
    <div className="diff-screen">
      <div className="diff-screen-body">
        <div className="diff-screen-inner">
          <header className="diff-screen-header">
            <h1 className="diff-screen-title">Open a diff</h1>
            <p className="diff-screen-subtitle">Choose a branch to review its changes</p>
          </header>

          {projects.length === 0 ? (
            <div className="diff-screen-empty-state">
              <GitBranch size={22} />
              <p>No projects open</p>
            </div>
          ) : projects.map((project) => {
            const list = branches[project.id] ?? [];
            return (
              <section key={project.id} className="diff-screen-project">
                <div className="diff-screen-project-header">
                  <span className="diff-screen-project-name">{project.name}</span>
                  {list.length > 0 && (
                    <span className="diff-screen-project-count">{list.length}</span>
                  )}
                </div>
                <div className="diff-screen-branches">
                  {loading && list.length === 0 ? (
                    <div className="diff-screen-loading">Loading branches…</div>
                  ) : list.length === 0 ? (
                    <div className="diff-screen-empty">No branches found</div>
                  ) : list.map((branch) => {
                    const canOpen = !!branch.worktree_path || branch.is_current;
                    const kind = branch.is_current
                      ? "head"
                      : branch.worktree_path
                        ? "worktree"
                        : branch.is_remote
                          ? "remote"
                          : "local";
                    return (
                      <button
                        key={`${project.id}:${branch.name}:${branch.is_remote ? "remote" : "local"}`}
                        className={`diff-screen-branch diff-screen-branch--${kind}`}
                        disabled={!canOpen}
                        onMouseDown={(e) => { e.preventDefault(); onPick(project, branch); }}
                        title={branch.worktree_path ?? (branch.is_current ? project.path : "Open this branch in a worktree to view its diff")}
                      >
                        <GitBranch size={14} className="diff-screen-branch-icon" />
                        <span className="diff-screen-branch-name">{branch.name}</span>
                        <span className={`diff-screen-branch-meta diff-screen-branch-meta--${kind}`}>
                          {kind}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
}
