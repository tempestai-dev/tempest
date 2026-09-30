import { useEffect, useRef, useState } from "react";
import { UiIcon } from "../../icons/UiIcon";
const ChevronLeft = (p: any) => <UiIcon name="chevron-left" {...p} />;
const Loader = (p: any) => <UiIcon name="loader" {...p} />;
const Play = (p: any) => <UiIcon name="play" {...p} />;
import {
  type Automation, type AutomationRun,
  updateAutomation, listAutomationRuns, runAutomationNow,
} from "../../store/automations";
import { SchedulePicker } from "./SchedulePicker";
import { computeNextRunAt, humanizeRrule } from "../../lib/automationSchedule";
import { useAgents, getAgent } from "../../lib/agentRegistry";
import { SpSelect } from "../ui/SpSelect";
import { AgentIcon } from "../NewSessionMenu";
import { TerminalPane, type TerminalPaneHandle } from "../TerminalPane";
import { sessionManager } from "../../store/sessionManager";

interface Props {
  automation: Automation;
  onBack: () => void;
  onUpdate: (a: Automation) => void;
}

// ponytail: in-memory only, resets on app reload — persist to localStorage if that matters.
const clearedTerminals = new Set<string>();

function timeAgo(iso: string): string {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export function AutomationDetailPage({ automation, onBack, onUpdate }: Props) {
  const agents = useAgents();
  const [prompt, setPrompt] = useState(automation.prompt);
  const [schedule, setSchedule] = useState(automation.schedule);
  const [modelDraft, setModelDraft] = useState(automation.model ?? "");
  const [runs, setRuns] = useState<AutomationRun[]>([]);
  const [runningNow, setRunningNow] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);
  // Which run's PTY the terminal panel is showing. Set on Run Now, and on mount
  // to the most recent run that still has a live sessionManager buffer.
  const [terminalRunId, setTerminalRunId] = useState<string | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const termRef = useRef<TerminalPaneHandle | null>(null);

  useEffect(() => {
    listAutomationRuns(automation.id).then((rs) => {
      setRuns(rs);
      if (clearedTerminals.has(automation.id)) return;
      const live = rs.find((r) => sessionManager.has(r.id));
      if (live) setTerminalRunId(live.id);
    });
  }, [automation.id]);

  function scheduleDebounce(newPrompt: string, newSchedule: string) {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      const updated = await updateAutomation(automation.id, { prompt: newPrompt, schedule: newSchedule });
      onUpdate(updated);
    }, 800);
  }

  function handlePromptChange(v: string) {
    setPrompt(v);
    scheduleDebounce(v, schedule);
  }

  function handleScheduleChange(v: string) {
    setSchedule(v);
    scheduleDebounce(prompt, v);
    // Also update nextRunAt
    const next = computeNextRunAt(v);
    updateAutomation(automation.id, { schedule: v, nextRunAt: next }).then(onUpdate);
  }

  async function handleAgentChange(agent: string) {
    const updated = await updateAutomation(automation.id, { agent });
    onUpdate(updated);
  }

  async function commitModel() {
    const trimmed = modelDraft.trim();
    if (trimmed === (automation.model ?? "")) return;
    const updated = await updateAutomation(automation.id, { model: trimmed });
    onUpdate(updated);
  }

  async function handleRunNow() {
    setRunningNow(true);
    setRunError(null);
    try {
      const runId = await runAutomationNow(automation, "manual");
      clearedTerminals.delete(automation.id);
      setTerminalRunId(runId);
      // Refresh run list so the new "dispatched" row shows up in the sidebar.
      listAutomationRuns(automation.id).then(setRuns);
    } catch (e) {
      setRunError(String((e as { message?: string })?.message ?? e));
    } finally {
      setRunningNow(false);
    }
  }

  return (
    <div className="am-root">
      <div className="am-builder-topbar">
        <button className="am-back-btn" onClick={onBack}>
          <ChevronLeft size={14} />
          Automations
        </button>
        <span className="am-builder-sep">/</span>
        <span className="am-builder-name">{automation.name}</span>
        <div className="am-detail-topbar-actions">
          <button
            className="am-act am-act--primary"
            onClick={() => void handleRunNow()}
            disabled={runningNow}
          >
            {runningNow ? <Loader size={13} className="am-spin" /> : <Play size={13} />}
            Run now
          </button>
        </div>
      </div>

      <div className="am-detail-layout">
        <div className="am-detail-main">
          <label className="am-field-label">Schedule</label>
          <SchedulePicker value={schedule} onChange={handleScheduleChange} />
          {schedule && (
            <span className="am-field-hint">{humanizeRrule(schedule)}</span>
          )}

          <label className="am-field-label" style={{ marginTop: 20 }}>Prompt</label>
          <textarea
            className="am-prompt-editor"
            value={prompt}
            onChange={(e) => handlePromptChange(e.target.value)}
            placeholder="What should the agent do each time this runs?"
            rows={6}
          />

          <div className="am-label-row" style={{ marginTop: 20 }}>
            <label className="am-field-label" style={{ marginBottom: 0 }}>Output</label>
            {terminalRunId && sessionManager.has(terminalRunId) && (
              <button
                type="button"
                className="am-label-action"
                onClick={() => { clearedTerminals.add(automation.id); setTerminalRunId(null); }}
              >
                Clear
              </button>
            )}
          </div>
          <div className={`am-terminal-panel${terminalRunId && sessionManager.has(terminalRunId) ? "" : " am-terminal-panel--muted"}`}>
            {terminalRunId && sessionManager.has(terminalRunId) ? (
              <TerminalPane ref={termRef} key={terminalRunId} sessionId={terminalRunId} isAgent readOnly />
            ) : (
              <div className="am-terminal-idle">No run in progress</div>
            )}
          </div>
        </div>

        <div className="am-detail-sidebar">
          <div className="am-sidebar-section">
            <div className="am-sidebar-label">Agent</div>
            <SpSelect
              value={automation.agent}
              onChange={(v) => void handleAgentChange(v)}
              options={agents.map((a) => ({ value: a.hint, label: a.name, icon: <AgentIcon hint={a.hint} size={14} /> }))}
            />
          </div>

          {(() => {
            const cfg = getAgent(automation.agent);
            // Show the model input for any agent whose manifest declares `--model`
            // flags. Free-text so the user types whatever the CLI accepts (alias
            // like haiku/sonnet/opus/fable, or a full `provider/model`).
            if (!cfg?.modelArgs) return null;
            return (
              <div className="am-sidebar-section">
                <div className="am-sidebar-label">Model</div>
                <input
                  className="am-field-input"
                  value={modelDraft}
                  onChange={(e) => setModelDraft(e.target.value)}
                  onBlur={() => void commitModel()}
                  onKeyDown={(e) => { if (e.key === "Enter") void commitModel(); }}
                  placeholder="Leave blank for the CLI default"
                />
              </div>
            );
          })()}

          {automation.nextRunAt && (
            <div className="am-sidebar-section">
              <div className="am-sidebar-label">Next run</div>
              <div className="am-sidebar-value">{new Date(automation.nextRunAt).toLocaleString()}</div>
            </div>
          )}

          <div className="am-sidebar-section">
            <div className="am-sidebar-label">Recent runs</div>
            {runs.length === 0 ? (
              <div className="am-sidebar-empty">No runs yet</div>
            ) : (
              <div className="am-run-list">
                {runs.slice(0, 8).map((r) => {
                  const live = sessionManager.has(r.id);
                  const isActive = terminalRunId === r.id;
                  return (
                    <div
                      key={r.id}
                      className={`am-run-item${live ? " am-run-item--clickable" : ""}${isActive ? " am-run-item--active" : ""}`}
                      onClick={live ? () => { clearedTerminals.delete(automation.id); setTerminalRunId(r.id); } : undefined}
                      role={live ? "button" : undefined}
                    >
                      <span className={`am-run-badge am-run-badge--${r.status}`}>{r.status}</span>
                      <span className="am-run-meta">{r.createdAt ? timeAgo(r.createdAt) : ""}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {runError && (
        <div className="am-run-error" role="alert">{runError}</div>
      )}
    </div>
  );
}
