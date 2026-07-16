export interface BranchInfo {
  name: string;
  is_current: boolean;
  is_remote: boolean;
  is_worktree: boolean;
  worktree_path?: string;
}

export interface DiffLine {
  kind: "hunk" | "context" | "added" | "removed";
  line_old: number | null;
  line_new: number | null;
  content: string;
}

export interface FileStats {
  path: string;
  adds: number;
  dels: number;
}
