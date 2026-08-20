import { Icon } from "../icons";
import type { GhKind, GhPreset, GhRepo, TasksState } from "../types";

const PRESETS: { id: GhPreset; label: string }[] = [
  { id: "all", label: "All" },
  { id: "assigned", label: "Assigned to me" },
  { id: "created", label: "Created by me" },
  { id: "mentioned", label: "Mentioned" },
  { id: "review", label: "Review requested" },
  { id: "open", label: "Open" },
  { id: "closed", label: "Closed" },
];

const KINDS: { id: GhKind; label: string }[] = [
  { id: "both", label: "Both" },
  { id: "issues", label: "Issues" },
  { id: "prs", label: "Pull requests" },
];

export function GithubContextBar({
  state,
  patch,
  repos,
}: {
  state: TasksState;
  patch: (p: Partial<TasksState>) => void;
  repos: GhRepo[];
}) {
  const repoLabel = state.ghRepo === "all"
    ? "All"
    : repos.find((r) => r.full === state.ghRepo || r.id === state.ghRepo)?.full ?? state.ghRepo;

  return (
    <>
      <div className="ctx-row">
        <select
          className="picker picker-select"
          value={state.ghRepo}
          onChange={(e) => patch({ ghRepo: e.target.value })}
          title="Repo"
        >
          <option value="all">All repos</option>
          {repos.map((r) => (
            <option key={r.full} value={r.full}>{r.full}</option>
          ))}
        </select>
        <div className="segmented">
          {KINDS.map((k) => (
            <button
              key={k.id}
              className={state.ghKind === k.id ? "active" : ""}
              onClick={() => patch({ ghKind: k.id })}
            >
              {k.label}
            </button>
          ))}
        </div>
        <div className="divider-v" />
        {PRESETS.map((p) => (
          <button
            key={p.id}
            className={`chip${state.ghPreset === p.id ? " active" : ""}`}
            onClick={() => patch({ ghPreset: p.id })}
          >
            {p.label}
          </button>
        ))}
      </div>
      <div className="ctx-row">
        <div className="search">
          {Icon.search()}
          <input
            placeholder={`Filter loaded ${repoLabel === "All" ? "results" : repoLabel} by title…`}
            value={state.query}
            onChange={(e) => patch({ query: e.target.value })}
          />
        </div>
        <button className="picker" disabled title="Sort — coming soon">
          <span className="label-muted">Sort</span><span>Updated</span><span className="caret">{Icon.caret()}</span>
        </button>
      </div>
    </>
  );
}
