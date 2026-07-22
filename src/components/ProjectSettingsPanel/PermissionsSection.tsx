import type { ProjectSettings } from "./useProjectSettings";

export function PermissionsSection({ value, onChange }: {
  value: ProjectSettings["permissions"];
  onChange: (v: ProjectSettings["permissions"]) => void;
}) {
  const allowSkip = value.allowSkipPermissions;
  const setAllowSkip = (next: boolean) => onChange({ allowSkipPermissions: next });

  return (
    <div className="sp-section">
      <div className="sp-section-heading">Permissions</div>
      <p className="sp-section-desc">
        Control what agents are allowed to do in this project beyond sandbox rules.
      </p>
      <div className="sp-rows">
        <div className="sp-toggle-row" onClick={() => setAllowSkip(!allowSkip)}>
          <div className="sp-toggle-text">
            <span className="sp-toggle-label">Allow skip-permissions bypass</span>
            <span className="sp-toggle-desc">
              Lets agents bypass tool-call approval prompts via{" "}
              <code className="sp-code">--dangerously-skip-permissions</code>.
              Disable for repos with production database or infrastructure access.
            </span>
          </div>
          <button
            className={`sp-toggle${allowSkip ? " sp-toggle--on" : ""}`}
            onClick={(e) => { e.stopPropagation(); setAllowSkip(!allowSkip); }}
            role="switch"
            aria-checked={allowSkip}
          >
            <span className="sp-toggle-thumb" />
          </button>
        </div>
      </div>
    </div>
  );
}
