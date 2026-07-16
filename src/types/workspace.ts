export interface Session {
  id: string;
  name: string;
  cwd: string;
  projectId: string;
  kind?: "terminal" | "diff" | "preview" | "editor" | "chat";
  previewUrl?: string;
  agent?: string;
  conversationId?: string;
  instanceId: string;
  createdAt: string;
  isRootSession?: boolean;
  noGit?: boolean;
  sandboxed?: boolean;
  parentSessionId?: string;
  storeKey?: string;
  initialDiffPath?: string;
  metadata: {
    resumeCount: number;
    hasBeenResumed: boolean;
  };
}

export interface Worktree {
  name: string;
  path: string;
}

export interface Project {
  id: string;
  name: string;
  path: string;
  expanded: boolean;
  worktrees: Worktree[];
}

export type NavSection = "overview" | "knowledge-base";
