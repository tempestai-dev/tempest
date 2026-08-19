import { useState, type MouseEvent } from "react";
import { relativeTime } from "./api";
import { Icon, priGlyph, statusGlyph } from "./icons";
import type { GhItem, LinearItem, LinearProject, LinearTeam, UnifiedItem } from "./types";
import { isGh } from "./types";

const cap = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);
const statusLabel = (s: string) =>
  (({ backlog: "Backlog", todo: "Todo", inprog: "In progress", review: "In review", done: "Done", cancel: "Canceled" } as Record<string, string>)[s] ?? s);

// Render body text with paragraph + linebreak preservation. Not markdown —
// the mockup didn't render markdown; real fidelity comes later.
function BodyText({ text }: { text: string }) {
  const t = (text ?? "").trim();
  if (!t) return <p style={{ color: "var(--fg-subtle)", fontStyle: "italic" }}>No description.</p>;
  return (
    <>
      {t.split(/\n{2,}/).map((para, i) => (
        <p key={i}>
          {para.split("\n").map((line, j, arr) => (
            <span key={j}>{line}{j < arr.length - 1 && <br />}</span>
          ))}
        </p>
      ))}
    </>
  );
}

export function RowAccordion({
  it,
  teams,
  projects,
  onCollapse,
  onLaunch,
}: {
  it: UnifiedItem;
  teams: LinearTeam[];
  projects: LinearProject[];
  onCollapse: () => void;
  onLaunch: (key: string) => void;
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
            <button className="btn primary" onClick={() => onLaunch(it.key)}>
              {Icon.bolt()} Launch agent
            </button>
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
          {tab !== 0 && <p style={{ color: "var(--fg-subtle)" }}>Loads from the provider on demand — not wired yet.</p>}
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
