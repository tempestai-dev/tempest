// Tempest ↔ OpenCode bridge.
//
// Per-turn Node sidecar. Rust spawns `node bridge.mjs` and writes ONE config
// line to stdin. We spin up `opencode serve` on a free localhost port, connect
// to its SSE event stream, POST the user prompt, and map the server's events
// onto the SAME NDJSON contract the Claude bridge emits.
//
// Permission decisions travel back over this process's stdin as
// { t: "permission_decision", id, behavior, message? } lines and are POSTed
// to the opencode session's permissions endpoint.

import { createInterface } from "node:readline";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createServer } from "node:net";

function emit(obj) {
  process.stdout.write(JSON.stringify(obj) + "\n");
}

// permId → resolve fn awaiting a user decision on this permission prompt.
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
  const port = await freePort();
  const child = spawn("opencode", ["serve", "--port", String(port), "--hostname", "127.0.0.1"], {
    cwd: cfg.cwd,
    stdio: ["ignore", "pipe", "pipe"],
    shell: process.platform === "win32",
  });

  streamLines(child.stderr, (line) => emit({ t: "log", text: `opencode: ${line}` }));

  child.on("error", (e) => {
    emit({ t: "error", message: `Failed to launch opencode: ${e.message}. Is OpenCode installed and on PATH?` });
    process.exit(1);
  });

  let resultSent = false;
  child.on("exit", (code) => {
    if (!resultSent) {
      emit({ t: "result", sessionId: cfg.resume ?? "", inputTokens: 0, outputTokens: 0, isError: code !== 0, errorSubtype: code !== 0 ? `opencode exit ${code}` : undefined });
    }
    process.exit(0);
  });

  const base = `http://127.0.0.1:${port}`;
  await waitForHttp(`${base}/app`);

  // Session: create or resume.
  let sessionId = cfg.resume;
  if (!sessionId) {
    const s = await postJson(`${base}/session`, { directory: cfg.cwd, title: "Tempest chat" });
    sessionId = s.id;
  }
  emit({ t: "session", sessionId });

  let inTokens = 0;
  let outTokens = 0;
  const toolIds = new Map();
  // messageIDs we KNOW are user-authored (from the POST response + any
  // message.updated with role=user). Everything else is treated as assistant so
  // we don't accidentally suppress the reply on a schema variant.
  const userMessageIds = new Set();
  // partID → chars already forwarded. opencode ships CUMULATIVE text on each
  // update, so we diff against this to emit only the new suffix.
  const emittedLen = new Map();

  const sse = streamSse(`${base}/event`, (evt) => {
    if (!evt) return;
    const props = evt.properties ?? evt;
    if (props?.sessionID && props.sessionID !== sessionId) return;
    const type = evt.type;
    switch (type) {
      case "message.updated": {
        const m = props.info ?? props.message ?? props;
        if (m?.id && m?.role === "user") userMessageIds.add(m.id);
        break;
      }
      case "message.part.updated": {
        const part = props.part;
        if (!part) break;
        if (part.type === "text" && typeof part.text === "string" && part.text.length) {
          const msgId = part.messageID ?? part.messageId;
          if (msgId && userMessageIds.has(msgId)) break; // user prompt echo
          const partId = String(part.id ?? part.callID ?? msgId ?? "text");
          const prev = emittedLen.get(partId) ?? 0;
          if (part.text.length > prev) {
            emit({ t: "text", text: part.text.slice(prev) });
            emittedLen.set(partId, part.text.length);
          }
        } else if (part.type === "tool" && part.tool) {
          const id = String(part.callID ?? part.id ?? randomUUID());
          if (part.state?.status === "running" && !toolIds.has(id)) {
            toolIds.set(id, part.tool);
            emit({ t: "tool_use", id, name: part.tool, input: part.state?.input ?? {} });
          } else if (part.state?.status === "completed" || part.state?.status === "error") {
            emit({ t: "tool_result", id, content: part.state?.output ?? "", isError: part.state?.status === "error" });
          }
        }
        break;
      }
      case "permission.updated":
      case "session.permission-requested":
      case "permission_request": {
        const permId = String(props.id ?? props.permissionID ?? randomUUID());
        emit({
          t: "permission",
          id: permId,
          name: props.tool ?? props.type ?? "tool",
          title: props.title,
          description: props.description ?? props.metadata?.description,
          input: props.metadata ?? props.input ?? {},
        });
        awaitDecision(permId).then(({ allow, message }) => {
          void postJson(`${base}/session/${sessionId}/permissions/${permId}`, {
            response: allow ? "always" : "reject",
            ...(message ? { message } : {}),
          }).catch(() => {});
        });
        break;
      }
      case "usage.updated": {
        inTokens = props.input ?? inTokens;
        outTokens = props.output ?? outTokens;
        break;
      }
      case "session.idle":
      case "message.completed": {
        resultSent = true;
        emit({ t: "result", sessionId, inputTokens: inTokens, outputTokens: outTokens, isError: false });
        sse.close();
        child.kill();
        process.exit(0);
        break;
      }
      case "session.error":
      case "message.error": {
        resultSent = true;
        emit({ t: "result", sessionId, inputTokens: inTokens, outputTokens: outTokens, isError: true, errorSubtype: props.error?.message ?? "error" });
        sse.close();
        child.kill();
        process.exit(0);
        break;
      }
    }
  });

  const [providerID, ...modelParts] = (cfg.model ?? "anthropic/claude-sonnet-4-5").split("/");
  const modelID = modelParts.join("/");
  const mcp = cfg.mcp
    ? { "tempest-canvas": { type: "local", command: [cfg.mcp.exe, "--canvas-mcp", "--db", cfg.mcp.db, "--project", cfg.mcp.project] } }
    : undefined;
  const body = {
    parts: [{ type: "text", text: cfg.prompt }],
    ...(providerID && modelID ? { providerID, modelID } : {}),
    ...(cfg.systemPrompt ? { system: cfg.systemPrompt } : {}),
    ...(mcp ? { mcp } : {}),
  };
  await postJson(`${base}/session/${sessionId}/message`, body);
}

function awaitDecision(id) {
  return new Promise((resolve) => pending.set(id, resolve));
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

function streamSse(url, onEvent) {
  const controller = new AbortController();
  (async () => {
    try {
      const res = await fetch(url, { signal: controller.signal });
      if (!res.body) return;
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let idx;
        while ((idx = buf.indexOf("\n\n")) !== -1) {
          const chunk = buf.slice(0, idx);
          buf = buf.slice(idx + 2);
          const dataLines = chunk.split("\n").filter((l) => l.startsWith("data:")).map((l) => l.slice(5).trim());
          if (!dataLines.length) continue;
          try { onEvent(JSON.parse(dataLines.join("\n"))); } catch { /* ignore */ }
        }
      }
    } catch (e) {
      if (!controller.signal.aborted) emit({ t: "log", text: `sse: ${e.message}` });
    }
  })();
  return { close: () => controller.abort() };
}

async function postJson(url, body) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`POST ${url} → ${res.status}: ${text}`);
  try { return JSON.parse(text); } catch { return text; }
}

async function waitForHttp(url, timeoutMs = 10_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`opencode server at ${url} did not come up in ${timeoutMs}ms`);
}

// ponytail: race between bind and consumer connect is theoretical here since
// opencode owns the port immediately; upgrade to a handshake if it ever collides.
function freePort() {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.unref();
    srv.on("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const port = srv.address().port;
      srv.close(() => resolve(port));
    });
  });
}

process.on("SIGTERM", () => process.exit(0));
process.on("SIGINT", () => process.exit(0));
