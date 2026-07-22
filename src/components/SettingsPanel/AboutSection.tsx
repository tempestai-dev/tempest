import { useState, useEffect } from "react";
import { getVersion } from "@tauri-apps/api/app";
import { Mark } from "../../assets/Mark";

export function AboutSection() {
  const [version, setVersion] = useState("…");

  useEffect(() => {
    getVersion().then(setVersion).catch(() => setVersion("—"));
  }, []);

  return (
    <div className="sp-section">
      <div className="sp-about-logo">
        <Mark size={40} />
      </div>
      <div className="sp-section-heading">Tempest</div>
      <p className="sp-section-desc">A focused workspace for agentic development.</p>
      <div className="sp-about-rows">
        <div className="sp-about-row">
          <span className="sp-about-key">Version</span>
          <span className="sp-about-val">{version}</span>
        </div>
        <div className="sp-about-row">
          <span className="sp-about-key">Built with</span>
          <span className="sp-about-val">Tauri · React · TypeScript</span>
        </div>
      </div>
    </div>
  );
}
