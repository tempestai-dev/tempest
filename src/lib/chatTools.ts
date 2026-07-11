import { tool } from "ai";
import { z } from "zod";
import { invoke } from "@tauri-apps/api/core";

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

export async function createChatTools(opts: { projectPath: string; atlasIndexed: boolean }) {
  const { projectPath, atlasIndexed } = opts;

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

  if (!atlasIndexed) return baseTools;

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

    return { ...baseTools, ...atlasTools };
  } catch {
    return baseTools;
  }
}

export type ChatTools = Awaited<ReturnType<typeof createChatTools>>;

export function argsPreview(toolName: string, args: unknown): string {
  if (!args || typeof args !== "object") return "";
  const a = args as Record<string, unknown>;
  switch (toolName) {
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
