import { useState } from "react";
import { createPortal } from "react-dom";
import { UiIcon } from "../../icons/UiIcon";
const Loader = (p: any) => <UiIcon name="loader" {...p} />;
const Workflow = (p: any) => <UiIcon name="workflow" {...p} />;
import { SchedulePicker } from "./SchedulePicker";
import { createAutomation, type CreateAutomationReq } from "../../store/automations";
import { computeNextRunAt } from "../../lib/automationSchedule";
import { useAgents, getAgent } from "../../lib/agentRegistry";
import { SpSelect } from "../ui/SpSelect";
import { AgentIcon } from "../NewSessionMenu";

interface Template {
  category: string;
  name: string;
  agent: string;
  schedule: string;
  prompt: string;
}

const TEMPLATES: Template[] = [
  // Status reports
  { category: "Status reports", name: "Daily Standup Summary", agent: "claude", schedule: "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR;BYHOUR=9;BYMINUTE=0;BYSECOND=0", prompt: "Summarize yesterday's git commits, open PRs, and any failing CI runs. Format as a standup update." },
  { category: "Status reports", name: "Weekly Progress Report", agent: "claude", schedule: "FREQ=WEEKLY;BYDAY=MO;BYHOUR=8;BYMINUTE=0;BYSECOND=0", prompt: "Generate a weekly progress report from the past week's commits, merged PRs, and closed issues." },
  { category: "Status reports", name: "Sprint Velocity Check", agent: "claude", schedule: "FREQ=WEEKLY;BYDAY=FR;BYHOUR=16;BYMINUTE=0;BYSECOND=0", prompt: "Check sprint velocity: count completed tickets, calculate story points delivered, and flag any blockers." },
  // Release prep
  { category: "Release prep", name: "Changelog Generator", agent: "claude", schedule: "FREQ=WEEKLY;BYDAY=FR;BYHOUR=14;BYMINUTE=0;BYSECOND=0", prompt: "Generate a changelog from this week's merged PRs and commits. Group by feature, fix, and chore." },
  { category: "Release prep", name: "Release Notes Draft", agent: "claude", schedule: "FREQ=WEEKLY;BYDAY=TH;BYHOUR=15;BYMINUTE=0;BYSECOND=0", prompt: "Draft release notes for the upcoming version. Focus on user-facing changes and breaking changes." },
  { category: "Release prep", name: "Dependency Audit", agent: "claude", schedule: "FREQ=WEEKLY;BYDAY=MO;BYHOUR=10;BYMINUTE=0;BYSECOND=0", prompt: "Audit package dependencies: check for outdated packages, known vulnerabilities, and unused deps." },
  // Quality & health
  { category: "Quality & health", name: "Test Coverage Report", agent: "claude", schedule: "FREQ=DAILY;BYHOUR=7;BYMINUTE=0;BYSECOND=0", prompt: "Run tests, report coverage by module, flag files below 70% coverage, and suggest tests to add." },
  { category: "Quality & health", name: "Dead Code Finder", agent: "claude", schedule: "FREQ=WEEKLY;BYDAY=WE;BYHOUR=10;BYMINUTE=0;BYSECOND=0", prompt: "Find unused exports, unreachable code paths, and stale feature flags. List candidates for removal." },
  { category: "Quality & health", name: "Performance Regression Check", agent: "claude", schedule: "FREQ=DAILY;BYHOUR=6;BYMINUTE=0;BYSECOND=0", prompt: "Compare bundle sizes and runtime benchmarks against last week's baseline. Flag regressions > 5%." },
  // Growth
  { category: "Growth", name: "SEO Content Audit", agent: "claude", schedule: "FREQ=WEEKLY;BYDAY=TU;BYHOUR=9;BYMINUTE=0;BYSECOND=0", prompt: "Audit landing page meta tags, heading hierarchy, and internal links. Suggest improvements." },
  { category: "Growth", name: "Error Log Triage", agent: "claude", schedule: "FREQ=DAILY;BYHOUR=9;BYMINUTE=0;BYSECOND=0", prompt: "Summarize the top 10 errors from yesterday's logs grouped by frequency. Suggest root causes." },
  { category: "Growth", name: "API Latency Monitor", agent: "claude", schedule: "FREQ=DAILY;BYHOUR=8;BYMINUTE=0;BYSECOND=0", prompt: "Check API endpoint latencies against SLA targets. Flag p95 > 500ms and suggest optimizations." },
];

const CATEGORIES = [...new Set(TEMPLATES.map((t) => t.category))];

interface Props {
  projectId?: string;
  onCreated: () => void;
  onClose: () => void;
}

export function CreateAutomationDialog({ projectId, onCreated, onClose }: Props) {
  const agents = useAgents();
  const [view, setView] = useState<"compose" | "gallery">("compose");
  const [name, setName] = useState("");
  const [agent, setAgent] = useState(agents[0]?.hint ?? "claude");
  const [schedule, setSchedule] = useState("FREQ=DAILY;BYHOUR=9;BYMINUTE=0;BYSECOND=0");
  const [prompt, setPrompt] = useState("");
  const [model, setModel] = useState(""); // "" = agent CLI default
  const [saving, setSaving] = useState(false);

  const agentCfg = getAgent(agent);
  // Any agent whose manifest declares `--model` flags can accept a model. The
  // field is free-text so the user can type whatever the CLI accepts — a bare
  // alias (haiku/sonnet/opus/fable) or a full `provider/model` string — without
  // us maintaining a hardcoded catalog per agent.
  const showModelPicker = !!agentCfg?.modelArgs;

  function applyTemplate(t: Template) {
    setName(t.name);
    setAgent(t.agent);
    setSchedule(t.schedule);
    setPrompt(t.prompt);
    setView("compose");
  }

  async function handleCreate() {
    if (!name.trim()) return;
    setSaving(true);
    try {
      const nextRunAt = computeNextRunAt(schedule) ?? undefined;
      const req: CreateAutomationReq = { projectId, name: name.trim(), agent, schedule, prompt, nextRunAt };
      if (showModelPicker && model.trim()) req.model = model.trim();
      await createAutomation(req);
      onCreated();
    } finally {
      setSaving(false);
    }
  }

  return createPortal(
    <div className="am-dialog-overlay" onClick={() => !saving && onClose()}>
      <div className="am-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="am-dialog-header">
          <Workflow size={14} />
          <span>New automation</span>
          <div className="am-dialog-tabs">
            <button className={`am-dialog-tab${view === "compose" ? " am-dialog-tab--active" : ""}`} onClick={() => setView("compose")}>Compose</button>
            <button className={`am-dialog-tab${view === "gallery" ? " am-dialog-tab--active" : ""}`} onClick={() => setView("gallery")}>Templates</button>
          </div>
        </div>

        {view === "gallery" ? (
          <div className="am-gallery">
            {CATEGORIES.map((cat) => (
              <div key={cat} className="am-gallery-section">
                <div className="am-gallery-category">{cat}</div>
                <div className="am-gallery-items">
                  {TEMPLATES.filter((t) => t.category === cat).map((t) => (
                    <button key={t.name} className="am-gallery-item" onClick={() => applyTemplate(t)}>
                      <span className="am-gallery-item-name">{t.name}</span>
                      <span className="am-gallery-item-prompt">{t.prompt.slice(0, 80)}…</span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="am-dialog-body">
            <label className="am-field-label">Name</label>
            <input
              className="am-field-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Daily Standup Bot"
              onKeyDown={(e) => { if (e.key === "Enter") void handleCreate(); }}
              disabled={saving}
              autoFocus
            />

            <label className="am-field-label">Agent</label>
            <SpSelect
              value={agent}
              onChange={setAgent}
              options={agents.map((a) => ({ value: a.hint, label: a.name, icon: <AgentIcon hint={a.hint} size={14} /> }))}
            />

            {showModelPicker && (
              <>
                <label className="am-field-label">Model</label>
                <input
                  className="am-field-input"
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  placeholder="Leave blank for the CLI default"
                  disabled={saving}
                />
              </>
            )}

            <label className="am-field-label">Schedule</label>
            <SchedulePicker value={schedule} onChange={setSchedule} />

            <label className="am-field-label">Prompt</label>
            <textarea
              className="am-field-textarea"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="What should the agent do?"
              rows={4}
              disabled={saving}
            />

            <div className="am-dialog-actions">
              <button className="am-dialog-btn am-dialog-btn--cancel" onClick={onClose} disabled={saving}>Cancel</button>
              <button
                className="am-dialog-btn am-dialog-btn--create"
                onClick={() => void handleCreate()}
                disabled={saving || !name.trim()}
              >
                {saving ? <Loader size={13} className="am-spin" /> : "Create"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
