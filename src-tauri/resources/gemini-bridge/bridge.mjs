// Tempest ↔ Gemini CLI bridge.
//
// Per-turn Node sidecar. Rust spawns `node bridge.mjs` and writes ONE config
// line to stdin. We spawn `gemini --experimental-acp` and speak the Agent
// Client Protocol (JSON-RPC 2.0 over line-delimited JSON on stdio). Agent
// events are mapped onto the SAME NDJSON contract the Claude bridge emits.
//
// Permission decisions travel back over this process's stdin as
// { t: "permission_decision", id, behavior, message? } lines and are returned
// as the result of the agent's session/request_permission request.

import { createInterface } from "node:readline";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";

function emit(obj) {
  process.stdout.write(JSON.stringify(obj) + "\n");
}

// permId → resolve fn awaiting a user decision.
const pending = new Map();

const rl = createInterface({ input: process.stdin });
let config = null;

rl.on("line", (line) => {
  line = line.trim();
  if (!line) return;
  let msg;
  try { msg = JSON.parse(line); } catch { return; }

  if (!config) {
    config = msg;
    run(config).catch((e) => {
      emit({ t: "error", message: e instanceof Error ? e.message : String(e) });
      process.exit(1);
    });
    return;
  }

  if (msg.t === "permission_decision") {
    const p = pending.get(msg.id);
    if (p) {
      pending.delete(msg.id);
      p({ allow: msg.behavior === "allow", message: msg.message });
    }
  }
});

async function run(cfg) {
  const args = ["--experimental-acp", ...(cfg.model ? ["-m", cfg.model] : [])];
  const child = spawn("gemini", args, {
    cwd: cfg.cwd,
    stdio: ["pipe", "pipe", "pipe"],
    shell: process.platform === "win32",
  });

  streamLines(child.stderr, (line) => emit({ t: "log", text: `gemini: ${line}` }));

  child.on("error", (e) => {
    emit({ t: "error", message: `Failed to launch gemini: ${e.message}. Is the Gemini CLI installed and on PATH?` });
    process.exit(1);
  });

  let resultSent = false;
  child.on("exit", (code) => {
    if (!resultSent) {
      emit({ t: "result", sessionId: cfg.resume ?? "", inputTokens: 0, outputTokens: 0, isError: code !== 0, errorSubtype: code !== 0 ? `gemini exit ${code}` : undefined });
    }
    process.exit(0);
  });

  const rpc = jsonRpcClient(child.stdin, child.stdout);

  rpc.on("session/request_permission", async (params) => {
    const permId = String(params.toolCall?.id ?? params.id ?? randomUUID());
    emit({
      t: "permission",
      id: permId,
      name: params.toolCall?.name ?? params.tool ?? "tool",
      title: params.toolCall?.title,
      description: params.toolCall?.description,
      input: params.toolCall?.input ?? params.input ?? {},
    });
    const { allow, message } = await awaitDecision(permId);
    const options = params.options ?? [];
    const chosen = allow
      ? options.find((o) => o.kind === "allow_once" || o.kind === "allow_always")
      : options.find((o) => o.kind === "reject_once" || o.kind === "reject_always");
    return {
      outcome: {
        outcome: "selected",
        optionId: chosen?.id ?? (allow ? "allow" : "reject"),
        ...(message ? { message } : {}),
      },
    };
  });

  rpc.on("session/update", (params) => {
    const u = params.update ?? params;
    switch (u.sessionUpdate ?? u.type) {
      case "agent_message_chunk":
      case "message_chunk": {
        const text = u.content?.text ?? u.text ?? "";
        if (text) emit({ t: "text", text });
        break;
      }
      case "tool_call": {
        emit({ t: "tool_use", id: String(u.toolCallId), name: u.title ?? u.kind ?? "tool", input: u.rawInput ?? u.input ?? {} });
        break;
      }
      case "tool_call_update": {
        if (u.status === "completed" || u.status === "failed") {
          emit({ t: "tool_result", id: String(u.toolCallId), content: u.content ?? u.rawOutput ?? "", isError: u.status === "failed" });
        }
        break;
      }
      case "plan":
        emit({ t: "log", text: `plan: ${JSON.stringify(u.entries ?? u.plan ?? [])}` });
        break;
    }
  });

  await rpc.request("initialize", {
    protocolVersion: 1,
    clientCapabilities: { fs: { readTextFile: false, writeTextFile: false }, terminal: false },
  });

  const mcpServers = cfg.mcp
    ? [{ name: "tempest-canvas", command: cfg.mcp.exe, args: ["--canvas-mcp", "--db", cfg.mcp.db, "--project", cfg.mcp.project] }]
    : [];
  const session = cfg.resume
    ? { sessionId: cfg.resume }
    : await rpc.request("session/new", { cwd: cfg.cwd, mcpServers });
  const sessionId = session.sessionId ?? cfg.resume ?? "";
  if (sessionId) emit({ t: "session", sessionId });

  const result = await rpc.request("session/prompt", {
    sessionId,
    prompt: [{ type: "text", text: cfg.prompt }],
  }).catch((e) => ({ __error: e }));

  resultSent = true;
  if (result?.__error) {
    emit({ t: "result", sessionId, inputTokens: 0, outputTokens: 0, isError: true, errorSubtype: String(result.__error.message ?? result.__error) });
  } else {
    emit({
      t: "result",
      sessionId,
      inputTokens: result?.usage?.input_tokens ?? 0,
      outputTokens: result?.usage?.output_tokens ?? 0,
      isError: result?.stopReason === "error",
    });
  }
  child.kill();
  process.exit(0);
}

function awaitDecision(id) {
  return new Promise((resolve) => pending.set(id, resolve));
}

// Minimal JSON-RPC 2.0 client over stdio (ACP transport).
function jsonRpcClient(stdin, stdout) {
  const inflight = new Map();
  const notifiers = new Map();
  let nextId = 1;

  streamLines(stdout, (line) => {
    let msg;
    try { msg = JSON.parse(line); } catch { emit({ t: "log", text: line }); return; }
    if (msg.id != null && (msg.result !== undefined || msg.error !== undefined)) {
      const p = inflight.get(msg.id);
      if (p) {
        inflight.delete(msg.id);
        msg.error ? p.reject(new Error(msg.error.message || "rpc error")) : p.resolve(msg.result);
      }
      return;
    }
    if (msg.method) {
      const h = notifiers.get(msg.method);
      if (msg.id != null) {
        Promise.resolve(h ? h(msg.params) : null)
          .then((result) => stdin.write(JSON.stringify({ jsonrpc: "2.0", id: msg.id, result }) + "\n"))
          .catch((e) => stdin.write(JSON.stringify({ jsonrpc: "2.0", id: msg.id, error: { code: -32000, message: String(e.message ?? e) } }) + "\n"));
      } else if (h) {
        h(msg.params);
      }
    }
  });

  return {
    request(method, params) {
      const id = nextId++;
      return new Promise((resolve, reject) => {
        inflight.set(id, { resolve, reject });
        stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
      });
    },
    on(method, handler) { notifiers.set(method, handler); },
  };
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
