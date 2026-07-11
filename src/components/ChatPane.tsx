import { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { invoke } from "@tauri-apps/api/core";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Plus, ArrowUp, ChevronDown, Search, Bug, GitPullRequest, Sliders, FileText, Folder, GitCommit, GitBranch, Bot, Database, Terminal } from "lucide-react";
import { streamChat } from "../lib/chat";
import { createChatTools, argsPreview, resultSummary } from "../lib/chatTools";
import type { CommitInfo, GitStatusEntry } from "../lib/chatTools";
import { getRuntimeState, setRuntimeState } from "../lib/runtimeState";
import tempestChat from "../assets/tempest-chat.png";
import "./ChatPane.css";

const CDN = "https://cdn.jsdelivr.net/npm/@lobehub/icons-static-svg@latest/icons/";

interface ChatProvider {
  id: string;
  label: string;
  icon: string;
  invert: boolean;
}

interface ChatModel {
  id: string;
  label: string;
}

const CHAT_PROVIDERS: ChatProvider[] = [
  { id: "anthropic",  label: "Anthropic",  icon: "anthropic.svg",      invert: true  },
  { id: "openai",     label: "OpenAI",     icon: "openai.svg",          invert: true  },
  { id: "gemini",     label: "Gemini",     icon: "gemini-color.svg",    invert: false },
  { id: "mistral",    label: "Mistral",    icon: "mistral-color.svg",   invert: false },
  { id: "deepseek",   label: "DeepSeek",   icon: "deepseek-color.svg",  invert: false },
  { id: "xai",        label: "xAI",        icon: "xai.svg",             invert: true  },
  { id: "groq",       label: "Groq",       icon: "groq.svg",            invert: true  },
  { id: "openrouter", label: "OpenRouter", icon: "openrouter.svg",      invert: true  },
  { id: "ollama",     label: "Ollama",     icon: "ollama.svg",          invert: true  },
];

const PROVIDER_MODELS: Record<string, ChatModel[]> = {
  anthropic: [
    { id: "claude-fable-5",            label: "Claude Fable 5"    },
    { id: "claude-opus-4-8",           label: "Claude Opus 4.8"   },
    { id: "claude-opus-4-7",           label: "Claude Opus 4.7"   },
    { id: "claude-opus-4-6",           label: "Claude Opus 4.6"   },
    { id: "claude-opus-4-5",           label: "Claude Opus 4.5"   },
    { id: "claude-sonnet-5",           label: "Claude Sonnet 5"   },
    { id: "claude-sonnet-4-6",         label: "Claude Sonnet 4.6" },
    { id: "claude-sonnet-4-5",         label: "Claude Sonnet 4.5" },
    { id: "claude-haiku-4-5-20251001", label: "Claude Haiku 4.5"  },
  ],
  openai: [
    { id: "gpt-5.5",      label: "GPT-5.5"      },
    { id: "gpt-5.4",      label: "GPT-5.4"      },
    { id: "gpt-5.4-mini", label: "GPT-5.4 Mini" },
    { id: "gpt-5.4-nano", label: "GPT-5.4 Nano" },
    { id: "gpt-5",        label: "GPT-5"        },
    { id: "gpt-5-mini",   label: "GPT-5 Mini"   },
    { id: "gpt-4.1",      label: "GPT-4.1"      },
    { id: "gpt-4.1-mini", label: "GPT-4.1 Mini" },
    { id: "gpt-4.1-nano", label: "GPT-4.1 Nano" },
    { id: "gpt-4o",       label: "GPT-4o"       },
    { id: "gpt-4o-mini",  label: "GPT-4o Mini"  },
    { id: "o4-mini",      label: "o4 Mini"      },
    { id: "o3",           label: "o3"           },
    { id: "o3-mini",      label: "o3 Mini"      },
  ],
  gemini: [
    { id: "gemini-3.5-flash",              label: "Gemini 3.5 Flash"      },
    { id: "gemini-3.1-pro-preview",        label: "Gemini 3.1 Pro"        },
    { id: "gemini-3.1-flash-lite-preview", label: "Gemini 3.1 Flash Lite" },
    { id: "gemini-3-flash-preview",        label: "Gemini 3 Flash"        },
    { id: "gemini-2.5-pro",               label: "Gemini 2.5 Pro"        },
    { id: "gemini-2.5-flash",             label: "Gemini 2.5 Flash"      },
    { id: "gemini-flash-latest",          label: "Gemini Flash"          },
    { id: "gemini-flash-lite-latest",     label: "Gemini Flash Lite"     },
  ],
  mistral: [
    { id: "mistral-large-latest",  label: "Mistral Large"    },
    { id: "mistral-large-2512",    label: "Mistral Large 3"  },
    { id: "mistral-medium-2508",   label: "Mistral Medium"   },
    { id: "magistral-medium-2509", label: "Magistral Medium" },
    { id: "magistral-small-2509",  label: "Magistral Small"  },
    { id: "mistral-small-latest",  label: "Mistral Small"    },
    { id: "mistral-small-2603",    label: "Mistral Small 4"  },
    { id: "devstral-2512",         label: "Devstral"         },
    { id: "ministral-14b-2512",    label: "Ministral 14B"    },
    { id: "ministral-8b-2512",     label: "Ministral 8B"     },
    { id: "ministral-3b-2512",     label: "Ministral 3B"     },
  ],
  deepseek: [
    { id: "deepseek-v4-pro",   label: "DeepSeek V4 Pro"   },
    { id: "deepseek-v4-flash", label: "DeepSeek V4 Flash" },
    { id: "deepseek-v3",       label: "DeepSeek V3"       },
    { id: "deepseek-chat",     label: "DeepSeek Chat"     },
    { id: "deepseek-reasoner", label: "DeepSeek Reasoner" },
  ],
  xai: [
    { id: "grok-4.20-non-reasoning-latest",  label: "Grok 4.20"               },
    { id: "grok-4.20-reasoning-latest",      label: "Grok 4.20 Reasoning"     },
    { id: "grok-4-1-fast-non-reasoning",     label: "Grok 4.1 Fast"           },
    { id: "grok-4-1-fast-reasoning",         label: "Grok 4.1 Fast Reasoning" },
    { id: "grok-4-fast-non-reasoning",       label: "Grok 4 Fast"             },
    { id: "grok-4-fast-reasoning",           label: "Grok 4 Fast Reasoning"   },
    { id: "grok-4",                          label: "Grok 4"                  },
    { id: "grok-code-fast-1",               label: "Grok Code Fast"          },
    { id: "grok-3",                          label: "Grok 3"                  },
    { id: "grok-3-mini",                     label: "Grok 3 Mini"             },
  ],
  groq: [
    { id: "openai/gpt-oss-120b",              label: "GPT-OSS 120B"  },
    { id: "openai/gpt-oss-20b",               label: "GPT-OSS 20B"   },
    { id: "qwen/qwen3-32b",                   label: "Qwen 3 32B"    },
    { id: "qwen/qwen3.6-27b",                 label: "Qwen 3.6 27B"  },
    { id: "moonshotai/kimi-k2-instruct-0905", label: "Kimi K2"       },
    { id: "llama-3.3-70b-versatile",          label: "Llama 3.3 70B" },
    { id: "llama-3.1-8b-instant",             label: "Llama 3.1 8B"  },
  ],
  openrouter: [
    { id: "openrouter/auto",                   label: "Auto"                   },
    { id: "deepseek/deepseek-v3.2",            label: "DeepSeek V3.2"          },
    { id: "deepseek/deepseek-v3.2-thinking",   label: "DeepSeek V3.2 Thinking" },
    { id: "deepseek/deepseek-v3.1-terminus",   label: "DeepSeek V3.1 Terminus" },
    { id: "google/gemini-3.1-pro-preview",     label: "Gemini 3.1 Pro"         },
    { id: "google/gemini-3-flash",             label: "Gemini 3 Flash"         },
    { id: "google/gemini-2.5-pro",             label: "Gemini 2.5 Pro"         },
    { id: "moonshotai/kimi-k2.5",              label: "Kimi K2.5"              },
    { id: "moonshotai/kimi-k2-thinking-turbo", label: "Kimi K2 Thinking Turbo" },
    { id: "minimax/minimax-m2.5",              label: "MiniMax M2.5"           },
    { id: "alibaba/qwen3-coder-plus",          label: "Qwen 3 Coder Plus"      },
    { id: "alibaba/qwen3-max",                 label: "Qwen 3 Max"             },
    { id: "meta-llama/llama-3.3-70b-instruct", label: "Llama 3.3 70B"          },
    { id: "mistral/mistral-large-latest",      label: "Mistral Large"          },
  ],
  ollama: [
    { id: "llama3.3",      label: "Llama 3.3 70B"  },
    { id: "llama3.2",      label: "Llama 3.2"      },
    { id: "llama3.1",      label: "Llama 3.1"      },
    { id: "qwen3",         label: "Qwen 3"         },
    { id: "qwen2.5-coder", label: "Qwen 2.5 Coder" },
    { id: "deepseek-r1",   label: "DeepSeek R1"    },
    { id: "deepseek-v3",   label: "DeepSeek V3"    },
    { id: "codellama",     label: "Code Llama"     },
    { id: "mistral",       label: "Mistral 7B"     },
    { id: "neural-chat",   label: "Neural Chat"    },
  ],
};

const MODEL_CONTEXT: Record<string, number> = {
  "claude-fable-5":              2_000_000,
  "claude-opus-4-8":               200_000,
  "claude-opus-4-7":               200_000,
  "claude-opus-4-6":               200_000,
  "claude-opus-4-5":               200_000,
  "claude-sonnet-5":               200_000,
  "claude-sonnet-4-6":             200_000,
  "claude-sonnet-4-5":             200_000,
  "claude-haiku-4-5-20251001":     200_000,
  "gpt-4.1":                     1_047_576,
  "gpt-4.1-mini":                1_047_576,
  "gpt-4.1-nano":                1_047_576,
  "gpt-4o":                        128_000,
  "gpt-4o-mini":                   128_000,
  "o3":                            200_000,
  "o3-mini":                       200_000,
  "o4-mini":                       200_000,
  "gemini-2.5-pro":              1_048_576,
  "gemini-2.5-flash":            1_048_576,
  "gemini-flash-latest":         1_048_576,
  "gemini-flash-lite-latest":    1_048_576,
  "mistral-large-latest":          131_072,
  "mistral-large-2512":            131_072,
  "mistral-medium-2508":           131_072,
  "magistral-medium-2509":         131_072,
  "magistral-small-2509":          131_072,
  "mistral-small-latest":          131_072,
  "mistral-small-2603":            131_072,
  "deepseek-v3":                   163_840,
  "deepseek-chat":                 163_840,
  "deepseek-reasoner":             163_840,
  "grok-4":                        256_000,
  "grok-3":                        131_072,
  "grok-3-mini":                   131_072,
};
const DEFAULT_CONTEXT = 128_000;
function getContextSize(modelId: string): number {
  return MODEL_CONTEXT[modelId] ?? DEFAULT_CONTEXT;
}

// ── Message model ─────────────────────────────────────────────────────────────

type TextPart = { type: "text"; content: string };

type ToolCallPart = {
  type: "tool-call";
  id: string;
  toolName: string;
  args: unknown;
  result?: unknown;
  status: "running" | "complete";
};

type ProposalPart = {
  type: "proposal";
  id: string;
  agent: string;
  model?: string;
  task: string;
  reason: string;
  launched: boolean;
  dismissed: boolean;
};

type MessagePart = TextPart | ToolCallPart | ProposalPart;

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  parts: MessagePart[];
}

// Persisted history format — stores full parts array (tool calls, proposals, text)
interface PersistedMessage {
  id: string;
  role: "user" | "assistant";
  content?: string;       // legacy — plain text (kept for backward compat with old saves)
  parts?: MessagePart[];  // full parts array
}

const MAX_CHAT_HISTORY = 100;

function loadChatHistory(projectPath?: string): ChatMessage[] {
  if (!projectPath) return [];
  const persisted = (getRuntimeState().chatHistory[projectPath] ?? []) as PersistedMessage[];
  return persisted.map(m => ({
    id: m.id,
    role: m.role,
    parts: m.parts ?? [{ type: "text" as const, content: m.content ?? "" }],
  }));
}

function saveChatHistory(projectPath: string | undefined, msgs: ChatMessage[]): void {
  if (!projectPath) return;
  const persisted: PersistedMessage[] = msgs.slice(-MAX_CHAT_HISTORY).map(m => ({
    id: m.id,
    role: m.role,
    parts: m.parts,
  }));
  const st = getRuntimeState();
  setRuntimeState({ chatHistory: { ...st.chatHistory, [projectPath]: persisted } });
}

// ── System prompt ─────────────────────────────────────────────────────────────

const BASE_SYSTEM =
  "You are Tempest, an AI engineering companion embedded in the developer's IDE. " +
  "You help the engineer understand systems, research solutions, plan work, review code, and debug. " +
  "Be precise, technical, and concise. When the engineer's question relates to their project, ground " +
  "your answer in the project context provided below rather than guessing. " +
  "You have tools to read files, list directories, check git status and history, search the codebase, " +
  "and propose agent tasks for complex multi-step work.";

function buildProjectContext(
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

function buildSystemPrompt(custom: string, projectContext: string): string {
  const parts = [BASE_SYSTEM];
  if (projectContext) parts.push("## Project context\n" + projectContext);
  if (custom.trim()) parts.push("## Additional instructions\n" + custom.trim());
  return parts.join("\n\n");
}

// ── Sub-components ────────────────────────────────────────────────────────────

type LucideIcon = React.ComponentType<{ size?: number; className?: string }>;

const TOOL_ICON_MAP: Record<string, LucideIcon> = {
  read_file:          FileText,
  list_files:         Folder,
  run_git_log:        GitCommit,
  run_git_status:     GitBranch,
  propose_agent_task: Bot,
};

const TOOL_LABEL_MAP: Record<string, string> = {
  read_file:          "Read file",
  list_files:         "List files",
  run_git_log:        "Git log",
  run_git_status:     "Git status",
  propose_agent_task: "Propose agent",
};

function getToolIcon(toolName: string): LucideIcon {
  if (toolName.startsWith("atlas_")) return Database;
  return TOOL_ICON_MAP[toolName] ?? Terminal;
}

function getToolLabel(toolName: string): string {
  if (toolName.startsWith("atlas_")) return toolName.slice(6).replace(/_/g, " ");
  return TOOL_LABEL_MAP[toolName] ?? toolName.replace(/_/g, " ");
}

function ToolCallCard({ part }: { part: ToolCallPart }) {
  const [expanded, setExpanded] = useState(false);
  const preview = argsPreview(part.toolName, part.args);
  const Icon = getToolIcon(part.toolName);
  const label = getToolLabel(part.toolName);
  const canExpand = part.status === "complete" && part.result != null;
  const dotState = part.status === "running" ? "running" : "complete";

  return (
    <div className="chat-step">
      <button
        className={`chat-step-trigger${canExpand ? " chat-step-trigger--clickable" : ""}`}
        onClick={() => canExpand && setExpanded(e => !e)}
        disabled={!canExpand}
      >
        <span className={`chat-step-dot chat-step-dot--${dotState}`} />
        <span className="chat-step-icon">
          <Icon size={13} />
        </span>
        <span className="chat-step-name">{label}</span>
        {preview && <span className="chat-step-summary">{preview}</span>}
        {canExpand && (
          <ChevronDown
            size={11}
            className={`chat-step-chevron${expanded ? " chat-step-chevron--open" : ""}`}
          />
        )}
      </button>
      <div className={`chat-step-detail${expanded ? " chat-step-detail--open" : ""}`}>
        <div className="chat-step-detail-overflow">
          <div className="chat-step-detail-inner">
            <pre>{resultSummary(part.result)}</pre>
          </div>
        </div>
      </div>
    </div>
  );
}

function ProposalCard({
  part,
  onLaunch,
  onDismiss,
}: {
  part: ProposalPart;
  onLaunch: () => void;
  onDismiss: () => void;
}) {
  if (part.dismissed) return null;

  return (
    <div className={`chat-proposal-card${part.launched ? " chat-proposal-card--launched" : ""}`}>
      <div className="chat-proposal-header">Agent proposal</div>
      <div className="chat-proposal-field">
        <span className="chat-proposal-label">Agent</span>
        <span className="chat-proposal-value">
          {part.agent}{part.model ? <span className="chat-proposal-model"> · {part.model}</span> : null}
        </span>
      </div>
      <div className="chat-proposal-field">
        <span className="chat-proposal-label">Task</span>
        <span className="chat-proposal-value">{part.task}</span>
      </div>
      <div className="chat-proposal-reason">{part.reason}</div>
      <div className="chat-proposal-actions">
        <button
          className="chat-proposal-btn chat-proposal-btn--launch"
          onClick={onLaunch}
          disabled={part.launched}
        >
          {part.launched ? "Launched" : "Launch agent"}
        </button>
        {!part.launched && (
          <button className="chat-proposal-btn chat-proposal-btn--dismiss" onClick={onDismiss}>
            Dismiss
          </button>
        )}
      </div>
    </div>
  );
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  sessionId: string;
  hidden: boolean;
  projectPath?: string;
  atlasIndexed?: boolean;
  onLaunchAgent?: (agentHint: string, prompt: string, model?: string) => void;
}

// ── Component ─────────────────────────────────────────────────────────────────

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
      {isEmpty && <div className="chat-box-ph">Ask anything…</div>}
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
                        <span className="chat-thinking-shimmer">Thinking…</span>
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
              placeholder="Add instructions the assistant should always follow in this conversation…"
              value={systemPrompt}
              onChange={(e) => updateSystemPrompt(e.target.value)}
              spellCheck={false}
            />
            <div className="chat-settings-title chat-settings-title--sub">
              Project context (auto-injected)
            </div>
            <pre className="chat-settings-context">
              {projectContext || "No project context — this chat is not attached to a repository."}
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
                placeholder="Search files…"
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
