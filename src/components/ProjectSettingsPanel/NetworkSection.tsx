import { useState } from "react";
import { X, Plus } from "lucide-react";
import type { ProjectSettings } from "./useProjectSettings";

function HostList({
  hosts, onRemove, input, onInput, onAdd, placeholder,
}: {
  hosts: string[];
  onRemove: (h: string) => void;
  input: string;
  onInput: (v: string) => void;
  onAdd: () => void;
  placeholder: string;
}) {
  return (
    <>
      {hosts.length > 0 && (
        <div className="psp-tag-list">
          {hosts.map((h) => (
            <span key={h} className="psp-tag">
              <span className="psp-tag-text">{h}</span>
              <button className="psp-tag-remove" onClick={() => onRemove(h)} aria-label={`Remove ${h}`}>
                <X size={10} />
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="psp-add-row">
        <input
          className="psp-input"
          placeholder={placeholder}
          value={input}
          onChange={(e) => onInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") onAdd(); }}
        />
        <button className="sp-global-agent-install psp-add-btn" onClick={onAdd} disabled={!input.trim()}>
          <Plus size={12} />Add
        </button>
      </div>
    </>
  );
}

export function NetworkSection({ value, onChange }: {
  value: ProjectSettings["network"];
  onChange: (v: ProjectSettings["network"]) => void;
}) {
  const { policy, allowHosts, blockHosts } = value;
  const [allowInput, setAllowInput] = useState("");
  const [blockInput, setBlockInput] = useState("");

  function addAllow() {
    const v = allowInput.trim();
    if (!v || allowHosts.includes(v)) { setAllowInput(""); return; }
    onChange({ ...value, allowHosts: [...allowHosts, v] });
    setAllowInput("");
  }

  function addBlock() {
    const v = blockInput.trim();
    if (!v || blockHosts.includes(v)) { setBlockInput(""); return; }
    onChange({ ...value, blockHosts: [...blockHosts, v] });
    setBlockInput("");
  }

  return (
    <div className="sp-section">
      <div className="sp-section-heading">Network Policy</div>
      <p className="sp-section-desc">
        Control which external hosts agents can reach.
        Wildcards supported: <code className="sp-code">*.example.com</code>
      </p>

      <div className="sp-rows" style={{ marginBottom: 20 }}>
        <div
          className={`psp-mode-card${policy === "permissive" ? " psp-mode-card--active" : ""}`}
          onClick={() => onChange({ ...value, policy: "permissive" })}
        >
          <div className={`psp-mode-dot${policy === "permissive" ? " psp-mode-dot--on" : ""}`} />
          <div className="sp-toggle-text">
            <span className="sp-toggle-label">Permissive — allow all, block specific</span>
            <span className="sp-toggle-desc">Agents can reach any host except the ones you list below.</span>
          </div>
        </div>
        <div
          className={`psp-mode-card${policy === "restrictive" ? " psp-mode-card--active" : ""}`}
          onClick={() => onChange({ ...value, policy: "restrictive" })}
        >
          <div className={`psp-mode-dot${policy === "restrictive" ? " psp-mode-dot--on" : ""}`} />
          <div className="sp-toggle-text">
            <span className="sp-toggle-label">Restrictive — block all, allow specific</span>
            <span className="sp-toggle-desc">Agents are blocked from all hosts except the ones you list below.</span>
          </div>
        </div>
      </div>

      {policy === "permissive" ? (
        <div className="psp-path-group">
          <div className="psp-path-label">Blocked hosts</div>
          <div className="psp-path-desc">
            All outbound traffic is allowed except to these hosts.
            Useful for blocking production APIs, payment processors, or internal services.
          </div>
          <HostList
            hosts={blockHosts}
            onRemove={(h) => onChange({ ...value, blockHosts: blockHosts.filter((x) => x !== h) })}
            input={blockInput}
            onInput={setBlockInput}
            onAdd={addBlock}
            placeholder="payments.stripe.com"
          />
        </div>
      ) : (
        <div className="psp-path-group">
          <div className="psp-path-label">Allowed hosts</div>
          <div className="psp-path-desc">
            All outbound traffic is blocked except to these hosts.
            Used together with sandbox Enforce mode.
          </div>
          <HostList
            hosts={allowHosts}
            onRemove={(h) => onChange({ ...value, allowHosts: allowHosts.filter((x) => x !== h) })}
            input={allowInput}
            onInput={setAllowInput}
            onAdd={addAllow}
            placeholder="api.anthropic.com"
          />
        </div>
      )}
    </div>
  );
}
