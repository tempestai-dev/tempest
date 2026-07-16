import { MessageSquare, X, Send } from "lucide-react";
import type { AgentSession } from "../DiffPane";

export function CommentBar({
  count,
  agentSessions,
  selectedAgentId,
  onSelectAgent,
  onClear,
  onSend,
}: {
  count: number;
  agentSessions: AgentSession[];
  selectedAgentId: string;
  onSelectAgent: (id: string) => void;
  onClear: () => void;
  onSend: () => void;
}) {
  if (count === 0) return null;
  return (
    <div className="dcb-bar">
      <div className="dcb-left">
        <MessageSquare size={13} className="dcb-icon" />
        <span className="dcb-count">{count} comment{count !== 1 ? "s" : ""}</span>
        <span className="dcb-hint">pending</span>
      </div>
      <div className="dcb-right">
        {agentSessions.length > 1 && (
          <select
            className="dcb-agent-select"
            value={selectedAgentId}
            onChange={(e) => onSelectAgent(e.target.value)}
          >
            {agentSessions.map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
        )}
        {agentSessions.length === 1 && (
          <span className="dcb-agent-name">{agentSessions[0].name}</span>
        )}
        <button className="dcb-clear-btn" onClick={onClear} title="Discard all comments">
          <X size={11} />
        </button>
        <button
          className={`dcb-send-btn${agentSessions.length === 0 ? " disabled" : ""}`}
          onClick={onSend}
          disabled={agentSessions.length === 0}
          title={agentSessions.length === 0 ? "No active agent sessions" : "Send comments to agent"}
        >
          <Send size={11} />
          Send to agent
        </button>
      </div>
    </div>
  );
}
