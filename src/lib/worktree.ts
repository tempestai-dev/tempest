import { invoke } from "@tauri-apps/api/core";

export interface WorktreeOptions {
  projectPath: string;
  name: string;
  existingBranch?: string;
}

export interface WorktreeResult {
  path: string;
}

export class NotAGitRepoError extends Error {
  constructor() {
    super("Not a git repository");
    this.name = "NotAGitRepoError";
  }
}

export async function createWorktree({ projectPath, name, existingBranch }: WorktreeOptions): Promise<WorktreeResult> {
  try {
    const path = await invoke<string>("create_terminal_worktree", {
      projectPath,
      name: name.trim(),
      existingBranch: existingBranch ?? null,
    });
    return { path };
  } catch (e) {
    const msg = String(e);
    if (msg.includes("not a git repository")) throw new NotAGitRepoError();
    throw new Error(msg);
  }
}

export async function gitInit(projectPath: string): Promise<void> {
  await invoke("git_init", { projectPath });
}
