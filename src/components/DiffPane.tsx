import { useState, useEffect, useRef, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import { ChevronRight, ChevronDown, RefreshCw, GitBranch, GitPullRequest, Loader, Check } from "lucide-react";
import { getSettings } from "../store/appSettings";
import "./DiffPane.css";

// ── Types ─────────────────────────────────────────────────────────────────────

interface DiffLine {
  kind: "hunk" | "context" | "added" | "removed";
  line_old: number | null;
  line_new: number | null;
  content: string;
}

interface DiffFile {
  status: "M" | "A" | "D" | "R";
  path: string;
  adds: number;
  dels: number;
  lines: DiffLine[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildPrUrl(remoteUrl: string, branch: string): string {
  let normalized = remoteUrl.trim().replace(/\.git$/, "");

  let host = "";
  let path = "";
  const sshMatch = normalized.match(/^git@([^:]+):(.+)$/);
  if (sshMatch) {
    host = sshMatch[1];
    path = sshMatch[2];
  } else {
    try {
      const u = new URL(normalized);
      host = u.host;
      path = u.pathname.replace(/^\//, "");
    } catch {
      return normalized;
    }
  }

  const httpsRemote = `https://${host}/${path}`;
  const eb = encodeURIComponent(branch);

  if (host === "github.com") {
    return `https://github.com/${path}/compare/${eb}?expand=1`;
  }
  if (host === "gitlab.com" || host.includes("gitlab")) {
    return `https://gitlab.com/${path}/-/merge_requests/new?merge_request[source_branch]=${eb}`;
  }
  if (host === "bitbucket.org") {
    return `https://bitbucket.org/${path}/pull-requests/new?source=${eb}`;
  }
  return httpsRemote;
}

function statusLabel(s: string) {
  switch (s) {
    case "M": return "M";
    case "A": return "A";
    case "D": return "D";
    case "R": return "R";
    default:  return "?";
  }
}

function statusClass(s: string) {
  switch (s) {
    case "M": return "dp-status--modified";
    case "A": return "dp-status--added";
    case "D": return "dp-status--deleted";
    case "R": return "dp-status--renamed";
    default:  return "dp-status--untracked";
  }
}

function FileStats({ adds, dels }: { adds: number; dels: number }) {
  return (
    <span className="dp-file-stats">
      {adds > 0 && <span className="dp-stat-add">+{adds}</span>}
      {dels > 0 && <span className="dp-stat-del">−{dels}</span>}
    </span>
  );
}

function UnifiedDiff({ lines }: { lines: DiffLine[] }) {
  return (
    <>
      {lines.map((line, i) => (
        <div key={i} className={`dp-line dp-line--${line.kind}`}>
          <span className="dp-ln dp-ln--old">{line.line_old ?? ""}</span>
          <span className="dp-ln dp-ln--new">{line.line_new ?? ""}</span>
          <span className="dp-line-content">{line.content}</span>
        </div>
      ))}
    </>
  );
}

// ── Stream view ───────────────────────────────────────────────────────────────

const LARGE_THRESHOLD = 12;

function StreamView({ files }: { files: DiffFile[] }) {
  const cardRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {};
    for (const f of files) {
      const big = (f.status === "A" || f.status === "D") && f.lines.length > LARGE_THRESHOLD;
      init[f.path] = big;
    }
    return init;
  });

  // Sync collapsed state when files list changes (e.g. after a refresh)
  useEffect(() => {
    setCollapsed((prev) => {
      const next: Record<string, boolean> = {};
      for (const f of files) {
        if (f.path in prev) {
          next[f.path] = prev[f.path];
        } else {
          next[f.path] = (f.status === "A" || f.status === "D") && f.lines.length > LARGE_THRESHOLD;
        }
      }
      return next;
    });
  }, [files]);

  const toggle = (path: string) =>
    setCollapsed((prev) => ({ ...prev, [path]: !prev[path] }));

  const jumpTo = (path: string) =>
    cardRefs.current[path]?.scrollIntoView({ behavior: "smooth", block: "start" });

  return (
    <div className="dp-stream">
      <div className="dp-stream-scroll">
        {files.map((f) => {
          const isCollapsed = collapsed[f.path];
          const changeCount = f.lines.filter((l) => l.kind === "added" || l.kind === "removed").length;
          return (
            <div
              key={f.path}
              className="dp-stream-card"
              ref={(el) => { cardRefs.current[f.path] = el; }}
            >
              <button className="dp-stream-cardhead" onClick={() => toggle(f.path)}>
                <span className="dp-stream-chevron">
                  {isCollapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
                </span>
                <span className={`dp-status ${statusClass(f.status)}`}>{statusLabel(f.status)}</span>
                <span className="dp-stream-path">{f.path}</span>
                <FileStats adds={f.adds} dels={f.dels} />
              </button>
              {isCollapsed ? (
                <button className="dp-stream-stub" onClick={() => toggle(f.path)}>
                  {f.status === "A" ? "New file" : f.status === "D" ? "Deleted file" : "Collapsed"} ·{" "}
                  {changeCount} changed {changeCount === 1 ? "line" : "lines"} — click to expand
                </button>
              ) : (
                <div className="dp-stream-body">
                  <UnifiedDiff lines={f.lines} />
                </div>
              )}
            </div>
          );
        })}
        <div className="dp-stream-tail" />
      </div>

      <div className="dp-stream-jumpbar">
        <span className="dp-stream-jumplabel">Jump:</span>
        {files.map((f) => (
          <button
            key={f.path}
            className="dp-stream-pill"
            onClick={() => jumpTo(f.path)}
            title={f.path}
          >
            <span className={`dp-status ${statusClass(f.status)}`}>{statusLabel(f.status)}</span>
            {f.path.split("/").pop()}
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Root ──────────────────────────────────────────────────────────────────────

interface Props {
  sessionId: string;
  cwd: string;
  hidden: boolean;
  gitRevision?: number;
}

export function DiffPane({ cwd, hidden, gitRevision }: Props) {
  const [files, setFiles] = useState<DiffFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pushState, setPushState] = useState<"idle" | "pushing" | "done">("idle");
  const [pushAction, setPushAction] = useState<"push" | "pr" | null>(null);
  const [pushError, setPushError] = useState<string | null>(null);

  const runPush = useCallback((openPr: boolean) => {
    setPushState("pushing");
    setPushAction(openPr ? "pr" : "push");
    setPushError(null);
    invoke<string>("git_push_branch", { repoPath: cwd, commitMessage: getSettings().commitMessageTemplate || null })
      .then((raw) => {
        const { remoteUrl, branch } = JSON.parse(raw) as { remoteUrl: string; branch: string };
        if (openPr) {
          openUrl(buildPrUrl(remoteUrl, branch)).catch(() => {});
        }
        load(cwd);
        setPushState("done");
        setTimeout(() => { setPushState("idle"); setPushAction(null); }, 2000);
      })
      .catch((e) => {
        setPushState("idle");
        setPushAction(null);
        setPushError(String(e));
        setTimeout(() => setPushError(null), 4000);
      });
  }, [cwd]);

  const load = useCallback((path: string) => {
    setLoading(true);
    setError(null);
    invoke<DiffFile[]>("git_diff", { path })
      .then((result) => { setFiles(result); setLoading(false); })
      .catch((e) => { setError(String(e)); setLoading(false); });
  }, []);

  useEffect(() => { load(cwd); }, [cwd, gitRevision]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="diff-pane" style={hidden ? { display: "none" } : {}}>
      <div className="dp-header">
        <span className="dp-header-title">Diff</span>
        <button
          className={`dp-reload-btn${loading ? " dp-reload-btn--spinning" : ""}`}
          title="Reload diff"
          aria-label="Reload diff"
          disabled={loading}
          onClick={() => load(cwd)}
        >
          <RefreshCw size={13} />
        </button>
      </div>
      {files.length > 0 && pushError && <div className="dp-push-error-strip">{pushError}</div>}
      {files.length > 0 && <div className="dp-push-bar">
        <button
          className="dp-push-bar-btn"
          disabled={pushState === "pushing"}
          onClick={() => runPush(false)}
        >
          {pushState === "pushing" && pushAction === "push" ? (
            <><Loader size={13} className="dp-push-spin" /><span>Pushing…</span></>
          ) : pushState === "done" && pushAction === "push" ? (
            <><Check size={13} /><span>Pushed</span></>
          ) : (
            <><GitBranch size={13} /><span>Push</span></>
          )}
        </button>
        <button
          className="dp-push-bar-btn"
          disabled={pushState === "pushing"}
          onClick={() => runPush(true)}
        >
          {pushState === "pushing" && pushAction === "pr" ? (
            <><Loader size={13} className="dp-push-spin" /><span>Pushing…</span></>
          ) : pushState === "done" && pushAction === "pr" ? (
            <><Check size={13} /><span>Pushed</span></>
          ) : (
            <><GitPullRequest size={13} /><span>Push &amp; Open PR</span></>
          )}
        </button>
      </div>}
      {loading && <div className="dp-status-msg">Loading diff…</div>}
      {!loading && error && <div className="dp-status-msg dp-status-msg--error">{error}</div>}
      {!loading && !error && files.length === 0 && (
        <div className="dp-status-msg">No changes</div>
      )}
      {!loading && !error && files.length > 0 && <StreamView files={files} />}
    </div>
  );
}
