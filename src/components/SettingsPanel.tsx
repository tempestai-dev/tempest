import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X, Palette, Keyboard, Info, GitCommitHorizontal, Terminal as TerminalIcon, GitBranch, BookOpen, Cpu, Shield, KeyRound } from "lucide-react";
import { Tooltip } from "./Tooltip";
import { useTheme } from "../themes/ThemeContext";
import { AppearanceSection } from "./SettingsPanel/AppearanceSection";
import { TerminalSection } from "./SettingsPanel/TerminalSection";
import { GitSection } from "./SettingsPanel/GitSection";
import { SecuritySection } from "./SettingsPanel/SecuritySection";
import { TokenIntelligenceSection } from "./SettingsPanel/TokenIntelligenceSection";
import { ApiKeysSection } from "./SettingsPanel/ApiKeysSection";
import { PromptsSection } from "./SettingsPanel/PromptsSection";
import { KeyboardSection } from "./SettingsPanel/KeyboardSection";
import { AttributionSection } from "./SettingsPanel/AttributionSection";
import { AboutSection } from "./SettingsPanel/AboutSection";
import "./SettingsPanel.css";

export { AttributionSection } from "./SettingsPanel/AttributionSection";

type Section = "appearance" | "terminal" | "git" | "intelligence" | "security" | "apikeys" | "prompts" | "keyboard" | "attribution" | "about";

interface SettingsPanelProps {
  onClose: () => void;
  onAttributionToggle?: (enabled: boolean) => void;
  initialSection?: Section;
}

export function SettingsPanel({ onClose, onAttributionToggle, initialSection }: SettingsPanelProps) {
  const [activeSection, setActiveSection] = useState<Section>(initialSection ?? "appearance");
  const { theme, themes, setTheme } = useTheme();

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  return createPortal(
    <div className="sp-overlay" onClick={onClose}>
      <div className="sp-panel" onClick={(e) => e.stopPropagation()}>

        <div className="sp-header">
          <span className="sp-title">Settings</span>
          <Tooltip content="Close" placement="left">
            <button className="sp-close" onClick={onClose}>
              <X size={15} />
            </button>
          </Tooltip>
        </div>

        <div className="sp-body">
          <nav className="sp-nav">
            <div className="sp-nav-group-label">General</div>
            <button
              className={`sp-nav-item${activeSection === "appearance" ? " sp-nav-item--active" : ""}`}
              onClick={() => setActiveSection("appearance")}
            >
              <Palette size={14} />
              Appearance
            </button>
            <button
              className={`sp-nav-item${activeSection === "terminal" ? " sp-nav-item--active" : ""}`}
              onClick={() => setActiveSection("terminal")}
            >
              <TerminalIcon size={14} />
              Terminal
            </button>
            <button
              className={`sp-nav-item${activeSection === "git" ? " sp-nav-item--active" : ""}`}
              onClick={() => setActiveSection("git")}
            >
              <GitBranch size={14} />
              Git
            </button>
            <button
              className={`sp-nav-item${activeSection === "intelligence" ? " sp-nav-item--active" : ""}`}
              onClick={() => setActiveSection("intelligence")}
            >
              <Cpu size={14} />
              Token Intelligence
            </button>
            <button
              className={`sp-nav-item${activeSection === "security" ? " sp-nav-item--active" : ""}`}
              onClick={() => setActiveSection("security")}
            >
              <Shield size={14} />
              Security
            </button>
<button
              className={`sp-nav-item${activeSection === "apikeys" ? " sp-nav-item--active" : ""}`}
              onClick={() => setActiveSection("apikeys")}
            >
              <KeyRound size={14} />
              API Keys
            </button>
            <button
              className={`sp-nav-item${activeSection === "prompts" ? " sp-nav-item--active" : ""}`}
              onClick={() => setActiveSection("prompts")}
            >
              <BookOpen size={14} />
              Prompts
            </button>
            <button
              className={`sp-nav-item${activeSection === "keyboard" ? " sp-nav-item--active" : ""}`}
              onClick={() => setActiveSection("keyboard")}
            >
              <Keyboard size={14} />
              Keybindings
            </button>
            <button
              className={`sp-nav-item${activeSection === "attribution" ? " sp-nav-item--active" : ""}`}
              onClick={() => setActiveSection("attribution")}
            >
              <GitCommitHorizontal size={14} />
              Attribution
            </button>
            <div className="sp-nav-group-label sp-nav-group-label--lower">Help</div>
            <button
              className={`sp-nav-item${activeSection === "about" ? " sp-nav-item--active" : ""}`}
              onClick={() => setActiveSection("about")}
            >
              <Info size={14} />
              About
            </button>
          </nav>

          <div className="sp-content">
            {activeSection === "appearance" && (
              <AppearanceSection themes={themes} activeTheme={theme} onThemeChange={setTheme} />
            )}
            {activeSection === "terminal" && <TerminalSection />}
            {activeSection === "git" && <GitSection />}
            {activeSection === "intelligence" && <TokenIntelligenceSection />}
            {activeSection === "security" && <SecuritySection />}
            {activeSection === "apikeys" && <ApiKeysSection />}
            {activeSection === "prompts" && <PromptsSection />}
            {activeSection === "keyboard" && <KeyboardSection />}
            {activeSection === "attribution" && <AttributionSection onToggle={onAttributionToggle} />}
            {activeSection === "about" && <AboutSection />}
          </div>
        </div>

      </div>
    </div>,
    document.body
  );
}
