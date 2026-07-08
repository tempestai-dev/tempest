import { useState, useEffect, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import {
  RefreshCw, GitBranch, GitPullRequest, Loader, Check,
  Plus, Minus, X, AlertTriangle, ChevronDown, Trash2,
} from "lucide-react";
import { Tooltip } from "./Tooltip";
import { useAttribution, setAttribution, COAUTHOR_LINE } from "../store/attribution";
import "./DiffPane.css";

// ── Types ─────────────────────────────────────────────────────────────────────

interface DiffLine {
  kind: "hunk" | "context" | "added" | "removed";
  line_old: number | null;
  line_new: number | null;
  content: string;
}

interface FileEntry {
  xy: string;
  path: string;
  status: string;
}

type FileSection = "staged" | "unstaged";

interface BranchInfo {
  name: string;
  is_current: boolean;
  is_remote: boolean;
  is_worktree: boolean;
  worktree_path?: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildPrUrl(remoteUrl: string, branch: string): string {
  const normalized = remoteUrl.trim().replace(/\.git$/, "");
  let host = "", path = "";
  const ssh = normalized.match(/^git@([^:]+):(.+)$/);
  if (ssh) { host = ssh[1]; path = ssh[2]; }
  else {
    try { const u = new URL(normalized); host = u.host; path = u.pathname.replace(/^\//, ""); }
    catch { return normalized; }
  }
  const eb = encodeURIComponent(branch);
  if (host === "github.com") return `https://github.com/${path}/compare/${eb}?expand=1`;
  if (host === "gitlab.com" || host.includes("gitlab"))
    return `https://gitlab.com/${path}/-/merge_requests/new?merge_request[source_branch]=${eb}`;
  if (host === "bitbucket.org")
    return `https://bitbucket.org/${path}/pull-requests/new?source=${eb}`;
  return `https://${host}/${path}`;
}

function statusClass(s: string) {
  if (s === "M") return "dp-status--modified";
  if (s === "A") return "dp-status--added";
  if (s === "D") return "dp-status--deleted";
  if (s === "R") return "dp-status--renamed";
  return "dp-status--untracked";
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

// ── Root ──────────────────────────────────────────────────────────────────────

interface Props {
  sessionId: string;
  cwd: string;
  hidden: boolean;
  gitRevision?: number;
}

export function DiffPane({ cwd, hidden, gitRevision }: Props) {
  const [staged, setStaged] = useState<FileEntry[]>([]);
  const [unstaged, setUnstaged] = useState<FileEntry[]>([]);
  const [selected, setSelected] = useState<{ path: string; section: FileSection } | null>(null);
  const selectedRef = useRef(selected);
  selectedRef.current = selected;

  const [diffLines, setDiffLines] = useState<DiffLine[]>([]);
  const [diffLoading, setDiffLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [commitTitle, setCommitTitle] = useState("");
  const [commitDesc, setCommitDesc] = useState("");
  const [commitState, setCommitState] = useState<"idle" | "committing" | "done" | "error">("idle");
  const coauthor = useAttribution();

  const [currentBranch, setCurrentBranch] = useState("");
  const [pushState, setPushState] = useState<"idle" | "pushing" | "done">("idle");
  const [pushError, setPushError] = useState<string | null>(null);

  const [showBranchInput, setShowBranchInput] = useState(false);
  const [newBranchName, setNewBranchName] = useState("");
  const [branchPushState, setBranchPushState] = useState<"idle" | "pushing" | "done" | "error">("idle");

  const [branches, setBranches] = useState<BranchInfo[]>([]);
  const [showBranchMenu, setShowBranchMenu] = useState(false);
  const branchMenuRef = useRef<HTMLDivElement>(null);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [deleteAlsoRemote, setDeleteAlsoRemote] = useState(true);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const [discardTarget, setDiscardTarget] = useState<string | null>(null);

  // ── Load file list ───────────────────────────────────────────────────────

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [entries, branch, branchList] = await Promise.all([
        invoke<FileEntry[]>("git_status", { path: cwd }),
        invoke<string>("get_git_branch", { path: cwd }).catch(() => ""),
        invoke<BranchInfo[]>("git_list_branches", { repoPath: cwd }).catch(() => []),
      ]);
      setCurrentBranch(branch);
      setBranches(branchList.filter((b) => !b.is_worktree));
      const filtered = entries.filter((e) => !e.path.includes(".tempest-pid"));
      const s: FileEntry[] = [];
      const u: FileEntry[] = [];
      for (const e of filtered) {
        const x = e.xy?.[0] ?? " ";
        const y = e.xy?.[1] ?? " ";
        if (x !== " " && x !== "?") s.push({ ...e, status: x });
        if (y !== " " || e.xy === "??") u.push({ ...e, status: e.xy === "??" ? "?" : y });
      }
      setStaged(s);
      setUnstaged(u);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [cwd]);

  // ── Load per-file diff ───────────────────────────────────────────────────

  const loadDiff = useCallback(async (path: string, section: FileSection, isUntracked: boolean) => {
    setDiffLoading(true);
    setDiffLines([]);
    try {
      const lines = await invoke<DiffLine[]>("git_diff_file", {
        path: cwd,
        filePath: path,
        staged: section === "staged",
        untracked: isUntracked,
      });
      setDiffLines(lines);
    } catch {
      setDiffLines([]);
    } finally {
      setDiffLoading(false);
    }
  }, [cwd]);

  useEffect(() => {
    if (!hidden) load();
  }, [cwd, gitRevision, hidden]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Selection ────────────────────────────────────────────────────────────

  const selectFile = (path: string, section: FileSection, entry: FileEntry) => {
    const isUntracked = entry.xy === "??";
    setSelected({ path, section });
    loadDiff(path, section, isUntracked);
  };

  // ── Staging actions ──────────────────────────────────────────────────────

  const stageFile = async (path: string) => {
    try { await invoke("git_stage", { repoPath: cwd, filePath: path }); } catch { /* non-fatal */ }
    await load();
    // Follow the file into the staged section
    if (selectedRef.current?.path === path) {
      setSelected({ path, section: "staged" });
      loadDiff(path, "staged", false);
    }
  };

  const unstageFile = async (path: string) => {
    try { await invoke("git_unstage", { repoPath: cwd, filePath: path }); } catch { /* non-fatal */ }
    await load();
    if (selectedRef.current?.path === path) {
      setSelected({ path, section: "unstaged" });
      loadDiff(path, "unstaged", false);
    }
  };

  const discardFile = async (path: string) => {
    const isUntracked = unstaged.find((f) => f.path === path)?.xy === "??";
    setDiscardTarget(null);
    if (selectedRef.current?.path === path) { setSelected(null); setDiffLines([]); }
    try { await invoke("git_discard", { repoPath: cwd, filePath: path, untracked: isUntracked }); } catch { /* non-fatal */ }
    await load();
  };

  const stageAll = async () => {
    try { await invoke("git_stage", { repoPath: cwd, filePath: "." }); } catch { /* non-fatal */ }
    await load();
  };

  const unstageAll = async () => {
    try { await invoke("git_unstage", { repoPath: cwd, filePath: "." }); } catch { /* non-fatal */ }
    await load();
  };

  // ── Commit ───────────────────────────────────────────────────────────────

  const commitStaged = async () => {
    if (!commitTitle.trim() || staged.length === 0 || commitState === "committing") return;
    setCommitState("committing");
    let msg = commitTitle.trim();
    if (commitDesc.trim()) msg += "\n\n" + commitDesc.trim();
    if (coauthor) msg += "\n\n" + COAUTHOR_LINE;
    try {
      await invoke("git_commit_staged", { repoPath: cwd, message: msg });
      setCommitTitle("");
      setCommitDesc("");
      setSelected(null);
      setDiffLines([]);
      setCommitState("done");
      await load();
      setTimeout(() => setCommitState("idle"), 1500);
    } catch (e) {
      setError(String(e));
      setCommitState("error");
      setTimeout(() => setCommitState("idle"), 3000);
    }
  };

  // ── Push ─────────────────────────────────────────────────────────────────

  const pushToCurrent = useCallback(() => {
    setPushState("pushing");
    setPushError(null);
    invoke<string>("git_push_current_branch", { repoPath: cwd })
      .then(() => {
        setPushState("done");
        load();
        setTimeout(() => setPushState("idle"), 2000);
      })
      .catch((e) => {
        setPushState("idle");
        setPushError(String(e));
        setTimeout(() => setPushError(null), 4000);
      });
  }, [cwd, load]);

  const pushToNewBranch = useCallback(() => {
    if (!newBranchName.trim() || branchPushState === "pushing") return;
    setBranchPushState("pushing");
    setPushError(null);
    invoke<string>("git_create_push_branch", { repoPath: cwd, branchName: newBranchName.trim() })
      .then((raw) => {
        const { remoteUrl, branch } = JSON.parse(raw) as { remoteUrl: string; branch: string };
        setCurrentBranch(branch);
        setShowBranchInput(false);
        setNewBranchName("");
        setBranchPushState("done");
        openUrl(buildPrUrl(remoteUrl, branch)).catch(() => {});
        load();
        setTimeout(() => setBranchPushState("idle"), 2000);
      })
      .catch((e) => {
        setBranchPushState("error");
        setPushError(String(e));
        setTimeout(() => { setBranchPushState("idle"); setPushError(null); }, 4000);
      });
  }, [cwd, newBranchName, branchPushState, load]);

  // ── Branch menu ───────────────────────────────────────────────────────────

  useEffect(() => {
    if (!showBranchMenu) return;
    const handler = (e: MouseEvent) => {
      if (branchMenuRef.current && !branchMenuRef.current.contains(e.target as Node)) {
        setShowBranchMenu(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showBranchMenu]);

  const switchBranch = async (name: string) => {
    setShowBranchMenu(false);
    try {
      await invoke("git_switch_branch", { repoPath: cwd, branch: name });
      await load();
    } catch (e) {
      setError(String(e));
    }
  };

  const confirmDelete = async (force: boolean) => {
    if (!deleteTarget) return;
    setDeleteError(null);
    try {
      await invoke("git_delete_branch", {
        repoPath: cwd,
        branch: deleteTarget,
        force,
        deleteRemote: deleteAlsoRemote,
      });
      setDeleteTarget(null);
      await load();
    } catch (e) {
      setDeleteError(String(e));
    }
  };

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="diff-pane" style={hidden ? { display: "none" } : {}}>

      {/* ── Header ── */}
      <div className="dp-header">
        <span className="dp-header-title">Changes</span>
        <Tooltip content="Reload" placement="top">
          <button
            className={`dp-reload-btn${loading ? " dp-reload-btn--spinning" : ""}`}
            disabled={loading}
            onClick={load}
          >
            <RefreshCw size={13} />
          </button>
        </Tooltip>
        {/* ── Branch picker ── */}
        <div className="dp-branch-picker" ref={branchMenuRef}>
          <button
            className="dp-branch-pill"
            onClick={() => setShowBranchMenu((v) => !v)}
            title="Switch branch"
          >
            <GitBranch size={11} />
            <span className="dp-branch-pill-name">{currentBranch || "branch"}</span>
            <ChevronDown size={10} className={showBranchMenu ? "dp-chevron--open" : ""} />
          </button>
          {showBranchMenu && (
            <div className="dp-branch-menu">
              {branches.length === 0 ? (
                <div className="dp-branch-menu-empty">No branches</div>
              ) : (
                branches.map((b) => (
                  <div
                    key={b.name}
                    className={`dp-branch-menu-row${b.is_current ? " dp-branch-menu-row--current" : ""}${b.is_remote ? " dp-branch-menu-row--remote" : ""}`}
                  >
                    <span className="dp-branch-menu-check">{b.is_current ? <Check size={11} /> : null}</span>
                    <button
                      className="dp-branch-menu-name"
                      onClick={() => !b.is_current && switchBranch(b.name)}
                      disabled={b.is_current}
                      title={b.is_current ? "Current branch" : `Switch to ${b.name}`}
                    >
                      {b.name}
                    </button>
                    {!b.is_current && !b.is_remote && (
                      <Tooltip content="Delete branch" placement="left">
                        <button
                          className="dp-branch-menu-del"
                          onClick={(e) => { e.stopPropagation(); setDeleteTarget(b.name); setDeleteError(null); }}
                        >
                          <Trash2 size={11} />
                        </button>
                      </Tooltip>
                    )}
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        <div className="dp-header-push">
          {!showBranchInput ? (
            <>
              <button
                className="dp-push-btn"
                disabled={pushState === "pushing"}
                onClick={pushToCurrent}
                title={`Push commits to ${currentBranch || "current branch"}`}
              >
                {pushState === "pushing"
                  ? <Loader size={12} className="dp-spin" />
                  : pushState === "done"
                  ? <Check size={12} />
                  : <GitBranch size={12} />}
                Push{currentBranch ? ` to ${currentBranch}` : ""}
              </button>
              <button
                className="dp-push-btn dp-push-btn--outline"
                onClick={() => setShowBranchInput(true)}
                title="Create a new branch and push"
              >
                <GitPullRequest size={12} />
                New Branch
              </button>
            </>
          ) : (
            <div className="dp-branch-row">
              <Tooltip content="Cancel" placement="top">
                <button
                  className="dp-branch-cancel"
                  onClick={() => { setShowBranchInput(false); setNewBranchName(""); }}
                >
                  <X size={12} />
                </button>
              </Tooltip>
              <input
                className="dp-branch-input"
                placeholder="branch-name"
                value={newBranchName}
                onChange={(e) => setNewBranchName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") pushToNewBranch();
                  if (e.key === "Escape") { setShowBranchInput(false); setNewBranchName(""); }
                }}
                autoFocus
              />
              <button
                className="dp-push-btn"
                disabled={!newBranchName.trim() || branchPushState === "pushing"}
                onClick={pushToNewBranch}
                title="Create branch, push, and open PR"
              >
                {branchPushState === "pushing"
                  ? <Loader size={12} className="dp-spin" />
                  : branchPushState === "done"
                  ? <Check size={12} />
                  : <GitPullRequest size={12} />}
                Push & PR
              </button>
            </div>
          )}
        </div>
      </div>

      {pushError && <div className="dp-push-error">{pushError}</div>}

      {/* ── Body ── */}
      {error ? (
        <div className="dp-status-msg dp-status-msg--error">{error}</div>
      ) : (
        <div className="dp-body">

          {/* Left column: file lists + commit form */}
          <div className="dp-files">
            <div className="dp-file-lists">

              {/* Staged */}
              <div className="dp-section">
                <div className="dp-section-hdr">
                  <span className="dp-section-label">
                    Staged
                    {staged.length > 0 && (
                      <span className="dp-section-count">{staged.length}</span>
                    )}
                  </span>
                  {staged.length > 0 && (
                    <button className="dp-action-all" onClick={unstageAll} title="Unstage all">
                      Unstage All
                    </button>
                  )}
                </div>
                {staged.length === 0 ? (
                  <div className="dp-empty-section">No staged files</div>
                ) : (
                  staged.map((f) => (
                    <div
                      key={f.path}
                      className={`dp-file-row${selected?.path === f.path && selected?.section === "staged" ? " dp-file-row--active" : ""}`}
                      onClick={() => selectFile(f.path, "staged", f)}
                    >
                      <span className={`dp-status ${statusClass(f.status)}`}>{f.status}</span>
                      <span className="dp-fpath" title={f.path}>{f.path}</span>
                      <Tooltip content="Unstage file" placement="left">
                        <button
                          className="dp-file-btn dp-file-btn--unstage"
                          onClick={(e) => { e.stopPropagation(); unstageFile(f.path); }}
                        >
                          <Minus size={11} />
                        </button>
                      </Tooltip>
                    </div>
                  ))
                )}
              </div>

              {/* Unstaged */}
              <div className="dp-section">
                <div className="dp-section-hdr">
                  <span className="dp-section-label">
                    Unstaged
                    {unstaged.length > 0 && (
                      <span className="dp-section-count">{unstaged.length}</span>
                    )}
                  </span>
                  {unstaged.length > 0 && (
                    <button className="dp-action-all dp-action-all--stage" onClick={stageAll} title="Stage all">
                      Stage All
                    </button>
                  )}
                </div>
                {unstaged.length === 0 ? (
                  <div className="dp-empty-section">No unstaged changes</div>
                ) : (
                  unstaged.map((f) => (
                    <div
                      key={f.path}
                      className={`dp-file-row${selected?.path === f.path && selected?.section === "unstaged" ? " dp-file-row--active" : ""}`}
                      onClick={() => selectFile(f.path, "unstaged", f)}
                    >
                      <span className={`dp-status ${statusClass(f.status)}`}>{f.status}</span>
                      <span className="dp-fpath" title={f.path}>{f.path}</span>
                      <div className="dp-file-btns">
                        <Tooltip content="Stage file" placement="left">
                          <button
                            className="dp-file-btn dp-file-btn--stage"
                            onClick={(e) => { e.stopPropagation(); stageFile(f.path); }}
                          >
                            <Plus size={11} />
                          </button>
                        </Tooltip>
                        <Tooltip content="Discard changes" placement="left">
                          <button
                            className="dp-file-btn dp-file-btn--discard"
                            onClick={(e) => { e.stopPropagation(); setDiscardTarget(f.path); }}
                          >
                            <X size={11} />
                          </button>
                        </Tooltip>
                      </div>
                    </div>
                  ))
                )}
              </div>

            </div>{/* /dp-file-lists */}

            {/* Commit form */}
            <div className="dp-commit">
              <input
                className="dp-commit-title"
                placeholder="Commit title"
                value={commitTitle}
                onChange={(e) => setCommitTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                    e.preventDefault();
                    commitStaged();
                  }
                }}
              />
              <textarea
                className="dp-commit-msg"
                placeholder="Description (optional)"
                value={commitDesc}
                onChange={(e) => setCommitDesc(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                    e.preventDefault();
                    commitStaged();
                  }
                }}
                rows={3}
              />
              <div className="dp-coauthor-row">
                <span className="dp-coauthor-label">Co-authored-by Tempest</span>
                <input
                  type="checkbox"
                  className="dp-toggle"
                  checked={coauthor}
                  onChange={(e) => setAttribution(e.target.checked)}
                />
              </div>
              <button
                className="dp-commit-btn"
                disabled={staged.length === 0 || !commitTitle.trim() || commitState === "committing"}
                onClick={commitStaged}
              >
                {commitState === "committing" && <Loader size={12} className="dp-spin" />}
                {commitState === "done" && <Check size={12} />}
                Commit
              </button>
            </div>
          </div>{/* /dp-files */}

          {/* Divider */}
          <div className="dp-divider" />

          {/* Right column: per-file diff */}
          <div className="dp-diff">
            {selected ? (
              <>
                <div className="dp-diff-filehdr">
                  <span className="dp-diff-filepath">{selected.path}</span>
                  <span className={`dp-diff-badge dp-diff-badge--${selected.section}`}>
                    {selected.section}
                  </span>
                </div>
                <div className="dp-diff-scroll">
                  {diffLoading ? (
                    <div className="dp-diff-center"><Loader size={16} className="dp-spin" /></div>
                  ) : diffLines.length === 0 ? (
                    <div className="dp-diff-center dp-diff-empty">No diff to display</div>
                  ) : (
                    <div className="dp-diff-lines">
                      <UnifiedDiff lines={diffLines} />
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div className="dp-diff-center dp-diff-empty">
                Select a file to view its diff
              </div>
            )}
          </div>

        </div>
      )}

      {/* Discard confirmation */}
      {discardTarget && (
        <div className="dp-overlay" onClick={() => setDiscardTarget(null)}>
          <div className="dp-dialog" onClick={(e) => e.stopPropagation()}>
            <AlertTriangle size={20} className="dp-dialog-icon" />
            <p className="dp-dialog-title">Discard changes?</p>
            <code className="dp-dialog-path">{discardTarget}</code>
            <p className="dp-dialog-warn">This cannot be undone.</p>
            <div className="dp-dialog-actions">
              <button className="dp-dialog-cancel" onClick={() => setDiscardTarget(null)}>
                Cancel
              </button>
              <button className="dp-dialog-confirm" onClick={() => discardFile(discardTarget)}>
                Discard
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Branch delete confirmation */}
      {deleteTarget && (
        <div className="dp-overlay" onClick={() => { setDeleteTarget(null); setDeleteError(null); }}>
          <div className="dp-dialog" onClick={(e) => e.stopPropagation()}>
            <Trash2 size={20} className="dp-dialog-icon dp-dialog-icon--delete" />
            <p className="dp-dialog-title">Delete branch?</p>
            <code className="dp-dialog-path">{deleteTarget}</code>
            {deleteError ? (
              <>
                <p className="dp-dialog-warn dp-dialog-warn--error">{deleteError}</p>
                <div className="dp-dialog-actions">
                  <button className="dp-dialog-cancel" onClick={() => { setDeleteTarget(null); setDeleteError(null); }}>
                    Cancel
                  </button>
                  <button className="dp-dialog-confirm" onClick={() => confirmDelete(true)}>
                    Force Delete
                  </button>
                </div>
              </>
            ) : (
              <>
                <label className="dp-delete-remote-row">
                  <input
                    type="checkbox"
                    className="dp-toggle"
                    checked={deleteAlsoRemote}
                    onChange={(e) => setDeleteAlsoRemote(e.target.checked)}
                  />
                  <span className="dp-coauthor-label">Also delete from remote</span>
                </label>
                <div className="dp-dialog-actions">
                  <button className="dp-dialog-cancel" onClick={() => { setDeleteTarget(null); setDeleteError(null); }}>
                    Cancel
                  </button>
                  <button className="dp-dialog-confirm" onClick={() => confirmDelete(false)}>
                    Delete
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
