import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X, Palette, Keyboard, Info, RotateCcw, GitCommitHorizontal, Terminal as TerminalIcon, GitBranch, BookOpen, GripVertical, Pencil, Copy, Trash2, Plus, Cpu, Shield, ChevronDown, KeyRound, Eye, EyeOff, Check } from "lucide-react";
import { Mark } from "../assets/Mark";
import { Tooltip } from "./Tooltip";
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
import {
  usePrompts,
  updatePrompt,
  deletePrompt,
  resetPrompt,
  clonePrompt,
  addPrompt,
  reorderPrompts,
  isBuiltinModified,
  type PromptEntry,
} from "../store/prompts";
import "./SettingsPanel.css";

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
      <Tooltip content="Decrease" placement="top">
        <button className="sp-stepper-btn" disabled={value <= min} onClick={() => onChange(value - 1)}>−</button>
      </Tooltip>
      <span className="sp-stepper-val">{value}</span>
      <Tooltip content="Increase" placement="top">
        <button className="sp-stepper-btn" disabled={value >= max} onClick={() => onChange(value + 1)}>+</button>
      </Tooltip>
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

function SpSelect({ value, options, onChange }: {
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const label = options.find((o) => o.value === value)?.label ?? value;

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div className="sp-drop" ref={ref}>
      <button
        className={`sp-drop-btn${open ? " sp-drop-btn--open" : ""}`}
        onClick={() => setOpen((v) => !v)}
        type="button"
      >
        <span className="sp-drop-label">{label}</span>
        <ChevronDown size={11} className="sp-drop-chevron" />
      </button>
      {open && (
        <div className="sp-drop-menu">
          {options.map((o) => (
            <button
              key={o.value}
              type="button"
              className={`sp-drop-item${o.value === value ? " sp-drop-item--active" : ""}`}
              onClick={() => { onChange(o.value); setOpen(false); }}
            >
              {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
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
          <SpSelect
            value={s.terminalFontFamily}
            options={FONT_FAMILY_OPTIONS}
            onChange={(v) => updateSetting("terminalFontFamily", v)}
          />
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

/* ── Token Intelligence ──────────────────────────────────────────────────── */

/* ── Security ────────────────────────────────────────────────────────────── */

function SecuritySection() {
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

/* ── Token Intelligence ───────────────────────────────────────────────────── */

function TokenIntelligenceSection() {
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

/* ── API Keys ────────────────────────────────────────────────────────────── */

const CDN = "https://cdn.jsdelivr.net/npm/@lobehub/icons-static-svg@latest/icons/";

const API_KEY_PROVIDERS = [
  { id: "anthropic",  label: "Anthropic",  icon: "anthropic.svg",      invert: true,  local: false },
  { id: "openai",     label: "OpenAI",     icon: "openai.svg",          invert: true,  local: false },
  { id: "gemini",     label: "Gemini",     icon: "gemini-color.svg",    invert: false, local: false },
  { id: "mistral",    label: "Mistral",    icon: "mistral-color.svg",   invert: false, local: false },
  { id: "deepseek",   label: "DeepSeek",   icon: "deepseek-color.svg",  invert: false, local: false },
  { id: "xai",        label: "xAI",        icon: "xai.svg",             invert: true,  local: false },
  { id: "groq",       label: "Groq",       icon: "groq.svg",            invert: true,  local: false },
  { id: "openrouter", label: "OpenRouter", icon: "openrouter.svg",      invert: true,  local: false },
  { id: "ollama",     label: "Ollama",     icon: "ollama.svg",          invert: true,  local: true  },
];

function maskKey(key: string) {
  if (key.length <= 8) return "••••••••";
  return key.slice(0, 4) + "••••••••" + key.slice(-4);
}

function ApiKeysSection() {
  const [keys, setKeys] = useState<Record<string, string>>(() => {
    const out: Record<string, string> = {};
    for (const p of API_KEY_PROVIDERS) {
      const k = localStorage.getItem(`tempest-byok-key-${p.id}`);
      if (k) out[p.id] = k;
    }
    return out;
  });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [showId, setShowId] = useState<string | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editingId) setTimeout(() => inputRef.current?.focus(), 0);
  }, [editingId]);

  function startEdit(id: string) {
    setEditingId(id);
    setEditValue(keys[id] ?? "");
  }

  function saveEdit(id: string) {
    const v = editValue.trim();
    if (v) {
      localStorage.setItem(`tempest-byok-key-${id}`, v);
      setKeys(prev => ({ ...prev, [id]: v }));
      setSavedId(id);
      setTimeout(() => setSavedId(null), 1500);
    }
    setEditingId(null);
    setEditValue("");
  }

  function removeKey(id: string) {
    localStorage.removeItem(`tempest-byok-key-${id}`);
    setKeys(prev => { const n = { ...prev }; delete n[id]; return n; });
  }

  return (
    <div className="sp-section">
      <div className="sp-section-heading">API Keys</div>
      <p className="sp-section-desc">
        Keys are stored locally in your browser and never leave your device.
        They power the Chat tab via your own provider accounts.
      </p>

      <div className="sp-apikeys-list">
        {API_KEY_PROVIDERS.map((p) => {
          const key = keys[p.id];
          const isEditing = editingId === p.id;
          const isSaved = savedId === p.id;
          const isVisible = showId === p.id;

          return (
            <div key={p.id} className={`sp-apikey-row${isEditing ? " sp-apikey-row--editing" : ""}`}>
              <div className="sp-apikey-provider">
                <img
                  src={CDN + p.icon}
                  alt={p.label}
                  width={16}
                  height={16}
                  className={p.invert ? "sp-apikey-logo-invert" : ""}
                  style={{ objectFit: "contain", flexShrink: 0 }}
                  onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
                />
                <span className="sp-apikey-name">{p.label}</span>
              </div>

              <div className="sp-apikey-right">
                {p.local ? (
                  <span className="sp-apikey-local">Local · no key needed</span>
                ) : isEditing ? (
                  <div className="sp-apikey-edit">
                    <input
                      ref={inputRef}
                      className="sp-apikey-input"
                      type="text"
                      value={editValue}
                      placeholder="Paste API key…"
                      onChange={(e) => setEditValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") { e.preventDefault(); saveEdit(p.id); }
                        if (e.key === "Escape") { setEditingId(null); setEditValue(""); }
                        e.stopPropagation();
                      }}
                    />
                    <div className="sp-apikey-edit-actions">
                      <button
                        className="sp-apikey-btn sp-apikey-btn--primary"
                        onClick={() => saveEdit(p.id)}
                        disabled={!editValue.trim()}
                      >
                        Save
                      </button>
                      <button
                        className="sp-apikey-btn"
                        onClick={() => { setEditingId(null); setEditValue(""); }}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : key ? (
                  <div className="sp-apikey-set">
                    <span className="sp-apikey-mask">
                      {isVisible ? key : maskKey(key)}
                    </span>
                    <Tooltip content={isVisible ? "Hide" : "Show"} placement="top">
                      <button
                        className="sp-apikey-icon-btn"
                        onClick={() => setShowId(isVisible ? null : p.id)}
                      >
                        {isVisible ? <EyeOff size={13} /> : <Eye size={13} />}
                      </button>
                    </Tooltip>
                    <Tooltip content={isSaved ? "Saved!" : "Edit"} placement="top">
                      <button
                        className={`sp-apikey-icon-btn${isSaved ? " sp-apikey-icon-btn--saved" : ""}`}
                        onClick={() => startEdit(p.id)}
                      >
                        {isSaved ? <Check size={13} /> : <Pencil size={13} />}
                      </button>
                    </Tooltip>
                    <Tooltip content="Remove" placement="top">
                      <button
                        className="sp-apikey-icon-btn sp-apikey-icon-btn--danger"
                        onClick={() => removeKey(p.id)}
                      >
                        <Trash2 size={13} />
                      </button>
                    </Tooltip>
                  </div>
                ) : (
                  <button className="sp-apikey-add-btn" onClick={() => startEdit(p.id)}>
                    <Plus size={12} />
                    Add key
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ── Prompts ─────────────────────────────────────────────────────────────── */

function PromptsSection() {
  const prompts = usePrompts();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editBody, setEditBody] = useState("");
  const [adding, setAdding] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newBody, setNewBody] = useState("");

  const dragIdRef = useRef<string | null>(null);
  const dropIdRef = useRef<string | null>(null);
  const dropSideRef = useRef<"before" | "after">("before");
  const [dropIndicator, setDropIndicator] = useState<{ id: string; side: "before" | "after" } | null>(null);

  function startEdit(p: PromptEntry) {
    setAdding(false);
    setEditingId(p.id);
    setEditTitle(p.title);
    setEditBody(p.body);
  }

  function saveEdit() {
    if (!editingId) return;
    updatePrompt(editingId, { title: editTitle.trim() || "Untitled", body: editBody });
    setEditingId(null);
  }

  function cancelEdit() {
    setEditingId(null);
  }

  function submitNew() {
    const t = newTitle.trim();
    const b = newBody.trim();
    if (!t || !b) return;
    addPrompt(t, b);
    setNewTitle("");
    setNewBody("");
    setAdding(false);
  }

  function cancelNew() {
    setNewTitle("");
    setNewBody("");
    setAdding(false);
  }

  return (
    <div className="sp-section">
      <div className="sp-prompts-header">
        <div>
          <div className="sp-section-heading">Prompt Library</div>
          <p className="sp-section-desc" style={{ marginBottom: 0 }}>
            Saved prompts you can insert into the message queue with one click.
          </p>
        </div>
        {!adding && (
          <button
            className="sp-prompts-new-btn"
            onClick={() => { setEditingId(null); setAdding(true); }}
          >
            <Plus size={12} />
            New
          </button>
        )}
      </div>

      {adding && (
        <div className="sp-prompt-form sp-prompt-form--standalone">
          <input
            className="sp-prompt-form-title"
            type="text"
            placeholder="Prompt title"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            autoFocus
          />
          <textarea
            className="sp-prompt-form-body"
            placeholder="Prompt text sent to the agent…"
            rows={4}
            value={newBody}
            onChange={(e) => setNewBody(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && e.ctrlKey) { e.preventDefault(); submitNew(); }
              if (e.key === "Escape") { e.preventDefault(); cancelNew(); }
              e.stopPropagation();
            }}
          />
          <div className="sp-prompt-form-actions">
            <button
              className="sp-prompt-form-btn sp-prompt-form-btn--primary"
              onClick={submitNew}
              disabled={!newTitle.trim() || !newBody.trim()}
            >
              Add
            </button>
            <button className="sp-prompt-form-btn" onClick={cancelNew}>Cancel</button>
          </div>
        </div>
      )}

      <div className="sp-prompt-list">
        {prompts.map((p) => {
          const modified = isBuiltinModified(p);
          const isEditing = editingId === p.id;
          const isDragOver = dropIndicator?.id === p.id;

          return (
            <div
              key={p.id}
              className={[
                "sp-prompt-item",
                !p.enabled && "sp-prompt-item--disabled",
                isDragOver && dropIndicator?.side === "before" && "sp-prompt-item--drop-before",
                isDragOver && dropIndicator?.side === "after"  && "sp-prompt-item--drop-after",
              ].filter(Boolean).join(" ")}
              draggable={!isEditing}
              onDragStart={(e) => {
                dragIdRef.current = p.id;
                e.dataTransfer.effectAllowed = "move";
                e.dataTransfer.setData("text/plain", p.id);
              }}
              onDragEnd={() => {
                dragIdRef.current = null;
                dropIdRef.current = null;
                setDropIndicator(null);
              }}
              onDragOver={(e) => {
                e.preventDefault();
                if (!dragIdRef.current || dragIdRef.current === p.id) return;
                const rect = e.currentTarget.getBoundingClientRect();
                const side: "before" | "after" = e.clientY < rect.top + rect.height / 2 ? "before" : "after";
                dropIdRef.current = p.id;
                dropSideRef.current = side;
                setDropIndicator({ id: p.id, side });
              }}
              onDrop={(e) => {
                e.preventDefault();
                const from = dragIdRef.current;
                const to = dropIdRef.current;
                const side = dropSideRef.current;
                if (from && to && from !== to) reorderPrompts(from, to, side);
                dragIdRef.current = null;
                dropIdRef.current = null;
                setDropIndicator(null);
              }}
            >
              {isEditing ? (
                <div className="sp-prompt-form">
                  <input
                    className="sp-prompt-form-title"
                    type="text"
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    autoFocus
                  />
                  <textarea
                    className="sp-prompt-form-body"
                    rows={4}
                    value={editBody}
                    onChange={(e) => setEditBody(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && e.ctrlKey) { e.preventDefault(); saveEdit(); }
                      if (e.key === "Escape") { e.preventDefault(); cancelEdit(); }
                      e.stopPropagation();
                    }}
                  />
                  <div className="sp-prompt-form-actions">
                    <button className="sp-prompt-form-btn sp-prompt-form-btn--primary" onClick={saveEdit}>
                      Save
                    </button>
                    <button className="sp-prompt-form-btn" onClick={cancelEdit}>Cancel</button>
                    {p.isBuiltin && modified && (
                      <button
                        className="sp-prompt-form-btn sp-prompt-form-btn--reset"
                        onClick={() => { resetPrompt(p.id); setEditingId(null); }}
                      >
                        <RotateCcw size={11} />
                        Reset to default
                      </button>
                    )}
                  </div>
                </div>
              ) : (
                <div className="sp-prompt-row">
                  <span className="sp-prompt-grip" aria-hidden>
                    <GripVertical size={13} />
                  </span>
                  <ToggleSwitch
                    on={p.enabled}
                    onChange={(v) => updatePrompt(p.id, { enabled: v })}
                  />
                  <div className="sp-prompt-info">
                    <div className="sp-prompt-title-row">
                      <span className="sp-prompt-title">{p.title}</span>
                      {p.isBuiltin && <span className="sp-prompt-badge">built-in</span>}
                      {modified && <span className="sp-prompt-badge sp-prompt-badge--modified">modified</span>}
                    </div>
                    <span className="sp-prompt-preview">
                      {p.body.length > 72 ? p.body.slice(0, 72) + "…" : p.body}
                    </span>
                  </div>
                  <div className="sp-prompt-actions">
                    <Tooltip content="Edit" placement="top">
                      <button className="sp-prompt-action-btn" onClick={() => startEdit(p)}>
                        <Pencil size={12} />
                      </button>
                    </Tooltip>
                    <Tooltip content="Clone" placement="top">
                      <button className="sp-prompt-action-btn" onClick={() => clonePrompt(p.id)}>
                        <Copy size={12} />
                      </button>
                    </Tooltip>
                    {p.isBuiltin && modified && (
                      <Tooltip content="Reset to default" placement="top">
                        <button
                          className="sp-prompt-action-btn"
                          onClick={() => resetPrompt(p.id)}
                        >
                          <RotateCcw size={12} />
                        </button>
                      </Tooltip>
                    )}
                    {!p.isBuiltin && (
                      <Tooltip content="Delete" placement="top">
                        <button
                          className="sp-prompt-action-btn sp-prompt-action-btn--danger"
                          onClick={() => deletePrompt(p.id)}
                        >
                          <Trash2 size={12} />
                        </button>
                      </Tooltip>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
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
                    <Tooltip content="Reset to default" placement="top">
                      <button
                        className="sp-kb-reset-btn"
                        onClick={(e) => { e.stopPropagation(); resetBinding(def.id); }}
                      >
                        <RotateCcw size={11} />
                      </button>
                    </Tooltip>
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
      <div className="sp-about-logo">
        <Mark size={40} />
      </div>
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
