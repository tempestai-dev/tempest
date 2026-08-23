import { useEffect, useState, type MouseEvent } from "react";
import { fetchGhPrChecks, fetchGhPrFiles, fetchGhThread, fetchLinearThread, relativeTime } from "./api";
import { Icon, priGlyph, statusGlyph } from "./icons";
import { Markdown } from "../Markdown";
import type { GhItem, LinearItem, LinearProject, LinearTeam, PrCheck, PrFile, TaskThread, UnifiedItem } from "./types";
import { isGh } from "./types";

const cap = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);
const statusLabel = (s: string) =>
  (({ backlog: "Backlog", todo: "Todo", inprog: "In progress", review: "In review", done: "Done", cancel: "Canceled" } as Record<string, string>)[s] ?? s);

function BodyText({ text }: { text: string }) {
  const t = (text ?? "").trim();
  if (!t) return <p style={{ color: "var(--fg-subtle)", fontStyle: "italic" }}>No description.</p>;
  return <Markdown>{t}</Markdown>;
}

type ThreadPaneProps = { thread: TaskThread | null; err: string | null; loading: boolean };

function ThreadComments({ thread, err, loading }: ThreadPaneProps) {
  if (loading) return <p style={{ color: "var(--fg-subtle)" }}>Loading comments…</p>;
  if (err) return <p style={{ color: "var(--tempest-semantic-error, tomato)" }}>{err}</p>;
  const items = thread?.comments ?? [];
  if (!items.length) return <p style={{ color: "var(--fg-subtle)", fontStyle: "italic" }}>No comments yet.</p>;
  return (
    <ul className="thread-list">
      {items.map((c) => (
        <li key={c.id} className="thread-comment">
          <div className="thread-head">
            <span className="thread-author">{c.author || "unknown"}</span>
            <span className="thread-time">{relativeTime(c.created)} ago</span>
          </div>
          <div className="prose"><Markdown>{c.body}</Markdown></div>
        </li>
      ))}
    </ul>
  );
}

function ThreadActivity({ thread, err, loading }: ThreadPaneProps) {
  if (loading) return <p style={{ color: "var(--fg-subtle)" }}>Loading activity…</p>;
  if (err) return <p style={{ color: "var(--tempest-semantic-error, tomato)" }}>{err}</p>;
  const items = thread?.activity ?? [];
  if (!items.length) return <p style={{ color: "var(--fg-subtle)", fontStyle: "italic" }}>No activity yet.</p>;
  return (
    <ul className="thread-list activity">
      {items.map((a) => (
        <li key={a.id} className="thread-event">
          <span className="thread-author">{a.author || "system"}</span>
          <span className="thread-detail"> {a.detail}</span>
          <span className="thread-time"> · {relativeTime(a.created)} ago</span>
        </li>
      ))}
    </ul>
  );
}

type LazyState<T> = { data: T | null; err: string | null; loading: boolean };

function PrFiles({ state }: { state: LazyState<PrFile[]> }) {
  if (state.loading) return <p style={{ color: "var(--fg-subtle)" }}>Loading files…</p>;
  if (state.err) return <p style={{ color: "var(--tempest-semantic-error, tomato)" }}>{state.err}</p>;
  const items = state.data ?? [];
  if (!items.length) return <p style={{ color: "var(--fg-subtle)", fontStyle: "italic" }}>No files changed.</p>;
  return (
    <ul className="thread-list pr-files">
      {items.map((f) => (
        <li key={f.filename} className="pr-file">
          <span className={`pr-file-status ${f.status}`}>{f.status}</span>
          <span className="pr-file-name mono">{f.filename}</span>
          <span className="pr-file-diff">
            <span className="add">+{f.additions}</span>{" "}
            <span className="del">−{f.deletions}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

// Duration between started_at and completed_at, in the same compact shape
// (`3s`, `1m`, `2h`) relativeTime uses so both tables read as one system.
function checkDuration(c: PrCheck): string {
  if (!c.started_at || !c.completed_at) return "";
  const a = Date.parse(c.started_at);
  const b = Date.parse(c.completed_at);
  if (Number.isNaN(a) || Number.isNaN(b) || b < a) return "";
  const s = Math.floor((b - a) / 1000);
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  return `${Math.floor(s / 3600)}h`;
}

function PrChecks({ state }: { state: LazyState<PrCheck[]> }) {
  if (state.loading) return <p style={{ color: "var(--fg-subtle)" }}>Loading checks…</p>;
  if (state.err) return <p style={{ color: "var(--tempest-semantic-error, tomato)" }}>{state.err}</p>;
  const items = state.data ?? [];
  if (!items.length) return <p style={{ color: "var(--fg-subtle)", fontStyle: "italic" }}>No checks reported.</p>;
  return (
    <ul className="thread-list pr-checks">
      {items.map((c, i) => {
        const outcome = c.conclusion ?? c.status;
        const dur = checkDuration(c);
        return (
          <li key={`${c.name}-${i}`} className="pr-check">
            <span className={`pr-check-outcome ${outcome}`}>{outcome}</span>
            <span className="pr-check-name">{c.name}</span>
            {dur && <span className="pr-check-dur">{dur}</span>}
          </li>
        );
      })}
    </ul>
  );
}

export function RowAccordion({
  it,
  teams,
  projects,
  liveSessionId,
  onCollapse,
  onLaunch,
  onViewSession,
}: {
  it: UnifiedItem;
  teams: LinearTeam[];
  projects: LinearProject[];
  liveSessionId: string | null;
  onCollapse: () => void;
  onLaunch: (key: string) => void;
  onViewSession: (id: string) => void;
}) {
  const gh = isGh(it);
  const idStr = gh ? `${(it as GhItem).repo}#${(it as GhItem).number}` : (it as LinearItem).id;
  const stateStr = gh
    ? ((it as GhItem).draft ? "Draft" : cap((it as GhItem).state))
    : statusLabel((it as LinearItem).status);

  const tabs = gh && (it as GhItem).kind === "pr"
    ? ["Description", "Comments", "Files", "Checks", "Activity"]
    : ["Description", "Comments", "Activity"];
  const [tab, setTab] = useState(0);

  const [thread, setThread] = useState<TaskThread | null>(null);
  const [threadErr, setThreadErr] = useState<string | null>(null);
  const [threadLoading, setThreadLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setThread(null);
    setThreadErr(null);
    setThreadLoading(true);
    const p = gh
      ? fetchGhThread((it as GhItem).repo, (it as GhItem).number)
      : fetchLinearThread((it as LinearItem).id);
    p.then((t) => { if (!cancelled) setThread(t); })
      .catch((e) => { if (!cancelled) setThreadErr(String(e?.message ?? e)); })
      .finally(() => { if (!cancelled) setThreadLoading(false); });
    return () => { cancelled = true; };
  }, [it.key, gh]);

  // PR-only Files/Checks tabs. Fetched lazily when their tab is first opened,
  // then kept in state so switching back is instant. Backend already caches
  // for 60s, so a stale row re-fetches on Refresh (cache_invalidate).
  const isPr = gh && (it as GhItem).kind === "pr";
  const [files, setFiles] = useState<LazyState<PrFile[]>>({ data: null, err: null, loading: false });
  const [checks, setChecks] = useState<LazyState<PrCheck[]>>({ data: null, err: null, loading: false });

  useEffect(() => {
    setFiles({ data: null, err: null, loading: false });
    setChecks({ data: null, err: null, loading: false });
  }, [it.key]);

  const activeTab = tabs[tab];
  useEffect(() => {
    if (!isPr) return;
    const repo = (it as GhItem).repo;
    const number = (it as GhItem).number;
    let cancelled = false;
    if (activeTab === "Files" && !files.data && !files.loading && !files.err) {
      setFiles({ data: null, err: null, loading: true });
      fetchGhPrFiles(repo, number)
        .then((d) => { if (!cancelled) setFiles({ data: d, err: null, loading: false }); })
        .catch((e) => { if (!cancelled) setFiles({ data: null, err: String(e?.message ?? e), loading: false }); });
    }
    if (activeTab === "Checks" && !checks.data && !checks.loading && !checks.err) {
      setChecks({ data: null, err: null, loading: true });
      fetchGhPrChecks(repo, number)
        .then((d) => { if (!cancelled) setChecks({ data: d, err: null, loading: false }); })
        .catch((e) => { if (!cancelled) setChecks({ data: null, err: String(e?.message ?? e), loading: false }); });
    }
    return () => { cancelled = true; };
  }, [activeTab, isPr, it, files.data, files.loading, files.err, checks.data, checks.loading, checks.err]);

  const activityLabel = activeTab === "Activity";
  const commentsLabel = activeTab === "Comments";
  const filesLabel = activeTab === "Files";
  const checksLabel = activeTab === "Checks";

  const openBrowser = async () => {
    if (!it.url) return;
    // Reuse the tauri opener plugin already wired into the app.
    try {
      const { openUrl } = await import("@tauri-apps/plugin-opener");
      await openUrl(it.url);
    } catch (e) {
      console.warn("[tasks] open in browser failed", e);
    }
  };
  const copyLink = async () => {
    if (!it.url) return;
    try {
      await navigator.clipboard.writeText(it.url);
    } catch (e) {
      console.warn("[tasks] copy link failed", e);
    }
  };

  const stop = (e: MouseEvent) => e.stopPropagation();

  return (
    <div className="accordion" onClick={stop}>
      <div className="exp-head">
        <div className="top-row">
          <div className="crumbs">
            <span className="id-chip mono">{idStr}</span>
            <span className="dot-sep">·</span>
            <span className="state-str">{stateStr}</span>
          </div>
          <div className="actions-inline">
            {liveSessionId ? (
              <button className="btn primary" onClick={() => onViewSession(liveSessionId)}>
                {Icon.bolt()} View agent
              </button>
            ) : (
              <button className="btn primary" onClick={() => onLaunch(it.key)}>
                {Icon.bolt()} Launch agent
              </button>
            )}
            <button className="icon-btn" title="Open in browser" onClick={openBrowser}>{Icon.extLink()}</button>
            <button className="icon-btn" title="Copy link" onClick={copyLink}>{Icon.copy()}</button>
            <button className="icon-btn" title="Close" onClick={onCollapse}>{Icon.close()}</button>
          </div>
        </div>
        <h2>{it.title}</h2>
        <div className="exp-meta">
          {!gh && (
            <span className="badge">
              <span className={`pri ${(it as LinearItem).priority}`}>{priGlyph((it as LinearItem).priority)}</span>
              {cap((it as LinearItem).priority)}
            </span>
          )}
          {!gh && (
            <span className="badge">
              <span className={`status-icon ${(it as LinearItem).status}`}>{statusGlyph((it as LinearItem).status)}</span>
              {statusLabel((it as LinearItem).status)}
            </span>
          )}
          {(it.labels ?? []).map((l) => (
            <span key={l.n} className="badge"><span className="dot" style={{ background: l.c }} />{l.n}</span>
          ))}
          {!gh && (it as LinearItem).project && (() => {
            const p = projects.find((x) => x.id === (it as LinearItem).project);
            return p ? <span className="badge subtle">{Icon.project()}<span style={{ marginLeft: 2 }}>{p.name}</span></span> : null;
          })()}
          {!gh && (it as LinearItem).cycle && (
            <span className="badge subtle">{Icon.cycle()}<span style={{ marginLeft: 2 }}>{(it as LinearItem).cycle}</span></span>
          )}
        </div>
      </div>

      <div className="exp-tabs">
        {tabs.map((t, i) => (
          <button key={t} className={`exp-tab${i === tab ? " active" : ""}`} onClick={() => setTab(i)}>{t}</button>
        ))}
      </div>

      <div className="exp-body">
        <div className="main">
          {tab === 0 && <div className="prose"><BodyText text={it.body} /></div>}
          {commentsLabel && <ThreadComments thread={thread} err={threadErr} loading={threadLoading} />}
          {activityLabel && <ThreadActivity thread={thread} err={threadErr} loading={threadLoading} />}
          {filesLabel && <PrFiles state={files} />}
          {checksLabel && <PrChecks state={checks} />}
        </div>

        <aside className="side">
          <div className="side-card">
            <h4>Details</h4>
            <div className="row-kv">
              <span className="k">{gh ? "Repo" : "Team"}</span>
              <span className="v">
                {gh ? (it as GhItem).repo : (teams.find((t) => t.id === (it as LinearItem).team)?.name ?? (it as LinearItem).team ?? "—")}
              </span>
            </div>
            <div className="row-kv">
              <span className="k">Assignee</span>
              <span className="v">
                {gh
                  ? ((it as GhItem).assignees[0] ?? "—")
                  : ((it as LinearItem).assignee ?? "—")}
              </span>
            </div>
            {!gh && (
              <div className="row-kv">
                <span className="k">Priority</span>
                <span className="v">{cap((it as LinearItem).priority)}</span>
              </div>
            )}
            {!gh && (
              <div className="row-kv">
                <span className="k">Status</span>
                <span className="v">{statusLabel((it as LinearItem).status)}</span>
              </div>
            )}
            <div className="row-kv">
              <span className="k">Updated</span>
              <span className="v">{relativeTime(it.updated)} ago</span>
            </div>
          </div>
          <div className="side-card">
            <h4>Labels</h4>
            <div className="chip-cluster">
              {(it.labels ?? []).length
                ? (it.labels ?? []).map((l) => (
                    <span key={l.n} className="badge"><span className="dot" style={{ background: l.c }} />{l.n}</span>
                  ))
                : <span className="empty-hint">No labels</span>
              }
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
