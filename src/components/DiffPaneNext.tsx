import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import {
  RefreshCw, GitBranch, Loader, Plus, X, ChevronDown, ChevronRight,
  Trash2, Check, Eye, Columns, Rows, Search, FileText, FoldVertical, UnfoldVertical, GitCommit,
} from "lucide-react";
import { Tooltip } from "./Tooltip";
import { useAttribution, COAUTHOR_LINE } from "../store/attribution";
import { useComments, addComment, removeComment, clearComments, composeMessage } from "../store/reviewComments";
import { sessionManager } from "../store/sessionManager";
import { DiscardFileDialog } from "./DiffPane/DiscardFileDialog";
import { DeleteBranchDialog } from "./DiffPane/DeleteBranchDialog";
import { CommitBox } from "./DiffPane/CommitBox";
import { BranchMenu } from "./DiffPane/BranchMenu";
import { PushControls } from "./DiffPane/PushControls";
import { CommentBar } from "./DiffPane/CommentBar";
import type { BranchInfo, DiffLine, FileStats } from "../types/git";
import { buildPrUrl, statusClass, groupHunks, type Hunk } from "../lib/git";
import "./DiffPane.css";
import "./DiffPaneNext.css";

// ── Types ─────────────────────────────────────────────────────────────────────

interface FileEntry {
  xy: string;
  path: string;
  status: string;
}
type FileSection = "staged" | "unstaged";
type ViewMode = "unified" | "split";

export interface AgentSession {
  id: string;
  name: string;
}
interface Props {
  sessionId: string;
  cwd: string;
  hidden: boolean;
  gitRevision?: number;
  agentSessions?: AgentSession[];
}

interface DiffCacheEntry {
  lines: DiffLine[];
  loading: boolean;
}
type DiffCache = Record<string, DiffCacheEntry>; // key = `${section}:${path}`
const cacheKey = (path: string, section: FileSection) => `${section}:${path}`;

// ── Root ──────────────────────────────────────────────────────────────────────

export function DiffPaneNext({ cwd, hidden, gitRevision, agentSessions = [] }: Props) {
  const [staged, setStaged] = useState<FileEntry[]>([]);
  const [unstaged, setUnstaged] = useState<FileEntry[]>([]);
  const [statsMap, setStatsMap] = useState<Record<string, { adds: number; dels: number }>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [diffCache, setDiffCache] = useState<DiffCache>({});

  // View state
  const [viewMode, setViewMode] = useState<ViewMode>("unified");
  const [filter, setFilter] = useState("");
  const [showSearch, setShowSearch] = useState(false);
  const [collapsedFiles, setCollapsedFiles] = useState<Set<string>>(new Set());
  const [viewedFiles, setViewedFiles] = useState<Set<string>>(new Set());
  const [sectionCollapsed, setSectionCollapsed] = useState<Set<FileSection>>(new Set());

  // Comments
  const comments = useComments(cwd);
  const [commentDraft, setCommentDraft] = useState("");
  const [selectedAgentId, setSelectedAgentId] = useState<string>("");
  interface CommentingRange {
    key: string; // cacheKey
    hunkIdx: number;
    startLi: number;
    endLi: number;
    startLineNum: number;
    endLineNum: number;
    filePath: string;
  }
  const [commentingRange, setCommentingRange] = useState<CommentingRange | null>(null);

  // Commit
  const [commitTitle, setCommitTitle] = useState("");
  const [commitDesc, setCommitDesc] = useState("");
  const [commitState, setCommitState] = useState<"idle" | "committing" | "done" | "error">("idle");
  const coauthor = useAttribution();

  // Branch / push
  const [currentBranch, setCurrentBranch] = useState("");
  const [remoteUrl, setRemoteUrl] = useState("");
  const [pushState, setPushState] = useState<"idle" | "pushing" | "done">("idle");
  const [pushError, setPushError] = useState<string | null>(null);
  const [showBranchInput, setShowBranchInput] = useState(false);
  const [newBranchName, setNewBranchName] = useState("");
  const [branchPushState, setBranchPushState] = useState<"idle" | "pushing" | "done" | "error">("idle");
  const [branches, setBranches] = useState<BranchInfo[]>([]);
  const [showBranchMenu, setShowBranchMenu] = useState(false);
  const [branchTab, setBranchTab] = useState<"local" | "remote">("local");
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [deleteAlsoRemote, setDeleteAlsoRemote] = useState(true);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [discardTarget, setDiscardTarget] = useState<string | null>(null);

  // Stage-all state
  const [stagingAll, setStagingAll] = useState(false);
  const [unstagingAll, setUnstagingAll] = useState(false);

  // Persist viewed/collapsed per-cwd
  const storageKey = `dpn-view:${cwd}`;
  const restoredRef = useRef(false);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const s = JSON.parse(raw);
        if (Array.isArray(s.viewed)) setViewedFiles(new Set(s.viewed));
        if (Array.isArray(s.collapsed)) setCollapsedFiles(new Set(s.collapsed));
        if (s.viewMode === "split" || s.viewMode === "unified") setViewMode(s.viewMode);
      }
    } catch {}
    restoredRef.current = true;
  }, [storageKey]);
  useEffect(() => {
    if (!restoredRef.current) return;
    try {
      localStorage.setItem(storageKey, JSON.stringify({
        viewed: [...viewedFiles],
        collapsed: [...collapsedFiles],
        viewMode,
      }));
    } catch {}
  }, [viewedFiles, collapsedFiles, viewMode, storageKey]);

  // ── Load status ──────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [entries, branch, branchList, stats, remote] = await Promise.all([
        invoke<FileEntry[]>("git_status", { path: cwd }),
        invoke<string>("get_git_branch", { path: cwd }).catch(() => ""),
        invoke<BranchInfo[]>("git_list_branches", { repoPath: cwd }).catch(() => []),
        invoke<FileStats[]>("git_numstat", { repoPath: cwd }).catch(() => [] as FileStats[]),
        invoke<string>("git_remote_url", { path: cwd }).catch(() => ""),
      ]);
      setCurrentBranch(branch);
      setBranches(branchList.filter((b) => !b.is_worktree));
      setRemoteUrl(remote);
      const map: Record<string, { adds: number; dels: number }> = {};
      for (const s of stats) map[s.path] = { adds: s.adds, dels: s.dels };
      setStatsMap(map);
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

  useEffect(() => {
    if (!hidden) load();
  }, [cwd, gitRevision, hidden]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Prefetch diffs in parallel ───────────────────────────────────────────
  const loadDiff = useCallback(async (path: string, section: FileSection, isUntracked: boolean) => {
    const key = cacheKey(path, section);
    setDiffCache((c) => ({ ...c, [key]: { lines: c[key]?.lines ?? [], loading: true } }));
    try {
      const lines = await invoke<DiffLine[]>("git_diff_file", {
        path: cwd, filePath: path, staged: section === "staged", untracked: isUntracked,
      });
      setDiffCache((c) => ({ ...c, [key]: { lines, loading: false } }));
    } catch {
      setDiffCache((c) => ({ ...c, [key]: { lines: [], loading: false } }));
    }
  }, [cwd]);

  // Fire diffs for every file that doesn't have one cached / isn't already loading.
  useEffect(() => {
    if (hidden) return;
    for (const f of unstaged) {
      const key = cacheKey(f.path, "unstaged");
      if (!diffCache[key]) loadDiff(f.path, "unstaged", f.xy === "??");
    }
    for (const f of staged) {
      const key = cacheKey(f.path, "staged");
      if (!diffCache[key]) loadDiff(f.path, "staged", false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [staged, unstaged, hidden]);

  // Invalidate cache when the tree revision moves.
  useEffect(() => {
    setDiffCache({});
  }, [gitRevision, cwd]);

  useEffect(() => { setCommentingRange(null); setCommentDraft(""); }, [cwd]);

  // ── Staging actions ──────────────────────────────────────────────────────
  const stageFile = async (path: string) => {
    try { await invoke("git_stage", { repoPath: cwd, filePath: path }); } catch {}
    await load();
  };
  const unstageFile = async (path: string) => {
    try { await invoke("git_unstage", { repoPath: cwd, filePath: path }); } catch {}
    await load();
  };
  const discardFile = async (path: string) => {
    const isUntracked = unstaged.find((f) => f.path === path)?.xy === "??";
    setDiscardTarget(null);
    try { await invoke("git_discard", { repoPath: cwd, filePath: path, untracked: isUntracked }); } catch {}
    await load();
  };
  const stageAll = async () => {
    setStagingAll(true);
    try { await invoke("git_stage", { repoPath: cwd, filePath: "." }); } catch {}
    finally { setStagingAll(false); }
    await load();
  };
  const unstageAll = async () => {
    setUnstagingAll(true);
    try { await invoke("git_unstage", { repoPath: cwd, filePath: "." }); } catch {}
    finally { setUnstagingAll(false); }
    await load();
  };

  // ── Commit / push ─────────────────────────────────────────────────────────
  const commitStaged = async () => {
    if (!commitTitle.trim() || staged.length === 0 || commitState === "committing") return;
    setCommitState("committing");
    let msg = commitTitle.trim();
    if (commitDesc.trim()) msg += "\n\n" + commitDesc.trim();
    if (coauthor) msg += "\n\n" + COAUTHOR_LINE;
    try {
      await invoke("git_commit_staged", { repoPath: cwd, message: msg });
      setCommitTitle(""); setCommitDesc("");
      setCommitState("done");
      await load();
      setTimeout(() => setCommitState("idle"), 1500);
    } catch (e) {
      setError(String(e));
      setCommitState("error");
      setTimeout(() => setCommitState("idle"), 3000);
    }
  };

  const pushToCurrent = useCallback(() => {
    setPushState("pushing"); setPushError(null);
    invoke<string>("git_push_current_branch", { repoPath: cwd })
      .then(() => { setPushState("done"); load(); setTimeout(() => setPushState("idle"), 2000); })
      .catch((e) => { setPushState("idle"); setPushError(String(e)); setTimeout(() => setPushError(null), 4000); });
  }, [cwd, load]);

  const pushToNewBranch = useCallback(() => {
    if (!newBranchName.trim() || branchPushState === "pushing") return;
    setBranchPushState("pushing"); setPushError(null);
    invoke<string>("git_create_push_branch", { repoPath: cwd, branchName: newBranchName.trim() })
      .then((raw) => {
        const { remoteUrl, branch } = JSON.parse(raw) as { remoteUrl: string; branch: string };
        setCurrentBranch(branch); setShowBranchInput(false); setNewBranchName("");
        setBranchPushState("done");
        openUrl(buildPrUrl(remoteUrl, branch)).catch(() => {});
        load();
        setTimeout(() => setBranchPushState("idle"), 2000);
      })
      .catch((e) => {
        setBranchPushState("error"); setPushError(String(e));
        setTimeout(() => { setBranchPushState("idle"); setPushError(null); }, 4000);
      });
  }, [cwd, newBranchName, branchPushState, load]);

  const openPrPage = () => {
    if (!remoteUrl || !currentBranch) return;
    openUrl(buildPrUrl(remoteUrl, currentBranch)).catch(() => {});
  };

  const switchBranch = async (name: string) => {
    setShowBranchMenu(false);
    try { await invoke("git_switch_branch", { repoPath: cwd, branch: name }); await load(); }
    catch (e) { setError(String(e)); }
  };
  const confirmDelete = async (force: boolean) => {
    if (!deleteTarget) return;
    setDeleteError(null);
    try {
      await invoke("git_delete_branch", { repoPath: cwd, branch: deleteTarget, force, deleteRemote: deleteAlsoRemote });
      setDeleteTarget(null); await load();
    } catch (e) { setDeleteError(String(e)); }
  };

  // ── Comments ─────────────────────────────────────────────────────────────
  const submitComment = (hunkLines: DiffLine[]) => {
    const text = commentDraft.trim();
    if (!text || !commentingRange) return;
    const { hunkIdx, startLi, endLi, startLineNum, endLineNum, filePath } = commentingRange;
    const startKey = `h${hunkIdx}l${startLi}`;
    const endKey = `h${hunkIdx}l${endLi}`;
    const quote = hunkLines.slice(startLi, endLi + 1).map(l => l.content).join("\n");
    addComment(cwd, { file: filePath, startLineKey: startKey, endLineKey: endKey, startLine: startLineNum, endLine: endLineNum, quote, body: text });
    setCommentDraft(""); setCommentingRange(null);
  };
  const sendCommentsToAgent = () => {
    const targetId = selectedAgentId || agentSessions[0]?.id;
    if (!targetId || comments.length === 0) return;
    const bytes = Array.from(new TextEncoder().encode(composeMessage(comments) + "\r"));
    invoke("write_to_pty", { sessionId: targetId, data: bytes }).catch(() => {});
    sessionManager.markUserInput(targetId);
    clearComments(cwd);
    setSelectedAgentId("");
  };

  // ── Derived ──────────────────────────────────────────────────────────────
  const canCommit = staged.length > 0 && commitTitle.trim().length > 0;
  const localBranches = branches.filter((b) => !b.is_remote);
  const remoteBranches = branches.filter((b) => b.is_remote);
  const branchList = branchTab === "local" ? localBranches : remoteBranches;

  const totalStats = useMemo(() => {
    let a = 0, d = 0;
    for (const p of Object.keys(statsMap)) { a += statsMap[p].adds; d += statsMap[p].dels; }
    return { adds: a, dels: d };
  }, [statsMap]);

  const matchesFilter = (path: string) => !filter.trim() || path.toLowerCase().includes(filter.trim().toLowerCase());

  // ── Helpers ──────────────────────────────────────────────────────────────
  const toggleCollapsed = (path: string) => {
    setCollapsedFiles((s) => {
      const n = new Set(s);
      if (n.has(path)) n.delete(path); else n.add(path);
      return n;
    });
  };
  const toggleViewed = (path: string) => {
    setViewedFiles((s) => {
      const n = new Set(s);
      if (n.has(path)) n.delete(path); else n.add(path);
      return n;
    });
  };
  const toggleSection = (sec: FileSection) => {
    setSectionCollapsed((s) => {
      const n = new Set(s);
      if (n.has(sec)) n.delete(sec); else n.add(sec);
      return n;
    });
  };
  const collapseAll = () => setCollapsedFiles(new Set([...staged, ...unstaged].map((f) => f.path)));
  const expandAll = () => setCollapsedFiles(new Set());

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="diff-pane dpn" style={hidden ? { display: "none" } : {}}>

      {error && (
        <div className="dp-error-banner">
          <span>{error}</span>
          <button onClick={() => setError(null)}><X size={12} /></button>
        </div>
      )}
      {pushError && <div className="dp-error-banner dp-error-banner--push">{pushError}</div>}

      {/* ── Top toolbar ─────────────────────────────────────────────────── */}
      <div className="dpn-toolbar">
        <div className="dpn-branch-anchor">
          <button
            className={`dv-branch-pill${showBranchMenu ? " open" : ""}`}
            onClick={() => setShowBranchMenu((v) => !v)}
          >
            <GitBranch size={11} />
            <span className="dv-branch-name">{currentBranch || "branch"}</span>
            <ChevronDown size={10} className={`dv-pill-chevron${showBranchMenu ? " open" : ""}`} />
          </button>
          {showBranchMenu && (
            <>
              <div className="dpn-branch-backdrop" onClick={() => setShowBranchMenu(false)} />
              <div className="dpn-branch-popover" role="dialog" aria-label="Switch branch">
                <BranchMenu
                  branches={branchList}
                  tab={branchTab}
                  onSetTab={setBranchTab}
                  onSwitch={switchBranch}
                  onDelete={(name) => { setDeleteTarget(name); setShowBranchMenu(false); }}
                />
              </div>
            </>
          )}
        </div>

        <div className="dpn-push">
          <PushControls
            currentBranch={currentBranch}
            pushState={pushState}
            branchPushState={branchPushState}
            showBranchInput={showBranchInput}
            newBranchName={newBranchName}
            onSetShowBranchInput={setShowBranchInput}
            onSetNewBranchName={setNewBranchName}
            onPushCurrent={pushToCurrent}
            onPushNewBranch={pushToNewBranch}
          />
        </div>

        {remoteUrl && currentBranch && !showBranchInput && (
          <Tooltip content={`Open pull request page for ${currentBranch}`} placement="bottom">
            <button className="dpn-icon-btn" onClick={openPrPage} aria-label="Open PR page">
              <FileText size={12} />
            </button>
          </Tooltip>
        )}

        <div className="dpn-spacer" />

        <Tooltip content="Filter files" placement="bottom">
          <button className={`dpn-icon-btn${showSearch ? " active" : ""}`} onClick={() => setShowSearch((v) => !v)} aria-label="Filter">
            <Search size={12} />
          </button>
        </Tooltip>

        <Tooltip content="Reload" placement="bottom">
          <button className={`dpn-icon-btn${loading ? " spinning" : ""}`} disabled={loading} onClick={load} aria-label="Reload">
            <RefreshCw size={12} />
          </button>
        </Tooltip>
      </div>

      {showSearch && (
        <div className="dpn-search">
          <Search size={11} />
          <input
            autoFocus
            placeholder="Filter files by path"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Escape") { setFilter(""); setShowSearch(false); } }}
          />
          {filter && <button onClick={() => setFilter("")}><X size={11} /></button>}
        </div>
      )}

      {/* ── Meta strip ──────────────────────────────────────────────────── */}
      <div className="dpn-meta">
        <span className="dpn-meta-item">
          <span className="dpn-meta-count">{staged.length + unstaged.length}</span>
          <span className="dpn-meta-label">files</span>
        </span>
        <span className="dpn-meta-item dpn-meta-stats">
          <span className="dv-adds">+{totalStats.adds}</span>
          <span className="dv-dels">−{totalStats.dels}</span>
        </span>
        <span className={`dpn-meta-item dpn-meta-staged${staged.length > 0 ? " has-staged" : ""}`}>
          <span className="dpn-meta-count">{staged.length}</span>
          <span className="dpn-meta-label">staged</span>
        </span>

        <div className="dpn-spacer" />

        <div className="dpn-seg" role="tablist" aria-label="Diff view">
          <Tooltip content="Unified view" placement="bottom">
            <button
              className={`dpn-seg-btn${viewMode === "unified" ? " active" : ""}`}
              onClick={() => setViewMode("unified")}
              aria-label="Unified view"
            ><Rows size={11} /></button>
          </Tooltip>
          <Tooltip content="Split view" placement="bottom">
            <button
              className={`dpn-seg-btn${viewMode === "split" ? " active" : ""}`}
              onClick={() => setViewMode("split")}
              aria-label="Split view"
            ><Columns size={11} /></button>
          </Tooltip>
        </div>

        <Tooltip content={collapsedFiles.size > 0 ? "Expand all files" : "Collapse all files"} placement="bottom">
          <button
            className="dpn-meta-btn"
            onClick={collapsedFiles.size > 0 ? expandAll : collapseAll}
            aria-label={collapsedFiles.size > 0 ? "Expand all files" : "Collapse all files"}
          >
            {collapsedFiles.size > 0 ? <UnfoldVertical size={12} /> : <FoldVertical size={12} />}
          </button>
        </Tooltip>
      </div>

      {/* ── Body ────────────────────────────────────────────────────────── */}
      <div className="dpn-body">
        <div className="dpn-scroll">

            {/* Empty state */}
            {staged.length === 0 && unstaged.length === 0 && !loading && (
              <div className="dpn-empty">
                <Check size={20} />
                <div>Working tree clean.</div>
                <div className="dpn-empty-sub">No changes to commit on <b>{currentBranch || "this branch"}</b>.</div>
              </div>
            )}

            {loading && staged.length === 0 && unstaged.length === 0 && (
              <div className="dpn-loading"><Loader size={16} className="dp-spin" /></div>
            )}

            {/* Unstaged section */}
            {unstaged.length > 0 && (
              <DiffSection
                title="Unstaged"
                count={unstaged.length}
                collapsed={sectionCollapsed.has("unstaged")}
                onToggle={() => toggleSection("unstaged")}
                actionLabel="Stage all"
                onAction={stageAll}
                actionDisabled={stagingAll || unstagingAll}
              >
                {unstaged.filter((f) => matchesFilter(f.path)).map((f) => (
                  <FileCard
                    key={`u-${f.path}`}
                    file={f}
                    section="unstaged"
                    stats={statsMap[f.path]}
                    collapsed={collapsedFiles.has(f.path)}
                    viewed={viewedFiles.has(f.path)}
                    onToggleCollapsed={() => toggleCollapsed(f.path)}
                    onToggleViewed={() => toggleViewed(f.path)}
                    onStage={() => stageFile(f.path)}
                    onUnstage={() => unstageFile(f.path)}
                    onDiscard={() => setDiscardTarget(f.path)}
                    diff={diffCache[cacheKey(f.path, "unstaged")]}
                    viewMode={viewMode}
                    comments={comments}
                    commentingRange={commentingRange}
                    setCommentingRange={setCommentingRange}
                    commentDraft={commentDraft}
                    setCommentDraft={setCommentDraft}
                    submitComment={submitComment}
                    onRemoveComment={(id) => removeComment(cwd, id)}
                  />
                ))}
              </DiffSection>
            )}

            {/* Staged section */}
            {staged.length > 0 && (
              <DiffSection
                title="Staged"
                count={staged.length}
                collapsed={sectionCollapsed.has("staged")}
                onToggle={() => toggleSection("staged")}
                actionLabel="Unstage all"
                onAction={unstageAll}
                actionDisabled={stagingAll || unstagingAll}
                accent="staged"
              >
                {staged.filter((f) => matchesFilter(f.path)).map((f) => (
                  <FileCard
                    key={`s-${f.path}`}
                    file={f}
                    section="staged"
                    stats={statsMap[f.path]}
                    collapsed={collapsedFiles.has(f.path)}
                    viewed={viewedFiles.has(f.path)}
                    onToggleCollapsed={() => toggleCollapsed(f.path)}
                    onToggleViewed={() => toggleViewed(f.path)}
                    onStage={() => stageFile(f.path)}
                    onUnstage={() => unstageFile(f.path)}
                    onDiscard={() => setDiscardTarget(f.path)}
                    diff={diffCache[cacheKey(f.path, "staged")]}
                    viewMode={viewMode}
                    comments={comments}
                    commentingRange={commentingRange}
                    setCommentingRange={setCommentingRange}
                    commentDraft={commentDraft}
                    setCommentDraft={setCommentDraft}
                    submitComment={submitComment}
                    onRemoveComment={(id) => removeComment(cwd, id)}
                  />
                ))}
              </DiffSection>
            )}

          </div>

        {/* ── Commit rail ─────────────────────────────────────────────── */}
        {(staged.length + unstaged.length > 0) && (
          <div className="dpn-commit-rail">
            <div className="dpn-commit-rail-hdr">
              <div className="dpn-commit-rail-title">
                <GitCommit size={12} />
                <span>Commit</span>
              </div>
              <span className={`dpn-commit-rail-count${staged.length > 0 ? " has-staged" : ""}`}>
                {staged.length} staged
              </span>
            </div>
            {staged.length === 0 ? (
              <div className="dpn-commit-empty">
                <div className="dpn-commit-empty-icon"><GitCommit size={16} /></div>
                <div className="dpn-commit-empty-title">Nothing staged yet</div>
                <div className="dpn-commit-empty-body">
                  Stage a file to prepare your commit.
                </div>
              </div>
            ) : (
              <CommitBox
                commitTitle={commitTitle}
                commitDesc={commitDesc}
                commitState={commitState}
                coauthor={coauthor}
                canCommit={canCommit}
                stagedCount={staged.length}
                onTitleChange={setCommitTitle}
                onDescChange={setCommitDesc}
                onCommit={commitStaged}
              />
            )}
          </div>
        )}
      </div>

      <CommentBar
        count={comments.length}
        agentSessions={agentSessions}
        selectedAgentId={selectedAgentId}
        onSelectAgent={setSelectedAgentId}
        onClear={() => clearComments(cwd)}
        onSend={sendCommentsToAgent}
      />

      <DiscardFileDialog
        path={discardTarget}
        onConfirm={discardFile}
        onCancel={() => setDiscardTarget(null)}
      />

      <DeleteBranchDialog
        branch={deleteTarget}
        alsoRemote={deleteAlsoRemote}
        error={deleteError}
        onSetAlsoRemote={setDeleteAlsoRemote}
        onCancel={() => { setDeleteTarget(null); setDeleteError(null); }}
        onDelete={confirmDelete}
      />
    </div>
  );
}

// ── Section wrapper ────────────────────────────────────────────────────────────

function DiffSection({
  title, count, collapsed, onToggle, children, actionLabel, onAction, actionDisabled, accent,
}: {
  title: string;
  count: number;
  collapsed: boolean;
  onToggle: () => void;
  children: React.ReactNode;
  actionLabel?: string;
  onAction?: () => void;
  actionDisabled?: boolean;
  accent?: "staged";
}) {
  return (
    <div className={`dpn-section${accent ? ` dpn-section--${accent}` : ""}`}>
      <div className="dpn-section-hdr">
        <button className="dpn-section-toggle" onClick={onToggle}>
          {collapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
          <span className="dpn-section-title">{title}</span>
          <span className="dpn-section-count">{count}</span>
        </button>
        {actionLabel && (
          <button className="dpn-section-action" onClick={onAction} disabled={actionDisabled}>
            {actionLabel}
          </button>
        )}
      </div>
      {!collapsed && <div className="dpn-section-body">{children}</div>}
    </div>
  );
}

// ── FileCard ──────────────────────────────────────────────────────────────────

interface FileCardProps {
  file: FileEntry;
  section: FileSection;
  stats?: { adds: number; dels: number };
  collapsed: boolean;
  viewed: boolean;
  onToggleCollapsed: () => void;
  onToggleViewed: () => void;
  onStage: () => void;
  onUnstage: () => void;
  onDiscard: () => void;
  diff?: DiffCacheEntry;
  viewMode: ViewMode;
  comments: ReturnType<typeof useComments>;
  commentingRange: any;
  setCommentingRange: (r: any) => void;
  commentDraft: string;
  setCommentDraft: (v: string) => void;
  submitComment: (lines: DiffLine[]) => void;
  onRemoveComment: (id: string) => void;
}

function FileCard(props: FileCardProps) {
  const { file, section, stats, collapsed, viewed, onToggleCollapsed, onToggleViewed,
    onStage, onUnstage, onDiscard, diff } = props;

  const dir = file.path.includes("/") ? file.path.substring(0, file.path.lastIndexOf("/") + 1) : "";
  const fname = file.path.split("/").pop() ?? file.path;
  const hunks = diff ? groupHunks(diff.lines) : [];
  const bodyHidden = collapsed || viewed;

  return (
    <div className={`dpn-file${viewed ? " viewed" : ""}${collapsed ? " collapsed" : ""}`}>
      <div
        className="dpn-file-hdr"
        onClick={onToggleCollapsed}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onToggleCollapsed(); } }}
        title={collapsed ? "Expand" : "Collapse"}
      >
        <button className="dpn-file-collapse" onClick={(e) => { e.stopPropagation(); onToggleCollapsed(); }} title={collapsed ? "Expand" : "Collapse"}>
          {collapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
        </button>
        <span className={`dv-fstatus ${statusClass(file.status)}`}>{file.status}</span>
        <span className="dpn-file-path">
          {dir && <span className="dv-fdir">{dir}</span>}
          <span className="dv-fname">{fname}</span>
        </span>
        {stats && (
          <span className="dv-fstats">
            {stats.adds > 0 && <span className="dv-adds">+{stats.adds}</span>}
            {stats.dels > 0 && <span className="dv-dels">-{stats.dels}</span>}
          </span>
        )}
        <div className="dpn-file-actions" onClick={(e) => e.stopPropagation()}>
          <Tooltip content={viewed ? "Mark unread" : "Mark viewed"} placement="top">
            <button className={`dpn-file-btn${viewed ? " on" : ""}`} onClick={onToggleViewed}>
              <Eye size={11} />
            </button>
          </Tooltip>
          {section === "staged" ? (
            <button className="dpn-file-btn dpn-file-btn--action" onClick={onUnstage}>Unstage</button>
          ) : (
            <button className="dpn-file-btn dpn-file-btn--action" onClick={onStage}>Stage</button>
          )}
          {section === "unstaged" && (
            <Tooltip content="Discard changes" placement="top">
              <button className="dpn-file-btn dpn-file-btn--danger" onClick={onDiscard}>
                <Trash2 size={11} />
              </button>
            </Tooltip>
          )}
        </div>
      </div>

      {!bodyHidden && (
        <div className="dpn-file-body">
          {!diff || diff.loading ? (
            <div className="dpn-file-loading"><Loader size={13} className="dp-spin" /> loading diff…</div>
          ) : hunks.length === 0 ? (
            <div className="dpn-file-empty">No hunks — file may be binary or unchanged.</div>
          ) : (
            hunks.map((hunk, i) => (
              <HunkView
                key={i}
                {...props}
                hunk={hunk}
                hunkIdx={i}
                filePath={file.path}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
}

// ── HunkView ──────────────────────────────────────────────────────────────────

interface HunkViewProps extends FileCardProps {
  hunk: Hunk;
  hunkIdx: number;
  filePath: string;
}

function HunkView(props: HunkViewProps) {
  const { hunk, hunkIdx, filePath, section, viewMode,
    comments, commentingRange, setCommentingRange, commentDraft, setCommentDraft, submitComment, onRemoveComment } = props;
  const key = cacheKey(filePath, section);
  const startComment = (li: number, endLi: number = li) => {
    const first = hunk.lines[li];
    const last = hunk.lines[endLi];
    const startLineNum = first.line_new ?? first.line_old ?? 1;
    const endLineNum = last.line_new ?? last.line_old ?? startLineNum;
    setCommentingRange({ key, hunkIdx, startLi: li, endLi, startLineNum, endLineNum, filePath });
    setCommentDraft("");
  };
  const commentingHere = commentingRange && commentingRange.key === key && commentingRange.hunkIdx === hunkIdx;

  return (
    <div className="dpn-hunk">
      <div className="dpn-hunk-hdr">
        <span className="dpn-hunk-range">{hunk.header.content}</span>
        <div className="dpn-hunk-actions">
          <Tooltip content="Comment on this hunk" placement="top">
            <button className="dpn-hunk-btn" onClick={() => startComment(0, hunk.lines.length - 1)} aria-label="Comment on hunk">
              <Plus size={10} />
            </button>
          </Tooltip>
        </div>
      </div>

      {viewMode === "unified" ? (
        <UnifiedHunk
          hunk={hunk} hunkIdx={hunkIdx} filePath={filePath}
          commentingHere={commentingHere} commentingRange={commentingRange}
          setCommentingRange={setCommentingRange}
          commentDraft={commentDraft} setCommentDraft={setCommentDraft}
          submitComment={submitComment} startComment={startComment}
          comments={comments} onRemoveComment={onRemoveComment}
        />
      ) : (
        <SplitHunk
          hunk={hunk} hunkIdx={hunkIdx} filePath={filePath}
          commentingHere={commentingHere} commentingRange={commentingRange}
          setCommentingRange={setCommentingRange}
          commentDraft={commentDraft} setCommentDraft={setCommentDraft}
          submitComment={submitComment} startComment={startComment}
          comments={comments} onRemoveComment={onRemoveComment}
        />
      )}
    </div>
  );
}

// ── Unified renderer ──────────────────────────────────────────────────────────

interface HunkRenderProps {
  hunk: Hunk;
  hunkIdx: number;
  filePath: string;
  commentingHere: any;
  commentingRange: any;
  setCommentingRange: (r: any) => void;
  commentDraft: string;
  setCommentDraft: (v: string) => void;
  submitComment: (lines: DiffLine[]) => void;
  startComment: (li: number, endLi?: number) => void;
  comments: ReturnType<typeof useComments>;
  onRemoveComment: (id: string) => void;
}

function UnifiedHunk(p: HunkRenderProps) {
  return (
    <div className="dpn-hunk-body">
      {p.hunk.lines.map((line, li) => (
        <LineRow
          key={li} line={line} li={li}
          hunk={p.hunk} hunkIdx={p.hunkIdx} filePath={p.filePath}
          commentingHere={p.commentingHere} commentingRange={p.commentingRange}
          setCommentingRange={p.setCommentingRange}
          commentDraft={p.commentDraft} setCommentDraft={p.setCommentDraft}
          submitComment={p.submitComment} startComment={p.startComment}
          comments={p.comments} onRemoveComment={p.onRemoveComment}
        />
      ))}
    </div>
  );
}

// ── Split renderer ────────────────────────────────────────────────────────────

interface Row { left?: { line: DiffLine; li: number }; right?: { line: DiffLine; li: number } }

function pairHunkLines(lines: DiffLine[]): Row[] {
  const rows: Row[] = [];
  let i = 0;
  while (i < lines.length) {
    const l = lines[i];
    if (l.kind === "context") { rows.push({ left: { line: l, li: i }, right: { line: l, li: i } }); i++; }
    else if (l.kind === "removed" || l.kind === "added") {
      const removes: { line: DiffLine; li: number }[] = [];
      const adds: { line: DiffLine; li: number }[] = [];
      while (i < lines.length && lines[i].kind === "removed") { removes.push({ line: lines[i], li: i }); i++; }
      while (i < lines.length && lines[i].kind === "added") { adds.push({ line: lines[i], li: i }); i++; }
      const n = Math.max(removes.length, adds.length);
      for (let k = 0; k < n; k++) rows.push({ left: removes[k], right: adds[k] });
    } else {
      i++;
    }
  }
  return rows;
}

function SplitHunk(p: HunkRenderProps) {
  const rows = useMemo(() => pairHunkLines(p.hunk.lines), [p.hunk]);
  return (
    <div className="dpn-hunk-body dpn-hunk-body--split">
      {rows.map((row, ri) => (
        <div key={ri} className="dpn-split-row">
          <SplitSide side="left" cell={row.left} {...p} />
          <SplitSide side="right" cell={row.right} {...p} />
        </div>
      ))}
      {/* Inline comment form spans full width if active on this hunk */}
      {p.commentingHere && (
        <div className="dpn-split-comment">
          <CommentForm
            hunkLines={p.hunk.lines}
            commentingRange={p.commentingRange}
            setCommentingRange={p.setCommentingRange}
            commentDraft={p.commentDraft} setCommentDraft={p.setCommentDraft}
            submitComment={p.submitComment}
          />
        </div>
      )}
    </div>
  );
}

function SplitSide({ side, cell, ...p }: HunkRenderProps & { side: "left" | "right"; cell?: { line: DiffLine; li: number } }) {
  if (!cell) return <div className="dpn-split-cell empty" />;
  const { line, li } = cell;
  const lineNum = side === "left" ? line.line_old : line.line_new;
  const lineNotes = p.comments.filter((c: any) => c.file === p.filePath && c.endLineKey === `h${p.hunkIdx}l${li}`);
  return (
    <div className={`dpn-split-cell diff-${line.kind}`}>
      <button
        className="diff-comment-btn"
        title="Add comment"
        onClick={() => p.startComment(li, li)}
      >
        <Plus size={9} />
      </button>
      <span className="diff-num">{lineNum ?? ""}</span>
      <span className="diff-content">{line.content}</span>
      {lineNotes.map((note: any) => (
        <div key={note.id} className="diff-placed-comment">
          <span className="diff-placed-comment-text">{note.body}</span>
          <button className="diff-placed-comment-remove" onClick={() => p.onRemoveComment(note.id)}>
            <X size={9} />
          </button>
        </div>
      ))}
    </div>
  );
}

// ── LineRow (unified) ────────────────────────────────────────────────────────

function LineRow(p: HunkRenderProps & { line: DiffLine; li: number }) {
  const { line, li, hunk, hunkIdx, filePath, commentingRange, comments } = p;
  const lineKey = `h${hunkIdx}l${li}`;
  const lineNotes = comments.filter((c: any) => c.file === filePath && c.endLineKey === lineKey);
  const inRange = commentingRange?.filePath === filePath && commentingRange?.hunkIdx === hunkIdx
    && li >= commentingRange.startLi && li <= commentingRange.endLi;
  const isRangeEnd = commentingRange?.filePath === filePath && commentingRange?.hunkIdx === hunkIdx && li === commentingRange.endLi;
  const isSingleActive = commentingRange?.filePath === filePath && commentingRange?.hunkIdx === hunkIdx
    && commentingRange.startLi === li && commentingRange.endLi === li;
  const lineNum = line.line_new ?? line.line_old ?? li + 1;

  return (
    <div className="diff-line-wrap">
      <div className={`diff-line diff-${line.kind}${inRange ? " diff-line-selected" : ""}`}>
        <button
          className={`diff-comment-btn${isSingleActive ? " active" : ""}`}
          type="button"
          title={isSingleActive ? "Shift+click to extend range" : "Add comment · Shift+click to select range"}
          onClick={(e) => {
            if (commentingRange?.filePath === filePath && commentingRange?.hunkIdx === hunkIdx && e.shiftKey) {
              const newStart = Math.min(commentingRange.startLi, li);
              const newEnd = Math.max(commentingRange.endLi, li);
              const newStartNum = newStart === commentingRange.startLi ? commentingRange.startLineNum : lineNum;
              const newEndNum = newEnd === commentingRange.endLi ? commentingRange.endLineNum : lineNum;
              p.setCommentingRange({ ...commentingRange, startLi: newStart, endLi: newEnd, startLineNum: newStartNum, endLineNum: newEndNum });
            } else if (isSingleActive) {
              p.setCommentingRange(null); p.setCommentDraft("");
            } else {
              p.startComment(li, li);
            }
          }}
        >
          <Plus size={9} />
        </button>
        <span className="diff-num">{line.line_old ?? ""}</span>
        <span className="diff-num">{line.line_new ?? ""}</span>
        <span className="diff-content">{line.content}</span>
      </div>
      {lineNotes.map((note: any) => (
        <div key={note.id} className="diff-placed-comment">
          <span className="diff-placed-comment-meta">
            {note.startLine === note.endLine ? `line ${note.startLine}` : `lines ${note.startLine}–${note.endLine}`}
          </span>
          <span className="diff-placed-comment-text">{note.body}</span>
          <button className="diff-placed-comment-remove" onClick={() => p.onRemoveComment(note.id)}>
            <X size={9} />
          </button>
        </div>
      ))}
      {isRangeEnd && (
        <CommentForm
          hunkLines={hunk.lines}
          commentingRange={commentingRange}
          setCommentingRange={p.setCommentingRange}
          commentDraft={p.commentDraft} setCommentDraft={p.setCommentDraft}
          submitComment={p.submitComment}
        />
      )}
    </div>
  );
}

// ── CommentForm ────────────────────────────────────────────────────────────────

function CommentForm({
  hunkLines, commentingRange, setCommentingRange, commentDraft, setCommentDraft, submitComment,
}: {
  hunkLines: DiffLine[];
  commentingRange: any;
  setCommentingRange: (r: any) => void;
  commentDraft: string;
  setCommentDraft: (v: string) => void;
  submitComment: (lines: DiffLine[]) => void;
}) {
  if (!commentingRange) return null;
  return (
    <div className="diff-comment-form" onClick={(e) => e.stopPropagation()}>
      <div className="diff-comment-form-hdr">
        <span className="diff-comment-form-who">You</span>
        <span className="diff-comment-form-line">
          {commentingRange.startLineNum === commentingRange.endLineNum
            ? `· line ${commentingRange.startLineNum}`
            : `· lines ${commentingRange.startLineNum}–${commentingRange.endLineNum}`}
        </span>
      </div>
      <textarea
        className="diff-comment-textarea"
        placeholder="Leave a comment…"
        value={commentDraft}
        onChange={(e) => setCommentDraft(e.target.value)}
        autoFocus
        rows={2}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); submitComment(hunkLines); }
          if (e.key === "Escape") { setCommentingRange(null); setCommentDraft(""); }
        }}
      />
      <div className="diff-comment-form-actions">
        <button className="diff-comment-cancel" onClick={() => { setCommentingRange(null); setCommentDraft(""); }}>
          Cancel
        </button>
        <button
          className={`diff-comment-submit${commentDraft.trim() ? " ready" : ""}`}
          disabled={!commentDraft.trim()}
          onClick={() => submitComment(hunkLines)}
        >
          Comment
        </button>
      </div>
    </div>
  );
}
