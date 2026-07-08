import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useAgentAvailability } from "../store/agentAvailability";
import { Bot, TerminalSquare, MessageSquare, Globe, ChevronRight, Download } from "lucide-react";
import claudeCodeSrc from "../assets/agent-icons/claude-color.svg";
import geminiCliSrc from "../assets/agent-icons/geminicli-color.svg";
import githubCopilotSrc from "../assets/agent-icons/githubcopilot-color.svg";
import opencodeSrc from "../assets/agent-icons/opencode.svg";
import clineSrc from "../assets/agent-icons/cline.svg";
import cursorSrc from "../assets/agent-icons/cursor.svg";
import gooseSrc from "../assets/agent-icons/goose.svg";
import codexSrc from "../assets/agent-icons/codex.svg";
import antigravitySrc from "../assets/agent-icons/antigravity.svg";
import "./NewSessionMenu.css";

export interface AgentConfig {
  name: string;
  hint: string; // CLI command
  iconSrc: string;
  mono?: boolean; // true = monochrome SVG; AgentIcon inverts it in dark mode
  // Args used the FIRST time an agent spawns. "{UUID}" is replaced with a freshly
  // minted session UUID so we can later resume that exact conversation. null when
  // the agent has no externally-addressable session id.
  sessionIdArgs: string[] | null;
  // Args used when RESUMING. "{UUID}" is replaced with the stored conversation UUID.
  // null when the agent cannot be resumed by id (it manages sessions internally).
  resumeArgs: string[] | null;
  // For agents that mint their own session ID and print it to PTY output (e.g. opencode).
  // capturePattern: regex with a capture group that extracts the session ID from raw output.
  // captureResumeArgs: resume args to use with the captured ID — "{UUID}" is substituted.
  capturePattern?: RegExp;
  captureResumeArgs?: string[] | null;
  mcpSupported?: boolean; // unused — MCP injection now via .mcp.json written at index time
  // CLI flags appended when the "Auto-approve agent tool calls" setting is on.
  // Absent (undefined) means the agent has no known auto-approve flag.
  autoApproveArgs?: string[];
  // URL to download/install the agent if it isn't detected on PATH.
  downloadUrl?: string;
}

export const AGENT_CONFIGS: AgentConfig[] = [
  {
    name: "Antigravity",
    hint: "agy",
    iconSrc: antigravitySrc,
    mono: true,
    sessionIdArgs: null,
    resumeArgs: ["--continue"],
    autoApproveArgs: ["--dangerously-skip-permissions"],
    downloadUrl: "https://antigravity.dev",
  },
  {
    name: "Claude Code",
    hint: "claude",
    iconSrc: claudeCodeSrc,
    sessionIdArgs: ["--session-id", "{UUID}"],
    resumeArgs: ["--resume", "{UUID}"],
    mcpSupported: true,
    autoApproveArgs: ["--dangerously-skip-permissions"],
    downloadUrl: "https://docs.anthropic.com/en/docs/claude-code",
  },
  {
    name: "Cline",
    hint: "cline",
    iconSrc: clineSrc,
    mono: true,
    sessionIdArgs: null,
    resumeArgs: null,
    downloadUrl: "https://cline.bot",
  },
  {
    name: "Codex CLI",
    hint: "codex",
    iconSrc: codexSrc,
    mono: true,
    sessionIdArgs: null,
    resumeArgs: ["resume", "--last"],
    autoApproveArgs: ["--dangerously-bypass-approvals-and-sandbox"],
    downloadUrl: "https://github.com/openai/codex",
  },
  {
    name: "Copilot CLI",
    hint: "gh copilot",
    iconSrc: githubCopilotSrc,
    sessionIdArgs: null,
    resumeArgs: null,
    downloadUrl: "https://cli.github.com",
  },
  {
    name: "Cursor Agent",
    hint: "cursor",
    iconSrc: cursorSrc,
    mono: true,
    sessionIdArgs: null,
    resumeArgs: null,
    downloadUrl: "https://cursor.sh",
  },
  {
    name: "Gemini CLI",
    hint: "gemini",
    iconSrc: geminiCliSrc,
    sessionIdArgs: ["--session-id", "{UUID}"],
    resumeArgs: ["--resume", "{UUID}"],
    autoApproveArgs: ["--yolo"],
    downloadUrl: "https://github.com/google-gemini/gemini-cli",
  },
  {
    name: "Goose",
    hint: "goose",
    iconSrc: gooseSrc,
    mono: true,
    sessionIdArgs: null,
    resumeArgs: null,
    downloadUrl: "https://block.github.io/goose",
  },
  {
    name: "Opencode",
    hint: "opencode",
    iconSrc: opencodeSrc,
    mono: true,
    sessionIdArgs: null,
    resumeArgs: null,
    capturePattern: /\b([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\b/i,
    captureResumeArgs: ["-s", "{UUID}"],
    downloadUrl: "https://opencode.ai",
  },
];

export function AgentIcon({ hint, size, className }: { hint?: string; size: number; className?: string }) {
  const config = AGENT_CONFIGS.find((a) => a.hint === hint);
  if (!config) return <Bot size={size} className={className} />;
  const monoClass = config.mono ? "agent-icon--mono" : undefined;
  const combinedClass = [className, monoClass].filter(Boolean).join(" ") || undefined;
  return (
    <img
      src={config.iconSrc}
      width={size}
      height={size}
      className={combinedClass}
      style={{ objectFit: "contain", display: "block", flexShrink: 0 }}
      alt={config.name}
    />
  );
}

export type NewSessionPlacement = "right" | "below";

interface Props {
  open: boolean;
  anchorRect: DOMRect | null;
  placement?: NewSessionPlacement;
  onClose: () => void;
  onNewTerminal: () => void;
  onAgentSession: (agent: AgentConfig) => void;
  onLivePreview?: () => void;
}

export function NewSessionMenu({
  open,
  anchorRect,
  placement = "below",
  onClose,
  onNewTerminal,
  onAgentSession,
  onLivePreview,
}: Props) {
  const [agentHovered, setAgentHovered] = useState(false);
  const available = useAgentAvailability();

  useEffect(() => {
    if (!open) { setAgentHovered(false); return; }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open || !anchorRect) return null;

  const pos =
    placement === "right"
      ? { top: anchorRect.top, left: anchorRect.right + 4 }
      : { top: anchorRect.bottom + 2, left: anchorRect.left };

  return createPortal(
    <div className="nsm-overlay" onClick={onClose}>
      <div className="nsm" style={pos} onClick={(e) => e.stopPropagation()}>

        <button
          className="nsm-item"
          onClick={() => { onClose(); onNewTerminal(); }}
        >
          <TerminalSquare size={14} className="nsm-item-icon" />
          <div className="nsm-item-text">
            <span className="nsm-item-label">New Terminal</span>
            <span className="nsm-item-desc">Open a bare terminal in this workspace</span>
          </div>
        </button>

        <div
          className="nsm-item nsm-item--sub"
          onMouseEnter={() => setAgentHovered(true)}
          onMouseLeave={() => setAgentHovered(false)}
        >
          <Bot size={14} className="nsm-item-icon" />
          <div className="nsm-item-text">
            <span className="nsm-item-label">Agent Session</span>
            <span className="nsm-item-desc">Run a CLI coding agent</span>
          </div>
          <ChevronRight size={12} className="nsm-item-chevron" />
          {agentHovered && (
            <div className="nsm-submenu">
              {AGENT_CONFIGS.map((a) => {
                const isAvailable = available[a.hint] !== false; // true until confirmed absent
                return (
                  <div key={a.name} className={`nsm-subitem${isAvailable ? "" : " nsm-subitem--unavailable"}`}>
                    <button
                      className="nsm-subitem-main"
                      disabled={!isAvailable}
                      onClick={() => { if (isAvailable) { onClose(); onAgentSession(a); } }}
                    >
                      <img
                        src={a.iconSrc}
                        width={14}
                        height={14}
                        className={`nsm-subitem-icon${a.mono ? " agent-icon--mono" : ""}`}
                        style={{ objectFit: "contain", flexShrink: 0 }}
                        alt={a.name}
                      />
                      <span className="nsm-subitem-name">{a.name}</span>
                      <span className="nsm-subitem-hint">{a.hint}</span>
                    </button>
                    {!isAvailable && a.downloadUrl && (
                      <button
                        className="nsm-subitem-dl"
                        title="Download"
                        onClick={(e) => { e.stopPropagation(); openUrl(a.downloadUrl!).catch(() => {}); }}
                      >
                        <Download size={11} />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <button className="nsm-item nsm-item--disabled" disabled>
          <MessageSquare size={14} className="nsm-item-icon" />
          <div className="nsm-item-text">
            <span className="nsm-item-label">Chat</span>
            <span className="nsm-item-desc">Coming soon</span>
          </div>
        </button>

        <button
          className={`nsm-item${!onLivePreview ? " nsm-item--disabled" : ""}`}
          disabled={!onLivePreview}
          onClick={() => onLivePreview?.()}
        >
          <Globe size={14} className="nsm-item-icon" />
          <div className="nsm-item-text">
            <span className="nsm-item-label">Live Preview</span>
            <span className="nsm-item-desc">Embedded browser for your dev server</span>
          </div>
        </button>

      </div>
    </div>,
    document.body
  );
}
