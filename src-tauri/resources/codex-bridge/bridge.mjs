// Tempest ↔ Codex bridge.
//
// Per-turn Node sidecar. Rust spawns `node bridge.mjs`, writes ONE config line
// to stdin, and we drive the Codex CLI via `codex exec --json`. Its JSONL event
// stream is mapped onto the SAME NDJSON contract the Claude bridge emits, so
// the chat node renders both identically.
//
// Approvals: `codex exec` does not round-trip per-tool prompts back to us — the
// approval policy is set at spawn time. We run with `--sandbox workspace-write`
// (Hephaestus provides the outer guarantee). Tool invocations are surfaced as
// tool_use / tool_result so the UI shows what ran; per-tool approval prompts
// would need the persistent `codex proto` protocol and are not wired here.
//
// Event schema (codex 0.147+): thread.started / turn.started / turn.completed /
// turn.failed / item.started / item.completed. Older `session_configured` /
// `agent_message_delta` names are kept as fallbacks so a downgrade still works.

import { createInterface } from "node:readline";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";

function emit(obj) {
  process.stdout.write(JSON.stringify(obj) + "\n");
}

const rl = createInterface({ input: process.stdin });
let config = null;

rl.on("line", (line) => {
  line = line.trim();
  if (!line) return;
  let msg;
  try { msg = JSON.parse(line); } catch { return; }
  if (!config) {
    config = msg;
    try { run(config); }
    catch (e) {
      emit({ t: "error", message: e instanceof Error ? e.message : String(e) });
      process.exit(1);
    }
  }
  // No stdin control channel — codex approvals are set at spawn time.
});

function run(cfg) {
  // Resume is a SUBCOMMAND on `codex exec`, not a flag:
  //   codex exec resume <SESSION_ID> [PROMPT]
  // For a fresh turn we just pass the prompt positionally.
  const commonBefore = [
    "--json",
    "--skip-git-repo-check",
    "--sandbox", "workspace-write",
    ...(cfg.model ? ["-m", cfg.model] : []),
    ...(cfg.mcp ? mcpConfigArgs(cfg.mcp) : []),
  ];
  const args = cfg.resume
    ? ["exec", ...commonBefore, "resume", cfg.resume, cfg.prompt]
    : ["exec", ...commonBefore, cfg.prompt];

  const child = spawn("codex", args, {
    cwd: cfg.cwd,
    stdio: ["ignore", "pipe", "pipe"],
    shell: process.platform === "win32",
  });

  let sessionId = null;
  let inTokens = 0;
  let outTokens = 0;
  let resultSent = false;
  const finish = (isError, errorSubtype) => {
    if (resultSent) return;
    resultSent = true;
    emit({ t: "result", sessionId, inputTokens: inTokens, outputTokens: outTokens, isError, ...(errorSubtype ? { errorSubtype } : {}) });
  };

  streamLines(child.stdout, (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { emit({ t: "log", text: raw }); return; }

    const type = msg.type;
    switch (type) {
      // ── Thread lifecycle ────────────────────────────────────────────────
      case "thread.started":
      case "session_configured":
      case "session":
        sessionId = msg.thread_id ?? msg.session_id ?? msg.id ?? sessionId;
        if (sessionId) emit({ t: "session", sessionId });
        break;

      case "turn.started":
        break;

      case "turn.completed":
        inTokens  = msg.usage?.input_tokens  ?? inTokens;
        outTokens = msg.usage?.output_tokens ?? outTokens;
        finish(false);
        break;

      case "turn.failed":
        finish(true, msg.error?.message ?? "turn failed");
        break;

      // ── Items (agent message / tool calls / etc.) ───────────────────────
      case "item.started":
      case "item.updated":
      case "item.completed": {
        handleItem(type, msg.item ?? {});
        break;
      }

      // ── Top-level fallbacks (older schema / plain errors) ───────────────
      case "agent_message_delta":
      case "message_delta": {
        const text = msg.delta ?? msg.text ?? "";
        if (text) emit({ t: "text", text });
        break;
      }
      case "token_count":
      case "usage":
        inTokens  = msg.input_tokens  ?? msg.input  ?? inTokens;
        outTokens = msg.output_tokens ?? msg.output ?? outTokens;
        break;
      case "task_complete":
        finish(false);
        break;
      case "error":
      case "task_error":
        finish(true, msg.message ?? msg.error?.message ?? "error");
        break;

      default:
        emit({ t: "log", text: `codex:${type ?? "?"}` });
    }
  });

  streamLines(child.stderr, (line) => emit({ t: "log", text: line }));

  // Per-turn state so we don't re-emit the same tool_use for repeated updates.
  const emittedToolUse = new Set();

  function handleItem(phase, item) {
    const id = String(item.id ?? randomUUID());
    const itype = item.type;

    switch (itype) {
      case "agent_message": {
        // codex 0.147 exec --json ships one final agent_message on completion
        // (no per-token deltas). Emit its text once on completion.
        if (phase === "item.completed" && item.text) emit({ t: "text", text: item.text });
        break;
      }
      case "reasoning": {
        if (phase === "item.completed" && item.text) emit({ t: "log", text: `reasoning: ${item.text}` });
        break;
      }
      case "command_execution": {
        if (!emittedToolUse.has(id)) {
          emittedToolUse.add(id);
          emit({ t: "tool_use", id, name: "Bash", input: { command: item.command ?? item.cmd ?? "" } });
        }
        if (phase === "item.completed") {
          emit({
            t: "tool_result",
            id,
            content: item.aggregated_output ?? item.stdout ?? item.output ?? "",
            isError: (item.exit_code ?? 0) !== 0 || item.status === "failed",
          });
        }
        break;
      }
      case "file_change":
      case "file_changes": {
        if (!emittedToolUse.has(id)) {
          emittedToolUse.add(id);
          emit({ t: "tool_use", id, name: "Edit", input: { changes: item.changes ?? item.patch ?? item } });
        }
        if (phase === "item.completed") {
          emit({ t: "tool_result", id, content: item.summary ?? "", isError: item.status === "failed" });
        }
        break;
      }
      case "mcp_tool_call":
      case "mcp_tool_calls": {
        if (!emittedToolUse.has(id)) {
          emittedToolUse.add(id);
          const name = item.server && item.tool ? `mcp__${item.server}__${item.tool}` : (item.tool ?? "mcp_tool");
          emit({ t: "tool_use", id, name, input: item.input ?? item.arguments ?? {} });
        }
        if (phase === "item.completed") {
          emit({ t: "tool_result", id, content: item.output ?? item.result ?? "", isError: item.status === "failed" });
        }
        break;
      }
      case "web_search":
      case "web_searches": {
        if (!emittedToolUse.has(id)) {
          emittedToolUse.add(id);
          emit({ t: "tool_use", id, name: "WebSearch", input: { query: item.query ?? "" } });
        }
        if (phase === "item.completed") {
          emit({ t: "tool_result", id, content: item.results ?? "", isError: false });
        }
        break;
      }
      case "plan_update":
      case "plan_updates":
      case "todo_list": {
        if (phase === "item.completed") {
          emit({ t: "tool_use", id, name: "TodoWrite", input: { entries: item.entries ?? item.plan ?? [] } });
          emit({ t: "tool_result", id, content: "", isError: false });
        }
        break;
      }
      default:
        if (phase === "item.completed") emit({ t: "log", text: `codex-item:${itype ?? "?"}` });
    }
  }

  child.on("exit", (code) => {
    finish(code !== 0, code !== 0 ? `exit ${code}` : undefined);
    process.exit(0);
  });
  child.on("error", (e) => {
    emit({ t: "error", message: `Failed to launch codex: ${e.message}. Is the Codex CLI installed and on PATH?` });
    process.exit(1);
  });
}

// Inject the canvas MCP via inline TOML overrides (codex parses --config KEY=VALUE
// as TOML). Use TOML *literal* strings (single-quoted) — double quotes get eaten
// by cmd.exe when shell:true wraps the whole command line on Windows.
// ponytail: strips any embedded `'` from paths (Windows paths never contain one).
function mcpConfigArgs(mcp) {
  const tstr = (s) => `'${String(s).replace(/'/g, "")}'`;
  const cmd  = tstr(mcp.exe);
  const args = "[" + ["--canvas-mcp", "--db", mcp.db, "--project", mcp.project].map(tstr).join(",") + "]";
  return [
    "--config", `mcp_servers.tempest-canvas.command=${cmd}`,
    "--config", `mcp_servers.tempest-canvas.args=${args}`,
  ];
}

function streamLines(stream, onLine) {
  let buf = "";
  stream.setEncoding("utf8");
  stream.on("data", (chunk) => {
    buf += chunk;
    let idx;
    while ((idx = buf.indexOf("\n")) !== -1) {
      const line = buf.slice(0, idx).replace(/\r$/, "");
      buf = buf.slice(idx + 1);
      if (line) onLine(line);
    }
  });
  stream.on("end", () => { if (buf.trim()) onLine(buf.trim()); });
}

process.on("SIGTERM", () => process.exit(0));
process.on("SIGINT", () => process.exit(0));
