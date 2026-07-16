import type { ProposalPart } from "../../types/chat";

export function ProposalCard({
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
