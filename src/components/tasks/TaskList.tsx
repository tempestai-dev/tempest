import { Fragment } from "react";
import { RowAccordion } from "./RowAccordion";
import { TaskRow } from "./TaskRow";
import { Icon, statusGlyph } from "./icons";
import type { LinearItem, LinearProject, LinearTeam, Source, UnifiedItem } from "./types";
import { isGh } from "./types";

export function TaskList({
  items,
  source,
  scopeLabel,
  teams,
  projects,
  loading,
  error,
  emptyHint,
  selected,
  expandedKey,
  linearGroupByStatus,
  onToggleSelect,
  onToggleExpanded,
  onCollapse,
  onLaunch,
}: {
  items: UnifiedItem[];
  source: Source;
  scopeLabel: string;
  teams: LinearTeam[];
  projects: LinearProject[];
  loading: boolean;
  error: string | null;
  emptyHint: string | null;
  selected: Set<string>;
  expandedKey: string | null;
  linearGroupByStatus: boolean;
  onToggleSelect: (key: string) => void;
  onToggleExpanded: (key: string) => void;
  onCollapse: () => void;
  onLaunch: (key: string) => void;
}) {
  const total = items.length;

  const renderRow = (it: UnifiedItem) => (
    <Fragment key={it.key}>
      <TaskRow
        it={it}
        source={source}
        projects={projects}
        isSelected={selected.has(it.key)}
        isExpanded={expandedKey === it.key}
        onToggleSelect={onToggleSelect}
        onToggleExpanded={onToggleExpanded}
      />
      {expandedKey === it.key && (
        <RowAccordion
          it={it}
          teams={teams}
          projects={projects}
          onCollapse={onCollapse}
          onLaunch={onLaunch}
        />
      )}
    </Fragment>
  );

  return (
    <section className="list-pane">
      <div className="list-header">
        <span className="group-label">{scopeLabel}</span>
        <span className="count">
          {loading ? "Loading…" : `${total} item${total === 1 ? "" : "s"}`}
        </span>
      </div>
      <div className="list-body">
        {error && (
          <div className="tasks-banner tasks-banner--error">
            {error}
          </div>
        )}
        {!error && !loading && total === 0 && (
          <div className="tasks-empty-state">
            {emptyHint ?? "No items."}
          </div>
        )}
        {source === "linear" && linearGroupByStatus && !error && total > 0
          ? renderLinearGrouped(items, renderRow)
          : total > 0 && (
              <>
                <div className="table-head">
                  <span></span>
                  <span>ID</span>
                  <span>Topic</span>
                  <span>Type</span>
                  <span className="align-right">Details</span>
                  <span></span>
                </div>
                {items.map(renderRow)}
              </>
            )}
      </div>
    </section>
  );
}

function renderLinearGrouped(
  items: UnifiedItem[],
  renderRow: (it: UnifiedItem) => JSX.Element,
) {
  const groups: Record<string, { label: string; glyph: JSX.Element; items: UnifiedItem[] }> = {
    inprog:  { label: "In progress", glyph: Icon.sInprog(),  items: [] },
    todo:    { label: "Todo",        glyph: Icon.sTodo(),    items: [] },
    review:  { label: "In review",   glyph: Icon.sReview(),  items: [] },
    backlog: { label: "Backlog",     glyph: Icon.sBacklog(), items: [] },
    done:    { label: "Done",        glyph: Icon.sDone(),    items: [] },
  };
  for (const it of items) {
    if (isGh(it)) continue;
    const s = (it as LinearItem).status;
    (groups[s] ?? groups.todo).items.push(it);
  }
  return (
    <>
      <div className="table-head">
        <span></span><span>Topic</span><span>ID</span><span>Type</span>
        <span className="align-right">Details</span><span></span>
      </div>
      {Object.entries(groups)
        .filter(([, g]) => g.items.length)
        .map(([sid, g]) => (
          <Fragment key={sid}>
            <div className="group">
              <span className={`status-icon ${sid}`}>{statusGlyph(sid)}</span>
              <span>{g.label}</span>
              <span className="n">{g.items.length}</span>
            </div>
            {g.items.map(renderRow)}
          </Fragment>
        ))}
    </>
  );
}
