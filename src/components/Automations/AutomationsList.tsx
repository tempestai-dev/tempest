import { useEffect, useState } from "react";
import { UiIcon } from "../../icons/UiIcon";
const Loader = (p: any) => <UiIcon name="loader" {...p} />;
const Plus = (p: any) => <UiIcon name="plus" {...p} />;
const Trash2 = (p: any) => <UiIcon name="trash-2" {...p} />;
const Workflow = (p: any) => <UiIcon name="workflow" {...p} />;
import { createPortal } from "react-dom";
import type { StoredProject } from "../../store/openProjects";
import { type Automation, loadAutomations, updateAutomation, deleteAutomation } from "../../store/automations";
import { CreateAutomationDialog } from "./CreateAutomationDialog";
import { humanizeRrule } from "../../lib/automationSchedule";
import { AgentIcon } from "../NewSessionMenu";
import { getAgent } from "../../lib/agentRegistry";

interface Props {
  projects: StoredProject[];
  scope: string | null;
  onSelectScope: (id: string | null) => void;
  onOpen: (a: Automation) => void;
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString();
}

export function AutomationsList({ projects, scope, onSelectScope, onOpen }: Props) {
  const [automations, setAutomations] = useState<Automation[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const list = await loadAutomations(scope ?? undefined);
      setAutomations(list);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, [scope]);

  async function handleToggleEnabled(a: Automation) {
    const updated = await updateAutomation(a.id, { enabled: !a.enabled });
    setAutomations((prev) => prev.map((x) => x.id === updated.id ? updated : x));
  }

  async function handleDelete() {
    if (!deleteId) return;
    setDeleting(true);
    try {
      await deleteAutomation(deleteId);
      setAutomations((prev) => prev.filter((a) => a.id !== deleteId));
      setDeleteId(null);
    } finally {
      setDeleting(false);
    }
  }

  const deleteTarget = automations.find((a) => a.id === deleteId);

  return (
    <div className="am-root">
      <div className="am-header">
        <div className="am-header-left">
          <div className="am-header-titlerow">
            <h1 className="am-header-title">Automations</h1>
            {!loading && automations.length > 0 && (
              <span className="am-header-count">{automations.length}</span>
            )}
          </div>
          <p className="am-header-sub">Schedule AI agents to run on autopilot.</p>
        </div>
        <div className="am-header-right">
          <button className="am-new-btn" onClick={() => setCreating(true)}>
            <Plus size={14} />
            New Automation
          </button>
        </div>
      </div>

      <div className="am-tabs" role="tablist" aria-label="Project scope">
        <button
          className={`am-tab${scope === null ? " am-tab--active" : ""}`}
          onClick={() => onSelectScope(null)}
          role="tab"
          aria-selected={scope === null}
        >
          Global
        </button>
        {projects.map((p) => (
          <button
            key={p.id}
            className={`am-tab${scope === p.id ? " am-tab--active" : ""}`}
            onClick={() => onSelectScope(p.id)}
            role="tab"
            aria-selected={scope === p.id}
            title={p.name}
          >
            <span className="am-tab-label">{p.name}</span>
          </button>
        ))}
      </div>

      <div className="am-list">
        {loading ? (
          <div className="am-loading"><Loader size={16} className="am-spin" /></div>
        ) : automations.length === 0 ? (
          <div className="am-empty">
            <Workflow size={22} className="am-empty-icon" />
            <p className="am-empty-text">No automations yet</p>
            <p className="am-empty-sub">Schedule AI agents to run on autopilot.</p>
            <button className="am-empty-cta" onClick={() => setCreating(true)}>
              <Plus size={14} />
              Create automation
            </button>
          </div>
        ) : (
          <table className="am-table">
            <thead>
              <tr>
                <th className="am-th"></th>
                <th className="am-th">Name</th>
                <th className="am-th">Agent</th>
                <th className="am-th">Model</th>
                <th className="am-th">Schedule</th>
                <th className="am-th">Next run</th>
                <th className="am-th">Enabled</th>
                <th className="am-th"></th>
              </tr>
            </thead>
            <tbody>
              {automations.map((a) => (
                <tr key={a.id} className="am-tr" onClick={() => onOpen(a)} role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === "Enter") onOpen(a); }}>
                  <td className="am-td am-td--dot">
                    <span className={`am-dot ${a.enabled ? "am-dot--running" : "am-dot--idle"}`} />
                  </td>
                  <td className="am-td am-td--name">{a.name}</td>
                  <td className="am-td am-td--agent">
                    <span className="am-agent-badge">
                      <AgentIcon hint={a.agent} size={12} />
                      <span className="am-agent-badge-label">{getAgent(a.agent)?.name ?? a.agent}</span>
                    </span>
                  </td>
                  <td className="am-td am-td--model">{a.model || "—"}</td>
                  <td className="am-td am-td--schedule">{humanizeRrule(a.schedule)}</td>
                  <td className="am-td am-td--next">{fmtDate(a.nextRunAt)}</td>
                  <td className="am-td am-td--toggle" onClick={(e) => e.stopPropagation()}>
                    <label className="am-toggle">
                      <input
                        type="checkbox"
                        checked={a.enabled}
                        onChange={() => void handleToggleEnabled(a)}
                      />
                      <span className="am-toggle-track" />
                    </label>
                  </td>
                  <td className="am-td am-td--actions" onClick={(e) => e.stopPropagation()}>
                    <button className="am-act am-act--icon am-act--danger" onClick={() => setDeleteId(a.id)} title="Delete">
                      <Trash2 size={13} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {creating && (
        <CreateAutomationDialog
          projectId={scope ?? undefined}
          onCreated={() => { setCreating(false); void load(); }}
          onClose={() => setCreating(false)}
        />
      )}

      {deleteId && createPortal(
        <div className="naming-modal-overlay" onClick={() => !deleting && setDeleteId(null)}>
          <div className="naming-modal" onClick={(e) => e.stopPropagation()}>
            <div className="naming-modal-header">
              <Trash2 size={14} />
              <span>Delete automation?</span>
            </div>
            <p className="naming-modal-desc">
              <strong>{deleteTarget?.name}</strong> will be permanently removed.
            </p>
            <div className="naming-modal-actions">
              <button className="naming-modal-btn naming-modal-btn--cancel" onClick={() => setDeleteId(null)} disabled={deleting}>Cancel</button>
              <button className="naming-modal-btn naming-modal-btn--delete" onClick={() => void handleDelete()} disabled={deleting}>
                {deleting ? <Loader size={13} className="am-spin" /> : "Delete"}
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
