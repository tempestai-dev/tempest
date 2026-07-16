import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { argsPreview, resultSummary } from "../../lib/chatTools";
import { getToolIcon, getToolLabel } from "../../lib/chatModels";
import type { ToolCallPart } from "../../types/chat";

export function ToolCallCard({ part }: { part: ToolCallPart }) {
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
