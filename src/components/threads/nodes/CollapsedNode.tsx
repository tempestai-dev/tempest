import { useContext } from "react";
import { Maximize2, MessagesSquare, StickyNote, Bot, SquareTerminal, Image as ImageIcon, FileText, Globe, Play } from "lucide-react";
import { NodeConnector } from "./NodeConnector";
import { getThreadNode, getNodeData } from "../../../store/threads";
import { getSession, getBranch } from "../../../store/sessions";
import { firstLine } from "../canvasContext";
import { ThreadNodeContext } from "../ThreadNodeContext";

// Compact form of any node when data.collapsed is set (Minimize all / per-node
// maximize). A single-row pill — kind icon, title, one-line gist — reusing the
// same metadata the canvas map shows (no full content loaded). Connectors stay
// live so wiring survives collapse; double-click or the maximize button expands.
const ICON: Record<string, typeof StickyNote> = {
  chat: MessagesSquare, text: StickyNote, agent: Bot, terminal: SquareTerminal,
  image: ImageIcon, file: FileText, site: Globe, media: Play,
};

interface CollapsedData {
  body?: string;
  gist?: string;
  msgCount?: number;
  // image
  width?: number; height?: number; alt?: string;
  // file
  path?: string; sizeBytes?: number; truncated?: boolean;
  // site
  url?: string; siteTitle?: string; contentLength?: number;
  // media
  transcript?: string; durationSec?: number; language?: string;
}

function hostOf(u?: string): string {
  if (!u) return "";
  try { return new URL(u).host.replace(/^www\./, ""); } catch { return u; }
}
function fmtDur(s?: number): string {
  if (!s) return "";
  const m = Math.floor(s / 60), sec = Math.round(s % 60);
  return `${m}:${String(sec).padStart(2, "0")}`;
}

function gistFor(id: string, kind: string, data: CollapsedData): string {
  if (kind === "text") return firstLine(data.body ?? "");
  if (kind === "chat") {
    const parts: string[] = [];
    if (data.msgCount) parts.push(`${data.msgCount} msg${data.msgCount === 1 ? "" : "s"}`);
    if (data.gist) parts.push(data.gist);
    return parts.join(" · ");
  }
  if (kind === "image") {
    const parts: string[] = [];
    if (data.width && data.height) parts.push(`${data.width}×${data.height}`);
    if (data.alt) parts.push(data.alt);
    return parts.join(" · ") || "no image";
  }
  if (kind === "file") {
    const parts: string[] = [];
    if (data.path) parts.push(data.path.split(/[\\/]/).filter(Boolean).pop() ?? "");
    if (data.sizeBytes) {
      const s = data.sizeBytes;
      parts.push(s < 1024 ? `${s} B` : s < 1024 * 1024 ? `${(s / 1024).toFixed(0)} KB` : `${(s / 1024 / 1024).toFixed(1)} MB`);
    }
    if (data.truncated) parts.push("truncated");
    return parts.join(" · ") || "no file";
  }
  if (kind === "site") {
    const parts: string[] = [];
    if (data.siteTitle) parts.push(data.siteTitle);
    else if (data.url) parts.push(hostOf(data.url));
    if (data.contentLength) parts.push(`${data.contentLength.toLocaleString()} chars`);
    return parts.join(" · ") || "no URL";
  }
  if (kind === "media") {
    const parts: string[] = [];
    if (data.url) parts.push(hostOf(data.url));
    if (data.durationSec) parts.push(fmtDur(data.durationSec));
    if (data.transcript) parts.push(data.language ? `captions:${data.language}` : "captions");
    else parts.push("no captions");
    return parts.join(" · ") || "no URL";
  }
  // agent / terminal — branch binding, no PTY scrollback.
  const node = getThreadNode(id);
  const bid = node?.sessionId ? getSession(node.sessionId)?.branchId : node?.branchId;
  const branch = bid ? getBranch(bid)?.name : undefined;
  return branch ?? "session";
}

export function CollapsedNode({ id }: { id: string }) {
  const ctx = useContext(ThreadNodeContext);
  const node = getThreadNode(id);
  const kind = node?.kind ?? "text";
  const data = getNodeData<CollapsedData & { title?: string }>(id);
  const title = data.title ?? kind;
  const Icon = ICON[kind] ?? StickyNote;
  const gist = gistFor(id, kind, data);
  const expand = () => ctx?.setNodeCollapsed?.(id, false);

  return (
    <div
      className="tnode-card"
      onDoubleClick={expand}
      style={{
        width: "100%", boxSizing: "border-box", cursor: "grab",
        display: "flex", alignItems: "center", gap: 8, overflow: "hidden",
        padding: "7px 9px", whiteSpace: "nowrap",
        background: "var(--tempest-bg-elevated, #161616)",
        border: "1px solid var(--tempest-border-subtle, #2a2a2a)",
        borderRadius: 8,
        font: '12px "Geist", system-ui, sans-serif',
      }}
    >
      <NodeConnector nodeId={id} side="left" />
      <Icon size={14} style={{ flexShrink: 0, opacity: 0.7 }} />
      <span style={{
        color: "var(--tempest-fg-default, #e6e6e6)", flexShrink: 0,
        maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis",
      }}>{title}</span>
      {gist && (
        <span style={{
          color: "var(--tempest-fg-muted, #888)", minWidth: 0,
          overflow: "hidden", textOverflow: "ellipsis",
        }}>{gist}</span>
      )}
      <div style={{ flex: 1 }} />
      <button
        className="tnode-header-btn nodrag"
        title="Expand node"
        onClick={(e) => { e.stopPropagation(); expand(); }}
      >
        <Maximize2 size={12} />
      </button>
      <NodeConnector nodeId={id} side="right" />
    </div>
  );
}
