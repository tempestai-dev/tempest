import { useMemo, useState } from "react";
import { ChevronRight, ChevronDown, Trash2, Copy, Plus } from "lucide-react";
import { useAgents, getCustomAgents, setCustomAgents } from "../../lib/agentRegistry";
import type { AgentConfig } from "../../lib/agentManifest";
import { getAgentConfig, setAgentConfig } from "../../lib/runtimeState";
import {
  parseArgs, argsToText, parseEnv, envToText,
} from "../../lib/agentConfig";
import { LUCIDE_ICON_NAMES, AgentIcon } from "../NewSessionMenu";
import { Terminal, Bot, Code2, Command as CommandIcon, Cpu, Zap, Sparkles, Package, Rocket, Wrench, Ghost, Play } from "lucide-react";
import { useSettings, updateSetting } from "../../store/appSettings";

// Local copy of the picker's icon map. Kept in sync with LUCIDE_ICON_NAMES
// (the single source of truth for which icon slugs are legal). Duplicated
// here so the picker can render an icon by slug directly, without going
// through AgentIcon (which needs a live agent hint to resolve).
const LUCIDE_ICON_LOOKUP: Record<string, React.ComponentType<{ size?: number }>> = {
  terminal: Terminal, bot: Bot, code: Code2, command: CommandIcon, cpu: Cpu,
  zap: Zap, sparkles: Sparkles, package: Package, rocket: Rocket, wrench: Wrench,
  ghost: Ghost, play: Play,
};

// Settings → Agents. Two responsibilities:
//   1. Per-agent-type LAUNCH DEFAULTS (args/env/subdir) applied globally — kept
//      for both built-in and custom entries. See src/lib/agentConfig.ts for the
//      merge model and precedence.
//   2. USER-ADDED AGENTS: full add/edit/clone/delete + a disable toggle for
//      hiding an agent from the launcher without deleting it. Custom entries
//      live in runtimeState.customAgents; built-ins can only be disabled.

// Reserve one id per open Add form. Not a user-facing string — it just keeps
// the freshly-created row addressable for the auto-expand + name input focus.
function nextCustomId(existing: readonly AgentConfig[]): string {
  const taken = new Set(existing.map((a) => a.id));
  for (let n = 1; ; n++) {
    const id = `custom-${n}`;
    if (!taken.has(id)) return id;
  }
}

/// The command field reaches Rust as a bare token (or a couple of them, e.g.
/// `gh copilot`). Reject spaces-as-arguments / shell metacharacters — a stray
/// `|` or `;` here would be executed by whatever spawns the PTY.
const CMD_RE = /^[A-Za-z0-9_.-]+( [A-Za-z0-9_.-]+)*$/;

export function AgentsSection() {
  const agents = useAgents();
  const [expandedId, setExpandedId] = useState<string | null>(null);

  function addCustom() {
    const id = nextCustomId(agents);
    const next = [
      ...getCustomAgents(),
      { id, name: "New agent", hint: "", custom: true, icon: "lucide:terminal" },
    ];
    setCustomAgents(next);
    setExpandedId(id);
  }

  return (
    <div className="sp-section">
      <div className="sp-section-heading">
        Agents
        <button
          className="sp-btn"
          style={{ float: "right", display: "inline-flex", alignItems: "center", gap: 6 }}
          onClick={addCustom}
        >
          <Plus size={13} /> Add agent
        </button>
      </div>
      <p className="sp-section-desc">
        Launch defaults for every session of an agent type. Custom agents you add here
        appear in the launcher alongside the built-ins. Placeholders you can use in flags:
        {" "}<code>{"{UUID}"}</code>, <code>{"{MODEL}"}</code>, <code>{"{WORKSPACE_NAME}"}</code>,
        {" "}<code>{"{WORKSPACE_SLUG}"}</code>, <code>{"{WORKSPACE_PATH}"}</code>,
        {" "}<code>{"{WORKSPACE_ID}"}</code>.
      </p>

      <ClaudeCliPathField />

      <div className="sp-agents-list">
        {agents.map((a) => (
          <AgentRow
            key={a.id}
            agent={a}
            open={expandedId === a.id}
            onToggle={() => setExpandedId(expandedId === a.id ? null : a.id)}
          />
        ))}
      </div>
    </div>
  );
}

// Override for the `claude` CLI the Claude Code chat bridge invokes. Empty →
// bridge falls back to a PATH lookup. Only affects chat nodes with backend "cli"
// on the Claude Code agent; PTY-launched sessions use the OS PATH directly.
function ClaudeCliPathField() {
  const { claudeCliPath } = useSettings();
  const [value, setValue] = useState(claudeCliPath);
  return (
    <div style={{ marginBottom: 16 }}>
      <label className="sp-agent-label">
        Path to claude binary <span className="sp-agent-hint">optional; overrides PATH lookup for the Claude Code chat bridge</span>
      </label>
      <input
        className="sp-agent-input"
        value={value}
        placeholder={"C:\\path\\to\\claude.cmd  (leave blank to use PATH)"}
        spellCheck={false}
        onChange={(e) => setValue(e.target.value)}
        onBlur={() => updateSetting("claudeCliPath", value.trim())}
        onKeyDown={(e) => e.stopPropagation()}
      />
    </div>
  );
}

function AgentRow({
  agent, open, onToggle,
}: {
  agent: AgentConfig;
  open: boolean;
  onToggle: () => void;
}) {
  // Per-agent launch defaults (args/env/subdir) — applies to both built-in and
  // custom agents.
  const cfg = getAgentConfig(agent.id);
  const [argsText, setArgsText] = useState(() => argsToText(cfg.args));
  const [envText, setEnvText]   = useState(() => envToText(cfg.env));
  const [subdir, setSubdir]     = useState(() => cfg.subdir);
  const [envWarnings, setEnvWarnings] = useState<string[]>([]);

  function commitDefaults() {
    const { env, warnings } = parseEnv(envText);
    setEnvWarnings(warnings);
    setAgentConfig(agent.id, { args: parseArgs(argsText), env, subdir: subdir.trim() });
  }

  const configured = cfg.args.length > 0 || Object.keys(cfg.env).length > 0 || !!cfg.subdir;

  return (
    <div className={`sp-agent-row${open ? " sp-agent-row--open" : ""}`}>
      <button className="sp-agent-head" onClick={onToggle}>
        {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        <AgentIcon hint={agent.hint} size={16} />
        <span className="sp-agent-name">{agent.name}</span>
        {agent.custom && <span className="sp-agent-badge">custom</span>}
        {agent.disabled && <span className="sp-agent-badge">disabled</span>}
        {configured && !open && <span className="sp-agent-badge">configured</span>}
      </button>

      {open && (
        <div className="sp-agent-body">
          {agent.custom && <CustomAgentEditor agent={agent} />}

          <DisableToggle agent={agent} />

          <label className="sp-agent-label">
            Extra flags <span className="sp-agent-hint">one per line, appended to every launch</span>
          </label>
          <textarea
            className="sp-agent-textarea"
            rows={3}
            value={argsText}
            placeholder={"--verbose\n--permission-mode=plan"}
            spellCheck={false}
            onChange={(e) => setArgsText(e.target.value)}
            onBlur={commitDefaults}
            onKeyDown={(e) => e.stopPropagation()}
          />

          <label className="sp-agent-label">
            Environment <span className="sp-agent-hint">KEY=VALUE per line</span>
          </label>
          <textarea
            className="sp-agent-textarea"
            rows={3}
            value={envText}
            placeholder={"ANTHROPIC_BASE_URL=https://gateway.corp.internal"}
            spellCheck={false}
            onChange={(e) => setEnvText(e.target.value)}
            onBlur={commitDefaults}
            onKeyDown={(e) => e.stopPropagation()}
          />
          {envWarnings.map((w, i) => (
            <p key={i} className="sp-agent-warn">{w}</p>
          ))}

          <label className="sp-agent-label">
            Working subdirectory <span className="sp-agent-hint">relative to the worktree</span>
          </label>
          <input
            className="sp-agent-input"
            value={subdir}
            placeholder="packages/api"
            spellCheck={false}
            onChange={(e) => setSubdir(e.target.value)}
            onBlur={commitDefaults}
            onKeyDown={(e) => e.stopPropagation()}
          />

          <RowActions agent={agent} />
        </div>
      )}
    </div>
  );
}

/// Custom-agent editor. Only rendered when `agent.custom` — every field here
/// mutates the persisted `customAgents` blob. Debounce isn't needed: writes
/// go through `setCustomAgents` on blur / toggle, not per keystroke.
function CustomAgentEditor({ agent }: { agent: AgentConfig }) {
  const [name, setName] = useState(agent.name);
  const [hint, setHint] = useState(agent.hint);
  const [icon, setIcon] = useState(agent.icon ?? "lucide:terminal");
  const [autoApprove, setAutoApprove] = useState(() => (agent.autoApproveArgs ?? []).join("\n"));
  const [resumeArgs, setResumeArgs] = useState(() => (agent.resumeArgs ?? []).join("\n"));
  const [sessionArgs, setSessionArgs] = useState(() => (agent.sessionIdArgs ?? []).join("\n"));
  const [modelArgs, setModelArgs] = useState(() => (agent.modelArgs ?? []).join("\n"));
  const [downloadUrl, setDownloadUrl] = useState(agent.downloadUrl ?? "");
  const [hintErr, setHintErr] = useState<string | null>(null);

  function persist(patch: Partial<AgentConfig>) {
    const list = getCustomAgents().map((a) =>
      a.id === agent.id ? { ...a, ...patch } : a,
    );
    setCustomAgents(list);
  }

  function commitHint() {
    const v = hint.trim();
    if (v && !CMD_RE.test(v)) { setHintErr("Command must be a bare binary name (letters, digits, . _ -)"); return; }
    setHintErr(null);
    persist({ hint: v });
  }

  function toArgList(text: string): string[] {
    return text.split("\n").map((l) => l.trim()).filter(Boolean);
  }

  return (
    <div className="sp-agent-custom">
      <div className="sp-agent-grid">
        <div>
          <label className="sp-agent-label">Display name</label>
          <input
            className="sp-agent-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => persist({ name: name.trim() || agent.id })}
            onKeyDown={(e) => e.stopPropagation()}
          />
        </div>
        <div>
          <label className="sp-agent-label">Command <span className="sp-agent-hint">binary on PATH</span></label>
          <input
            className="sp-agent-input"
            value={hint}
            placeholder="my-agent"
            onChange={(e) => setHint(e.target.value)}
            onBlur={commitHint}
            onKeyDown={(e) => e.stopPropagation()}
          />
          {hintErr && <p className="sp-agent-warn">{hintErr}</p>}
        </div>
      </div>

      <label className="sp-agent-label">Icon</label>
      <IconPicker value={icon} onChange={(v) => { setIcon(v); persist({ icon: v }); }} />

      <label className="sp-agent-label">
        Session-start args <span className="sp-agent-hint">first launch; supports {"{UUID}"}</span>
      </label>
      <textarea
        className="sp-agent-textarea" rows={2} value={sessionArgs}
        placeholder={"--session-id\n{UUID}"}
        spellCheck={false}
        onChange={(e) => setSessionArgs(e.target.value)}
        onBlur={() => persist({ sessionIdArgs: toArgList(sessionArgs) })}
        onKeyDown={(e) => e.stopPropagation()}
      />

      <label className="sp-agent-label">
        Resume args <span className="sp-agent-hint">reopens a saved session; supports {"{UUID}"}</span>
      </label>
      <textarea
        className="sp-agent-textarea" rows={2} value={resumeArgs}
        placeholder={"--resume\n{UUID}"}
        spellCheck={false}
        onChange={(e) => setResumeArgs(e.target.value)}
        onBlur={() => persist({ resumeArgs: toArgList(resumeArgs) })}
        onKeyDown={(e) => e.stopPropagation()}
      />

      <label className="sp-agent-label">
        Model args <span className="sp-agent-hint">optional; supports {"{MODEL}"}</span>
      </label>
      <textarea
        className="sp-agent-textarea" rows={2} value={modelArgs}
        placeholder={"--model\n{MODEL}"}
        spellCheck={false}
        onChange={(e) => setModelArgs(e.target.value)}
        onBlur={() => persist({ modelArgs: toArgList(modelArgs) })}
        onKeyDown={(e) => e.stopPropagation()}
      />

      <label className="sp-agent-label">
        Auto-approve args <span className="sp-agent-hint">only applied when the global Auto setting is on</span>
      </label>
      <textarea
        className="sp-agent-textarea" rows={2} value={autoApprove}
        placeholder={"--dangerously-skip-permissions"}
        spellCheck={false}
        onChange={(e) => setAutoApprove(e.target.value)}
        onBlur={() => persist({ autoApproveArgs: toArgList(autoApprove) })}
        onKeyDown={(e) => e.stopPropagation()}
      />

      <label className="sp-agent-label">
        Download URL <span className="sp-agent-hint">shown when the command isn't on PATH</span>
      </label>
      <input
        className="sp-agent-input"
        value={downloadUrl}
        placeholder="https://example.com/install"
        onChange={(e) => setDownloadUrl(e.target.value)}
        onBlur={() => persist({ downloadUrl: /^https:\/\//i.test(downloadUrl.trim()) ? downloadUrl.trim() : undefined })}
        onKeyDown={(e) => e.stopPropagation()}
      />
    </div>
  );
}

function IconPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const options = useMemo(() => LUCIDE_ICON_NAMES.map((n) => `lucide:${n}`), []);
  return (
    <div className="sp-agent-icon-grid">
      {options.map((opt) => (
        <button
          key={opt}
          type="button"
          className={`sp-agent-icon-swatch${value === opt ? " sp-agent-icon-swatch--on" : ""}`}
          onClick={() => onChange(opt)}
          title={opt.slice("lucide:".length)}
        >
          {(() => {
            const key = opt.slice("lucide:".length);
            const Comp = LUCIDE_ICON_LOOKUP[key];
            return Comp ? <Comp size={16} /> : <span style={{ fontSize: 10 }}>{key}</span>;
          })()}
        </button>
      ))}
    </div>
  );
}

function DisableToggle({ agent }: { agent: AgentConfig }) {
  const disabled = !!agent.disabled;
  function toggle() {
    if (agent.custom) {
      const list = getCustomAgents().map((a) =>
        a.id === agent.id ? { ...a, disabled: !disabled } : a,
      );
      setCustomAgents(list);
      return;
    }
    // Built-ins aren't in customAgents yet; disabling one adds a minimal patch
    // that inherits every other field from the bundled entry via the merge.
    const list = getCustomAgents();
    const idx = list.findIndex((a) => a.id === agent.id);
    if (idx >= 0) list[idx] = { ...list[idx], disabled: !disabled };
    else list.push({ id: agent.id, name: agent.name, hint: agent.hint, disabled: !disabled });
    setCustomAgents([...list]);
  }
  return (
    <div className="sp-agent-toggle-row" onClick={toggle}>
      <span className="sp-agent-label" style={{ margin: 0 }}>Hide from launcher</span>
      <button
        className={`sp-toggle${disabled ? " sp-toggle--on" : ""}`}
        role="switch"
        aria-checked={disabled}
        onClick={(e) => { e.stopPropagation(); toggle(); }}
      >
        <span className="sp-toggle-thumb" />
      </button>
    </div>
  );
}

function RowActions({ agent }: { agent: AgentConfig }) {
  function clone() {
    const base = agent.name.replace(/-copy(\s\d+)?$/, "");
    const existing = getCustomAgents();
    let n = 2;
    while (existing.some((a) => a.id === `${agent.id}-${n}`)) n++;
    const copy: AgentConfig = {
      ...agent,
      id: `${agent.id}-${n}`,
      name: `${base} copy`,
      custom: true,
      extends: agent.id,
    };
    // Strip fields the sanitizer doesn't accept from cloned entries (resolved
    // iconSrc, compiled RegExps): only the serializable shape survives.
    delete (copy as Partial<AgentConfig>).iconSrc;
    delete (copy as Partial<AgentConfig>).capturePattern;
    setCustomAgents([...existing, copy]);
  }
  function remove() {
    if (!agent.custom) return;
    setCustomAgents(getCustomAgents().filter((a) => a.id !== agent.id));
  }
  return (
    <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
      <button className="sp-btn" onClick={clone}>
        <Copy size={12} /> Clone
      </button>
      {agent.custom && (
        <button
          className="sp-btn"
          style={{ color: "var(--tempest-danger, #ef4444)" }}
          onClick={remove}
        >
          <Trash2 size={12} /> Delete
        </button>
      )}
    </div>
  );
}
