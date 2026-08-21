import type { MouseEvent, ReactElement } from "react";
import { relativeTime } from "./api";
import { Icon, priGlyph, statusGlyph } from "./icons";
import type { GhItem, Label, LinearItem, LinearProject, Source, UnifiedItem } from "./types";
import { isGh } from "./types";

const cap = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);
const initials = (n: string) => n.slice(0, 1).toUpperCase();
const avatarClass = (n: string) => (({ you: "you", harsha: "p1", alex: "p2", sam: "p3" } as Record<string, string>)[n] ?? "");

const statusLabel = (s: string) =>
  (({ backlog: "Backlog", todo: "Todo", inprog: "In progress", review: "In review", done: "Done", cancel: "Canceled" } as Record<string, string>)[s] ?? s);

function labelsHtml(labels: Label[] = []) {
  return labels.slice(0, 3).map((l) => (
    <span key={l.n} className="badge"><span className="dot" style={{ background: l.c }} />{l.n}</span>
  ));
}

function projectBadge(pid: string, projects: LinearProject[]) {
  const p = projects.find((x) => x.id === pid);
  if (!p) return null;
  return <span className="badge subtle">{Icon.project()}<span style={{ marginLeft: 2 }}>{p.name}</span></span>;
}

function assigneesHtml(list: string[] = []) {
  if (!list.length) {
    return <span className="avatars"><span className="avatar empty" title="Unassigned">·</span></span>;
  }
  return (
    <span className="avatars">
      {list.slice(0, 3).map((n) => (
        <span key={n} className={`avatar ${avatarClass(n)}`} title={n}>{initials(n)}</span>
      ))}
    </span>
  );
}

function prStateClass(it: GhItem) {
  if (it.kind === "pr") return it.draft ? "draft" : it.state;
  return it.state === "open" ? "open" : "closed";
}
function prStateGlyph(it: GhItem): ReactElement {
  if (it.kind === "pr") {
    if (it.draft) return Icon.prDraft();
    return it.state === "open" ? Icon.prOpen() : it.state === "merged" ? Icon.prMerged() : Icon.prClosed();
  }
  return it.state === "open" ? Icon.issueOpen() : Icon.issueClosed();
}
function ghTypeLabel(it: GhItem) {
  if (it.kind === "pr") {
    if (it.draft) return "PR · draft";
    return it.state === "open" ? "Pull request" : it.state === "merged" ? "PR · merged" : "PR · closed";
  }
  return it.state === "open" ? "Issue" : "Issue · closed";
}

export function TaskRow({
  it,
  source,
  projects,
  isSelected,
  isExpanded,
  liveSessionId,
  onToggleSelect,
  onToggleExpanded,
  onViewSession,
}: {
  it: UnifiedItem;
  source: Source;
  projects: LinearProject[];
  isSelected: boolean;
  isExpanded: boolean;
  liveSessionId: string | null;
  onToggleSelect: (key: string) => void;
  onToggleExpanded: (key: string) => void;
  onViewSession: (id: string) => void;
}) {
  const gh = isGh(it);
  const cls = `row${isSelected ? " selected" : ""}${isExpanded ? " is-expanded" : ""}${gh && (it as GhItem).state !== "open" ? " is-resolved" : ""}`;
  const updated = relativeTime(it.updated);

  const sourceGlyph = source === "unified"
    ? (
      <span className={`src-glyph ${gh ? "gh" : "ln"}`} title={gh ? "GitHub" : "Linear"} aria-label={gh ? "GitHub" : "Linear"}>
        {gh ? Icon.ghMark() : Icon.linearMark()}
      </span>
    )
    : null;

  const idCell = gh
    ? (
      <span className="col-id" title={`${(it as GhItem).repo}#${(it as GhItem).number}`}>
        {sourceGlyph}
        <span className="id-text">
          {(it as GhItem).repo.split("/").pop()}<span style={{ color: "var(--fg-faint)" }}>#</span>{(it as GhItem).number}
        </span>
      </span>
    )
    : (
      <span className="col-id" title={(it as LinearItem).id}>
        {sourceGlyph}
        <span className="id-text">{(it as LinearItem).id}</span>
      </span>
    );

  const typeCell = gh
    ? (
      <span className="col-type">
        <span className={`state-icon ${prStateClass(it as GhItem)}`}>{prStateGlyph(it as GhItem)}</span>
        <span className="type-label">{ghTypeLabel(it as GhItem)}</span>
      </span>
    )
    : (
      <span className="col-type">
        <span className={`status-icon ${(it as LinearItem).status}`}>{statusGlyph((it as LinearItem).status)}</span>
        <span className="type-label">{statusLabel((it as LinearItem).status)}</span>
      </span>
    );

  // At-a-glance resolved marker for GitHub rows: merged PRs → Merged (purple),
  // closed-unmerged PRs / closed issues → Closed (red). Draft PRs keep the existing "Draft" chip.
  const ghDone = gh && (it as GhItem).state !== "open";
  const ghResolvedPill = ghDone
    ? (it as GhItem).kind === "pr" && (it as GhItem).state === "merged"
      ? <span className="state-pill merged" title="Merged">Merged</span>
      : <span className="state-pill closed" title="Closed">Closed</span>
    : null;

  const titleCell = (
    <span className="col-title">
      {gh && (it as GhItem).draft && <span className="draft">Draft</span>}
      {ghResolvedPill}
      <span className="text">{it.title}</span>
    </span>
  );

  const badgesCell = gh
    ? (
      <span className="col-badges">
        {labelsHtml((it as GhItem).labels)}
        {assigneesHtml((it as GhItem).assignees)}
        <span className="updated">{updated}</span>
      </span>
    )
    : (
      <span className="col-badges">
        <span className="badge">
          <span className={`pri ${(it as LinearItem).priority}`}>{priGlyph((it as LinearItem).priority)}</span>
          {cap((it as LinearItem).priority)}
        </span>
        {labelsHtml((it as LinearItem).labels)}
        {(it as LinearItem).project && projectBadge((it as LinearItem).project!, projects)}
        {assigneesHtml((it as LinearItem).assignee ? [(it as LinearItem).assignee!] : [])}
        <span className="updated">{updated}</span>
      </span>
    );

  const handleClick = (e: MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    if (target.closest("[data-check]")) { onToggleSelect(it.key); return; }
    if (target.closest("[data-expand]")) { onToggleExpanded(it.key); return; }
    if (target.closest("[data-view-agent]")) return; // handler on the button
    if (e.metaKey || e.ctrlKey) { onToggleSelect(it.key); return; }
    onToggleExpanded(it.key);
  };

  return (
    <div className={cls} data-key={it.key} onClick={handleClick}>
      <span className={`check${isSelected ? " on" : ""}`} data-check="1">
        {isSelected && Icon.check()}
      </span>
      {idCell}
      {titleCell}
      {typeCell}
      {badgesCell}
      {liveSessionId && (
        <button
          className="view-agent-pill"
          data-view-agent="1"
          title="Jump to the running agent"
          onClick={(e) => { e.stopPropagation(); onViewSession(liveSessionId); }}
        >
          {Icon.bolt()} View agent
        </button>
      )}
      <button className="col-expand" data-expand={it.key} aria-expanded={isExpanded}>
        {isExpanded ? "Collapse" : "Expand"}
      </button>
    </div>
  );
}
