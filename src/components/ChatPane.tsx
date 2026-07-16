import { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { invoke } from "@tauri-apps/api/core";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Plus, ArrowUp, ChevronDown, Search, Bug, GitPullRequest, Sliders } from "lucide-react";
import { streamChat } from "../lib/chat";
import { createChatTools } from "../lib/chatTools";
import type { CommitInfo, GitStatusEntry } from "../lib/chatTools";
import { getRuntimeState, setRuntimeState } from "../lib/runtimeState";
import {
  CDN,
  CHAT_PROVIDERS,
  PROVIDER_MODELS,
  getContextSize,
  type ChatProvider,
  type ChatModel,
} from "../lib/chatModels";
import { ToolCallCard } from "./ChatPane/ToolCallCard";
import { ProposalCard } from "./ChatPane/ProposalCard";
import {
  loadChatHistory,
  saveChatHistory,
  buildProjectContext,
  buildSystemPrompt,
} from "../lib/chatHistory";
import tempestChat from "../assets/tempest-chat.png";
import "./ChatPane.css";

import type {
  TextPart,
  MessagePart,
  ChatMessage,
} from "../types/chat";



interface Props {
  sessionId: string;
  hidden: boolean;
  projectPath?: string;
  atlasIndexed?: boolean;
  onLaunchAgent?: (agentHint: string, prompt: string, model?: string) => void;
}

// â”€â”€ Component â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export function ChatPane({ hidden, projectPath, atlasIndexed, onLaunchAgent }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>(() => loadChatHistory(projectPath));
  const [isEmpty, setIsEmpty] = useState(true);
  const [isLoading, setIsLoading] = useState(false);

  const [provider, setProvider] = useState<ChatProvider>(() => {
    const saved = localStorage.getItem("tempest-chat-provider");
    return CHAT_PROVIDERS.find(p => p.id === saved) ?? CHAT_PROVIDERS[0];
  });
  const [model, setModel] = useState<ChatModel>(() => {
    const savedProvider = localStorage.getItem("tempest-chat-provider");
    const savedModel    = localStorage.getItem("tempest-chat-model");
    const models = PROVIDER_MODELS[savedProvider ?? "anthropic"] ?? [];
    return models.find(m => m.id === savedModel) ?? PROVIDER_MODELS["anthropic"][0];
  });
  const [pickerOpen, setPickerOpen]     = useState(false);
  const [pickerPos, setPickerPos]       = useState({ bottom: 0, left: 0 });
  const [pickerProvider, setPickerProvider] = useState(CHAT_PROVIDERS[0].id);
  const [search, setSearch]             = useState("");

  const [contextTokens, setContextTokens] = useState(() => {
    const history = loadChatHistory(projectPath);
    if (history.length === 0) return 0;
    return getRuntimeState().chatContextTokens[projectPath ?? ""] ?? 0;
  });
  const [ctxPopupOpen, setCtxPopupOpen] = useState(false);

  const [projectContext, setProjectContext] = useState("");
  const projectContextRef = useRef("");
  const systemPromptRef   = useRef("");

  const [systemPrompt, setSystemPrompt] = useState(() =>
    projectPath ? getRuntimeState().chatSystemPrompts?.[projectPath] ?? "" : ""
  );
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsPos, setSettingsPos]   = useState({ bottom: 0, left: 0 });
  const settingsBtnRef = useRef<HTMLButtonElement>(null);

  const [slashOpen, setSlashOpen]   = useState(false);
  const [slashIdx,  setSlashIdx]    = useState(0);
  const [slashFilter, setSlashFilter] = useState("");

  const [atOpen,   setAtOpen]       = useState(false);
  const [atIdx,    setAtIdx]        = useState(0);
  const [atFiles,  setAtFiles]      = useState<string[]>([]);
  const atFilesCacheRef = useRef<string[] | null>(null);
  const [atSearch, setAtSearch]     = useState("");
  const atSearchRef = useRef<HTMLInputElement>(null);

  const editableRef    = useRef<HTMLDivElement>(null);
  const chatBoxRef     = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const pickerBtnRef   = useRef<HTMLButtonElement>(null);
  const searchRef      = useRef<HTMLInputElement>(null);
  const cancelRef      = useRef<{ cancel: () => void } | null>(null);
  const streamingIdRef = useRef<string | null>(null);
  const messagesRef    = useRef<ChatMessage[]>([]);

  useEffect(() => { messagesRef.current = messages; }, [messages]);
  useEffect(() => { projectContextRef.current = projectContext; }, [projectContext]);
  useEffect(() => { systemPromptRef.current = systemPrompt; }, [systemPrompt]);

  useEffect(() => {
    if (atOpen) {
      setAtSearch("");
      setTimeout(() => atSearchRef.current?.focus(), 50);
    }
  }, [atOpen]);

  useEffect(() => {
    let cancelled = false;
    if (!projectPath) {
      setProjectContext("");
      return;
    }
    (async () => {
      const [branch, commits, status, remote] = await Promise.all([
        invoke<string>("get_git_branch", { path: projectPath }).catch(() => ""),
        invoke<CommitInfo[]>("git_recent_commits", { path: projectPath, count: 5 }).catch(() => []),
        invoke<GitStatusEntry[]>("git_status", { path: projectPath }).catch(() => []),
        invoke<string>("git_remote_url", { path: projectPath }).catch(() => ""),
      ]);
      if (cancelled) return;
      setProjectContext(buildProjectContext(projectPath, branch, commits, status, remote));
    })();
    return () => { cancelled = true; };
  }, [projectPath]);

  useEffect(() => {
    setSystemPrompt(projectPath ? getRuntimeState().chatSystemPrompts?.[projectPath] ?? "" : "");
  }, [projectPath]);

  useEffect(() => {
    if (!hidden && messages.length > 0) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, hidden]);

  const SLASH_COMMANDS = [
    { cmd: "/clear",  label: "Clear chat",         desc: "Start a fresh conversation" },
    { cmd: "/status", label: "Git status",          inject: "What's the current git status?" },
    { cmd: "/log",    label: "Recent commits",      inject: "Show me the recent commits" },
    { cmd: "/files",  label: "List files",          inject: "List the files in this project" },
    { cmd: "/agent",  label: "Propose agent task",  inject: "Based on our conversation so far, propose an agent task to implement the work we discussed" },
  ] as const;

  function clearChatHistory() {
    setMessages([]);
    saveChatHistory(projectPath, []);
    setContextTokens(0);
    if (projectPath) {
      const st = getRuntimeState();
      setRuntimeState({ chatContextTokens: { ...st.chatContextTokens, [projectPath]: 0 } });
    }
  }

  const send = useCallback(async (injectText?: string) => {
    const chips = Array.from(editableRef.current?.querySelectorAll(".chat-input-chip") ?? [])
      .map(el => (el as HTMLElement).dataset.path ?? "")
      .filter(Boolean);

    const rawText = injectText ?? (editableRef.current?.innerText ?? "").trim();
    if (!rawText || isLoading) return;

    if (editableRef.current) editableRef.current.innerHTML = "";
    setIsEmpty(true);
    setSlashOpen(false);
    setAtOpen(false);

    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      parts: [{ type: "text", content: rawText }],
    };
    const assistantId = crypto.randomUUID();
    const prior = messagesRef.current;

    setMessages(prev => [
      ...prev,
      userMsg,
      { id: assistantId, role: "assistant", parts: [] },
    ]);
    streamingIdRef.current = assistantId;
    setIsLoading(true);

    cancelRef.current?.cancel();

    const history = prior.map(m => ({
      role: m.role,
      content: m.parts.filter((p): p is TextPart => p.type === "text").map(p => p.content).join(""),
    }));

    const system = buildSystemPrompt(systemPromptRef.current, projectContextRef.current);

    // Read mentioned files and prepend as context
    let userContent = rawText;
    if (chips.length > 0) {
      const settled = await Promise.allSettled(
        chips.map(p => invoke<string>("read_file", { path: p }).then(c => ({ p, c })))
      );
      const preamble = settled
        .filter((r): r is PromiseFulfilledResult<{ p: string; c: string }> => r.status === "fulfilled")
        .map(r => `<file path="${r.value.p}">\n${r.value.c.slice(0, 6000)}\n</file>`)
        .join("\n");
      if (preamble) userContent = preamble + "\n\n" + rawText;
    }

    const tools = projectPath
      ? await createChatTools({ projectPath, atlasIndexed: atlasIndexed ?? false })
      : undefined;

    let assistantParts: MessagePart[] = [];

    const stream = streamChat({
      providerId: provider.id,
      modelId:    model.id,
      messages:   [...history, { role: "user", content: userContent }],
      system,
      tools:      tools as Parameters<typeof streamChat>[0]["tools"],
      onEvent: (event) => {
        if (streamingIdRef.current !== assistantId) return;

        switch (event.type) {
          case "token": {
            const last = assistantParts[assistantParts.length - 1];
            if (last?.type === "text") {
              assistantParts = [
                ...assistantParts.slice(0, -1),
                { type: "text", content: last.content + event.delta },
              ];
            } else {
              assistantParts = [...assistantParts, { type: "text", content: event.delta }];
            }
            const snap = assistantParts;
            setMessages(prev => prev.map(m => m.id === assistantId ? { ...m, parts: snap } : m));
            break;
          }

          case "tool-call": {
            const newPart: MessagePart = event.toolName === "propose_agent_task"
              ? {
                  type: "proposal",
                  id: event.id,
                  agent:   ((event.args ?? {}) as { agent?: string }).agent   ?? "",
                  model:   ((event.args ?? {}) as { model?: string }).model,
                  task:    ((event.args ?? {}) as { task?: string }).task     ?? "",
                  reason:  ((event.args ?? {}) as { reason?: string }).reason ?? "",
                  launched: false,
                  dismissed: false,
                }
              : {
                  type: "tool-call",
                  id:       event.id,
                  toolName: event.toolName,
                  args:     event.args,
                  status:   "running",
                };
            assistantParts = [...assistantParts, newPart];
            const snap = assistantParts;
            setMessages(prev => prev.map(m => m.id === assistantId ? { ...m, parts: snap } : m));
            break;
          }

          case "tool-result": {
            assistantParts = assistantParts.map(p =>
              p.type === "tool-call" && p.id === event.id
                ? { ...p, result: event.result, status: "complete" as const }
                : p
            );
            const snap = assistantParts;
            setMessages(prev => prev.map(m => m.id === assistantId ? { ...m, parts: snap } : m));
            break;
          }

          case "finish": {
            const used = event.inputTokens + event.outputTokens;
            setContextTokens(used);
            if (projectPath) {
              const st = getRuntimeState();
              setRuntimeState({ chatContextTokens: { ...st.chatContextTokens, [projectPath]: used } });
            }
            setIsLoading(false);
            streamingIdRef.current = null;
            saveChatHistory(projectPath, [
              ...prior,
              userMsg,
              { id: assistantId, role: "assistant", parts: assistantParts },
            ]);
            break;
          }

          case "error": {
            const errParts: MessagePart[] = [{ type: "text", content: event.message }];
            assistantParts = errParts;
            setMessages(prev => prev.map(m =>
              m.id === assistantId ? { ...m, parts: errParts } : m
            ));
            setIsLoading(false);
            streamingIdRef.current = null;
            saveChatHistory(projectPath, [
              ...prior,
              userMsg,
              { id: assistantId, role: "assistant", parts: errParts },
            ]);
            break;
          }
        }
      },
    });

    cancelRef.current = stream;
  }, [isLoading, provider, model, projectPath, atlasIndexed]);

  function launchProposal(assistantMsgId: string, proposalId: string, agentHint: string, prompt: string, model?: string) {
    onLaunchAgent?.(agentHint, prompt, model);
    setMessages(prev => {
      const updated = prev.map(m => {
        if (m.id !== assistantMsgId) return m;
        return { ...m, parts: m.parts.map(p => p.type === "proposal" && p.id === proposalId ? { ...p, launched: true } : p) };
      });
      saveChatHistory(projectPath, updated);
      return updated;
    });
  }

  function dismissProposal(assistantMsgId: string, proposalId: string) {
    setMessages(prev => {
      const updated = prev.map(m => {
        if (m.id !== assistantMsgId) return m;
        return { ...m, parts: m.parts.map(p => p.type === "proposal" && p.id === proposalId ? { ...p, dismissed: true } : p) };
      });
      saveChatHistory(projectPath, updated);
      return updated;
    });
  }

  function updateSystemPrompt(value: string) {
    setSystemPrompt(value);
    if (projectPath) {
      const st = getRuntimeState();
      setRuntimeState({ chatSystemPrompts: { ...st.chatSystemPrompts, [projectPath]: value } });
    }
  }

  function openSettings() {
    if (!settingsBtnRef.current) return;
    const r = settingsBtnRef.current.getBoundingClientRect();
    setSettingsPos({ bottom: window.innerHeight - r.top + 6, left: r.left });
    setSettingsOpen(true);
  }

  const filteredSlash = slashFilter
    ? SLASH_COMMANDS.filter(c =>
        c.cmd.slice(1).startsWith(slashFilter) ||
        c.label.toLowerCase().includes(slashFilter.toLowerCase())
      )
    : [...SLASH_COMMANDS];

  const filteredAtFiles = atSearch
    ? atFiles.filter(f => f.toLowerCase().includes(atSearch.toLowerCase())).slice(0, 8)
    : atFiles.slice(0, 8);

  function onKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (slashOpen) {
      if (e.key === "ArrowDown") { e.preventDefault(); setSlashIdx(i => Math.min(i + 1, filteredSlash.length - 1)); return; }
      if (e.key === "ArrowUp")   { e.preventDefault(); setSlashIdx(i => Math.max(i - 1, 0)); return; }
      if (e.key === "Escape")    { e.preventDefault(); setSlashOpen(false); return; }
      if (e.key === "Enter") {
        e.preventDefault();
        const cmd = filteredSlash[slashIdx];
        if (cmd) executeSlash(cmd);
        return;
      }
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  function onInput() {
    const text = editableRef.current?.innerText ?? "";
    setIsEmpty(!text.trim());

    const trimmed = text.trimStart();
    if (trimmed.startsWith("/")) {
      const filter = trimmed.slice(1).toLowerCase();
      setSlashFilter(filter);
      setSlashIdx(0);
      setSlashOpen(true);
      setAtOpen(false);
      return;
    }

    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0 && editableRef.current) {
      const range = sel.getRangeAt(0);
      const preRange = document.createRange();
      preRange.selectNodeContents(editableRef.current);
      preRange.setEnd(range.endContainer, range.endOffset);
      const textBefore = preRange.toString();
      const lastAt = textBefore.lastIndexOf("@");
      if (lastAt >= 0) {
        const fragment = textBefore.slice(lastAt + 1);
        if (!fragment.includes(" ")) {
          setAtIdx(0);
          setAtOpen(true);
          setSlashOpen(false);
          if (atFilesCacheRef.current === null && projectPath) {
            invoke<string[]>("git_ls_files", { path: projectPath })
              .then(files => { atFilesCacheRef.current = files; setAtFiles(files); })
              .catch(() => {});
          } else if (atFilesCacheRef.current !== null) {
            setAtFiles(atFilesCacheRef.current);
          }
          return;
        }
      }
    }

    setSlashOpen(false);
    setAtOpen(false);
  }

  function executeSlash(cmd: typeof SLASH_COMMANDS[number]) {
    if (editableRef.current) editableRef.current.innerHTML = "";
    setIsEmpty(true);
    setSlashOpen(false);
    if (cmd.cmd === "/clear") { clearChatHistory(); return; }
    if ("inject" in cmd) void send(cmd.inject);
  }

  function insertMentionChip(relativePath: string) {
    const filename = relativePath.split(/[/\\]/).pop() ?? relativePath;
    const editable = editableRef.current;
    if (!editable) return;

    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) { editable.focus(); return; }

    const range = sel.getRangeAt(0);
    const preRange = document.createRange();
    preRange.selectNodeContents(editable);
    preRange.setEnd(range.endContainer, range.endOffset);
    const textBefore = preRange.toString();
    const atPos = textBefore.lastIndexOf("@");
    if (atPos < 0) return;

    let charsLeft = atPos;
    let atNode: Text | null = null;
    let atNodeOffset = 0;
    const iter = document.createNodeIterator(editable, NodeFilter.SHOW_TEXT);
    let node: Node | null;
    while ((node = iter.nextNode())) {
      const t = node as Text;
      if (charsLeft <= t.length) { atNode = t; atNodeOffset = charsLeft; break; }
      charsLeft -= t.length;
    }
    if (!atNode) return;

    const chipRange = document.createRange();
    chipRange.setStart(atNode, atNodeOffset);
    chipRange.setEnd(range.endContainer, range.endOffset);
    chipRange.deleteContents();

    const chip = document.createElement("span");
    chip.contentEditable = "false";
    chip.className = "chat-input-chip";
    chip.dataset.path = relativePath;
    chip.textContent = "@" + filename;
    chipRange.insertNode(chip);

    const cursor = document.createTextNode(" ");
    chip.after(cursor);
    const newRange = document.createRange();
    newRange.setStart(cursor, 1);
    newRange.collapse(true);
    sel.removeAllRanges();
    sel.addRange(newRange);

    setAtOpen(false);
    setIsEmpty(false);
  }

  function focusInput() { editableRef.current?.focus(); }

  function openPicker() {
    if (!pickerBtnRef.current) return;
    const r = pickerBtnRef.current.getBoundingClientRect();
    setPickerPos({ bottom: window.innerHeight - r.top + 6, left: r.left });
    setPickerProvider(provider.id);
    setSearch("");
    setPickerOpen(true);
    setTimeout(() => searchRef.current?.focus(), 50);
  }

  function selectModel(m: ChatModel) {
    const p = CHAT_PROVIDERS.find(cp => cp.id === pickerProvider);
    if (p) {
      setProvider(p);
      localStorage.setItem("tempest-chat-provider", p.id);
    }
    setModel(m);
    localStorage.setItem("tempest-chat-model", m.id);
    setPickerOpen(false);
  }

  const activePickerProvider = CHAT_PROVIDERS.find(p => p.id === pickerProvider)!;
  const rawPickerModels = PROVIDER_MODELS[pickerProvider] ?? [];
  const filteredModels  = search.trim()
    ? rawPickerModels.filter(m => m.label.toLowerCase().includes(search.toLowerCase()))
    : rawPickerModels;
  const hasMessages = messages.length > 0 || isLoading;

  const ctxSize   = getContextSize(model.id);
  const ctxPct    = contextTokens > 0 ? Math.min(contextTokens / ctxSize, 1) : 0;
  const ctxR      = 7;
  const ctxCirc   = 2 * Math.PI * ctxR;
  const ctxOffset = ctxCirc * (1 - ctxPct);
  const ctxLevel  = ctxPct >= 0.9 ? "danger" : ctxPct >= 0.7 ? "warn" : "ok";
  const ctxUsedK  = (contextTokens / 1000).toFixed(1);
  const ctxTotalK = Math.round(ctxSize / 1000);
  const ctxLeftK  = ((ctxSize - contextTokens) / 1000).toFixed(1);

  const popupPos = (() => {
    if (!chatBoxRef.current) return { bottom: 60, left: 8 };
    const r = chatBoxRef.current.getBoundingClientRect();
    return { bottom: window.innerHeight - r.top + 4, left: r.left + 4 };
  })();

  const inputBox = (
    <div className="chat-input-wrap">
    <div ref={chatBoxRef} className="chat-box" onClick={focusInput}>
      {isEmpty && <div className="chat-box-ph">Ask anythingâ€¦</div>}
      <div
        ref={editableRef}
        className="chat-box-edit"
        contentEditable
        suppressContentEditableWarning
        onInput={onInput}
        onKeyDown={onKeyDown}
        spellCheck={false}
      />
      <div className="chat-box-bar">
        <button className="chat-bar-btn" disabled title="Attach files">
          <Plus size={14} />
        </button>

        <button
          ref={pickerBtnRef}
          className="chat-bar-mode"
          onClick={(e) => { e.stopPropagation(); openPicker(); }}
        >
          <img
            src={CDN + provider.icon}
            alt={provider.label}
            width={14}
            height={14}
            className={provider.invert ? "chat-logo-invert" : ""}
            style={{ objectFit: "contain", flexShrink: 0 }}
            onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
          />
          {model.label}
          <ChevronDown size={11} style={{ transform: pickerOpen ? "rotate(180deg)" : "none", transition: "transform 0.15s" }} />
        </button>

        <button
          ref={settingsBtnRef}
          className="chat-bar-btn"
          onClick={(e) => { e.stopPropagation(); openSettings(); }}
          title="System prompt"
        >
          <Sliders size={14} />
        </button>

        <div className="chat-bar-space" />

        {hasMessages && contextTokens > 0 && (
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
                  <div
                    className={`chat-ctx-popup-fill chat-ctx-popup-fill--${ctxLevel}`}
                    style={{ width: `${Math.round(ctxPct * 100)}%` }}
                  />
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
    </div>
    {projectPath && (
      <div className="chat-input-hint">/ for commands · @ to mention a file</div>
    )}
    </div>
  );

  return (
    <div className="chat-pane" style={hidden ? { display: "none" } : undefined}>
      {hasMessages ? (
        <>
          <div className="chat-msgs">
            {messages.map((msg) => {
              const isStreaming = isLoading && msg.id === streamingIdRef.current;
              return (
                <div key={msg.id} className="chat-msg">
                  {msg.role === "user" ? (
                    <div className="chat-msg-avatar chat-msg-avatar--user" />
                  ) : (
                    <img
                      className="chat-msg-avatar chat-msg-avatar--assistant"
                      src={tempestChat}
                      alt="Tempest"
                    />
                  )}
                  <div className="chat-msg-body">
                    {msg.role === "user" ? (
                      <span>{msg.parts.filter((p): p is TextPart => p.type === "text").map(p => p.content).join("")}</span>
                    ) : isStreaming && msg.parts.length === 0 ? (
                      <div className="chat-thinking-text">
                        <span className="chat-thinking-shimmer">Thinkingâ€¦</span>
                      </div>
                    ) : (
                      msg.parts.map((part, i) => {
                        if (part.type === "text") {
                          return (
                            <ReactMarkdown key={i} remarkPlugins={[remarkGfm]}>
                              {part.content}
                            </ReactMarkdown>
                          );
                        }
                        if (part.type === "tool-call") {
                          return <ToolCallCard key={part.id} part={part} />;
                        }
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
                        return null;
                      })
                    )}
                  </div>
                </div>
              );
            })}
            <div ref={messagesEndRef} />
          </div>
          <div className="chat-input-row">{inputBox}</div>
        </>
      ) : (
        <div className="chat-center">
          <div className="chat-empty">
            <p className="chat-empty-title">Hey there!</p>
            <p className="chat-empty-title">What would you like to understand?</p>
          </div>
          <div className="chat-input-row">{inputBox}</div>
          <div className="chat-suggestions">
            <div className="chat-suggestion">
              <Search size={13} className="chat-suggestion-icon" />
              <span className="chat-suggestion-text">How does this codebase work?</span>
            </div>
            <div className="chat-suggestion">
              <Bug size={13} className="chat-suggestion-icon" />
              <span className="chat-suggestion-text">Why is this test failing?</span>
            </div>
            <div className="chat-suggestion">
              <GitPullRequest size={13} className="chat-suggestion-icon" />
              <span className="chat-suggestion-text">Review my latest changes</span>
            </div>
          </div>
        </div>
      )}

      {pickerOpen && createPortal(
        <>
          <div className="chat-drop-overlay" onClick={() => setPickerOpen(false)} />
          <div className="chat-picker" style={{ bottom: pickerPos.bottom, left: pickerPos.left }}>
            <div className="chat-picker-sidebar">
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
              <div className="chat-picker-prov-name">{activePickerProvider.label}</div>
              <div className="chat-picker-search-wrap">
                <div className="chat-picker-search-box">
                  <Search size={11} className="chat-picker-search-ico" />
                  <input
                    ref={searchRef}
                    className="chat-picker-search-inp"
                    placeholder="Search modelsâ€¦"
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
                    className={`chat-picker-item${model.id === m.id ? " chat-picker-item--active" : ""}`}
                    onClick={() => selectModel(m)}
                  >
                    <div className="chat-picker-item-logo">
                      <img
                        src={CDN + activePickerProvider.icon}
                        alt={activePickerProvider.label}
                        width={18}
                        height={18}
                        className={activePickerProvider.invert ? "chat-logo-invert" : ""}
                        style={{ objectFit: "contain" }}
                        onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
                      />
                    </div>
                    <div className="chat-picker-item-text">
                      <span className="chat-picker-item-name">{m.label}</span>
                      <span className="chat-picker-item-desc">{m.id}</span>
                    </div>
                    {model.id === m.id && <div className="chat-picker-item-dot" />}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </>,
        document.body
      )}

      {settingsOpen && createPortal(
        <>
          <div className="chat-drop-overlay" onClick={() => setSettingsOpen(false)} />
          <div className="chat-settings" style={{ bottom: settingsPos.bottom, left: settingsPos.left }}>
            <div className="chat-settings-title">System prompt</div>
            <textarea
              className="chat-settings-textarea"
              placeholder="Add instructions the assistant should always follow in this conversationâ€¦"
              value={systemPrompt}
              onChange={(e) => updateSystemPrompt(e.target.value)}
              spellCheck={false}
            />
            <div className="chat-settings-title chat-settings-title--sub">
              Project context (auto-injected)
            </div>
            <pre className="chat-settings-context">
              {projectContext || "No project context â€” this chat is not attached to a repository."}
            </pre>
          </div>
        </>,
        document.body
      )}

      {slashOpen && filteredSlash.length > 0 && createPortal(
        <div className="chat-cmd-popup" style={{ bottom: popupPos.bottom, left: popupPos.left }}>
          {filteredSlash.map((c, i) => (
            <button
              key={c.cmd}
              className={`chat-cmd-item${i === slashIdx ? " chat-cmd-item--active" : ""}`}
              onMouseDown={(e) => { e.preventDefault(); executeSlash(c); }}
            >
              <span className="chat-cmd-name">{c.cmd}</span>
              <span className="chat-cmd-desc">{c.label}</span>
            </button>
          ))}
        </div>,
        document.body
      )}

      {atOpen && atFiles.length > 0 && createPortal(
        <div className="chat-cmd-popup" style={{ bottom: popupPos.bottom, left: popupPos.left }}>
          <div className="chat-picker-search-wrap">
            <div className="chat-picker-search-box">
              <Search size={11} className="chat-picker-search-ico" />
              <input
                ref={atSearchRef}
                className="chat-picker-search-inp"
                placeholder="Search filesâ€¦"
                value={atSearch}
                onChange={(e) => { setAtSearch(e.target.value); setAtIdx(0); }}
                onKeyDown={(e) => {
                  if (e.key === "ArrowDown") { e.preventDefault(); setAtIdx(i => Math.min(i + 1, filteredAtFiles.length - 1)); }
                  else if (e.key === "ArrowUp") { e.preventDefault(); setAtIdx(i => Math.max(i - 1, 0)); }
                  else if (e.key === "Escape") { e.preventDefault(); setAtOpen(false); editableRef.current?.focus(); }
                  else if (e.key === "Enter") { e.preventDefault(); const f = filteredAtFiles[atIdx]; if (f) insertMentionChip(f); }
                }}
              />
            </div>
          </div>
          {filteredAtFiles.map((f, i) => (
            <button
              key={f}
              className={`chat-cmd-item${i === atIdx ? " chat-cmd-item--active" : ""}`}
              onMouseDown={(e) => { e.preventDefault(); insertMentionChip(f); }}
            >
              <span className="chat-cmd-name">@{f.split(/[/\\]/).pop()}</span>
              <span className="chat-cmd-desc">{f}</span>
            </button>
          ))}
        </div>,
        document.body
      )}
    </div>
  );
}
