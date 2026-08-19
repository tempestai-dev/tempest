import { Icon } from "../icons";
import type { LinearBootstrap, LinearScope, TasksState } from "../types";

const cap = (s: string) => s[0].toUpperCase() + s.slice(1);

export function LinearContextBar({
  state,
  patch,
  bootstrap,
}: {
  state: TasksState;
  patch: (p: Partial<TasksState>) => void;
  bootstrap: LinearBootstrap | null;
}) {
  const views = bootstrap?.views ?? [];
  const teams = bootstrap?.teams ?? [];
  const projects = bootstrap?.projects ?? [];

  const scopeLabel = (() => {
    const s = state.lnScope;
    if (s.kind === "view") return views.find((v) => v.id === s.id)?.name ?? "—";
    if (s.kind === "team") return teams.find((t) => t.id === s.id)?.name ?? "—";
    if (s.kind === "project") return projects.find((p) => p.id === s.id)?.name ?? "—";
    return "All issues";
  })();

  const scopeValue = `${state.lnScope.kind}:${state.lnScope.id}`;
  const onScopeChange = (val: string) => {
    const [kind, ...rest] = val.split(":");
    const id = rest.join(":");
    patch({ lnScope: { kind: kind as LinearScope["kind"], id } });
  };

  return (
    <>
      <div className="ctx-row">
        <button className="picker" disabled title="Workspace picker — coming soon">
          <span className="label-muted">Workspace</span>
          <span>{bootstrap?.viewer_name || "Linear"}</span>
          <span className="caret">{Icon.caret()}</span>
        </button>
        <select
          className="picker picker-select"
          value={scopeValue}
          onChange={(e) => onScopeChange(e.target.value)}
          title="Scope"
        >
          <optgroup label="Views">
            {views.map((v) => (
              <option key={v.id} value={`view:${v.id}`}>{v.name}</option>
            ))}
          </optgroup>
          {teams.length > 0 && (
            <optgroup label="Teams">
              {teams.map((t) => (
                <option key={t.id} value={`team:${t.id}`}>{t.name}</option>
              ))}
            </optgroup>
          )}
          {projects.length > 0 && (
            <optgroup label="Projects">
              {projects.map((p) => (
                <option key={p.id} value={`project:${p.id}`}>{p.name}</option>
              ))}
            </optgroup>
          )}
        </select>
        <span className="ctx-note">Scope: <b>{scopeLabel}</b></span>
      </div>
      <div className="ctx-row">
        <div className="search">
          {Icon.search()}
          <input
            placeholder="Filter loaded issues by title…"
            value={state.query}
            onChange={(e) => patch({ query: e.target.value })}
          />
        </div>
        <button
          className={`picker${state.lnGroup === "status" ? " picker-on" : ""}`}
          onClick={() => patch({ lnGroup: state.lnGroup === "status" ? "none" : "status" })}
          title="Toggle group-by-status"
        >
          <span className="label-muted">Group</span><span>{cap(state.lnGroup)}</span><span className="caret">{Icon.caret()}</span>
        </button>
      </div>
    </>
  );
}
