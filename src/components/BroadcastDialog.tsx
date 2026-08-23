import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { Megaphone, X } from "lucide-react";
import { AgentIcon } from "./NewSessionMenu";

export interface BroadcastSession {
  id: string;
  name: string;
  agent: string;
  projectName: string;
}

interface BroadcastDialogProps {
  sessions: BroadcastSession[];
  onClose: () => void;
  onSend: (message: string, sessionIds: string[]) => void;
}

export function BroadcastDialog({ sessions, onClose, onSend }: BroadcastDialogProps) {
  const [selected, setSelected] = useState<Set<string>>(() => new Set(sessions.map((s) => s.id)));
  const [message, setMessage] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Stable ref so the keydown handler always sees the latest message/selected.
  const handleSendRef = useRef<() => void>(() => {});
  handleSendRef.current = () => {
    if (!message.trim() || selected.size === 0) return;
    onSend(message, Array.from(selected));
  };

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") { e.preventDefault(); onClose(); }
      if (e.key === "Enter" && e.ctrlKey) { e.preventDefault(); handleSendRef.current(); }
    }
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, []);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelected(selected.size === sessions.length ? new Set() : new Set(sessions.map((s) => s.id)));
  }

  const canSend = message.trim().length > 0 && selected.size > 0;
  const allSelected = sessions.length > 0 && selected.size === sessions.length;

  return createPortal(
    <div className="bc-overlay" onClick={onClose}>
      <div className="bc-dialog" onClick={(e) => e.stopPropagation()}>

        <div className="bc-header">
          <Megaphone size={14} className="bc-header-icon" />
          <span className="bc-title">Broadcast to Agents</span>
          <button className="bc-close" onClick={onClose} aria-label="Close">
            <X size={13} />
          </button>
        </div>

        {sessions.length === 0 ? (
          <p className="bc-empty">No agent sessions are currently running.</p>
        ) : (
          <>
            <div className="bc-section-label">
              Agents
              <span className="bc-count">· {selected.size} of {sessions.length}</span>
            </div>
            <div className="bc-session-list">
              <label className="bc-session-row bc-session-row--all">
                <input
                  type="checkbox"
                  className="bc-checkbox"
                  checked={allSelected}
                  onChange={toggleAll}
                />
                <span className="bc-all-label">Select all</span>
              </label>

              {sessions.map((s) => (
                <label key={s.id} className="bc-session-row">
                  <input
                    type="checkbox"
                    className="bc-checkbox"
                    checked={selected.has(s.id)}
                    onChange={() => toggle(s.id)}
                  />
                  <AgentIcon hint={s.agent} size={13} />
                  <span className="bc-session-name">{s.name}</span>
                  <span className="bc-session-project">{s.projectName}</span>
                </label>
              ))}
            </div>

            <div className="bc-compose">
              <textarea
                ref={textareaRef}
                className="bc-textarea"
                placeholder="Type a message to send to all selected agents…"
                rows={4}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
              />
              <p className="bc-hint"><code>Ctrl</code>+<code>Enter</code> to send</p>
            </div>

            <div className="bc-actions">
              <button className="bc-btn bc-btn--cancel" onClick={onClose}>
                Cancel
              </button>
              <button
                className="bc-btn bc-btn--send"
                disabled={!canSend}
                onClick={() => handleSendRef.current()}
              >
                <Megaphone size={12} />
                Send to {selected.size} agent{selected.size !== 1 ? "s" : ""}
              </button>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body
  );
}
