import {
  dbLoad, dbLoadChat, dbReplaceChat,
  dbSetProjectContextTokens, dbSetProjectSystemPrompt,
} from "./db";
import { getOpenProjects } from "../store/openProjects";
import type { CommitInfo, GitStatusEntry } from "./chatTools";
import type { ChatMessage } from "../types/chat";

export const MAX_CHAT_HISTORY = 100;

// In-memory mirrors of the chat_messages table and the per-project chat columns
// (context_tokens / system_prompt). Hydrated once at startup so the chat pane's
// synchronous reads keep working; writes flush to SQLite.
const _messages = new Map<string, ChatMessage[]>(); // projectId -> messages
const _tokens = new Map<string, number>();          // projectId -> last context tokens
const _prompts = new Map<string, string>();         // projectId -> custom system prompt

const logErr = (op: string) => (e: unknown) => console.error(`[chat] ${op} failed:`, e);

function idForPath(projectPath?: string): string | undefined {
  if (!projectPath) return undefined;
  return getOpenProjects().find((p) => p.path === projectPath)?.id;
}

export async function loadChat(): Promise<void> {
  _messages.clear(); _tokens.clear(); _prompts.clear();
  const snap = await dbLoad();
  for (const p of snap.projects) {
    if (p.contextTokens != null) _tokens.set(p.id, p.contextTokens);
    if (p.systemPrompt != null) _prompts.set(p.id, p.systemPrompt);
  }
  await Promise.all(
    snap.projects.map(async (p) => {
      const rows = await dbLoadChat(p.id);
      _messages.set(p.id, rows.map((m) => ({
        id: m.id,
        role: m.role as ChatMessage["role"],
        parts: JSON.parse(m.parts) as ChatMessage["parts"],
      })));
    })
  );
}

export function loadChatHistory(projectPath?: string): ChatMessage[] {
  const id = idForPath(projectPath);
  return id ? (_messages.get(id) ?? []) : [];
}

export function saveChatHistory(projectPath: string | undefined, msgs: ChatMessage[]): void {
  const id = idForPath(projectPath);
  if (!id) return;
  const trimmed = msgs.slice(-MAX_CHAT_HISTORY);
  _messages.set(id, trimmed);
  dbReplaceChat(
    id,
    trimmed.map((m) => ({ id: m.id, role: m.role, parts: JSON.stringify(m.parts ?? []) }))
  ).catch(logErr("replace chat"));
}

export function getContextTokens(projectPath?: string): number {
  const id = idForPath(projectPath);
  return id ? (_tokens.get(id) ?? 0) : 0;
}

export function setContextTokens(projectPath: string | undefined, tokens: number): void {
  const id = idForPath(projectPath);
  if (!id) return;
  _tokens.set(id, tokens);
  dbSetProjectContextTokens(id, tokens).catch(logErr("set context tokens"));
}

export function getSystemPrompt(projectPath?: string): string {
  const id = idForPath(projectPath);
  return id ? (_prompts.get(id) ?? "") : "";
}

export function setSystemPrompt(projectPath: string | undefined, prompt: string): void {
  const id = idForPath(projectPath);
  if (!id) return;
  _prompts.set(id, prompt);
  dbSetProjectSystemPrompt(id, prompt || null).catch(logErr("set system prompt"));
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
