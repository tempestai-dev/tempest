import { createPortal } from "react-dom";
import { Check, Plus } from "lucide-react";
import type { PromptEntry } from "../../store/prompts";

type Props = {
  pos: { top: number; right: number };
  items: PromptEntry[];
  sentId: string | null;
  onCopy: (p: PromptEntry) => void;
  onManage: () => void;
};

export function PromptPickerPopover({ pos, items, sentId, onCopy, onManage }: Props) {
  return createPortal(
    <div className="sub-bar-prompt-picker" style={{ top: pos.top, right: pos.right, position: "fixed" }}>
      <div className="sub-bar-prompt-picker-header">Prompt Library</div>
      <div className="sub-bar-prompt-picker-items">
        {items.length > 0 ? (
          items.map((p) => {
            const sent = sentId === p.id;
            return (
              <div key={p.id} className={`sub-bar-prompt-item${sent ? " sub-bar-prompt-item--sent" : ""}`}>
                <div className="sub-bar-prompt-item-text">
                  <span className="sub-bar-prompt-title">{p.title}</span>
                  <span className="sub-bar-prompt-preview">
                    {p.body.length > 60 ? p.body.slice(0, 60) + "…" : p.body}
                  </span>
                </div>
                <button
                  className={`sub-bar-prompt-copy-btn${sent ? " sub-bar-prompt-copy-btn--sent" : ""}`}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    if (sent) return;
                    onCopy(p);
                  }}
                >
                  {sent ? <><Check size={11} /> Copied</> : <>Copy</>}
                </button>
              </div>
            );
          })
        ) : (
          <div className="sub-bar-prompt-empty">No prompts yet</div>
        )}
      </div>
      <div className="sub-bar-prompt-picker-footer">
        <button
          className="sub-bar-prompt-manage-btn"
          onMouseDown={(e) => { e.preventDefault(); onManage(); }}
        >
          <Plus size={12} />
          <span>Manage Prompts</span>
        </button>
      </div>
    </div>,
    document.body
  );
}
