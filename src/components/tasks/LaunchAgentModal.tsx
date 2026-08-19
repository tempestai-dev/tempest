import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Icon } from "./icons";
import type { GhItem, LinearItem, UnifiedItem } from "./types";
import { isGh } from "./types";

const AGENTS = ["Claude Code", "Codex", "Aider", "OpenCode", "Copilot CLI"];

function idOf(it: UnifiedItem) {
  return isGh(it) ? `${(it as GhItem).repo}#${(it as GhItem).number}` : (it as LinearItem).id;
}

function prefillPrompt(it: UnifiedItem) {
  const header = isGh(it)
    ? `# ${(it as GhItem).repo}#${(it as GhItem).number} — ${it.title}`
    : `# ${(it as LinearItem).id} — ${it.title}`;
  const kind = isGh(it) ? "issue" : "ticket";
  return `${header}\n\n${it.body ?? ""}\n\nGoal: implement, add a test, open a PR referencing this ${kind}.`;
}

type Form = { it: UnifiedItem; agent: string; prompt: string };

export function LaunchAgentModal({
  items,
  onClose,
}: {
  items: UnifiedItem[];
  onClose: () => void;
}) {
  const [forms, setForms] = useState<Form[]>(() =>
    items.map((it) => ({ it, agent: AGENTS[0], prompt: prefillPrompt(it) })),
  );
  const [active, setActive] = useState(0);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.stopImmediatePropagation(); onClose(); }
    };
    document.addEventListener("keydown", handler, true);
    document.body.classList.add("modal-open");
    return () => {
      document.removeEventListener("keydown", handler, true);
      document.body.classList.remove("modal-open");
    };
  }, [onClose]);

  if (forms.length === 0) return null;
  const multi = forms.length > 1;
  const f = forms[active];

  const patch = (p: Partial<Form>) => {
    setForms((prev) => prev.map((x, i) => (i === active ? { ...x, ...p } : x)));
  };

  const launch = () => {
    // Real spawn wiring lives in the plan's Phase 3. For now surface intent
    // so the flow is testable.
    console.log("[tasks] launch", forms.map((x) => ({ id: idOf(x.it), agent: x.agent, prompt: x.prompt })));
    onClose();
  };

  return createPortal(
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className={`modal${multi ? " modal-wide" : ""}`}
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="modal-head">
          <div className="modal-titles">
            <h3>{multi ? `Launch ${forms.length} agents` : "Launch agent"}</h3>
            <p className="modal-sub">
              <span className="mono">{idOf(f.it)}</span> · {f.it.title}
            </p>
          </div>
          <button className="icon-btn" title="Close" onClick={onClose}>{Icon.close()}</button>
        </header>

        {multi && (
          <nav className="modal-tabs" role="tablist">
            {forms.map((form, i) => (
              <button
                key={form.it.key}
                className={`modal-tab${i === active ? " active" : ""}`}
                role="tab"
                onClick={() => setActive(i)}
                title={form.it.title}
              >
                <span className="mono">{idOf(form.it)}</span>
                <span className="modal-tab-title">{form.it.title}</span>
              </button>
            ))}
          </nav>
        )}

        <div className="modal-body">
          <div className="field">
            <label htmlFor="modal-agent">Agent</label>
            <select
              id="modal-agent"
              className="select"
              value={f.agent}
              onChange={(e) => patch({ agent: e.target.value })}
            >
              {AGENTS.map((a) => <option key={a}>{a}</option>)}
            </select>
            <p className="field-hint">Executes this task in a fresh worktree.</p>
          </div>
          <div className="field">
            <label htmlFor="modal-prompt">Prompt</label>
            <textarea
              id="modal-prompt"
              className="textarea"
              rows={10}
              value={f.prompt}
              onChange={(e) => patch({ prompt: e.target.value })}
            />
            <p className="field-hint">
              Prefilled from the {isGh(f.it) ? "issue" : "ticket"}. Edit before launching.
              {multi && " Launch button wires in the plan's Phase 7."}
            </p>
          </div>
        </div>

        <footer className="modal-foot">
          {multi && <span className="modal-foot-count"><b>{forms.length}</b> agents ready</span>}
          <div className="modal-foot-actions">
            <button className="btn ghost" onClick={onClose}>Cancel</button>
            <button
              className="btn primary"
              onClick={launch}
              disabled={multi /* Phase 7 unlocks bulk launch */}
              title={multi ? "Bulk launch arrives in the plan's Phase 7" : undefined}
            >
              {Icon.bolt()} {multi ? `Launch ${forms.length}` : "Launch"}
            </button>
          </div>
        </footer>
      </div>
    </div>,
    document.body,
  );
}
