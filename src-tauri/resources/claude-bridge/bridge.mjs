// Tempest ↔ Claude Code bridge (the CLI-agent chat backend).
//
// A per-turn Node sidecar: Rust spawns `node bridge.mjs`, writes ONE config line
// to stdin, and we drive Claude Code through the official Agent SDK's `query()`.
// Each SDKMessage is mapped to a small NDJSON event on stdout; Rust forwards those
// to the chat node, which renders them with the SAME UI the BYOK path uses.
//
// Permissions round-trip in-band: `canUseTool` emits a `permission` event and
// returns a Promise that resolves when Rust writes a `permission_decision` line
// back to our stdin. Session continuity is `resume` — the next turn passes the
// session_id from this turn's `result`.
//
// Built against the SDK's public API only. Stdout is OUR protocol exclusively;
// the claude subprocess's own stdout is consumed by the SDK internally, and its
// stderr comes to us via `options.stderr`.

import { createInterface } from "node:readline";
import { execFileSync } from "node:child_process";
import { query } from "@anthropic-ai/claude-agent-sdk";

function emit(obj) {
  process.stdout.write(JSON.stringify(obj) + "\n");
}

// Resolve the system-installed `claude` CLI. We ship the SDK's JS but not the
// per-platform binaries it optionally bundles (~250 MB), so we point the SDK
// at the user's own install. Override wins → PATH lookup → clear error.
function resolveClaude(override) {
  if (override) return override;
  const cmd = process.platform === "win32" ? "where" : "which";
  try {
    const out = execFileSync(cmd, ["claude"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
    const first = out.split(/\r?\n/).map((s) => s.trim()).filter(Boolean)[0];
    if (first) return first;
  } catch { /* fall through */ }
  throw new Error("claude CLI not found on PATH. Install with: npm install -g @anthropic-ai/claude-code");
}

// toolUseID → resolve fn for a pending canUseTool promise.
const pending = new Map();

const rl = createInterface({ input: process.stdin });
let config = null;

rl.on("line", (line) => {
  line = line.trim();
  if (!line) return;
  let msg;
  try { msg = JSON.parse(line); } catch { return; }

  // First line is the turn config; it starts the query.
  if (!config) {
    config = msg;
    run(config).catch((e) => {
      emit({ t: "error", message: e instanceof Error ? e.message : String(e) });
      process.exit(1);
    });
    return;
  }

  // Every later line is a permission decision from the user (via Rust).
  if (msg.t === "permission_decision") {
    const p = pending.get(msg.id);
    if (p) {
      pending.delete(msg.id);
      p(msg.behavior === "allow"
        ? { behavior: "allow", updatedInput: p.input }
        : { behavior: "deny", message: msg.message || "Denied by the user." });
    }
  }
});

async function run(cfg) {
  const options = {
    cwd: cfg.cwd,
    pathToClaudeCodeExecutable: resolveClaude(cfg.claudePath),
    // v1 = default permission mode; every tool is gated through canUseTool below.
    permissionMode: "default",
    ...(cfg.resume ? { resume: cfg.resume } : {}),
    ...(cfg.systemPrompt ? { systemPrompt: cfg.systemPrompt } : {}),
    // Model alias from the node's picker ("opus" | "sonnet" | "haiku"); absent →
    // Claude Code's configured default. Rust omits it entirely for "default".
    ...(cfg.model ? { model: cfg.model } : {}),
    ...(cfg.mcp
      ? {
          mcpServers: {
            "tempest-canvas": {
              type: "stdio",
              command: cfg.mcp.exe,
              args: ["--canvas-mcp", "--db", cfg.mcp.db, "--project", cfg.mcp.project],
            },
          },
        }
      : {}),
    // Stream text token-by-token instead of one lump per assistant message —
    // partial events carry Anthropic content_block_delta chunks as they generate.
    includePartialMessages: true,
    stderr: (data) => emit({ t: "log", text: String(data) }),
    canUseTool: (toolName, input, opts) =>
      new Promise((resolve) => {
        const id = opts.toolUseID;
        const box = (r) => resolve(r);
        box.input = input;
        pending.set(id, box);
        emit({
          t: "permission",
          id,
          name: toolName,
          title: opts.title,
          displayName: opts.displayName,
          description: opts.description,
          input,
        });
      }),
  };

  let sentSession = false;
  let sentModel = false;
  for await (const message of query({ prompt: cfg.prompt, options })) {
    switch (message.type) {
      case "system":
        if (!sentSession && message.session_id) {
          sentSession = true;
          emit({ t: "session", sessionId: message.session_id });
        }
        break;

      // Live text deltas (includePartialMessages). Text now streams from here;
      // the complete `assistant` message below only carries fully-formed tool_use.
      case "stream_event": {
        const ev = message.event;
        if (ev?.type === "content_block_delta" && ev.delta?.type === "text_delta")
          emit({ t: "text", text: ev.delta.text });
        break;
      }

      case "assistant":
        // Ground-truth model the CLI actually ran (verify the picker took effect).
        if (!sentModel && message.message?.model) {
          sentModel = true;
          emit({ t: "log", text: `model: ${message.message.model}` });
        }
        for (const block of message.message.content ?? []) {
          if (block.type === "tool_use")
            emit({ t: "tool_use", id: block.id, name: block.name, input: block.input });
        }
        break;

      case "user": {
        // Tool results come back as user-role tool_result blocks.
        const content = message.message?.content;
        if (Array.isArray(content)) {
          for (const block of content) {
            if (block.type === "tool_result")
              emit({
                t: "tool_result",
                id: block.tool_use_id,
                content: block.content,
                isError: block.is_error === true,
              });
          }
        }
        break;
      }

      case "result":
        emit({
          t: "result",
          sessionId: message.session_id,
          inputTokens: message.usage?.input_tokens ?? 0,
          outputTokens: message.usage?.output_tokens ?? 0,
          isError: message.is_error === true,
          errorSubtype: message.subtype !== "success" ? message.subtype : undefined,
        });
        break;
    }
  }
  process.exit(0);
}
