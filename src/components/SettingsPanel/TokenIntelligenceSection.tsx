import { useSettings, updateSetting } from "../../store/appSettings";

export function TokenIntelligenceSection() {
  const s = useSettings();
  return (
    <div className="sp-section">
      <div className="sp-section-heading">Token Intelligence</div>
      <p className="sp-section-desc">
        Atlas indexes your codebase locally and gives AI agents a pre-built semantic
        code graph — reducing repeated file reads and cutting token usage. No data
        leaves your machine.
      </p>

      <div className="sp-rows">
        <div className="sp-toggle-row" onClick={() => updateSetting("atlasEnabled", !s.atlasEnabled)}>
          <div className="sp-toggle-text">
            <span className="sp-toggle-label">Enable Token Intelligence</span>
            <span className="sp-toggle-desc">Off by default — entirely your choice.</span>
          </div>
          <button
            className={`sp-toggle${s.atlasEnabled ? " sp-toggle--on" : ""}`}
            onClick={(e) => { e.stopPropagation(); updateSetting("atlasEnabled", !s.atlasEnabled); }}
            role="switch"
            aria-checked={s.atlasEnabled}
          >
            <span className="sp-toggle-thumb" />
          </button>
        </div>

        {s.atlasEnabled && (
          <div className="sp-toggle-row sp-toggle-row--indent" onClick={() => updateSetting("atlasAutoIndex", !s.atlasAutoIndex)}>
            <div className="sp-toggle-text">
              <span className="sp-toggle-label">Auto-index new projects</span>
              <span className="sp-toggle-desc">Skip the prompt and index every project automatically.</span>
            </div>
            <button
              className={`sp-toggle${s.atlasAutoIndex ? " sp-toggle--on" : ""}`}
              onClick={(e) => { e.stopPropagation(); updateSetting("atlasAutoIndex", !s.atlasAutoIndex); }}
              role="switch"
              aria-checked={s.atlasAutoIndex}
            >
              <span className="sp-toggle-thumb" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
