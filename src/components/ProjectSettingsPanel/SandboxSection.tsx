import type { ProjectSettings } from "./useProjectSettings";

type SandboxMode = ProjectSettings["sandbox"]["mode"];

const MODES: { value: SandboxMode; label: string; desc: string }[] = [
  { value: "off",     label: "Off",     desc: "No restrictions. Agents have full system access." },
  { value: "monitor", label: "Monitor", desc: "Log all file and network access. Nothing is blocked." },
  { value: "enforce", label: "Enforce", desc: "Block all access outside the configured paths and hosts." },
];

export function SandboxSection({ value, onChange }: {
  value: ProjectSettings["sandbox"];
  onChange: (v: ProjectSettings["sandbox"]) => void;
}) {
  const mode = value.mode;

  return (
    <div className="sp-section">
      <div className="sp-section-heading">Agent Sandbox</div>
      <p className="sp-section-desc">
        Control how strictly agent sessions are isolated in this project.
        Enforce mode uses the Network and Filesystem allow-lists below.
      </p>
      <div className="sp-rows">
        {MODES.map((m) => (
          <div
            key={m.value}
            className={`psp-mode-card${mode === m.value ? " psp-mode-card--active" : ""}`}
            onClick={() => onChange({ mode: m.value })}
          >
            <div className={`psp-mode-dot${mode === m.value ? " psp-mode-dot--on" : ""}`} />
            <div className="sp-toggle-text">
              <span className="sp-toggle-label">{m.label}</span>
              <span className="sp-toggle-desc">{m.desc}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
