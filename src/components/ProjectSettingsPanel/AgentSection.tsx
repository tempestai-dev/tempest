import { Check } from "lucide-react";
import { AGENT_CONFIGS, AgentIcon } from "../NewSessionMenu";
import type { ProjectSettings } from "./useProjectSettings";

export function AgentSection({ value, onChange }: {
  value: ProjectSettings["agents"];
  onChange: (v: ProjectSettings["agents"]) => void;
}) {
  const permitted = new Set(value.permitted);
  const allSelected = permitted.size === AGENT_CONFIGS.length;

  function toggle(hint: string) {
    const next = new Set(permitted);
    if (next.has(hint)) { next.delete(hint); } else { next.add(hint); }
    onChange({ permitted: [...next] });
  }

  function toggleAll() {
    onChange({ permitted: allSelected ? [] : AGENT_CONFIGS.map((a) => a.hint) });
  }

  return (
    <div className="sp-section">
      <div className="sp-section-heading">Permitted Agents</div>
      <p className="sp-section-desc">
        Choose which agent CLIs team members are allowed to use in this project.
        Unchecked agents are hidden from the session picker for this project.
      </p>

      <div className="psp-agent-select-all">
        <button
          className={`psp-select-all-btn${allSelected ? " psp-select-all-btn--active" : ""}`}
          onClick={toggleAll}
        >
          <span className={`psp-select-all-check${allSelected ? " psp-select-all-check--on" : ""}`}>
            {allSelected && <Check size={10} strokeWidth={3} />}
          </span>
          All agents permitted
        </button>
      </div>

      <div className="psp-agent-grid">
        {AGENT_CONFIGS.map((a) => {
          const on = permitted.has(a.hint);
          return (
            <button
              key={a.hint}
              className={`psp-agent-card${on ? " psp-agent-card--active" : ""}`}
              onClick={() => toggle(a.hint)}
            >
              {on && (
                <span className="psp-agent-check">
                  <Check size={9} strokeWidth={3} />
                </span>
              )}
              <AgentIcon hint={a.hint} size={20} />
              <span className="psp-agent-card-name">{a.name}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
