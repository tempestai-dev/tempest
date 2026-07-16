import { useSettings, updateSetting } from "../../store/appSettings";
import type { Theme } from "../../themes/types";
import { SettingRow } from "../ui/SettingRow";
import { Stepper } from "../ui/Stepper";

export function AppearanceSection({
  themes,
  activeTheme,
  onThemeChange,
}: {
  themes: Theme[];
  activeTheme: Theme;
  onThemeChange: (t: Theme) => void;
}) {
  const s = useSettings();
  return (
    <div className="sp-section">
      <div className="sp-section-heading">Theme</div>
      <p className="sp-section-desc">Choose a color theme for the editor and UI.</p>
      <div className="sp-theme-grid">
        {themes.map((t) => (
          <button
            key={t.name}
            className={`sp-theme-card${t.name === activeTheme.name ? " sp-theme-card--active" : ""}`}
            onClick={() => onThemeChange(t)}
          >
            <ThemePreview theme={t} />
            <span className="sp-theme-name">{t.name}</span>
          </button>
        ))}
      </div>

      <div className="sp-section-heading" style={{ marginTop: 24 }}>Interface</div>
      <p className="sp-section-desc">Adjust sidebar text sizing.</p>
      <div className="sp-rows">
        <SettingRow label="Sidebar font size" hint="12 – 18 px">
          <Stepper value={s.sidebarFontSize} min={12} max={18}
            onChange={(v) => updateSetting("sidebarFontSize", v)} />
        </SettingRow>
      </div>
    </div>
  );
}

function ThemePreview({ theme }: { theme: Theme }) {
  const bg      = theme.colors["bg.editor"]      ?? "#0a0a0a";
  const sidebar = theme.colors["bg.sidebar"]     ?? "#000000";
  const accent  = theme.colors["accent.blue"]    ?? "#62a6ff";
  const fg      = theme.colors["fg.default"]     ?? "#ededed";
  const fgMuted = theme.colors["fg.muted"]       ?? "#a1a1a1";
  const border  = theme.colors["border.default"] ?? "#242424";
  const green   = theme.colors["accent.green"]   ?? "#58c760";

  return (
    <div className="sp-theme-preview" style={{ background: bg, borderColor: border }}>
      <div className="sp-theme-preview-sidebar" style={{ background: sidebar, borderRightColor: border }}>
        <div className="sp-theme-preview-dot" style={{ background: fgMuted, opacity: 0.55 }} />
        <div className="sp-theme-preview-dot" style={{ background: fgMuted, opacity: 0.3  }} />
        <div className="sp-theme-preview-dot" style={{ background: fgMuted, opacity: 0.3  }} />
      </div>
      <div className="sp-theme-preview-content">
        <div className="sp-theme-preview-line" style={{ background: fg,      width: "65%", opacity: 0.55 }} />
        <div className="sp-theme-preview-line" style={{ background: accent,  width: "42%", opacity: 0.75 }} />
        <div className="sp-theme-preview-line" style={{ background: green,   width: "50%", opacity: 0.55 }} />
        <div className="sp-theme-preview-line" style={{ background: fgMuted, width: "35%", opacity: 0.3  }} />
      </div>
    </div>
  );
}
