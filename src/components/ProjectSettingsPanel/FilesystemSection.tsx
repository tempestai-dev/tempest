import { useState } from "react";
import { X, Plus } from "lucide-react";
import type { ProjectSettings } from "./useProjectSettings";

function PathList({
  label, desc, paths, onChange, placeholder, danger,
}: {
  label: string; desc: string;
  paths: string[]; onChange: (p: string[]) => void;
  placeholder?: string; danger?: boolean;
}) {
  const [input, setInput] = useState("");

  function add() {
    const v = input.trim();
    if (!v || paths.includes(v)) { setInput(""); return; }
    onChange([...paths, v]);
    setInput("");
  }

  return (
    <div className="psp-path-group">
      <div className={`psp-path-label${danger ? " psp-path-label--danger" : ""}`}>{label}</div>
      <div className="psp-path-desc">{desc}</div>
      {paths.length > 0 && (
        <div className="psp-tag-list">
          {paths.map((p) => (
            <span key={p} className={`psp-tag psp-tag--mono${danger ? " psp-tag--danger" : ""}`}>
              <span className="psp-tag-text">{p}</span>
              <button
                className="psp-tag-remove"
                onClick={() => onChange(paths.filter((x) => x !== p))}
                aria-label={`Remove ${p}`}
              >
                <X size={10} />
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="psp-add-row">
        <input
          className="psp-input psp-input--mono"
          placeholder={placeholder ?? "./relative or /absolute/path"}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") add(); }}
        />
        <button className="sp-global-agent-install psp-add-btn" onClick={add} disabled={!input.trim()}>
          <Plus size={12} />Add
        </button>
      </div>
    </div>
  );
}

export function FilesystemSection({ value, onChange }: {
  value: ProjectSettings["filesystem"];
  onChange: (v: ProjectSettings["filesystem"]) => void;
}) {
  const { rwPaths, roPaths, denyPaths } = value;

  return (
    <div className="sp-section">
      <div className="sp-section-heading">Filesystem Access</div>
      <p className="sp-section-desc">
        Restrict where agents can read and write when sandbox is set to Enforce.
        Denied paths are always blocked regardless of the allow-lists above.
        Paths are relative to the project root or absolute.
      </p>
      <PathList
        label="Read & Write"
        desc="Agents may read and modify files in these paths."
        paths={rwPaths}
        onChange={(rwPaths) => onChange({ ...value, rwPaths })}
      />
      <PathList
        label="Read Only"
        desc="Agents may read but not modify files in these paths."
        paths={roPaths}
        onChange={(roPaths) => onChange({ ...value, roPaths })}
      />
      <PathList
        label="Always Denied"
        desc="These paths are always blocked — overrides Read & Write and Read Only entries. Use for secrets, production configs, or sensitive directories."
        paths={denyPaths}
        onChange={(denyPaths) => onChange({ ...value, denyPaths })}
        placeholder=".env.production or /etc/secrets"
        danger
      />
    </div>
  );
}
