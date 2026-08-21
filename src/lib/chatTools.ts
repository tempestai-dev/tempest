import { tool } from "ai";
import { z } from "zod";
import { invoke } from "@tauri-apps/api/core";
import { getThreadNodes, getNodeData } from "../store/threads";
import { getBranch } from "../store/sessions";
import { sessionManager } from "../store/sessionManager";
import { loadNodeMessages } from "../store/threadMessages";
import type { TextPart } from "../types/chat";

export interface CommitInfo {
  hash: string;
  author: string;
  relative_date: string;
  subject: string;
}

export interface GitStatusEntry {
  xy: string;
  status: string;
  path: string;
}

function resolvePath(p: string, root: string): string {
  if (p.startsWith("/") || /^[A-Za-z]:/.test(p)) return p;
  return root.replace(/[/\\]+$/, "") + "/" + p;
}

export async function createChatTools(opts: {
  projectPath: string;
  atlasIndexed: boolean;
  threadId?: string;
  selfNodeId?: string;
}) {
  const { projectPath, atlasIndexed, threadId, selfNodeId } = opts;

  const cap = (s: string) => (s.length > 16000 ? s.slice(0, 16000) + "\n…(truncated)" : s);
  const nodeTitle = (id: string, kind: string) => getNodeData<{ title?: string }>(id).title ?? kind;

  const baseTools = {
    read_file: tool({
      description:
        `Read the contents of a file. Workspace root: ${projectPath}. ` +
        "Accepts absolute or project-relative paths.",
      inputSchema: z.object({
        path: z.string().describe("Absolute or project-relative file path"),
      }),
      execute: async ({ path: p }) => {
        try {
          const content = await invoke<string>("read_file", { path: resolvePath(p, projectPath) });
          return { content: content.length > 8000 ? content.slice(0, 8000) + "\n…(truncated)" : content };
        } catch (e) {
          return { error: String(e) };
        }
      },
    }),

    list_files: tool({
      description: `List files and directories at a path. Workspace root: ${projectPath}.`,
      inputSchema: z.object({
        dir: z.string().optional().describe("Directory to list (default: workspace root)"),
      }),
      execute: async ({ dir }) => {
        try {
          const resolved = dir ? resolvePath(dir, projectPath) : projectPath;
          const entries = await invoke<{ name: string; path: string; is_dir: boolean }[]>(
            "list_directory", { path: resolved }
          );
          return { entries };
        } catch (e) {
          return { error: String(e) };
        }
      },
    }),

    run_git_log: tool({
      description: "Show recent git commits for the project",
      inputSchema: z.object({
        count: z.number().int().min(1).max(50).optional()
          .describe("Number of commits to return (default: 10)"),
      }),
      execute: async ({ count }) => {
        try {
          const commits = await invoke<CommitInfo[]>("git_recent_commits", {
            path: projectPath,
            count: count ?? 10,
          });
          return { commits };
        } catch (e) {
          return { error: String(e) };
        }
      },
    }),

    run_git_status: tool({
      description: "Show current git working tree status — modified, staged, and untracked files",
      inputSchema: z.object({}),
      execute: async () => {
        try {
          const entries = await invoke<GitStatusEntry[]>("git_status", { path: projectPath });
          return { entries };
        } catch (e) {
          return { error: String(e) };
        }
      },
    }),

    propose_agent_task: tool({
      description:
        "Propose launching a dedicated sub-agent session for a complex, multi-step task. " +
        "Use when the request requires extensive code changes across many files or a long autonomous " +
        "sequence of steps. A proposal card appears in the chat — the engineer decides whether to launch. " +
        "The 'task' field is sent verbatim as the opening prompt to the agent, so write it as a complete, " +
        "detailed instruction the agent can act on immediately (not a vague description).",
      inputSchema: z.object({
        agent: z.string().describe(
          "CLI agent to use: 'claude' (Claude Code), 'gemini' (Gemini CLI), 'codex' (OpenAI Codex CLI), etc.",
        ),
        model: z.string().optional().describe(
          "Specific model to pass to the agent CLI via --model. " +
          "Examples: 'claude-haiku-4-5-20251001', 'claude-sonnet-4-6', 'claude-opus-4-8', 'gemini-2.5-flash'. " +
          "Omit to use the agent's default model. Always specify this when the engineer mentions a specific model.",
        ),
        task: z.string().describe(
          "The full prompt to send to the agent — write it as a complete actionable instruction, " +
          "e.g. 'Implement the authentication flow in src/auth/. Add login, logout, and token refresh endpoints.'",
        ),
        reason: z.string().describe("Why this task is better handled by a dedicated agent session"),
      }),
      execute: async () => ({ proposed: true }),
    }),
  };

  // Canvas retrieval: the chat's system prompt carries a "Canvas map" — every node's
  // title + a one-line gist. When that gist isn't enough (a long note, another chat's
  // transcript), the model reads the node's FULL content on demand with this tool,
  // instead of every node's body being stuffed into context up front.
  const canvasTools = threadId
    ? {
        read_canvas_node: tool({
          description:
            "Read the FULL content of another node on this canvas, identified by its title as shown in the " +
            "Canvas map. Use when a node's one-line gist there is not enough — e.g. to read a note/text node's " +
            "whole body, or another chat node's full transcript. Returns complete content, not a preview.",
          inputSchema: z.object({
            title: z.string().describe("The node's title exactly as it appears in the Canvas map"),
          }),
          execute: async ({ title }) => {
            const nodes = getThreadNodes(threadId).filter((n) => n.id !== selfNodeId);
            const q = title.trim().toLowerCase();
            const node =
              nodes.find((n) => nodeTitle(n.id, n.kind).toLowerCase() === q) ??
              nodes.find((n) => nodeTitle(n.id, n.kind).toLowerCase().includes(q));
            if (!node) {
              return {
                error: `No node titled "${title}". Available: ${nodes.map((n) => nodeTitle(n.id, n.kind)).join(", ") || "(none)"}`,
              };
            }

            const t = nodeTitle(node.id, node.kind);
            if (node.kind === "text") {
              const body = getNodeData<{ body?: string }>(node.id).body ?? "";
              return { kind: node.kind, title: t, content: cap(body) };
            }
            if (node.kind === "chat") {
              const msgs = await loadNodeMessages(node.id);
              const transcript = msgs
                .map((m) => {
                  const text = m.parts
                    .filter((p): p is TextPart => p.type === "text")
                    .map((p) => p.content)
                    .join("")
                    .trim();
                  return text ? `${m.role}: ${text}` : "";
                })
                .filter(Boolean)
                .join("\n\n");
              return { kind: node.kind, title: t, content: cap(transcript) };
            }
            if (node.kind === "file") {
              const d = getNodeData<{ body?: string; path?: string }>(node.id);
              const header = d.path ? `[file: ${d.path}]\n\n` : "";
              return { kind: node.kind, title: t, content: cap(header + (d.body ?? "")) };
            }
            if (node.kind === "site") {
              const d = getNodeData<{ body?: string; url?: string; siteTitle?: string }>(node.id);
              const header = d.url ? `[site: ${d.url}${d.siteTitle ? ` — ${d.siteTitle}` : ""}]\n\n` : "";
              return { kind: node.kind, title: t, content: cap(header + (d.body ?? "")) };
            }
            if (node.kind === "media") {
              const d = getNodeData<{
                transcript?: string; url?: string; durationSec?: number; language?: string;
                uploader?: string; description?: string; captionSource?: string;
              }>(node.id);
              const meta = [
                d.url ? `URL: ${d.url}` : "",
                d.uploader ? `Uploader: ${d.uploader}` : "",
                d.durationSec ? `Duration: ${Math.round(d.durationSec)}s` : "",
                d.language ? `Language: ${d.language}` : "",
              ].filter(Boolean).join(" · ");
              let body: string;
              if (d.transcript) {
                const source = d.captionSource === "auto" ? "auto-captions" : "captions";
                body = [`[transcript from ${source}]`, meta, "", d.transcript.trim()].filter(Boolean).join("\n").trim();
              } else if (d.description) {
                body = [`[video metadata — no captions published]`, meta, "", `Description:\n${d.description.trim()}`].filter(Boolean).join("\n").trim();
              } else {
                body = [`[video metadata — no captions or description]`, meta].filter(Boolean).join("\n").trim();
              }
              return { kind: node.kind, title: t, content: cap(body) };
            }
            if (node.kind === "image") {
              // Vision handoff only fires for images WIRED INTO the calling chat
              // (attached as an image part on the outgoing user message). A stray
              // read_canvas_node call can't ferry image bytes back through the
              // tool-result channel, so return the caption + shape + a note.
              const d = getNodeData<{ alt?: string; width?: number; height?: number; mime?: string }>(node.id);
              const bits = [
                d.alt ? `Caption: ${d.alt}` : "(no caption)",
                d.width && d.height ? `Dimensions: ${d.width}×${d.height}` : "",
                d.mime ? `Type: ${d.mime}` : "",
              ].filter(Boolean).join("\n");
              return {
                kind: node.kind, title: t,
                content: `${bits}\n\nWire this image into a chat to have the vision-capable model actually see it.`,
              };
            }
            // agent / terminal — no readable PTY scrollback from here; return status.
            const branch = node.branchId ? getBranch(node.branchId)?.name : undefined;
            const live = node.sessionId ? sessionManager.has(node.sessionId) : false;
            return {
              kind: node.kind,
              title: t,
              content: `${node.kind} session "${t}"${branch ? `, branch ${branch}` : ""}, ${live ? "running" : "idle"}. Live terminal output isn't readable from here.`,
            };
          },
        }),
      }
    : {};

  if (!atlasIndexed) return { ...baseTools, ...canvasTools };

  try {
    const toolsJson = await invoke<string>("atlas_mcp_tools", { projectPath });
    const toolDefs = JSON.parse(toolsJson) as Array<{
      name: string;
      description: string;
      inputSchema: Record<string, unknown>;
    }>;

    const atlasTools = Object.fromEntries(
      toolDefs.map(t => [
        t.name,
        tool({
          description: t.description,
          inputSchema: z.object({
            query: z.string().optional().describe("Natural language query or question about the codebase"),
          }).catchall(z.unknown()),
          execute: async (args) => {
            try {
              const resultJson = await invoke<string>("atlas_mcp_call", {
                projectPath,
                toolName: t.name,
                argsJson: JSON.stringify(args),
              });
              return JSON.parse(resultJson);
            } catch (e) {
              return { error: String(e) };
            }
          },
        }),
      ])
    );

    return { ...baseTools, ...canvasTools, ...atlasTools };
  } catch {
    return { ...baseTools, ...canvasTools };
  }
}

export type ChatTools = Awaited<ReturnType<typeof createChatTools>>;

export function argsPreview(toolName: string, args: unknown): string {
  if (!args || typeof args !== "object") return "";
  const a = args as Record<string, unknown>;
  const base = (p: unknown) => String(p ?? "").split(/[/\\]/).filter(Boolean).pop() ?? "";
  switch (toolName) {
    // Claude Code native tools (CLI backend): show the target, not the raw args.
    case "Read": case "Write": case "Edit": case "MultiEdit":
      return base(a.file_path);
    case "NotebookEdit":
      return base(a.notebook_path);
    case "Bash":
      return String(a.command ?? "").replace(/\s+/g, " ").slice(0, 60);
    case "Grep": case "Glob":
      return String(a.pattern ?? "").slice(0, 50);
    case "LS":
      return base(a.path) || "root";
    case "WebFetch":
      try { return new URL(String(a.url)).hostname; } catch { return String(a.url ?? ""); }
    case "WebSearch":
      return String(a.query ?? "").slice(0, 50);
    case "Task":
      return String(a.description ?? a.subagent_type ?? "").slice(0, 50);
    case "TodoWrite":
      return Array.isArray(a.todos) ? `${a.todos.length} steps` : "";

    case "read_file":
      return String(a.path ?? "").split(/[/\\]/).pop() ?? "";
    case "list_files":
      return String(a.dir ?? "root");
    case "run_git_log":
      return `${a.count ?? 10} commits`;
    case "run_git_status":
      return "";
    case "propose_agent_task":
      return String(a.agent ?? "");
    case "read_canvas_node":
      return String(a.title ?? "");
    default: {
      if (toolName.startsWith("atlas_")) {
        return String(a.query ?? "").slice(0, 40) || toolName.replace("atlas_", "");
      }
      const first = Object.values(a)[0];
      return first ? String(first).slice(0, 40) : "";
    }
  }
}

export function resultSummary(result: unknown): string {
  if (!result || typeof result !== "object") return String(result ?? "");
  const r = result as Record<string, unknown>;
  if ("error" in r) return `Error: ${String(r.error).slice(0, 80)}`;
  if ("content" in r) {
    const c = r.content;
    if (typeof c === "string") return c.slice(0, 120) + (c.length > 120 ? "…" : "");
    if (Array.isArray(c)) {
      const text = c
        .filter((item): item is { type: string; text: string } => !!item && typeof item === "object" && "text" in item)
        .map(item => item.text)
        .join("\n");
      return text.slice(0, 120) + (text.length > 120 ? "…" : "");
    }
  }
  if ("entries" in r && Array.isArray(r.entries)) return `${r.entries.length} entries`;
  if ("commits" in r && Array.isArray(r.commits)) return `${r.commits.length} commits`;
  if ("matches" in r && Array.isArray(r.matches)) return `${r.matches.length} matches`;
  if ("proposed" in r) return "Proposal created";
  if ("isError" in r && r.isError) return `Error from Atlas`;
  return JSON.stringify(result).slice(0, 100);
}
