import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X, Palette, Keyboard, Info, RotateCcw, GitCommitHorizontal, Terminal as TerminalIcon, GitBranch } from "lucide-react";
import { useTheme } from "../themes/ThemeContext";
import type { Theme } from "../themes/types";
import {
  ACTION_DEFS,
  DEFAULTS,
  useKeybindings,
  setBinding,
  resetBinding,
  resetAllBindings,
  formatShortcut,
  shortcutFromEvent,
  type ActionId,
  type Shortcut,
} from "../store/keybindings";
import { useAttribution, setAttribution } from "../store/attribution";
import { useSettings, updateSetting, FONT_FAMILY_OPTIONS, type AppSettings } from "../store/appSettings";
import "./SettingsPanel.css";

interface SettingsPanelProps {
  onClose: () => void;
  onAttributionToggle?: (enabled: boolean) => void;
}

type Section = "appearance" | "terminal" | "git" | "keyboard" | "attribution" | "about";

export function SettingsPanel({ onClose, onAttributionToggle }: SettingsPanelProps) {
  const [activeSection, setActiveSection] = useState<Section>("appearance");
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
          <button className="sp-close" onClick={onClose} aria-label="Close settings">
            <X size={15} />
          </button>
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

/* ── Appearance ──────────────────────────────────────────────────────────── */

function AppearanceSection({
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

/* ── Shared controls ─────────────────────────────────────────────────────── */

function SettingRow({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="sp-row">
      <div className="sp-row-text">
        <span className="sp-row-label">{label}</span>
        {hint && <span className="sp-row-hint">{hint}</span>}
      </div>
      <div className="sp-row-control">{children}</div>
    </div>
  );
}

function Stepper({ value, min, max, onChange }: { value: number; min: number; max: number; onChange: (v: number) => void }) {
  return (
    <div className="sp-stepper">
      <button className="sp-stepper-btn" disabled={value <= min} onClick={() => onChange(value - 1)}>−</button>
      <span className="sp-stepper-val">{value}</span>
      <button className="sp-stepper-btn" disabled={value >= max} onClick={() => onChange(value + 1)}>+</button>
    </div>
  );
}

function Segmented({ options, value, onChange }: {
  options: { value: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="sp-segmented">
      {options.map((o) => (
        <button
          key={o.value}
          className={`sp-segmented-btn${value === o.value ? " sp-segmented-btn--active" : ""}`}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function ToggleSwitch({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      className={`sp-toggle${on ? " sp-toggle--on" : ""}`}
      onClick={() => onChange(!on)}
      role="switch"
      aria-checked={on}
    >
      <span className="sp-toggle-thumb" />
    </button>
  );
}

/* ── Terminal ────────────────────────────────────────────────────────────── */

function TerminalSection() {
  const s = useSettings();
  return (
    <div className="sp-section">
      <div className="sp-section-heading">Terminal</div>
      <p className="sp-section-desc">Customize how the embedded terminal looks and behaves.</p>
      <div className="sp-rows">
        <SettingRow label="Font size" hint="10 – 20 px">
          <Stepper value={s.terminalFontSize} min={10} max={20}
            onChange={(v) => updateSetting("terminalFontSize", v)} />
        </SettingRow>
        <SettingRow label="Font family">
          <select
            className="sp-select"
            value={s.terminalFontFamily}
            onChange={(e) => updateSetting("terminalFontFamily", e.target.value)}
          >
            {FONT_FAMILY_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </SettingRow>
        <SettingRow label="Cursor style">
          <Segmented
            options={[
              { value: "block", label: "Block" },
              { value: "bar", label: "Bar" },
              { value: "underline", label: "Line" },
            ]}
            value={s.terminalCursorStyle}
            onChange={(v) => updateSetting("terminalCursorStyle", v as AppSettings["terminalCursorStyle"])}
          />
        </SettingRow>
        <SettingRow label="Cursor blink">
          <ToggleSwitch on={s.terminalCursorBlink}
            onChange={(v) => updateSetting("terminalCursorBlink", v)} />
        </SettingRow>
        <SettingRow label="Scrollback" hint="Lines kept in history">
          <input
            className="sp-number-input"
            type="number"
            min={100} max={50000} step={100}
            value={s.terminalScrollback}
            onChange={(e) => {
              const n = parseInt(e.target.value, 10);
              if (!isNaN(n) && n >= 100 && n <= 50000) updateSetting("terminalScrollback", n);
            }}
          />
        </SettingRow>
      </div>
    </div>
  );
}

/* ── Git ─────────────────────────────────────────────────────────────────── */

function GitSection() {
  const s = useSettings();
  return (
    <div className="sp-section">
      <div className="sp-section-heading">Git</div>
      <p className="sp-section-desc">Configure how Tempest interacts with your repositories.</p>
      <div className="sp-rows">
        <SettingRow label="Branch prefix" hint="Prepended to new worktree branch names">
          <input
            className="sp-text-input"
            type="text"
            value={s.branchPrefix}
            placeholder="e.g. feat-"
            onChange={(e) => updateSetting("branchPrefix", e.target.value)}
          />
        </SettingRow>
        <SettingRow label="Commit message" hint="Used when pushing agent changes">
          <input
            className="sp-text-input"
            type="text"
            value={s.commitMessageTemplate}
            placeholder="Agent work"
            onChange={(e) => updateSetting("commitMessageTemplate", e.target.value)}
          />
        </SettingRow>
      </div>
    </div>
  );
}

/* ── Keyboard ────────────────────────────────────────────────────────────── */

function KeyboardSection() {
  const bindings = useKeybindings();
  const [capturing, setCapturing] = useState<ActionId | null>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  // Capture keydown while a row is in capture mode
  useEffect(() => {
    if (!capturing) return;
    const handler = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.key === "Escape") { setCapturing(null); return; }
      const sc = shortcutFromEvent(e);
      if (sc) { setBinding(capturing, sc); setCapturing(null); }
    };
    window.addEventListener("keydown", handler, true);
    return () => window.removeEventListener("keydown", handler, true);
  }, [capturing]);

  // Group actions by group field
  const groups = ACTION_DEFS.reduce<Record<string, typeof ACTION_DEFS>>((acc, def) => {
    (acc[def.group] ??= []).push(def);
    return acc;
  }, {});

  const hasCustom = ACTION_DEFS.some(
    (d) => JSON.stringify(bindings[d.id]) !== JSON.stringify(DEFAULTS[d.id])
  );

  return (
    <div className="sp-section sp-section--kb" ref={overlayRef}>
      <div className="sp-kb-header-row">
        <div>
          <div className="sp-section-heading">Keybindings</div>
          <p className="sp-section-desc">Click a binding to remap it. Press Escape to cancel.</p>
        </div>
        {hasCustom && (
          <button className="sp-kb-reset-all" onClick={resetAllBindings}>
            <RotateCcw size={12} />
            Reset all
          </button>
        )}
      </div>

      {Object.entries(groups).map(([group, defs]) => (
        <div key={group} className="sp-kb-group">
          <div className="sp-kb-group-label">{group}</div>
          {defs.map((def) => {
            const sc = bindings[def.id];
            const isDefault = JSON.stringify(sc) === JSON.stringify(DEFAULTS[def.id]);
            const isCapturing = capturing === def.id;
            return (
              <div key={def.id} className="sp-kb-row">
                <span className="sp-kb-action">{def.label}</span>
                <div className="sp-kb-right">
                  <button
                    className={`sp-kb-binding${isCapturing ? " sp-kb-binding--capturing" : ""}`}
                    onClick={() => setCapturing(isCapturing ? null : def.id)}
                  >
                    {isCapturing
                      ? <span className="sp-kb-press-hint">Press shortcut…</span>
                      : <ShortcutChips shortcut={sc} />
                    }
                  </button>
                  {!isDefault && !isCapturing && (
                    <button
                      className="sp-kb-reset-btn"
                      title="Reset to default"
                      onClick={(e) => { e.stopPropagation(); resetBinding(def.id); }}
                    >
                      <RotateCcw size={11} />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

function ShortcutChips({ shortcut }: { shortcut: Shortcut | null }) {
  if (!shortcut) return <span className="sp-kb-unset">—</span>;
  const label = formatShortcut(shortcut);
  return (
    <span className="sp-kb-chips">
      {label.split("+").map((part, i) => (
        <span key={i} className="sp-kb-chip">{part}</span>
      ))}
    </span>
  );
}

/* ── Attribution ─────────────────────────────────────────────────────────── */

interface AttributionSectionProps {
  onToggle?: (enabled: boolean) => void;
}

export function AttributionSection({ onToggle }: AttributionSectionProps) {
  const enabled = useAttribution();

  function toggle() {
    const next = !enabled;
    setAttribution(next);
    onToggle?.(next);
  }

  return (
    <div className="sp-section">
      <div className="sp-section-heading">Tempest Co-authorship</div>
      <p className="sp-section-desc">
        Tempest is open source. This feature is one small way you can help it grow.
      </p>
      <p className="sp-section-desc">
        When enabled, Tempest adds itself as a co-author on commits made inside your
        workspaces. On GitHub, that means every commit shows Tempest next to your name —
        a quiet signal to other developers that this project was built with the help of Tempest.
        No data is collected and nothing is sent anywhere. It is purely a git trailer
        line in the commit message, and you can turn it off at any time.
      </p>

      <div className="sp-toggle-row" onClick={toggle}>
        <div className="sp-toggle-text">
          <span className="sp-toggle-label">Add Tempest as co-author</span>
          <span className="sp-toggle-desc">Off by default — entirely your choice.</span>
        </div>
        <button
          className={`sp-toggle${enabled ? " sp-toggle--on" : ""}`}
          onClick={(e) => { e.stopPropagation(); toggle(); }}
          role="switch"
          aria-checked={enabled}
        >
          <span className="sp-toggle-thumb" />
        </button>
      </div>

      {enabled && (
        <p className="sp-attribution-note">
          Hook written to <code className="sp-code">.git/hooks/prepare-commit-msg</code> in
          each open project. Disabling removes it automatically.
        </p>
      )}
    </div>
  );
}

/* ── About ───────────────────────────────────────────────────────────────── */

function AboutSection() {
  return (
    <div className="sp-section">
      <div className="sp-section-heading">Tempest</div>
      <p className="sp-section-desc">A focused workspace for agentic development.</p>
      <div className="sp-about-rows">
        <div className="sp-about-row">
          <span className="sp-about-key">Version</span>
          <span className="sp-about-val">0.1.0</span>
        </div>
        <div className="sp-about-row">
          <span className="sp-about-key">Built with</span>
          <span className="sp-about-val">Tauri · React · TypeScript</span>
        </div>
      </div>
    </div>
  );
}
