import { useSettings, updateSetting } from "../../store/appSettings";

export function ExperimentalSection() {
  const s = useSettings();
  return (
    <div className="sp-section">
      <div className="sp-section-heading">Experimental features</div>
      <div className="sp-section-desc" style={{ opacity: 0.6, fontSize: 12, marginBottom: 12 }}>
        Early-access surfaces we're testing. Interfaces and behavior may change
        without notice. Off by default.
      </div>

      <div className="sp-rows">
        <div className="sp-toggle-row" onClick={() => updateSetting("experimentalWarp", !s.experimentalWarp)}>
          <div className="sp-toggle-text">
            <span className="sp-toggle-label">Warp chat backend</span>
            <span className="sp-toggle-desc">
              Adds "Warp" alongside the built-in CLI agents in the chat node's Agents picker.
              Backed by warpllm — Jin Lee's Rust AI gateway (OpenAI, DeepSeek,
              OpenRouter, Kimi via <code>provider/model</code> strings). Requires
              the provider's API key in your environment
              (e.g. <code>OPENAI_API_KEY</code>) or an OpenAI BYOK key saved in
              Settings → API Keys. Non-streaming: replies land as a single block.
            </span>
          </div>
          <button
            className={`sp-toggle${s.experimentalWarp ? " sp-toggle--on" : ""}`}
            onClick={(e) => { e.stopPropagation(); updateSetting("experimentalWarp", !s.experimentalWarp); }}
            role="switch"
            aria-checked={s.experimentalWarp}
          >
            <span className="sp-toggle-thumb" />
          </button>
        </div>
      </div>
    </div>
  );
}
