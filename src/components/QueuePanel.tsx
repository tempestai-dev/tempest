import { useRef, useState, useEffect } from "react";
import { X, ListOrdered, Eraser, Send } from "lucide-react";
import { useQueue, enqueue, dequeue, removeFromQueue, clearQueue } from "../store/messageQueue";
import "./QueuePanel.css";

interface Props {
  sessionId: string;
  onClose: () => void;
  // Writes text directly to the PTY (used by the Send button, bypassing the
  // work-done dequeue hook). Kept as a prop so QueuePanel doesn't need to know
  // about invoke / sessionManager — the parent owns that wiring.
  onSend: (text: string) => void;
  // The active agent's context-reset REPL command (e.g. "/clear", "/new",
  // ".clear"), from the agent manifest. Undefined for user-added agents that
  // haven't set one — we fall back to "/clear" since it's the near-universal
  // convention for modern coding-agent TUIs.
  clearCommand?: string;
}

export function QueuePanel({ sessionId, onClose, onSend, clearCommand }: Props) {
  const clearCmd = clearCommand || "/clear";
  const queue = useQueue(sessionId);
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") { e.preventDefault(); onClose(); }
    }
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  function queueDraft() {
    const text = draft.trim();
    if (!text) return;
    enqueue(sessionId, text);
    setDraft("");
    inputRef.current?.focus();
  }

  // Start the queue right now: enqueue the draft (if any), then pop the head
  // and write it to the PTY. Subsequent items flow through the existing
  // work-done dequeue hook in WorkspaceView, so one click kicks off the whole
  // sequence — no waiting for the agent to idle first.
  function startQueue() {
    const text = draft.trim();
    if (text) enqueue(sessionId, text);
    setDraft("");
    const item = dequeue(sessionId);
    if (item) onSend(item.text);
    inputRef.current?.focus();
  }

  // Explicit clear injection — enqueues the agent's context-reset command as
  // its own item so the running agent resets between queued tasks (issue #34).
  // Opt-in: user clicks to insert. The command varies per agent (Claude Code
  // /clear, Codex /new, Goose .clear, …) and comes from the agent manifest.
  function addClear() {
    enqueue(sessionId, clearCmd);
    inputRef.current?.focus();
  }

  return (
    <div className="qp-panel">
      <div className="qp-header">
        <ListOrdered size={12} className="qp-header-icon" />
        <span className="qp-title">Message Queue</span>
        {queue.length > 0 && <span className="qp-count">{queue.length}</span>}
        <span className="qp-header-spacer" />
        {queue.length > 0 && (
          <button className="qp-clear" onClick={() => clearQueue(sessionId)}>
            Clear all
          </button>
        )}
        <button className="qp-close" onClick={onClose} aria-label="Close queue">
          <X size={12} />
        </button>
      </div>

      {queue.length > 0 && (
        <ol className="qp-list">
          {queue.map((item, i) => (
            <li
              key={item.id}
              className={`qp-item${item.text.trim() === clearCmd ? " qp-item--clear" : ""}`}
            >
              <span className="qp-item-index">{i + 1}</span>
              <span className="qp-item-text">{item.text}</span>
              <button
                className="qp-item-remove"
                onClick={() => removeFromQueue(sessionId, item.id)}
                aria-label="Remove"
              >
                <X size={11} />
              </button>
            </li>
          ))}
        </ol>
      )}

      {queue.length === 0 && (
        <p className="qp-empty">Nothing queued. The next message you add will be sent automatically when the agent finishes.</p>
      )}

      <div className="qp-compose">
        <textarea
          ref={inputRef}
          className="qp-input"
          placeholder="Next message for the agent…"
          rows={3}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); queueDraft(); }
            e.stopPropagation();
          }}
        />
        <div className="qp-compose-footer">
          <div className="qp-compose-left">
            <button
              className="qp-chip"
              onClick={addClear}
              title={`Enqueue ${clearCmd} so the agent resets context between tasks`}
            >
              <Eraser size={12} />
              <span>Add {clearCmd}</span>
            </button>
            <span className="qp-hint">
              <kbd className="qp-kbd">Enter</kbd> queue
              <span className="qp-hint-sep">·</span>
              <kbd className="qp-kbd">Shift</kbd>+<kbd className="qp-kbd">Enter</kbd> newline
              <span className="qp-hint-sep">·</span>
              <kbd className="qp-kbd">Esc</kbd> close
            </span>
          </div>
          <div className="qp-compose-actions">
            <button
              className="qp-send-btn"
              disabled={!draft.trim() && queue.length === 0}
              onClick={startQueue}
              title="Start the queue now — sends the first item to the agent immediately"
            >
              <Send size={12} />
              <span>Send</span>
            </button>
            <button
              className="qp-queue-btn"
              disabled={!draft.trim()}
              onClick={queueDraft}
              title="Add this message to the queue"
            >
              Queue
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
