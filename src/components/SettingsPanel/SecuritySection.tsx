import { useSettings, updateSetting } from "../../store/appSettings";

export function SecuritySection() {
  const s = useSettings();
  return (
    <div className="sp-section">
      <div className="sp-section-heading">Security</div>

      <div className="sp-rows">
        <div className="sp-toggle-row" onClick={() => updateSetting("autoApprove", !s.autoApprove)}>
          <div className="sp-toggle-text">
            <span className="sp-toggle-label">Auto-approve agent tool calls</span>
            <span className="sp-toggle-desc">
              Pass each agent's skip-permissions flag at spawn so it never stops to ask
              for confirmation. Supported agents: Claude Code, Gemini CLI, Codex CLI,
              Antigravity. Applies to sessions started after this is enabled.
            </span>
          </div>
          <button
            className={`sp-toggle${s.autoApprove ? " sp-toggle--on" : ""}`}
            onClick={(e) => { e.stopPropagation(); updateSetting("autoApprove", !s.autoApprove); }}
            role="switch"
            aria-checked={s.autoApprove}
          >
            <span className="sp-toggle-thumb" />
          </button>
        </div>

        <div className="sp-toggle-row" onClick={() => updateSetting("isolateAgents", !s.isolateAgents)}>
          <div className="sp-toggle-text">
            <span className="sp-toggle-label">Isolate agent sessions</span>
            <span className="sp-toggle-desc">
              Wrap every new agent in a Hephaestus sandbox. On Windows, each agent
              session runs inside a Job Object so its entire process tree is confined
              and killed cleanly when the session closes. Network isolation arrives
              with the Linux and macOS releases. Applies to sessions started after
              this is enabled.
            </span>
          </div>
          <button
            className={`sp-toggle${s.isolateAgents ? " sp-toggle--on" : ""}`}
            onClick={(e) => { e.stopPropagation(); updateSetting("isolateAgents", !s.isolateAgents); }}
            role="switch"
            aria-checked={s.isolateAgents}
          >
            <span className="sp-toggle-thumb" />
          </button>
        </div>
      </div>
    </div>
  );
}
