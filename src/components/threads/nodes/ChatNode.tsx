import { useState, useRef, useCallback, useEffect, useContext } from "react";
import { createPortal } from "react-dom";
import { NodeResizeControl, ResizeControlVariant, useReactFlow, useNodeConnections } from "@xyflow/react";
import { Trash2, Pencil, Plus, ArrowUp, ChevronDown, Search, Terminal } from "lucide-react";
import { NodeConnector } from "./NodeConnector";
import { useZoomCounterScale } from "./useZoomCounterScale";
import { CollapsedNode } from "./CollapsedNode";
import { getNodeData, patchNodeData, getThreadNode, getThreadNodes, getThreadEdges } from "../../../store/threads";
import { setNodeGenerating } from "../../../store/nodeActivity";
import { getBranch } from "../../../store/sessions";
import { sessionManager } from "../../../store/sessionManager";
import { getNodeMessages, loadNodeMessages, saveNodeMessages } from "../../../store/threadMessages";
import { chatGist, firstLine, formatCanvasGraph, type CanvasNodeMeta } from "../canvasContext";
import { getRuntimeState, setRuntimeState } from "../../../lib/runtimeState";
import { track } from "../../../lib/telemetry";
import { CDN, CHAT_PROVIDERS, CLAUDE_CODE, CLAUDE_CODE_MODELS, WARP, WARP_MODELS, type ChatProvider, type ChatModel } from "../../../lib/chatModels";
import { useModelManifest, contextSizeFor } from "../../../lib/remoteConfig";
import { streamChat, type ChatStreamEvent } from "../../../lib/chat";
import { streamClaudeCode, type ClaudeCodeStream } from "../../../lib/claudeCode";
import { streamWarp } from "../../../lib/warp";
import { useSettings } from "../../../store/appSettings";
import { createChatTools } from "../../../lib/chatTools";
import { ThreadNodeContext } from "../ThreadNodeContext";
import { Markdown } from "../../Markdown";
import { ToolCallCard } from "../../ChatPane/ToolCallCard";
import { ProposalCard } from "../../ChatPane/ProposalCard";
import { SpSelect } from "../../ui/SpSelect";
import tempestChat from "../../../assets/tempest-chat.png";
import "../../ChatPane.css";
import "./TextNode.css";

import type { TextPart, MessagePart, ChatMessage, PermissionPart } from "../../../types/chat";

// System prompt. No auto-injected project/git context — the model only sees what
// the user types, the canvas nodes wired into this chat, and tool results it
// fetches on demand.
const BASE_SYSTEM =
  "You are Tempest, an AI engineering companion embedded in the developer's IDE. " +
  "You help the engineer understand systems, research solutions, plan work, review code, and debug. " +
  "Be precise, technical, and concise. " +
  "You have tools to read files, list directories, check git status and history, search the codebase, " +
  "and propose agent tasks for complex multi-step work.";

// Ambient canvas context (threads-plan §3.4 / §13): nodes wired INTO this chat
// feed it as context — a per-node gist of type + title + content preview, not raw
// file dumps. Text nodes contribute their full body; chat nodes a transcript
// preview; execution nodes their metadata + branch. Rebuilt each send so edits and
// (dis)connections are always reflected. `sourceIds` = connected source node ids.
const PREVIEW_CHARS = 4000;

function messagePreview(nodeId: string): string {
  const msgs = getNodeMessages(nodeId);
  if (msgs.length === 0) return "";
  return msgs
    .map((m) => {
      const text = m.parts.filter((p): p is TextPart => p.type === "text").map((p) => p.content).join("").trim();
      return text ? `${m.role}: ${text}` : "";
    })
    .filter(Boolean)
    .join("\n")
    .slice(-PREVIEW_CHARS);
}

// A wire is LINEAGE: source → target means the target CONTINUES the source's thread.
// The wired-in node(s) are this chat's parent(s) — their content is inherited context, the
// prior line of work this chat branches from (Slashspace's branching-conversations model).
// This is distinct from the ambient canvas map, which is passive reference.
function buildLineageContext(sourceIds: string[]): string {
  const blocks: string[] = [];
  for (const nid of sourceIds) {
    const node = getThreadNode(nid);
    if (!node) continue;
    const data = getNodeData<{ title?: string; body?: string }>(nid);
    const title = data.title ?? node.kind;

    let content = "";
    if (node.kind === "text") {
      content = (data.body ?? "").trim();
    } else if (node.kind === "chat") {
      content = messagePreview(nid);
    }

    const branch = node.branchId ? ` branch="${node.branchId}"` : "";
    blocks.push(
      content
        ? `<parent kind="${node.kind}" title="${title}"${branch}>\n${content}\n</parent>`
        : `<parent kind="${node.kind}" title="${title}"${branch} />`,
    );
  }
  if (blocks.length === 0) return "";
  return (
    "## Lineage — you continue from these\n" +
    "This chat branched from the node(s) below; their content is your INHERITED context — " +
    "the prior line of work you carry forward, as if it were earlier in this same thread. " +
    "Build on it directly; don't treat it as a fresh task to execute. (Distinct from the " +
    'ambient "Canvas map" — reference you may consult.)\n\n' +
    blocks.join("\n\n")
  );
}

// Ambient canvas metadata (tier 2 — canvas-as-context). Every node on this thread
// gets a one-line gist derived WITHOUT loading its full content: text → first line
// of its (mirrored) body; chat → persisted msgCount + gist; agent/terminal → branch
// + live/idle. The pure formatter (canvasContext.ts) turns these + the edge graph
// into the `## Canvas map` block. Rebuilt each send so it reflects the live canvas.
function buildCanvasGraph(threadId: string, selfId: string, canReadNodes = true): string {
  const metas: CanvasNodeMeta[] = getThreadNodes(threadId).map((n) => {
    const data = getNodeData<{ title?: string; body?: string; gist?: string; msgCount?: number }>(n.id);
    const title = data.title ?? n.kind;

    let gist = "";
    if (n.kind === "text") {
      gist = firstLine(data.body ?? "");
    } else if (n.kind === "chat") {
      const parts: string[] = [];
      if (data.msgCount) parts.push(`${data.msgCount} msg${data.msgCount === 1 ? "" : "s"}`);
      if (data.gist) parts.push(data.gist);
      gist = parts.join(" · ");
    } else {
      const parts: string[] = [];
      const branch = n.branchId ? getBranch(n.branchId)?.name : undefined;
      if (branch) parts.push(`branch=${branch}`);
      parts.push(n.sessionId && sessionManager.has(n.sessionId) ? "live" : "idle");
      gist = parts.join(" · ");
    }
    return { id: n.id, kind: n.kind, title, gist };
  });

  const edges = getThreadEdges(threadId).map((e) => ({ source: e.source, target: e.target }));
  return formatCanvasGraph(metas, edges, selfId, undefined, canReadNodes);
}

// Tempest Bridge (tier-4 opt 1): seed an external CLI agent with the same canvas
// awareness a chat node builds for itself — the launching chat's transcript as
// inherited lineage + the ambient canvas map — prepended to its initial prompt at
// spawn. The CLI agent has no `read_canvas_node` tool, so the map drops that line.
export function buildAgentSeedContext(threadId: string, sourceNodeId?: string): string {
  const lineage = sourceNodeId ? buildLineageContext([sourceNodeId]) : "";
  const canvasMap = buildCanvasGraph(threadId, sourceNodeId ?? "", false);
  return [lineage, canvasMap].filter(Boolean).join("\n\n");
}

// New canvas chat node — auto-height card that grows downward as messages stack.
// Card shell (resize / title pill / delete / connector) is a sibling to TextNode;
// the footer holds the composer. Streaming, tools, and project-context injection
// are wired against the same libs as the old ChatNode; history is node-scoped via
// threadMessages. Slash/@ affordances and the system-prompt popover are omitted.
export function ChatNode({ id, data }: { id: string; data?: { collapsed?: boolean } }) {
  const { deleteElements } = useReactFlow();
  const ctx = useContext(ThreadNodeContext);
  const projectPath = ctx?.projectPath;
  const projectId = ctx?.projectId;
  const atlasIndexed = ctx?.atlasIndexed;
  const onLaunchAgent = ctx?.onLaunchAgent;
  const worktrees = ctx?.worktrees;
  const createCanvasWorktree = ctx?.createCanvasWorktree;
  const threadId = getThreadNode(id)?.threadId ?? "";

  const [title, setTitle] = useState(() => getNodeData<{ title?: string }>(id).title ?? "new chat");
  const [editingTitle, setEditingTitle] = useState(false);
  const titleScale = useZoomCounterScale();
  // Launch target for proposals fired from this chat: "" = project root,
  // "__new__" = cut a new worktree, else a worktree path. Resolved on launch.
  const [target, setTarget] = useState("");
  const [newName, setNewName] = useState("");
  const runInOptions = [
    { value: "", label: "Project root" },
    ...(worktrees ?? []).map((w) => ({ value: w.path, label: w.name })),
    ...(createCanvasWorktree ? [{ value: "__new__", label: "New worktree…" }] : []),
  ];

  const manifest = useModelManifest();
  // "api" = BYOK (Vercel AI SDK); "cli" = Claude Code harness (sidecar). Persisted per node.
  const [backend, setBackend] = useState<"api" | "cli" | "warp">(
    () => getNodeData<{ backend?: "api" | "cli" | "warp" }>(id).backend ?? "api",
  );
  const [provider, setProvider] = useState<ChatProvider>(() => {
    const saved = getRuntimeState().chatProvider;
    return CHAT_PROVIDERS.find((p) => p.id === saved) ?? CHAT_PROVIDERS[0];
  });
  const settings = useSettings();
  const [model, setModel] = useState<ChatModel>(() => {
    const data = getNodeData<{ backend?: "api" | "cli" | "warp"; cliModel?: string; warpModel?: string }>(id);
    if (data.backend === "cli") return CLAUDE_CODE_MODELS.find((m) => m.id === data.cliModel) ?? CLAUDE_CODE_MODELS[0];
    if (data.backend === "warp") return WARP_MODELS.find((m) => m.id === data.warpModel) ?? WARP_MODELS[0];
    const { chatProvider, chatModel } = getRuntimeState();
    const models = manifest.providers[chatProvider ?? "anthropic"] ?? [];
    return models.find((m) => m.id === chatModel) ?? manifest.providers["anthropic"][0];
  });
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerPos, setPickerPos] = useState({ bottom: 0, left: 0 });
  // Selected picker category: a BYOK provider id, CLAUDE_CODE, or WARP (experimental).
  const [pickerProvider, setPickerProvider] = useState(() => {
    const b = getNodeData<{ backend?: "api" | "cli" | "warp" }>(id).backend;
    if (b === "cli") return CLAUDE_CODE;
    if (b === "warp") return WARP;
    return CHAT_PROVIDERS[0].id;
  });
  const [search, setSearch] = useState("");
  const [isEmpty, setIsEmpty] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [ctxPopupOpen, setCtxPopupOpen] = useState(false);

  const [messages, setMessages] = useState<ChatMessage[]>(() => getNodeMessages(id));
  const [contextTokens, setContextTokens] = useState(() => getNodeData<{ contextTokens?: number }>(id).contextTokens ?? 0);

  const editableRef = useRef<HTMLDivElement>(null);
  const pickerBtnRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const cancelRef = useRef<{ cancel: () => void; decide?: ClaudeCodeStream["decide"] } | null>(null);
  const streamingIdRef = useRef<string | null>(null);
  const messagesRef = useRef<ChatMessage[]>([]);
  // Live streaming buffer for the in-flight assistant turn. A ref (not a local in
  // send) so the permission card's approve/deny can mutate the same parts the token
  // events keep snapshotting — otherwise the next token would revert a resolved card.
  const assistantPartsRef = useRef<MessagePart[]>([]);

  // Nodes wired INTO this chat (incoming edges) — their content is injected as
  // context on send. Kept in a ref so send() (a useCallback) reads the latest.
  const incoming = useNodeConnections({ id, handleType: "target" });
  const sourceIdsRef = useRef<string[]>([]);
  useEffect(() => {
    sourceIdsRef.current = [...new Set(incoming.map((c) => c.source))];
  }, [incoming]);

  useEffect(() => { messagesRef.current = messages; }, [messages]);

  // thread_messages is a separate table, loaded lazily when the node mounts.
  useEffect(() => { loadNodeMessages(id).then(setMessages); }, [id]);

  // Publish streaming state so ThreadEdge can animate the edges feeding this
  // node while it generates. Cleared on unmount separately from the
  // toggle effect so a mid-stream unmount doesn't leave a stale "generating" flag.
  useEffect(() => { setNodeGenerating(id, isLoading); }, [id, isLoading]);
  useEffect(() => () => setNodeGenerating(id, false), [id]);

  function commitTitle() {
    setEditingTitle(false);
    const t = title.trim() || "new chat";
    setTitle(t);
    patchNodeData(id, { title: t });
  }

  function focusInput() { editableRef.current?.focus(); }
  function onInput() { setIsEmpty(!(editableRef.current?.innerText ?? "").trim()); }

  function onKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void send();
    }
  }

  // Save history AND persist a lightweight gist/count into node.data, so other
  // chat nodes' canvas maps can show this chat's recent state without loading it.
  const persistChat = useCallback((msgs: ChatMessage[]) => {
    saveNodeMessages(id, msgs);
    patchNodeData(id, { gist: chatGist(msgs), msgCount: msgs.length });
  }, [id]);

  const send = useCallback(async () => {
    const rawText = (editableRef.current?.innerText ?? "").trim();
    if (!rawText || isLoading) return;
    void track("feature_used", { feature: "chat" });

    if (editableRef.current) editableRef.current.innerHTML = "";
    setIsEmpty(true);

    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      parts: [{ type: "text", content: rawText }],
    };
    const assistantId = crypto.randomUUID();
    const prior = messagesRef.current;

    // First message on the canvas names it (plan §11.2); no-op once named.
    if (prior.length === 0) ctx?.autoNameThread?.(rawText);

    setMessages((prev) => [...prev, userMsg, { id: assistantId, role: "assistant", parts: [] }]);
    streamingIdRef.current = assistantId;
    setIsLoading(true);

    cancelRef.current?.cancel();

    const history = prior.map((m) => ({
      role: m.role,
      content: m.parts.filter((p): p is TextPart => p.type === "text").map((p) => p.content).join(""),
    }));

    // Wired chat sources may never have mounted, so their message mirror is empty.
    // Load their histories (into the mirror buildConnectedContext reads) before
    // building context. Guard skips nodes already loaded/mounted so we don't clobber
    // a live node's fresher mirror.
    await Promise.all(
      sourceIdsRef.current.map(async (nid) => {
        if (getThreadNode(nid)?.kind === "chat" && getNodeMessages(nid).length === 0) {
          await loadNodeMessages(nid);
        }
      }),
    );

    const lineage = buildLineageContext(sourceIdsRef.current);
    const canvasMap = buildCanvasGraph(threadId, id);
    // Inherited lineage first (the thread this chat continues), then the ambient map (reference).
    const system = [BASE_SYSTEM, lineage, canvasMap].filter(Boolean).join("\n\n");
    // BYOK chat wires our own tools. The CLI harness brings Claude Code's native
    // tools (and reaches the canvas via the tempest-canvas MCP), so no double set.
    const tools = backend === "api" && projectPath
      ? await createChatTools({ projectPath, atlasIndexed: atlasIndexed ?? false, threadId, selfNodeId: id })
      : undefined;

    assistantPartsRef.current = [];
    const setParts = (parts: MessagePart[]) => {
      assistantPartsRef.current = parts;
      setMessages((prev) => prev.map((m) => (m.id === assistantId ? { ...m, parts } : m)));
    };

    // One handler for both backends. Api never emits session/permission; cli does.
    const onEvent = (event: ChatStreamEvent) => {
      if (streamingIdRef.current !== assistantId) return;
      const parts = assistantPartsRef.current;

      switch (event.type) {
        case "token": {
          const last = parts[parts.length - 1];
          setParts(last?.type === "text"
            ? [...parts.slice(0, -1), { type: "text", content: last.content + event.delta }]
            : [...parts, { type: "text", content: event.delta }]);
          break;
        }

        case "tool-call": {
          const newPart: MessagePart = event.toolName === "propose_agent_task"
            ? {
                type: "proposal",
                id: event.id,
                agent: ((event.args ?? {}) as { agent?: string }).agent ?? "",
                model: ((event.args ?? {}) as { model?: string }).model,
                task: ((event.args ?? {}) as { task?: string }).task ?? "",
                reason: ((event.args ?? {}) as { reason?: string }).reason ?? "",
                launched: false,
                dismissed: false,
              }
            : { type: "tool-call", id: event.id, toolName: event.toolName, args: event.args, status: "running" };
          setParts([...parts, newPart]);
          break;
        }

        case "tool-result": {
          setParts(parts.map((p) =>
            p.type === "tool-call" && p.id === event.id
              ? { ...p, result: event.result, status: "complete" as const }
              : p,
          ));
          break;
        }

        case "permission-request": {
          setParts([...parts, {
            type: "permission",
            id: event.id,
            toolName: event.toolName,
            title: event.title,
            description: event.description,
            input: event.input,
          }]);
          break;
        }

        case "session": {
          patchNodeData(id, { claudeSessionId: event.sessionId });
          break;
        }

        case "finish": {
          const used = event.inputTokens + event.outputTokens;
          setContextTokens(used);
          patchNodeData(id, { contextTokens: used, ...(event.sessionId ? { claudeSessionId: event.sessionId } : {}) });
          setIsLoading(false);
          streamingIdRef.current = null;
          persistChat([...prior, userMsg, { id: assistantId, role: "assistant", parts: assistantPartsRef.current }]);
          break;
        }

        case "error": {
          const errParts: MessagePart[] = [...parts, { type: "text", content: event.message }];
          setParts(errParts);
          setIsLoading(false);
          streamingIdRef.current = null;
          persistChat([...prior, userMsg, { id: assistantId, role: "assistant", parts: errParts }]);
          break;
        }
      }
    };

    if (backend === "cli") {
      const data = getNodeData<{ claudeSessionId?: string }>(id);
      // Chat nodes have no branch binding in v1 → Claude Code runs in the project root.
      // model.id is the resolved CLI alias (legacy "default" already collapsed to Haiku).
      cancelRef.current = streamClaudeCode({
        prompt: rawText,
        cwd: projectPath ?? ".",
        resume: data.claudeSessionId,
        model: model.id,
        projectId,
        onEvent,
      });
    } else if (backend === "warp") {
      // Experimental Warp backend — non-streaming. system carries the same
      // lineage + canvas map the BYOK path builds, so context stays consistent.
      cancelRef.current = streamWarp({
        model: model.id,
        messages: [...history, { role: "user", content: rawText }],
        system,
        onEvent,
      });
    } else {
      cancelRef.current = streamChat({
        providerId: provider.id,
        modelId: model.id,
        messages: [...history, { role: "user", content: rawText }],
        system,
        tools: tools as Parameters<typeof streamChat>[0]["tools"],
        onEvent,
      });
    }
  }, [isLoading, backend, provider, model, projectPath, projectId, atlasIndexed, id, threadId, persistChat]);

  // Resolve a Claude Code permission prompt: tell the sidecar, freeze the card.
  // Update the streaming buffer too so the next token snapshot keeps the decision.
  function decidePermission(assistantMsgId: string, permId: string, behavior: "allow" | "deny") {
    cancelRef.current?.decide?.(permId, behavior);
    const freeze = (parts: MessagePart[]) =>
      parts.map((p) => (p.type === "permission" && p.id === permId ? { ...p, decision: behavior } : p));
    assistantPartsRef.current = freeze(assistantPartsRef.current);
    setMessages((prev) => {
      const updated = prev.map((m) => (m.id !== assistantMsgId ? m : { ...m, parts: freeze(m.parts) }));
      persistChat(updated);
      return updated;
    });
  }

  async function launchProposal(assistantMsgId: string, proposalId: string, agentHint: string, prompt: string, model?: string) {
    // Resolve the "Run in:" target: root ("") → undefined; "__new__" cuts a worktree first.
    let worktreePath: string | undefined;
    if (target === "__new__") {
      worktreePath = (await createCanvasWorktree?.(newName)) ?? undefined;
      if (!worktreePath) return; // empty name / creation failed
    } else if (target) {
      worktreePath = target;
    }
    onLaunchAgent?.(agentHint, prompt, model, id, worktreePath);
    setMessages((prev) => {
      const updated = prev.map((m) =>
        m.id !== assistantMsgId ? m
          : { ...m, parts: m.parts.map((p) => (p.type === "proposal" && p.id === proposalId ? { ...p, launched: true } : p)) },
      );
      persistChat(updated);
      return updated;
    });
  }

  function dismissProposal(assistantMsgId: string, proposalId: string) {
    setMessages((prev) => {
      const updated = prev.map((m) =>
        m.id !== assistantMsgId ? m
          : { ...m, parts: m.parts.map((p) => (p.type === "proposal" && p.id === proposalId ? { ...p, dismissed: true } : p)) },
      );
      persistChat(updated);
      return updated;
    });
  }

  function openPicker() {
    if (!pickerBtnRef.current) return;
    const r = pickerBtnRef.current.getBoundingClientRect();
    setPickerPos({ bottom: window.innerHeight - r.top + 6, left: r.left });
    setPickerProvider(backend === "cli" ? CLAUDE_CODE : backend === "warp" ? WARP : provider.id);
    setSearch("");
    setPickerOpen(true);
    setTimeout(() => searchRef.current?.focus(), 50);
  }

  function selectModel(m: ChatModel) {
    if (pickerProvider === CLAUDE_CODE) {
      setBackend("cli");
      setModel(m);
      patchNodeData(id, { backend: "cli", cliModel: m.id });
    } else {
      const p = CHAT_PROVIDERS.find((cp) => cp.id === pickerProvider);
      if (p) { setProvider(p); setRuntimeState({ chatProvider: p.id }); }
      setBackend("api");
      setModel(m);
      setRuntimeState({ chatModel: m.id });
      patchNodeData(id, { backend: "api" });
    }
    setPickerOpen(false);
  }

  // Pick a model for a CLI agent (Claude Code) from its inline dropdown → activate
  // the cli backend on this node.
  function selectCliModel(modelId: string) {
    const m = CLAUDE_CODE_MODELS.find((x) => x.id === modelId) ?? CLAUDE_CODE_MODELS[0];
    setBackend("cli");
    setModel(m);
    patchNodeData(id, { backend: "cli", cliModel: m.id });
    setPickerOpen(false);
  }

  function selectWarpModel(modelId: string) {
    const m = WARP_MODELS.find((x) => x.id === modelId) ?? WARP_MODELS[0];
    setBackend("warp");
    setModel(m);
    patchNodeData(id, { backend: "warp", warpModel: m.id });
    setPickerOpen(false);
  }

  const isCliCat = pickerProvider === CLAUDE_CODE || pickerProvider === WARP;
  // BYOK-provider category vars (the cli category renders its own agents list).
  const activePickerProvider = CHAT_PROVIDERS.find((p) => p.id === pickerProvider);
  const catLabel  = activePickerProvider?.label ?? "";
  const catIcon   = activePickerProvider?.icon ?? "";
  const catInvert = activePickerProvider?.invert ?? false;
  const rawPickerModels = manifest.providers[pickerProvider] ?? [];
  const filteredModels = search.trim()
    ? rawPickerModels.filter((m) => m.label.toLowerCase().includes(search.toLowerCase()))
    : rawPickerModels;

  // Context ring geometry (same as old ChatNode).
  const ctxSize   = contextSizeFor(manifest, model.id);
  const ctxPct    = contextTokens > 0 ? Math.min(contextTokens / ctxSize, 1) : 0;
  const ctxR      = 7;
  const ctxCirc   = 2 * Math.PI * ctxR;
  const ctxOffset = ctxCirc * (1 - ctxPct);
  const ctxLevel  = ctxPct >= 0.9 ? "danger" : ctxPct >= 0.7 ? "warn" : "ok";
  const ctxUsedK  = (contextTokens / 1000).toFixed(1);
  const ctxTotalK = Math.round(ctxSize / 1000);
  const ctxLeftK  = ((ctxSize - contextTokens) / 1000).toFixed(1);

  if (data?.collapsed) return <CollapsedNode id={id} />;

  return (
    <div
      className="tnode-card"
      style={{
        width: "100%", minHeight: 200, boxSizing: "border-box",
        display: "flex", flexDirection: "column", overflow: "hidden",
        background: "var(--tempest-bg-elevated, #161616)",
        border: "1px solid var(--tempest-border-subtle, #2a2a2a)",
        borderRadius: 8,
      }}
    >
      {/* Only the left/right edges resize (width). Height is content-driven — the
          node grows downward as messages stack, so no vertical resize handles. */}
      {(["right", "left"] as const).map((pos) => (
        <NodeResizeControl
          key={pos}
          position={pos}
          variant={ResizeControlVariant.Line}
          minWidth={260}
          className={`tnode-edge tnode-edge--${pos}`}
        >
          <span className="tnode-grip tnode-grip--v" />
        </NodeResizeControl>
      ))}

      {/* Header — drag handle. Title pill (left), delete + connector (right). */}
      <div
        style={{
          flex: "0 0 auto", padding: "6px 8px", cursor: "grab", userSelect: "none",
          display: "flex", alignItems: "center", gap: 6,
        }}
      >
        <NodeConnector nodeId={id} side="left" />

        <div
          className="tnode-title-pill nodrag"
          onDoubleClick={() => setEditingTitle(true)}
          style={{ transform: `scale(${titleScale})`, transformOrigin: "left center" }}
        >
          {editingTitle ? (
            <input
              className="tnode-title-input"
              autoFocus
              value={title}
              style={{ width: `${Math.max(title.length, 4) + 1}ch` }}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={commitTitle}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitTitle();
                else if (e.key === "Escape") { setTitle(getNodeData<{ title?: string }>(id).title ?? "new chat"); setEditingTitle(false); }
                e.stopPropagation();
              }}
              onFocus={(e) => e.currentTarget.select()}
            />
          ) : (
            <>
              <span className="tnode-title-text">{title}</span>
              <button className="tnode-title-edit" title="Rename chat" onClick={() => setEditingTitle(true)}>
                <Pencil size={11} strokeWidth={2.2} />
              </button>
            </>
          )}
        </div>

        <div style={{ flex: 1 }} />

        {/* "Run in:" picker — the worktree proposals launched from this chat land in. */}
        {onLaunchAgent && (
          <div
            className="nodrag"
            onClick={(e) => e.stopPropagation()}
            style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, flex: "0 1 auto", minWidth: 0, maxWidth: 200 }}
          >
            <span style={{ opacity: 0.5, flexShrink: 0 }}>Run in:</span>
            <SpSelect className="sp-drop--full" value={target} options={runInOptions} onChange={setTarget} />
            {target === "__new__" && (
              <input
                placeholder="new-branch-name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                style={{
                  width: 110, padding: "4px 6px", borderRadius: 6, font: "inherit", flexShrink: 0,
                  border: "1px solid var(--tempest-border-default, #2a2a2a)",
                  background: "var(--tempest-bg-hover, #0f0f0f)",
                  color: "var(--tempest-fg-default, #e6e6e6)",
                }}
              />
            )}
          </div>
        )}

        <div style={{ flex: 1 }} />

        <button
          className="tnode-header-btn nodrag"
          title="Delete chat"
          onClick={(e) => { e.stopPropagation(); void deleteElements({ nodes: [{ id }] }); }}
        >
          <Trash2 size={13} />
        </button>

        <NodeConnector nodeId={id} side="right" />
      </div>

      {/* Body — messages stack and grow downward (no internal scroll). Draggable:
          holding anywhere in the middle moves the node. */}
      <div className="chat-msgs" style={{ flex: "1 0 auto", overflow: "visible", cursor: "grab" }}>
        {messages.map((msg) => {
          const isStreaming = isLoading && msg.id === streamingIdRef.current;
          return (
            <div key={msg.id} className="chat-msg">
              {msg.role === "user" ? (
                <div className="chat-msg-avatar chat-msg-avatar--user" />
              ) : (
                <img className="chat-msg-avatar chat-msg-avatar--assistant" src={tempestChat} alt="Tempest" />
              )}
              <div className="chat-msg-body">
                {msg.role === "user" ? (
                  <span>{msg.parts.filter((p): p is TextPart => p.type === "text").map((p) => p.content).join("")}</span>
                ) : isStreaming && msg.parts.length === 0 ? (
                  <div className="chat-thinking-text">
                    <span className="chat-thinking-shimmer">Thinking…</span>
                  </div>
                ) : (
                  msg.parts.map((part, i) => {
                    if (part.type === "text") return <Markdown key={i}>{part.content}</Markdown>;
                    if (part.type === "tool-call") return <ToolCallCard key={part.id} part={part} />;
                    if (part.type === "proposal") {
                      return (
                        <ProposalCard
                          key={part.id}
                          part={part}
                          onLaunch={() => launchProposal(msg.id, part.id, part.agent, part.task, part.model)}
                          onDismiss={() => dismissProposal(msg.id, part.id)}
                        />
                      );
                    }
                    if (part.type === "permission") {
                      return (
                        <PermissionCard
                          key={part.id}
                          part={part}
                          onAllow={() => decidePermission(msg.id, part.id, "allow")}
                          onDeny={() => decidePermission(msg.id, part.id, "deny")}
                        />
                      );
                    }
                    return null;
                  })
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Footer — no border, muted fill. Single composer row:
          [attach] [text input] [model picker] [context ring] [send]. */}
      <div
        className="chat-box-bar nodrag"
        style={{ flex: "0 0 auto", padding: "6px 8px", background: "var(--tempest-bg-canvas-wrap)" }}
      >
        <button className="chat-bar-btn" disabled title="Attach files">
          <Plus size={14} />
        </button>

        <div
          onClick={focusInput}
          style={{ flex: 1, minHeight: 32, position: "relative", display: "flex", background: "transparent", cursor: "text" }}
        >
          {isEmpty && <div className="chat-box-ph" style={{ top: 7, left: 10 }}>Ask anything…</div>}
          <div
            ref={editableRef}
            className="chat-box-edit"
            contentEditable
            suppressContentEditableWarning
            onInput={onInput}
            onKeyDown={onKeyDown}
            spellCheck={false}
            style={{ flex: 1, minHeight: 18, maxHeight: 150, padding: "7px 10px" }}
          />
        </div>

        <button
          ref={pickerBtnRef}
          className="chat-bar-mode"
          onClick={(e) => { e.stopPropagation(); openPicker(); }}
        >
          {backend === "cli" || backend === "warp" ? (
            <Terminal size={13} style={{ flexShrink: 0 }} />
          ) : (
            <img
              src={CDN + provider.icon}
              alt={provider.label}
              width={14}
              height={14}
              className={provider.invert ? "chat-logo-invert" : ""}
              style={{ objectFit: "contain", flexShrink: 0 }}
              onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
            />
          )}
          {backend === "cli" ? `Claude Code · ${model.label}`
            : backend === "warp" ? `Warp · ${model.label}`
            : model.label}
          <ChevronDown size={11} style={{ transform: pickerOpen ? "rotate(180deg)" : "none", transition: "transform 0.15s" }} />
        </button>

        {contextTokens > 0 && (
          <div
            className={`chat-ctx-ring chat-ctx-ring--${ctxLevel}`}
            onMouseEnter={() => setCtxPopupOpen(true)}
            onMouseLeave={() => setCtxPopupOpen(false)}
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <circle cx="10" cy="10" r={ctxR} strokeWidth="2" className="chat-ctx-track" />
              <circle
                cx="10" cy="10" r={ctxR} strokeWidth="2"
                strokeDasharray={ctxCirc}
                strokeDashoffset={ctxOffset}
                strokeLinecap="round"
                transform="rotate(-90 10 10)"
                className="chat-ctx-progress"
              />
            </svg>
            {ctxPopupOpen && (
              <div className="chat-ctx-popup">
                <div className="chat-ctx-popup-title">Context window</div>
                <div className="chat-ctx-popup-bar">
                  <div className={`chat-ctx-popup-fill chat-ctx-popup-fill--${ctxLevel}`} style={{ width: `${Math.round(ctxPct * 100)}%` }} />
                </div>
                <div className="chat-ctx-popup-row">
                  <span className="chat-ctx-popup-label">Used</span>
                  <span className="chat-ctx-popup-value">{ctxUsedK}k / {ctxTotalK}k</span>
                </div>
                <div className="chat-ctx-popup-row">
                  <span className="chat-ctx-popup-label">Remaining</span>
                  <span className="chat-ctx-popup-value">{ctxLeftK}k tokens</span>
                </div>
              </div>
            )}
          </div>
        )}

        <button
          className="chat-bar-send"
          onClick={(e) => { e.stopPropagation(); void send(); }}
          disabled={isEmpty || isLoading}
          title="Send"
        >
          <ArrowUp size={14} />
        </button>
      </div>

      {pickerOpen && createPortal(
        <>
          <div className="chat-drop-overlay" onClick={() => setPickerOpen(false)} />
          <div className="chat-picker" style={{ bottom: pickerPos.bottom, left: pickerPos.left }}>
            <div className="chat-picker-sidebar">
              {/* Claude Code — its own category (CLI harness), set apart from the
                  BYOK providers below by a divider. Not part of the providers list. */}
              <button
                className={`chat-picker-prov${isCliCat ? " chat-picker-prov--active" : ""}`}
                onClick={() => { setPickerProvider(CLAUDE_CODE); setSearch(""); }}
                title="Agents (CLI)"
              >
                <Terminal size={16} />
              </button>
              <div style={{ height: 1, margin: "4px 6px", background: "var(--tempest-border-subtle, #2a2a2a)" }} />
              {CHAT_PROVIDERS.map((p) => (
                <button
                  key={p.id}
                  className={`chat-picker-prov${pickerProvider === p.id ? " chat-picker-prov--active" : ""}`}
                  onClick={() => { setPickerProvider(p.id); setSearch(""); searchRef.current?.focus(); }}
                  title={p.label}
                >
                  <img
                    src={CDN + p.icon}
                    alt={p.label}
                    width={16}
                    height={16}
                    className={p.invert ? "chat-logo-invert" : ""}
                    style={{ objectFit: "contain" }}
                    onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
                  />
                </button>
              ))}
            </div>
            <div className="chat-picker-panel">
              <div className="chat-picker-prov-name">{isCliCat ? "Agents" : catLabel}</div>
              {isCliCat ? (
                // Agents list: one item per (agent, model) — same shape as the
                // BYOK model list. Grouped by a small agent header. Kills the
                // nested-dropdown problem that squished the agent name.
                (() => {
                  const q = search.trim().toLowerCase();
                  const matches = (m: ChatModel, group: string) =>
                    !q || group.includes(q) || m.label.toLowerCase().includes(q) || m.id.toLowerCase().includes(q);
                  const cliShown = CLAUDE_CODE_MODELS.filter((m) => matches(m, "claude code"));
                  const warpShown = settings.experimentalWarp ? WARP_MODELS.filter((m) => matches(m, "warp")) : [];
                  return (
                    <>
                      <div className="chat-picker-search-wrap">
                        <div className="chat-picker-search-box">
                          <Search size={11} className="chat-picker-search-ico" />
                          <input
                            ref={searchRef}
                            className="chat-picker-search-inp"
                            placeholder="Search agents…"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                          />
                        </div>
                      </div>
                      <div className="chat-picker-list">
                        {cliShown.length === 0 && warpShown.length === 0 && (
                          <div className="chat-picker-empty">No agents found</div>
                        )}

                        {cliShown.length > 0 && (
                          <>
                            <div style={{
                              display: "flex", alignItems: "center", gap: 6,
                              padding: "6px 8px 4px", fontSize: 10, fontWeight: 600,
                              color: "var(--tempest-fg-subtle)", textTransform: "uppercase",
                              letterSpacing: "0.07em",
                            }}>
                              <Terminal size={11} />
                              Claude Code
                            </div>
                            {cliShown.map((m) => (
                              <button
                                key={`cli-${m.id}`}
                                className={`chat-picker-item${backend === "cli" && model.id === m.id ? " chat-picker-item--active" : ""}`}
                                onClick={() => selectCliModel(m.id)}
                              >
                                <div className="chat-picker-item-logo"><Terminal size={16} /></div>
                                <div className="chat-picker-item-text">
                                  <span className="chat-picker-item-name">{m.label}</span>
                                </div>
                                {backend === "cli" && model.id === m.id && <div className="chat-picker-item-dot" />}
                              </button>
                            ))}
                          </>
                        )}

                        {warpShown.length > 0 && (
                          <>
                            <div style={{
                              display: "flex", alignItems: "center", gap: 6,
                              padding: "10px 8px 4px", fontSize: 10, fontWeight: 600,
                              color: "var(--tempest-fg-subtle)", textTransform: "uppercase",
                              letterSpacing: "0.07em",
                            }}>
                              <Terminal size={11} />
                              Warp
                              <span style={{
                                fontSize: 9, fontWeight: 600, padding: "1px 5px", borderRadius: 4,
                                background: "var(--tempest-accent-yellow, #f5c518)", color: "#000",
                                letterSpacing: "0.04em", textTransform: "uppercase",
                              }}>Beta</span>
                            </div>
                            {warpShown.map((m) => (
                              <button
                                key={`warp-${m.id}`}
                                className={`chat-picker-item${backend === "warp" && model.id === m.id ? " chat-picker-item--active" : ""}`}
                                onClick={() => selectWarpModel(m.id)}
                              >
                                <div className="chat-picker-item-logo"><Terminal size={16} /></div>
                                <div className="chat-picker-item-text">
                                  <span className="chat-picker-item-name">{m.label}</span>
                                  <span className="chat-picker-item-desc">{m.id}</span>
                                </div>
                                {backend === "warp" && model.id === m.id && <div className="chat-picker-item-dot" />}
                              </button>
                            ))}
                          </>
                        )}
                      </div>
                    </>
                  );
                })()
              ) : (
                <>
                  <div className="chat-picker-search-wrap">
                    <div className="chat-picker-search-box">
                      <Search size={11} className="chat-picker-search-ico" />
                      <input
                        ref={searchRef}
                        className="chat-picker-search-inp"
                        placeholder="Search models…"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="chat-picker-list">
                    {filteredModels.length === 0 ? (
                      <div className="chat-picker-empty">No models found</div>
                    ) : filteredModels.map((m) => (
                      <button
                        key={m.id}
                        className={`chat-picker-item${backend === "api" && model.id === m.id ? " chat-picker-item--active" : ""}`}
                        onClick={() => selectModel(m)}
                      >
                        <div className="chat-picker-item-logo">
                          <img
                            src={CDN + catIcon}
                            alt={catLabel}
                            width={18}
                            height={18}
                            className={catInvert ? "chat-logo-invert" : ""}
                            style={{ objectFit: "contain" }}
                            onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
                          />
                        </div>
                        <div className="chat-picker-item-text">
                          <span className="chat-picker-item-name">{m.label}</span>
                          <span className="chat-picker-item-desc">{m.id}</span>
                        </div>
                        {backend === "api" && model.id === m.id && <div className="chat-picker-item-dot" />}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        </>,
        document.body,
      )}
    </div>
  );
}

// Claude Code permission prompt (CLI backend). Shows the SDK's own prompt text
// and blocks the agent until the user allows or denies; once resolved the card
// freezes to the decision.
function PermissionCard({ part, onAllow, onDeny }: { part: PermissionPart; onAllow: () => void; onDeny: () => void }) {
  const heading = part.title ?? `Claude wants to use ${part.toolName}`;
  return (
    <div
      className="nodrag"
      style={{
        margin: "6px 0", padding: "8px 10px", borderRadius: 8,
        border: "1px solid var(--tempest-border-default, #2a2a2a)",
        background: "var(--tempest-bg-hover, #0f0f0f)",
        fontSize: 12, display: "flex", flexDirection: "column", gap: 6,
      }}
    >
      <div style={{ fontWeight: 600, color: "var(--tempest-fg-default, #e6e6e6)" }}>{heading}</div>
      {part.description && (
        <div style={{ opacity: 0.65, lineHeight: 1.4 }}>{part.description}</div>
      )}
      {part.decision ? (
        <div style={{ opacity: 0.6, fontStyle: "italic" }}>
          {part.decision === "allow" ? "Allowed" : "Denied"}
        </div>
      ) : (
        <div style={{ display: "flex", gap: 6 }}>
          <button
            onClick={(e) => { e.stopPropagation(); onAllow(); }}
            style={{
              padding: "4px 12px", borderRadius: 6, cursor: "pointer", fontWeight: 600,
              border: "1px solid var(--tempest-accent, #4a9eff)",
              background: "var(--tempest-accent, #4a9eff)", color: "#fff",
            }}
          >
            Allow
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onDeny(); }}
            style={{
              padding: "4px 12px", borderRadius: 6, cursor: "pointer",
              border: "1px solid var(--tempest-border-default, #2a2a2a)",
              background: "transparent", color: "var(--tempest-fg-default, #e6e6e6)",
            }}
          >
            Deny
          </button>
        </div>
      )}
    </div>
  );
}
