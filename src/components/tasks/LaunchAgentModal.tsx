import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Icon } from "./icons";
import type { GhItem, LaunchTargetProject, LinearItem, UnifiedItem } from "./types";
import { isGh, suggestBranch } from "./types";
import { useAgents, type AgentConfig } from "../../lib/agentRegistry";

function idOf(it: UnifiedItem) {
  return isGh(it) ? `${(it as GhItem).repo}#${(it as GhItem).number}` : (it as LinearItem).id;
}

function prefillPrompt(it: UnifiedItem) {
  const header = isGh(it)
    ? `# ${(it as GhItem).repo}#${(it as GhItem).number} — ${it.title}`
    : `# ${(it as LinearItem).id} — ${it.title}`;
  const kind = isGh(it) ? "issue" : "ticket";
  return `${header}\n\n${it.body ?? ""}\n\nGoal: implement, add a test, open a PR referencing this ${kind}.`;
}

type Form = {
  it: UnifiedItem;
  agentHint: string;
  prompt: string;
  branchName: string;
  projectId: string;
};

export function LaunchAgentModal({
  items,
  projects,
  defaultProjectId,
  onLaunch,
  onLaunched,
  onClose,
}: {
  items: UnifiedItem[];
  projects: LaunchTargetProject[];
  defaultProjectId: string | null;
  onLaunch: (opts: {
    projectId: string;
    branchName: string;
    agent: AgentConfig;
    prompt: string;
  }) => Promise<string | null>;
  onLaunched?: (itemKey: string, sessionId: string) => void;
  onClose: () => void;
}) {
  const agents = useAgents();
  // Honor the per-agent "hidden" toggle from Settings; spawn path itself
  // surfaces install/auth issues so no further filtering here.
  const launchable = useMemo(() => agents.filter((a) => !a.disabled), [agents]);
  const defaultAgent = launchable[0]?.hint ?? "";

  const [forms, setForms] = useState<Form[]>(() =>
    items.map((it) => ({
      it,
      agentHint: defaultAgent,
      prompt: prefillPrompt(it),
      branchName: suggestBranch(it),
      projectId: defaultProjectId ?? projects[0]?.id ?? "",
    })),
  );
  const [active, setActive] = useState(0);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.stopImmediatePropagation(); if (!busy) onClose(); }
    };
    document.addEventListener("keydown", handler, true);
    document.body.classList.add("modal-open");
    return () => {
      document.removeEventListener("keydown", handler, true);
      document.body.classList.remove("modal-open");
    };
  }, [onClose, busy]);

  if (forms.length === 0) return null;
  const multi = forms.length > 1;
  const f = forms[active];

  const patch = (p: Partial<Form>) => {
    setForms((prev) => prev.map((x, i) => (i === active ? { ...x, ...p } : x)));
  };

  const noProjects = projects.length === 0;
  const noAgents = launchable.length === 0;

  const launch = async () => {
    setErr(null);
    if (noProjects) { setErr("Open a project first — tasks launch into a fresh worktree of a project."); return; }
    if (noAgents) { setErr("No launchable agents configured."); return; }

    // Validate all forms in bulk mode before firing any launch.
    const jobs = forms.map((form) => {
      const branch = form.branchName.trim();
      const agentCfg = launchable.find((a) => a.hint === form.agentHint) ?? launchable[0];
      return { form, branch, agentCfg };
    });
    const bad = jobs.findIndex((j) => !j.branch || !j.form.projectId);
    if (bad >= 0) { setActive(bad); setErr("Every task needs a project and a branch name."); return; }

    // Fire-and-forget: worktree creation + agent boot each take a couple of
    // seconds, but the tab already exists in the sidebar the instant we fire
    // (WorkspaceView pre-mints the pending session). Close the modal now so
    // the user is back on the Tasks page immediately; onLaunched keeps
    // filling launchedByKey as each spawn resolves. Errors surface via
    // WorkspaceView.setPolicyError.
    for (const { form, branch, agentCfg } of jobs) {
      onLaunch({
        projectId: form.projectId,
        branchName: branch,
        agent: agentCfg,
        prompt: form.prompt,
      })
        .then((id) => { if (id) onLaunched?.(form.it.key, id); })
        .catch((e) => console.error("Task agent launch failed:", form.it.key, e));
    }
    onClose();
  };

  return createPortal(
    <div className="modal-backdrop" onClick={() => !busy && onClose()}>
      <div
        className={`modal${multi ? " modal-wide" : ""}`}
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="modal-head">
          <div className="modal-titles">
            <h3>{multi ? `Launch ${forms.length} agents` : "Launch agent"}</h3>
            <p className="modal-sub">
              <span className="mono">{idOf(f.it)}</span> · {f.it.title}
            </p>
          </div>
          <button className="icon-btn" title="Close" onClick={onClose} disabled={busy}>{Icon.close()}</button>
        </header>

        {multi && (
          <nav className="modal-tabs" role="tablist">
            {forms.map((form, i) => (
              <button
                key={form.it.key}
                className={`modal-tab${i === active ? " active" : ""}`}
                role="tab"
                onClick={() => setActive(i)}
                title={form.it.title}
              >
                <span className="mono">{idOf(form.it)}</span>
                <span className="modal-tab-title">{form.it.title}</span>
              </button>
            ))}
          </nav>
        )}

        <div className="modal-body">
          <div className="field">
            <label htmlFor="modal-project">Project</label>
            <select
              id="modal-project"
              className="select"
              value={f.projectId}
              onChange={(e) => patch({ projectId: e.target.value })}
              disabled={noProjects || busy}
            >
              {noProjects
                ? <option value="">(no projects open)</option>
                : projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <p className="field-hint">A new worktree is cut here and the agent starts in it.</p>
          </div>

          <div className="field">
            <label htmlFor="modal-branch">Branch</label>
            <input
              id="modal-branch"
              className="text-input mono"
              type="text"
              value={f.branchName}
              onChange={(e) => patch({ branchName: e.target.value })}
              spellCheck={false}
              disabled={busy}
            />
            <p className="field-hint">Cut from the project's default branch.</p>
          </div>

          <div className="field">
            <label htmlFor="modal-agent">Agent</label>
            <select
              id="modal-agent"
              className="select"
              value={f.agentHint}
              onChange={(e) => patch({ agentHint: e.target.value })}
              disabled={noAgents || busy}
            >
              {noAgents
                ? <option value="">(no agents available)</option>
                : launchable.map((a) => <option key={a.id} value={a.hint}>{a.name}</option>)}
            </select>
          </div>

          <div className="field">
            <label htmlFor="modal-prompt">Prompt</label>
            <textarea
              id="modal-prompt"
              className="textarea"
              rows={10}
              value={f.prompt}
              onChange={(e) => patch({ prompt: e.target.value })}
              disabled={busy}
            />
            <p className="field-hint">
              Prefilled from the {isGh(f.it) ? "issue" : "ticket"}. Edit before launching.
              {multi ? " Each task spawns its own worktree in the background." : " The agent runs in the background — use View agent on the row to jump in."}
            </p>
          </div>

          {err && <p className="field-hint" style={{ color: "var(--tempest-danger, #ef4444)" }}>{err}</p>}
        </div>

        <footer className="modal-foot">
          {multi && <span className="modal-foot-count"><b>{forms.length}</b> agents ready</span>}
          <div className="modal-foot-actions">
            <button className="btn ghost" onClick={onClose} disabled={busy}>Cancel</button>
            <button
              className="btn primary"
              onClick={launch}
              disabled={busy || noProjects || noAgents}
            >
              {Icon.bolt()} {busy ? "Launching…" : (multi ? `Launch ${forms.length}` : "Launch")}
            </button>
          </div>
        </footer>
      </div>
    </div>,
    document.body,
  );
}
