import { useState } from "react";

export function InstructionsSection({ projectId: _projectId }: { projectId: string }) {
  const [text, setText] = useState("");
  const [saved, setSaved] = useState(false);

  function save() {
    // ponytail: wire to dbSetProjectSystemPrompt(_projectId, text || null)
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  }

  return (
    <div className="sp-section">
      <div className="sp-section-heading">Agent Instructions</div>
      <p className="sp-section-desc">
        Injected as a system prompt into every agent session in this project.
        Use for repo conventions, coding standards, environment context, or team rules.
      </p>
      <textarea
        className="psp-instructions-textarea"
        placeholder={"# Project conventions\n- TypeScript strict mode everywhere\n- All DB access through the service layer\n- Tests required for new API endpoints"}
        value={text}
        onChange={(e) => setText(e.target.value)}
        spellCheck={false}
      />
      <div className="psp-instructions-actions">
        <button className="sp-global-agent-install" onClick={save} disabled={!text.trim()}>
          {saved ? "Saved" : "Save"}
        </button>
        {text.trim() && (
          <button
            className="sp-global-agent-install psp-btn-ghost"
            onClick={() => { setText(""); setSaved(false); }}
          >
            Clear
          </button>
        )}
      </div>
    </div>
  );
}
