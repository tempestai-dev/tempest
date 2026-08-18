import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type { ChatStreamEvent } from "./chat";
import type { CliAgent } from "./chatModels";

// CLI chat backend: drive one of four CLI coding agents (Claude Code, Codex,
// OpenCode, Gemini CLI) via the Node sidecar bridge, and map its NDJSON events
// onto the SAME `ChatStreamEvent` union the BYOK path emits so ChatNode renders
// them identically. The sidecar streams over a per-turn `claude://{streamId}`
// Tauri channel; permission decisions + cancel go back through Rust commands.
// Session id is surfaced so the node can `resume` next turn.

// Raw event shapes the bridge prints (see resources/claude-bridge/bridge.mjs).
type BridgeEvent =
  | { t: "session"; sessionId: string }
  | { t: "text"; text: string }
  | { t: "tool_use"; id: string; name: string; input: unknown }
  | { t: "tool_result"; id: string; content: unknown; isError: boolean }
  | { t: "permission"; id: string; name: string; title?: string; description?: string; input: unknown }
  | { t: "result"; sessionId: string; inputTokens: number; outputTokens: number; isError: boolean; errorSubtype?: string }
  | { t: "closed" }
  | { t: "log"; text: string };

export interface StreamClaudeCodeOptions {
  prompt: string;
  cwd: string;
  /** Which CLI agent to drive. Defaults to "claude". */
  agent?: CliAgent;
  /** Persisted session id from a prior turn; enables multi-turn continuity. */
  resume?: string;
  /** CLI model alias — meaning is per-agent (see chatModels.CLI_AGENT_MODELS). */
  model?: string;
  systemPrompt?: string;
  /** Project id → wires the tempest-canvas MCP so the agent can read the canvas. */
  projectId?: string;
  onEvent: (event: ChatStreamEvent) => void;
}

export interface ClaudeCodeStream {
  cancel: () => void;
  decide: (id: string, behavior: "allow" | "deny", message?: string) => void;
}

const AGENT_LABEL: Record<string, string> = {
  claude:   "Claude Code",
  codex:    "Codex",
  opencode: "OpenCode",
  gemini:   "Gemini CLI",
};

export function streamClaudeCode(options: StreamClaudeCodeOptions): ClaudeCodeStream {
  const { prompt, cwd, agent, resume, model, systemPrompt, projectId, onEvent } = options;
  const agentLabel = AGENT_LABEL[agent ?? "claude"] ?? (agent ?? "Agent");
  const streamId = crypto.randomUUID();

  let unlisten: UnlistenFn | null = null;
  let done = false;

  const cleanup = () => {
    done = true;
    unlisten?.();
    unlisten = null;
  };

  (async () => {
    try {
      unlisten = await listen<BridgeEvent>(`claude://${streamId}`, (e) => {
        if (done) return;
        const ev = e.payload;
        switch (ev.t) {
          case "session":
            onEvent({ type: "session", sessionId: ev.sessionId });
            break;
          case "text":
            onEvent({ type: "token", delta: ev.text });
            break;
          case "tool_use":
            onEvent({ type: "tool-call", id: ev.id, toolName: ev.name, args: ev.input });
            break;
          case "tool_result":
            onEvent({ type: "tool-result", id: ev.id, toolName: "", result: ev.content });
            break;
          case "permission":
            onEvent({ type: "permission-request", id: ev.id, toolName: ev.name, title: ev.title, description: ev.description, input: ev.input });
            break;
          case "result":
            if (ev.isError) onEvent({ type: "error", message: `${agentLabel} error: ${ev.errorSubtype ?? "unknown"}` });
            onEvent({ type: "finish", inputTokens: ev.inputTokens, outputTokens: ev.outputTokens, sessionId: ev.sessionId });
            break;
          case "closed":
            cleanup();
            break;
          case "log":
            // Sidecar/claude stderr + the ground-truth model line. console.log,
            // not console.debug — DevTools hides Verbose/debug level by default.
            if (ev.text.trim()) console.log("[claude-bridge]", ev.text);
            break;
        }
      });

      await invoke("claude_stream_start", {
        streamId,
        config: {
          prompt,
          cwd,
          ...(agent ? { agent } : {}),
          ...(resume ? { resume } : {}),
          ...(model ? { model } : {}),
          ...(systemPrompt ? { systemPrompt } : {}),
          ...(projectId ? { project: projectId } : {}),
        },
      });
    } catch (err) {
      if (!done) onEvent({ type: "error", message: err instanceof Error ? err.message : String(err) });
      cleanup();
    }
  })();

  return {
    cancel: () => {
      cleanup();
      void invoke("claude_stream_cancel", { streamId }).catch(() => {});
    },
    decide: (id, behavior, message) => {
      void invoke("claude_permission_decision", { streamId, id, behavior, message: message ?? null }).catch(() => {});
    },
  };
}
