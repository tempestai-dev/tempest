import { useRef, useState } from "react";
import { RotateCcw, GripVertical, Pencil, Copy, Trash2, Plus } from "lucide-react";
import { Tooltip } from "../Tooltip";
import { ToggleSwitch } from "../ui/ToggleSwitch";
import {
  usePrompts,
  updatePrompt,
  deletePrompt,
  resetPrompt,
  clonePrompt,
  addPrompt,
  reorderPrompts,
  isBuiltinModified,
  type PromptEntry,
} from "../../store/prompts";

export function PromptsSection() {
  const prompts = usePrompts();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editBody, setEditBody] = useState("");
  const [adding, setAdding] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newBody, setNewBody] = useState("");

  const dragIdRef = useRef<string | null>(null);
  const dropIdRef = useRef<string | null>(null);
  const dropSideRef = useRef<"before" | "after">("before");
  const [dropIndicator, setDropIndicator] = useState<{ id: string; side: "before" | "after" } | null>(null);

  function startEdit(p: PromptEntry) {
    setAdding(false);
    setEditingId(p.id);
    setEditTitle(p.title);
    setEditBody(p.body);
  }

  function saveEdit() {
    if (!editingId) return;
    updatePrompt(editingId, { title: editTitle.trim() || "Untitled", body: editBody });
    setEditingId(null);
  }

  function cancelEdit() {
    setEditingId(null);
  }

  function submitNew() {
    const t = newTitle.trim();
    const b = newBody.trim();
    if (!t || !b) return;
    addPrompt(t, b);
    setNewTitle("");
    setNewBody("");
    setAdding(false);
  }

  function cancelNew() {
    setNewTitle("");
    setNewBody("");
    setAdding(false);
  }

  return (
    <div className="sp-section">
      <div className="sp-prompts-header">
        <div>
          <div className="sp-section-heading">Prompt Library</div>
          <p className="sp-section-desc" style={{ marginBottom: 0 }}>
            Saved prompts you can insert into the message queue with one click.
          </p>
        </div>
        {!adding && (
          <button
            className="sp-prompts-new-btn"
            onClick={() => { setEditingId(null); setAdding(true); }}
          >
            <Plus size={12} />
            New
          </button>
        )}
      </div>

      {adding && (
        <div className="sp-prompt-form sp-prompt-form--standalone">
          <input
            className="sp-prompt-form-title"
            type="text"
            placeholder="Prompt title"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            autoFocus
          />
          <textarea
            className="sp-prompt-form-body"
            placeholder="Prompt text sent to the agent…"
            rows={4}
            value={newBody}
            onChange={(e) => setNewBody(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && e.ctrlKey) { e.preventDefault(); submitNew(); }
              if (e.key === "Escape") { e.preventDefault(); cancelNew(); }
              e.stopPropagation();
            }}
          />
          <div className="sp-prompt-form-actions">
            <button
              className="sp-prompt-form-btn sp-prompt-form-btn--primary"
              onClick={submitNew}
              disabled={!newTitle.trim() || !newBody.trim()}
            >
              Add
            </button>
            <button className="sp-prompt-form-btn" onClick={cancelNew}>Cancel</button>
          </div>
        </div>
      )}

      <div className="sp-prompt-list">
        {prompts.map((p) => {
          const modified = isBuiltinModified(p);
          const isEditing = editingId === p.id;
          const isDragOver = dropIndicator?.id === p.id;

          return (
            <div
              key={p.id}
              className={[
                "sp-prompt-item",
                !p.enabled && "sp-prompt-item--disabled",
                isDragOver && dropIndicator?.side === "before" && "sp-prompt-item--drop-before",
                isDragOver && dropIndicator?.side === "after"  && "sp-prompt-item--drop-after",
              ].filter(Boolean).join(" ")}
              draggable={!isEditing}
              onDragStart={(e) => {
                dragIdRef.current = p.id;
                e.dataTransfer.effectAllowed = "move";
                e.dataTransfer.setData("text/plain", p.id);
              }}
              onDragEnd={() => {
                dragIdRef.current = null;
                dropIdRef.current = null;
                setDropIndicator(null);
              }}
              onDragOver={(e) => {
                e.preventDefault();
                if (!dragIdRef.current || dragIdRef.current === p.id) return;
                const rect = e.currentTarget.getBoundingClientRect();
                const side: "before" | "after" = e.clientY < rect.top + rect.height / 2 ? "before" : "after";
                dropIdRef.current = p.id;
                dropSideRef.current = side;
                setDropIndicator({ id: p.id, side });
              }}
              onDrop={(e) => {
                e.preventDefault();
                const from = dragIdRef.current;
                const to = dropIdRef.current;
                const side = dropSideRef.current;
                if (from && to && from !== to) reorderPrompts(from, to, side);
                dragIdRef.current = null;
                dropIdRef.current = null;
                setDropIndicator(null);
              }}
            >
              {isEditing ? (
                <div className="sp-prompt-form">
                  <input
                    className="sp-prompt-form-title"
                    type="text"
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    autoFocus
                  />
                  <textarea
                    className="sp-prompt-form-body"
                    rows={4}
                    value={editBody}
                    onChange={(e) => setEditBody(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && e.ctrlKey) { e.preventDefault(); saveEdit(); }
                      if (e.key === "Escape") { e.preventDefault(); cancelEdit(); }
                      e.stopPropagation();
                    }}
                  />
                  <div className="sp-prompt-form-actions">
                    <button className="sp-prompt-form-btn sp-prompt-form-btn--primary" onClick={saveEdit}>
                      Save
                    </button>
                    <button className="sp-prompt-form-btn" onClick={cancelEdit}>Cancel</button>
                    {p.isBuiltin && modified && (
                      <button
                        className="sp-prompt-form-btn sp-prompt-form-btn--reset"
                        onClick={() => { resetPrompt(p.id); setEditingId(null); }}
                      >
                        <RotateCcw size={11} />
                        Reset to default
                      </button>
                    )}
                  </div>
                </div>
              ) : (
                <div className="sp-prompt-row">
                  <span className="sp-prompt-grip" aria-hidden>
                    <GripVertical size={13} />
                  </span>
                  <ToggleSwitch
                    on={p.enabled}
                    onChange={(v) => updatePrompt(p.id, { enabled: v })}
                  />
                  <div className="sp-prompt-info">
                    <div className="sp-prompt-title-row">
                      <span className="sp-prompt-title">{p.title}</span>
                      {p.isBuiltin && <span className="sp-prompt-badge">built-in</span>}
                      {modified && <span className="sp-prompt-badge sp-prompt-badge--modified">modified</span>}
                    </div>
                    <span className="sp-prompt-preview">
                      {p.body.length > 72 ? p.body.slice(0, 72) + "…" : p.body}
                    </span>
                  </div>
                  <div className="sp-prompt-actions">
                    <Tooltip content="Edit" placement="top">
                      <button className="sp-prompt-action-btn" onClick={() => startEdit(p)}>
                        <Pencil size={12} />
                      </button>
                    </Tooltip>
                    <Tooltip content="Clone" placement="top">
                      <button className="sp-prompt-action-btn" onClick={() => clonePrompt(p.id)}>
                        <Copy size={12} />
                      </button>
                    </Tooltip>
                    {p.isBuiltin && modified && (
                      <Tooltip content="Reset to default" placement="top">
                        <button
                          className="sp-prompt-action-btn"
                          onClick={() => resetPrompt(p.id)}
                        >
                          <RotateCcw size={12} />
                        </button>
                      </Tooltip>
                    )}
                    {!p.isBuiltin && (
                      <Tooltip content="Delete" placement="top">
                        <button
                          className="sp-prompt-action-btn sp-prompt-action-btn--danger"
                          onClick={() => deletePrompt(p.id)}
                        >
                          <Trash2 size={12} />
                        </button>
                      </Tooltip>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
