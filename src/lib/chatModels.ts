import { FileText, Folder, GitCommit, GitBranch, Bot, Database, Terminal, Search, Globe, Pencil, FilePlus2, ListChecks } from "lucide-react";
import type React from "react";

export interface ChatProvider {
  id: string;
  label: string;
  icon: string;
  invert: boolean;
}

export interface ChatModel {
  id: string;
  label: string;
}

export const CDN = "https://cdn.jsdelivr.net/npm/@lobehub/icons-static-svg@latest/icons/";

export const CHAT_PROVIDERS: ChatProvider[] = [
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

// Claude Code (CLI backend) is its own category — NOT a BYOK provider. Its
// picker id is CLAUDE_CODE; models are the CLI's real `--model` aliases. Selecting
// one flips the chat node to backend "cli". First entry is the default (Haiku).
export const CLAUDE_CODE = "claude-code";

export const CLAUDE_CODE_MODELS: ChatModel[] = [
  { id: "haiku",   label: "Haiku"   },
  { id: "sonnet",  label: "Sonnet"  },
  { id: "opus",    label: "Opus"    },
];

// Additional CLI coding agents that ride the same "cli" backend + bridge sidecar
// (dispatched by cfg.agent). Each has its own `--model` alias set.
export const CLI_AGENTS = ["claude", "codex", "opencode", "gemini"] as const;
export type CliAgent = typeof CLI_AGENTS[number];

export const CLI_AGENT_LABELS: Record<CliAgent, string> = {
  claude:   "Claude Code",
  codex:    "Codex",
  opencode: "OpenCode",
  gemini:   "Gemini CLI",
};

// Codex CLI passes -m through to the OpenAI Responses API. Any model that
// endpoint accepts works; this is the picker's default shortlist. Order = default first.
export const CODEX_MODELS: ChatModel[] = [
  { id: "gpt-5-codex",  label: "GPT-5 Codex"  },
  { id: "gpt-5.5",      label: "GPT-5.5"      },
  { id: "gpt-5.4",      label: "GPT-5.4"      },
  { id: "gpt-5.4-mini", label: "GPT-5.4 Mini" },
  { id: "gpt-5",        label: "GPT-5"        },
  { id: "gpt-5-mini",   label: "GPT-5 Mini"   },
  { id: "o4-mini",      label: "o4 Mini"      },
  { id: "o3",           label: "o3"           },
];

// OpenCode routes through many providers; model ids are `provider/model`.
// This list mirrors `opencode models` output verbatim — paid `opencode-go/*`
// tier first (coding-strongest at top), then `opencode/*` free tier.
export const OPENCODE_MODELS: ChatModel[] = [
  { id: "opencode-go/gpt-5.6-luna",                label: "GPT-5.6 Luna"       },
  { id: "opencode-go/grok-4.5",                    label: "Grok 4.5"           },
  { id: "opencode-go/kimi-k3",                     label: "Kimi K3"            },
  { id: "opencode-go/kimi-k2.7-code",              label: "Kimi K2.7 Code"     },
  { id: "opencode-go/kimi-k2.6",                   label: "Kimi K2.6"          },
  { id: "opencode-go/deepseek-v4-pro",             label: "DeepSeek V4 Pro"    },
  { id: "opencode-go/deepseek-v4-flash",           label: "DeepSeek V4 Flash"  },
  { id: "opencode-go/glm-5.3",                     label: "GLM 5.3"            },
  { id: "opencode-go/glm-5.2",                     label: "GLM 5.2"            },
  { id: "opencode-go/glm-5.1",                     label: "GLM 5.1"            },
  { id: "opencode-go/qwen3.8-max",                 label: "Qwen 3.8 Max"       },
  { id: "opencode-go/qwen3.7-max",                 label: "Qwen 3.7 Max"       },
  { id: "opencode-go/qwen3.7-plus",                label: "Qwen 3.7 Plus"      },
  { id: "opencode-go/qwen3.6-plus",                label: "Qwen 3.6 Plus"      },
  { id: "opencode-go/minimax-m3",                  label: "MiniMax M3"         },
  { id: "opencode-go/minimax-m2.7",                label: "MiniMax M2.7"       },
  { id: "opencode-go/mimo-v2.5-pro",               label: "MiMo v2.5 Pro"      },
  { id: "opencode-go/mimo-v2.5",                   label: "MiMo v2.5"          },
  { id: "opencode-go/hy3",                         label: "Hy3"                },
  { id: "opencode/big-pickle",                     label: "Big Pickle (free)"  },
  { id: "opencode/nemotron-3-ultra-free",          label: "Nemotron 3 Ultra (free)"     },
  { id: "opencode/nemotron-3.5-lightning-free",    label: "Nemotron 3.5 Lightning (free)" },
  { id: "opencode/deepseek-v4-flash-free",         label: "DeepSeek V4 Flash (free)"    },
  { id: "opencode/laguna-s-2.1-free",              label: "Laguna S 2.1 (free)"         },
  { id: "opencode/mimo-v2.5-free",                 label: "MiMo v2.5 (free)"            },
  { id: "opencode/hy3-free",                       label: "Hy3 (free)"                  },
];

// Gemini CLI's -m accepts any Gemini API model id. Kept in sync with the
// Gemini rows in PROVIDER_MODELS so the two pickers don't drift again.
export const GEMINI_CLI_MODELS: ChatModel[] = [
  { id: "gemini-3.5-flash",              label: "Gemini 3.5 Flash"      },
  { id: "gemini-3.1-pro-preview",        label: "Gemini 3.1 Pro"        },
  { id: "gemini-3.1-flash-lite-preview", label: "Gemini 3.1 Flash Lite" },
  { id: "gemini-3-flash-preview",        label: "Gemini 3 Flash"        },
  { id: "gemini-2.5-pro",                label: "Gemini 2.5 Pro"        },
  { id: "gemini-2.5-flash",              label: "Gemini 2.5 Flash"      },
];

export const CLI_AGENT_MODELS: Record<CliAgent, ChatModel[]> = {
  claude:   CLAUDE_CODE_MODELS,
  codex:    CODEX_MODELS,
  opencode: OPENCODE_MODELS,
  gemini:   GEMINI_CLI_MODELS,
};

export function getCliAgentModel(agent: CliAgent, modelId: string | undefined): ChatModel {
  const list = CLI_AGENT_MODELS[agent];
  return list.find((m) => m.id === modelId) ?? list[0];
}

// Warp (warpllm) — experimental Rust chat backend. Its own category alongside
// CLAUDE_CODE in the picker; gated by settings.experimentalWarp. Model ids are
// warpllm's `provider/model` routing strings — the prefix is required.
export const WARP = "warp";

export const WARP_MODELS: ChatModel[] = [
  { id: "openai/gpt-5-nano",                    label: "GPT-5 Nano"       },
  { id: "openai/gpt-4o-mini",                   label: "GPT-4o Mini"      },
  { id: "deepseek/deepseek-v4-flash",           label: "DeepSeek V4"      },
  { id: "kimi/kimi-k3",                         label: "Kimi K3"          },
  { id: "openrouter/anthropic/claude-sonnet-4", label: "Claude Sonnet 4"  },
];

// warpllm reads keys from process env, one per provider. Map the routing
// prefix → the env var so the frontend can pass the right BYOK key through.
export const WARP_PROVIDER_ENV: Record<string, string> = {
  openai:     "OPENAI_API_KEY",
  deepseek:   "DEEPSEEK_API_KEY",
  kimi:       "MOONSHOT_API_KEY",
  openrouter: "OPENROUTER_API_KEY",
};

export const PROVIDER_MODELS: Record<string, ChatModel[]> = {
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

export const MODEL_CONTEXT: Record<string, number> = {
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

export const DEFAULT_CONTEXT = 128_000;

export function getContextSize(modelId: string): number {
  return MODEL_CONTEXT[modelId] ?? DEFAULT_CONTEXT;
}

export type LucideIcon = React.ComponentType<{ size?: number; className?: string }>;

export const TOOL_ICON_MAP: Record<string, LucideIcon> = {
  read_file:          FileText,
  list_files:         Folder,
  run_git_log:        GitCommit,
  run_git_status:     GitBranch,
  propose_agent_task: Bot,
};

export const TOOL_LABEL_MAP: Record<string, string> = {
  read_file:          "Read file",
  list_files:         "List files",
  run_git_log:        "Git log",
  run_git_status:     "Git status",
  propose_agent_task: "Propose agent",
};

// Claude Code's native tool names (CLI backend). Each entry is an icon, a
// static noun label, and a present-tense verb shown while the step is still
// running so the user sees the live action ("Reading src/foo.ts"). argsPreview
// supplies the target (basename / command / query).
const CLI_TOOL_META: Record<string, { icon: LucideIcon; label: string; running: string }> = {
  Read:         { icon: FileText,  label: "Read",       running: "Reading" },
  Write:        { icon: FilePlus2, label: "Write",      running: "Writing" },
  Edit:         { icon: Pencil,    label: "Edit",       running: "Editing" },
  MultiEdit:    { icon: Pencil,    label: "Edit",       running: "Editing" },
  NotebookEdit: { icon: Pencil,    label: "Edit",       running: "Editing" },
  Bash:         { icon: Terminal,  label: "Shell",      running: "Running" },
  BashOutput:   { icon: Terminal,  label: "Shell output", running: "Reading output" },
  Grep:         { icon: Search,    label: "Search",     running: "Searching" },
  Glob:         { icon: Search,    label: "Find",       running: "Finding" },
  LS:           { icon: Folder,    label: "List",       running: "Listing" },
  WebFetch:     { icon: Globe,     label: "Fetch",      running: "Fetching" },
  WebSearch:    { icon: Globe,     label: "Web search", running: "Searching" },
  Task:         { icon: Bot,       label: "Task",       running: "Working" },
  TodoWrite:    { icon: ListChecks, label: "Plan",      running: "Planning" },
};

// mcp__<server>__<tool> → the leaf tool name, spaced (canvas MCP etc.).
function mcpLeaf(toolName: string): string | null {
  const m = toolName.match(/^mcp__[^_]+(?:_[^_]+)*__(.+)$/);
  return m ? m[1].replace(/_/g, " ") : null;
}

export function getToolIcon(toolName: string): LucideIcon {
  if (CLI_TOOL_META[toolName]) return CLI_TOOL_META[toolName].icon;
  if (toolName.startsWith("atlas_") || toolName.startsWith("mcp__")) return Database;
  return TOOL_ICON_MAP[toolName] ?? Terminal;
}

export function getToolLabel(toolName: string, running = false): string {
  const cli = CLI_TOOL_META[toolName];
  if (cli) return running ? cli.running : cli.label;
  if (toolName.startsWith("atlas_")) return toolName.slice(6).replace(/_/g, " ");
  const leaf = mcpLeaf(toolName);
  if (leaf) return leaf;
  return TOOL_LABEL_MAP[toolName] ?? toolName.replace(/_/g, " ");
}
