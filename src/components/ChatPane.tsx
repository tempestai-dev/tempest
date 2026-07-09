import { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Plus, ArrowUp, SlidersHorizontal, ChevronDown, Search, Bug, GitPullRequest } from "lucide-react";
import { streamChat } from "../lib/chat";
import { getRuntimeState, setRuntimeState } from "../lib/runtimeState";
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
  { id: "ollama",     label: "Ollama",     icon: "ollama.svg",           invert: true  },
];

const PROVIDER_MODELS: Record<string, ChatModel[]> = {
  anthropic: [
    { id: "claude-fable-5",           label: "Claude Fable 5"    },
    { id: "claude-opus-4-8",          label: "Claude Opus 4.8"   },
    { id: "claude-opus-4-7",          label: "Claude Opus 4.7"   },
    { id: "claude-opus-4-6",          label: "Claude Opus 4.6"   },
    { id: "claude-opus-4-5",          label: "Claude Opus 4.5"   },
    { id: "claude-sonnet-5",          label: "Claude Sonnet 5"   },
    { id: "claude-sonnet-4-6",        label: "Claude Sonnet 4.6" },
    { id: "claude-sonnet-4-5",        label: "Claude Sonnet 4.5" },
    { id: "claude-haiku-4-5-20251001",label: "Claude Haiku 4.5"  },
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
    { id: "gemini-3.5-flash",              label: "Gemini 3.5 Flash"       },
    { id: "gemini-3.1-pro-preview",        label: "Gemini 3.1 Pro"         },
    { id: "gemini-3.1-flash-lite-preview", label: "Gemini 3.1 Flash Lite"  },
    { id: "gemini-3-flash-preview",        label: "Gemini 3 Flash"         },
    { id: "gemini-2.5-pro",               label: "Gemini 2.5 Pro"         },
    { id: "gemini-2.5-flash",             label: "Gemini 2.5 Flash"       },
    { id: "gemini-flash-latest",          label: "Gemini Flash"           },
    { id: "gemini-flash-lite-latest",     label: "Gemini Flash Lite"      },
  ],
  mistral: [
    { id: "mistral-large-latest",   label: "Mistral Large"     },
    { id: "mistral-large-2512",     label: "Mistral Large 3"   },
    { id: "mistral-medium-2508",    label: "Mistral Medium"    },
    { id: "magistral-medium-2509",  label: "Magistral Medium"  },
    { id: "magistral-small-2509",   label: "Magistral Small"   },
    { id: "mistral-small-latest",   label: "Mistral Small"     },
    { id: "mistral-small-2603",     label: "Mistral Small 4"   },
    { id: "devstral-2512",          label: "Devstral"          },
    { id: "ministral-14b-2512",     label: "Ministral 14B"     },
    { id: "ministral-8b-2512",      label: "Ministral 8B"      },
    { id: "ministral-3b-2512",      label: "Ministral 3B"      },
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
    { id: "grok-code-fast-1",                label: "Grok Code Fast"          },
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
    { id: "llama3.2",      label: "Llama 3.2"       },
    { id: "llama3.1",      label: "Llama 3.1"       },
    { id: "qwen3",         label: "Qwen 3"          },
    { id: "qwen2.5-coder", label: "Qwen 2.5 Coder"  },
    { id: "deepseek-r1",   label: "DeepSeek R1"     },
    { id: "deepseek-v3",   label: "DeepSeek V3"     },
    { id: "codellama",     label: "Code Llama"       },
    { id: "mistral",       label: "Mistral 7B"      },
    { id: "neural-chat",   label: "Neural Chat"     },
  ],
};

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
}

const MAX_CHAT_HISTORY = 100;

function loadChatHistory(projectPath?: string): ChatMessage[] {
  if (!projectPath) return [];
  return getRuntimeState().chatHistory[projectPath] ?? [];
}

function saveChatHistory(projectPath: string | undefined, msgs: ChatMessage[]): void {
  if (!projectPath) return;
  const capped = msgs.slice(-MAX_CHAT_HISTORY);
  const st = getRuntimeState();
  setRuntimeState({ chatHistory: { ...st.chatHistory, [projectPath]: capped } });
}

interface Props {
  sessionId: string;
  hidden: boolean;
  projectPath?: string;
}

export function ChatPane({ hidden, projectPath }: Props) {
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
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerPos, setPickerPos] = useState({ bottom: 0, left: 0 });
  const [pickerProvider, setPickerProvider] = useState(CHAT_PROVIDERS[0].id);
  const [search, setSearch] = useState("");

  const editableRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const pickerBtnRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const messagesRef = useRef<ChatMessage[]>([]);

  // Keep messagesRef in sync for use inside send callback
  useEffect(() => { messagesRef.current = messages; }, [messages]);

  useEffect(() => {
    if (!hidden && messages.length > 0) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, hidden]);

  const send = useCallback(async () => {
    const text = (editableRef.current?.innerText ?? "").trim();
    if (!text || isLoading) return;

    if (editableRef.current) editableRef.current.innerText = "";
    setIsEmpty(true);

    const userMsg: ChatMessage = { id: crypto.randomUUID(), role: "user", content: text };
    const assistantId = crypto.randomUUID();
    const prior = messagesRef.current;

    setMessages(prev => [...prev, userMsg, { id: assistantId, role: "assistant", content: "" }]);
    setIsLoading(true);

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    const history = prior.map(m => ({ role: m.role, content: m.content }));
    let assistantContent = "";

    try {
      await streamChat(
        provider.id,
        model.id,
        [...history, { role: "user", content: text }],
        (delta) => {
          assistantContent += delta;
          setMessages(prev => prev.map(m =>
            m.id === assistantId ? { ...m, content: m.content + delta } : m
          ));
        },
        controller.signal,
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Something went wrong.";
      if ((err as { name?: string }).name !== "AbortError") {
        assistantContent = msg;
        setMessages(prev => prev.map(m =>
          m.id === assistantId ? { ...m, content: msg } : m
        ));
      }
    } finally {
      setIsLoading(false);
      // Only save if this turn wasn't superseded by a newer send() call.
      if (abortRef.current === controller) {
        saveChatHistory(projectPath, [
          ...prior,
          userMsg,
          { id: assistantId, role: "assistant", content: assistantContent },
        ]);
      }
    }
  }, [isLoading, provider, model, projectPath]);

  function onKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  function onInput() {
    setIsEmpty(!(editableRef.current?.innerText?.trim()));
  }

  function focusInput() {
    editableRef.current?.focus();
  }

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
  const filteredModels = search.trim()
    ? rawPickerModels.filter(m => m.label.toLowerCase().includes(search.toLowerCase()))
    : rawPickerModels;
  const hasMessages = messages.length > 0 || isLoading;

  const inputBox = (
    <div className="chat-box" onClick={focusInput}>
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

        {/* Combined provider + model picker trigger */}
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

        <div className="chat-bar-space" />
        <button className="chat-bar-btn" disabled title="Preferences">
          <SlidersHorizontal size={14} />
        </button>
        <button
          className="chat-bar-send"
          onClick={(e) => { e.stopPropagation(); send(); }}
          disabled={isEmpty || isLoading}
          title="Send"
        >
          <ArrowUp size={14} />
        </button>
      </div>
    </div>
  );

  return (
    <div className="chat-pane" style={hidden ? { display: "none" } : undefined}>
      {hasMessages ? (
        <>
          <div className="chat-msgs">
            {messages.map((msg) => (
              <div key={msg.id} className="chat-msg">
                <div className="chat-msg-role">
                  {msg.role === "user" ? "You" : "Assistant"}
                </div>
                <div className="chat-msg-body">
                  {msg.role === "assistant" ? (
                    isLoading && msg.content === "" ? (
                      <div className="chat-thinking">
                        <span /><span /><span />
                      </div>
                    ) : (
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {msg.content}
                      </ReactMarkdown>
                    )
                  ) : (
                    msg.content
                  )}
                </div>
              </div>
            ))}
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

      {/* Combined provider + model picker */}
      {pickerOpen && createPortal(
        <>
          <div className="chat-drop-overlay" onClick={() => setPickerOpen(false)} />
          <div className="chat-picker" style={{ bottom: pickerPos.bottom, left: pickerPos.left }}>
            {/* Provider sidebar */}
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

            {/* Model panel */}
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
    </div>
  );
}
