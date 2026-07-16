import { getRuntimeState, setRuntimeState } from "./runtimeState";
import type { CommitInfo, GitStatusEntry } from "./chatTools";
import type { ChatMessage, PersistedMessage } from "../types/chat";

export const MAX_CHAT_HISTORY = 100;

export function loadChatHistory(projectPath?: string): ChatMessage[] {
  if (!projectPath) return [];
  const persisted = (getRuntimeState().chatHistory[projectPath] ?? []) as PersistedMessage[];
  return persisted.map(m => ({
    id: m.id,
    role: m.role,
    parts: m.parts ?? [{ type: "text" as const, content: m.content ?? "" }],
  }));
}

export function saveChatHistory(projectPath: string | undefined, msgs: ChatMessage[]): void {
  if (!projectPath) return;
  const persisted: PersistedMessage[] = msgs.slice(-MAX_CHAT_HISTORY).map(m => ({
    id: m.id,
    role: m.role,
    parts: m.parts,
  }));
  const st = getRuntimeState();
  setRuntimeState({ chatHistory: { ...st.chatHistory, [projectPath]: persisted } });
}

export const BASE_SYSTEM =
  "You are Tempest, an AI engineering companion embedded in the developer's IDE. " +
  "You help the engineer understand systems, research solutions, plan work, review code, and debug. " +
  "Be precise, technical, and concise. When the engineer's question relates to their project, ground " +
  "your answer in the project context provided below rather than guessing. " +
  "You have tools to read files, list directories, check git status and history, search the codebase, " +
  "and propose agent tasks for complex multi-step work.";

export function buildProjectContext(
  path: string,
  branch: string,
  commits: CommitInfo[],
  status: GitStatusEntry[],
  remoteUrl: string,
): string {
  const lines: string[] = [];
  lines.push(`Repository path: ${path}`);
  if (remoteUrl) lines.push(`Remote (origin): ${remoteUrl}`);
  if (branch) lines.push(`Current branch: ${branch}`);
  if (commits.length > 0) {
    lines.push("Recent commits:");
    for (const c of commits) {
      lines.push(`  - ${c.hash} ${c.subject} (${c.author}, ${c.relative_date})`);
    }
  }
  if (status.length > 0) {
    lines.push("Modified / untracked files:");
    for (const s of status.slice(0, 30)) {
      lines.push(`  - [${s.status}] ${s.path}`);
    }
    if (status.length > 30) lines.push(`  …and ${status.length - 30} more`);
  } else {
    lines.push("Working tree: clean");
  }
  return lines.join("\n");
}

export function buildSystemPrompt(custom: string, projectContext: string): string {
  const parts = [BASE_SYSTEM];
  if (projectContext) parts.push("## Project context\n" + projectContext);
  if (custom.trim()) parts.push("## Additional instructions\n" + custom.trim());
  return parts.join("\n\n");
}
