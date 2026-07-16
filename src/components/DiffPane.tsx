import { useState, useEffect, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import {
  RefreshCw, GitBranch, Loader,
  Plus, X, ChevronDown,
} from "lucide-react";
import { Tooltip } from "./Tooltip";
import { useAttribution, COAUTHOR_LINE } from "../store/attribution";
import { useComments, addComment, removeComment, clearComments, composeMessage } from "../store/reviewComments";
import { enqueue } from "../store/messageQueue";
import { DiscardFileDialog } from "./DiffPane/DiscardFileDialog";
import { DeleteBranchDialog } from "./DiffPane/DeleteBranchDialog";
import { CommitBox } from "./DiffPane/CommitBox";
import { BranchMenu } from "./DiffPane/BranchMenu";
import { PushControls } from "./DiffPane/PushControls";
import { CommentBar } from "./DiffPane/CommentBar";
import "./DiffPane.css";

// ── Types ─────────────────────────────────────────────────────────────────────

import type { BranchInfo, DiffLine, FileStats } from "../types/git";
import { buildPrUrl, statusClass, groupHunks } from "../lib/git";

interface FileEntry {
  xy: string;
  path: string;
  status: string;
}

interface FileDiff {
  status: string;
  path: string;
  adds: number;
  dels: number;
  lines: DiffLine[];
}

type FileSection = "staged" | "unstaged";

// ── Root ──────────────────────────────────────────────────────────────────────

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

export function DiffPane({ cwd, hidden, gitRevision, agentSessions = [] }: Props) {
  const [staged, setStaged] = useState<FileEntry[]>([]);
  const [unstaged, setUnstaged] = useState<FileEntry[]>([]);
  const [statsMap, setStatsMap] = useState<Record<string, { adds: number; dels: number }>>({});
  const [selected, setSelected] = useState<{ path: string; section: FileSection } | null>(null);
  const selectedRef = useRef(selected);
  selectedRef.current = selected;

  const [diffLines, setDiffLines] = useState<DiffLine[]>([]);
  const [diffLoading, setDiffLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [allDiffs, setAllDiffs] = useState<FileDiff[]>([]);
  const [allDiffsLoading, setAllDiffsLoading] = useState(false);

  const comments = useComments(cwd);
  const [commentDraft, setCommentDraft] = useState("");
  const [selectedAgentId, setSelectedAgentId] = useState<string>("");

  interface CommentingRange {
    filePath: string;
    hunkIdx: number;
    startLi: number;
    endLi: number;
    startLineNum: number;
    endLineNum: number;
  }
  const [commentingRange, setCommentingRange] = useState<CommentingRange | null>(null);
  const [stagingAll, setStagingAll] = useState(false);
  const [unstagingAll, setUnstagingAll] = useState(false);
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
  const [branchTab, setBranchTab] = useState<"local" | "remote">("local");
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [deleteAlsoRemote, setDeleteAlsoRemote] = useState(true);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [discardTarget, setDiscardTarget] = useState<string | null>(null);

  // ── Load file list ───────────────────────────────────────────────────────

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [entries, branch, branchList, stats] = await Promise.all([
        invoke<FileEntry[]>("git_status", { path: cwd }),
        invoke<string>("get_git_branch", { path: cwd }).catch(() => ""),
        invoke<BranchInfo[]>("git_list_branches", { repoPath: cwd }).catch(() => []),
        invoke<FileStats[]>("git_numstat", { repoPath: cwd }).catch(() => [] as FileStats[]),
      ]);
      setCurrentBranch(branch);
      setBranches(branchList.filter((b) => !b.is_worktree));
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

  const loadAllDiffs = useCallback(async () => {
    setAllDiffsLoading(true);
    try {
      const files = await invoke<FileDiff[]>("git_diff", { path: cwd });
      setAllDiffs(files);
    } catch {
      setAllDiffs([]);
    } finally {
      setAllDiffsLoading(false);
    }
  }, [cwd]);

  useEffect(() => {
    if (!hidden) load();
  }, [cwd, gitRevision, hidden]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (hidden || selected || showBranchMenu) return;
    loadAllDiffs();
  }, [hidden, selected, showBranchMenu, cwd, gitRevision, loadAllDiffs]);

  useEffect(() => {
    setCommentingRange(null);
    setCommentDraft("");
  }, [selected?.path, selected?.section]);

  // ── Comments ─────────────────────────────────────────────────────────────

  const submitComment = (hunkLines: DiffLine[]) => {
    const text = commentDraft.trim();
    if (!text || !commentingRange) return;
    const { filePath, hunkIdx, startLi, endLi, startLineNum, endLineNum } = commentingRange;
    const startKey = `h${hunkIdx}l${startLi}`;
    const endKey = `h${hunkIdx}l${endLi}`;
    const quote = hunkLines.slice(startLi, endLi + 1).map(l => l.content).join("\n");
    addComment(cwd, { file: filePath, startLineKey: startKey, endLineKey: endKey, startLine: startLineNum, endLine: endLineNum, quote, body: text });
    setCommentDraft("");
    setCommentingRange(null);
  };

  const sendCommentsToAgent = () => {
    const targetId = selectedAgentId || agentSessions[0]?.id;
    if (!targetId || comments.length === 0) return;
    enqueue(targetId, composeMessage(comments));
    clearComments(cwd);
    setSelectedAgentId("");
  };

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
    setStagingAll(true);
    try { await invoke("git_stage", { repoPath: cwd, filePath: "." }); } catch { /* non-fatal */ }
    finally { setStagingAll(false); }
    await load();
  };

  const unstageAll = async () => {
    setUnstagingAll(true);
    try { await invoke("git_unstage", { repoPath: cwd, filePath: "." }); } catch { /* non-fatal */ }
    finally { setUnstagingAll(false); }
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

  // ── Derived ──────────────────────────────────────────────────────────────

  const allStaged = unstaged.length === 0 && staged.length > 0;
  const activeFile = selected ? [...staged, ...unstaged].find((f) => f.path === selected.path) ?? null : null;
  const hunks = groupHunks(diffLines);
  const localBranches = branches.filter((b) => !b.is_remote);
  const remoteBranches = branches.filter((b) => b.is_remote);
  const branchList = branchTab === "local" ? localBranches : remoteBranches;
  const canCommit = staged.length > 0 && commitTitle.trim().length > 0;

  function renderFileRow(f: FileEntry, section: FileSection) {
    const stats = statsMap[f.path];
    const dir = f.path.includes("/") ? f.path.substring(0, f.path.lastIndexOf("/") + 1) : "";
    const fname = f.path.split("/").pop() ?? f.path;
    const isActive = selected?.path === f.path && selected?.section === section;
    return (
      <div
        key={f.path}
        className={`dv-file-row${isActive ? " active" : ""}`}
        onClick={() => selectFile(f.path, section, f)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === "Enter" && selectFile(f.path, section, f)}
      >
        <span className={`dv-fstatus ${statusClass(f.status)}`}>{f.status}</span>
        <span className="dv-fpath">
          {dir && <span className="dv-fdir">{dir}</span>}
          <span className="dv-fname">{fname}</span>
        </span>
        {stats && (
          <span className="dv-fstats">
            {stats.adds > 0 && <span className="dv-adds">+{stats.adds}</span>}
            {stats.dels > 0 && <span className="dv-dels">-{stats.dels}</span>}
          </span>
        )}
      </div>
    );
  }

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="diff-pane" style={hidden ? { display: "none" } : {}}>

      {error && (
        <div className="dp-error-banner">
          <span>{error}</span>
          <button onClick={() => setError(null)}><X size={12} /></button>
        </div>
      )}
      {pushError && <div className="dp-error-banner dp-error-banner--push">{pushError}</div>}

      <div className="dv-root">

        {/* ── Left: staging + commit panel ── */}
        <div className="dv-panel" style={showBranchMenu ? { display: "none" } : {}}>

          <div className="dv-panel-actions">
            <button
              className={`dv-stage-all-btn${allStaged ? " unstage" : ""}`}
              onClick={allStaged ? unstageAll : stageAll}
              disabled={stagingAll || unstagingAll || (staged.length === 0 && unstaged.length === 0)}
            >
              {(stagingAll || unstagingAll) && <Loader size={10} className="dp-spin" />}
              {allStaged ? "Unstage All" : "Stage All"}
            </button>
            <Tooltip content="Reload" placement="top">
              <button
                className={`dv-reload-btn${loading ? " spinning" : ""}`}
                disabled={loading}
                onClick={load}
              >
                <RefreshCw size={12} />
              </button>
            </Tooltip>
          </div>

          {/* Unstaged section */}
          <div className="dv-panel-sec">
            <div className="dv-panel-label">
              Unstaged
              {unstaged.length > 0 && <span className="dv-panel-count">{unstaged.length}</span>}
            </div>
            <div className="dv-panel-list">
              {unstaged.length > 0
                ? unstaged.map((f) => renderFileRow(f, "unstaged"))
                : <div className="dv-panel-empty">—</div>}
            </div>
          </div>

          {/* Staged section */}
          <div className="dv-panel-sec">
            <div className="dv-panel-label">
              Staged
              {staged.length > 0 && <span className="dv-panel-count">{staged.length}</span>}
            </div>
            <div className="dv-panel-list">
              {staged.length > 0
                ? staged.map((f) => renderFileRow(f, "staged"))
                : <div className="dv-panel-empty">—</div>}
            </div>
          </div>

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
        </div>

        {/* ── Right: branch bar + diff viewer ── */}
        <div className="dv-right" style={showBranchMenu ? { paddingLeft: 0 } : {}}>

          {/* Branch bar */}
          <div className="dv-branch-bar">
            <div className="dv-branch-group">
              <button
                className={`dv-branch-pill${showBranchMenu ? " open" : ""}`}
                onClick={() => setShowBranchMenu((v) => !v)}
              >
                <GitBranch size={11} />
                <span className="dv-branch-name">{currentBranch || "branch"}</span>
                <ChevronDown size={10} className={`dv-pill-chevron${showBranchMenu ? " open" : ""}`} />
              </button>
            </div>

            <div className="dv-branch-push">
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

            <div className="dv-branch-meta">
              <span className="dv-remote-label">↑ origin/{currentBranch}</span>
              <span className="dv-meta-sep">·</span>
              <span className={`dv-staged-label${staged.length > 0 ? " has-staged" : ""}`}>
                {staged.length}/{staged.length + unstaged.length} staged
              </span>
            </div>
          </div>

          {/* Diff viewer / branch list */}
          <div className="dv-viewer">
            {showBranchMenu ? (
              <BranchMenu
                branches={branchList}
                tab={branchTab}
                onSetTab={setBranchTab}
                onSwitch={switchBranch}
                onDelete={(name) => { setDeleteTarget(name); setShowBranchMenu(false); }}
              />
            ) : selected && activeFile ? (
              <>
                <div className="dv-viewer-hdr">
                  <span className="dv-viewer-path">{selected.path}</span>
                  <button
                    className={`dv-file-stage-btn${selected.section === "staged" ? " staged" : ""}`}
                    onClick={() => selected.section === "staged" ? unstageFile(selected.path) : stageFile(selected.path)}
                  >
                    {selected.section === "staged" ? "Unstage file" : "Stage file"}
                  </button>
                </div>
                {diffLoading ? (
                  <div className="dv-diff-center"><Loader size={16} className="dp-spin" /></div>
                ) : hunks.length === 0 ? (
                  <div className="dv-diff-center dv-diff-empty">No diff to display</div>
                ) : (
                    <div className="dv-hunks">
                      {hunks.map((hunk, i) => (
                        <div key={i} className="dv-hunk">
                          <div className="dv-hunk-hdr">
                            <span className="dv-hunk-range">{hunk.header.content}</span>
                            <div className="dv-hunk-actions">
                              <button
                                className="dv-hunk-btn dv-hunk-btn--comment"
                                onClick={() => {
                                  if (hunk.lines.length === 0) return;
                                  const first = hunk.lines[0];
                                  const last = hunk.lines[hunk.lines.length - 1];
                                  setCommentingRange({
                                    filePath: selected.path,
                                    hunkIdx: i,
                                    startLi: 0,
                                    endLi: hunk.lines.length - 1,
                                    startLineNum: first.line_new ?? first.line_old ?? 1,
                                    endLineNum: last.line_new ?? last.line_old ?? hunk.lines.length,
                                  });
                                  setCommentDraft("");
                                }}
                              >
                                Comment on hunk
                              </button>
                              <button
                                className="dv-hunk-btn"
                                onClick={() => selected.section === "staged" ? unstageFile(selected.path) : stageFile(selected.path)}
                              >
                                {selected.section === "staged" ? "Unstage hunk" : "Stage hunk"}
                              </button>
                            </div>
                          </div>
                          <div className="dv-hunk-body">
                            {hunk.lines.map((line, li) => {
                              const lineKey = `h${i}l${li}`;
                              const lineNum = line.line_new ?? line.line_old ?? li + 1;
                              // Notes whose range ends at this line
                              const lineNotes = comments.filter(c => c.file === selected.path && c.endLineKey === lineKey);
                              // Is this line inside the active selection range?
                              const inRange = commentingRange?.filePath === selected.path && commentingRange?.hunkIdx === i
                                && li >= commentingRange.startLi
                                && li <= commentingRange.endLi;
                              // Is this the last line of the active range? (form renders here)
                              const isRangeEnd = commentingRange?.filePath === selected.path && commentingRange?.hunkIdx === i && li === commentingRange.endLi;
                              // Is this exactly a single-line range start/end?
                              const isSingleActive = commentingRange?.filePath === selected.path && commentingRange?.hunkIdx === i
                                && commentingRange.startLi === li
                                && commentingRange.endLi === li;
                              return (
                                <div key={li} className="diff-line-wrap">
                                  {(() => {
                                    const isMultiRange = inRange && commentingRange!.startLi !== commentingRange!.endLi;
                                    const centerLi = isMultiRange
                                      ? Math.floor((commentingRange!.startLi + commentingRange!.endLi) / 2)
                                      : -1;
                                    return (
                                  <div className={`diff-line diff-${line.kind}${inRange ? " diff-line-selected" : ""}`}>
                                    {isMultiRange ? (
                                      li === centerLi ? (
                                        <button
                                          className="diff-comment-btn diff-comment-btn--center"
                                          type="button"
                                          title="Cancel range"
                                          onClick={() => { setCommentingRange(null); setCommentDraft(""); }}
                                        >
                                          <Plus size={9} />
                                        </button>
                                      ) : (
                                        <div className="diff-range-segment" />
                                      )
                                    ) : (
                                      <button
                                        className={`diff-comment-btn${isSingleActive ? " active" : ""}`}
                                        type="button"
                                        title={isSingleActive
                                          ? "Shift+click to extend range"
                                          : "Add comment · Shift+click to select range"}
                                        onClick={(e) => {
                                          if (commentingRange?.filePath === selected.path && commentingRange?.hunkIdx === i && e.shiftKey) {
                                            const newStart = Math.min(commentingRange.startLi, li);
                                            const newEnd = Math.max(commentingRange.endLi, li);
                                            const newStartNum = newStart === commentingRange.startLi
                                              ? commentingRange.startLineNum : lineNum;
                                            const newEndNum = newEnd === commentingRange.endLi
                                              ? commentingRange.endLineNum : lineNum;
                                            setCommentingRange({ filePath: selected.path, hunkIdx: i, startLi: newStart, endLi: newEnd, startLineNum: newStartNum, endLineNum: newEndNum });
                                          } else if (isSingleActive) {
                                            setCommentingRange(null);
                                            setCommentDraft("");
                                          } else {
                                            setCommentingRange({ filePath: selected.path, hunkIdx: i, startLi: li, endLi: li, startLineNum: lineNum, endLineNum: lineNum });
                                            setCommentDraft("");
                                          }
                                        }}
                                      >
                                        <Plus size={9} />
                                      </button>
                                    )}
                                    <span className="diff-num">{line.line_old ?? ""}</span>
                                    <span className="diff-num">{line.line_new ?? ""}</span>
                                    <span className="diff-content">{line.content}</span>
                                  </div>
                                    );
                                  })()}
                                  {lineNotes.map((note) => (
                                    <div key={note.id} className="diff-placed-comment">
                                      <span className="diff-placed-comment-meta">
                                        {note.startLine === note.endLine
                                          ? `line ${note.startLine}`
                                          : `lines ${note.startLine}–${note.endLine}`}
                                      </span>
                                      <span className="diff-placed-comment-text">{note.body}</span>
                                      <button
                                        className="diff-placed-comment-remove"
                                        type="button"
                                        onClick={() => removeComment(cwd, note.id)}
                                      >
                                        <X size={9} />
                                      </button>
                                    </div>
                                  ))}
                                  {isRangeEnd && (
                                    <div className="diff-comment-form" onClick={(e) => e.stopPropagation()}>
                                      <div className="diff-comment-form-hdr">
                                        <span className="diff-comment-form-who">You</span>
                                        <span className="diff-comment-form-line">
                                          {commentingRange.startLineNum === commentingRange.endLineNum
                                            ? `· line ${commentingRange.startLineNum}`
                                            : `· lines ${commentingRange.startLineNum}–${commentingRange.endLineNum}`}
                                        </span>
                                        {commentingRange.startLi !== commentingRange.endLi && (
                                          <span className="diff-comment-form-range-hint">Shift+click to adjust range</span>
                                        )}
                                      </div>
                                      <textarea
                                        className="diff-comment-textarea"
                                        placeholder="Leave a comment…"
                                        value={commentDraft}
                                        onChange={(e) => setCommentDraft(e.target.value)}
                                        autoFocus
                                        rows={2}
                                        onKeyDown={(e) => {
                                          if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                                            e.preventDefault();
                                            submitComment(hunk.lines);
                                          }
                                          if (e.key === "Escape") {
                                            setCommentingRange(null);
                                            setCommentDraft("");
                                          }
                                        }}
                                      />
                                      <div className="diff-comment-form-actions">
                                        <button
                                          className="diff-comment-cancel"
                                          type="button"
                                          onClick={() => { setCommentingRange(null); setCommentDraft(""); }}
                                        >
                                          Cancel
                                        </button>
                                        <button
                                          className={`diff-comment-submit${commentDraft.trim() ? " ready" : ""}`}
                                          type="button"
                                          disabled={!commentDraft.trim()}
                                          onClick={() => submitComment(hunk.lines)}
                                        >
                                          Comment
                                        </button>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
              </>
            ) : allDiffsLoading && allDiffs.length === 0 ? (
              <div className="dv-diff-center"><Loader size={16} className="dp-spin" /></div>
            ) : allDiffs.length === 0 ? (
              <div className="dv-diff-center dv-diff-empty">No changes</div>
            ) : (
              <div className="dv-all-files">
                {allDiffs.map((file) => {
                  const fileHunks = groupHunks(file.lines);
                  return (
                    <div key={file.path} className="dv-file-block">
                      <div className="dv-file-block-hdr">
                        <span className={`dv-fstatus ${statusClass(file.status)}`}>{file.status}</span>
                        <span className="dv-file-block-path">{file.path}</span>
                        <span className="dv-file-block-stats">
                          {file.adds > 0 && <span className="dv-adds">+{file.adds}</span>}
                          {file.dels > 0 && <span className="dv-dels">-{file.dels}</span>}
                        </span>
                        <button
                          className="dv-file-stage-btn"
                          onClick={() => {
                            const entry = [...staged, ...unstaged].find((f) => f.path === file.path);
                            if (entry) selectFile(file.path, staged.some((s) => s.path === file.path) ? "staged" : "unstaged", entry);
                          }}
                        >
                          View
                        </button>
                      </div>
                      <div className="dv-hunks">
                        {fileHunks.map((hunk, i) => (
                          <div key={i} className="dv-hunk">
                            <div className="dv-hunk-hdr">
                              <span className="dv-hunk-range">{hunk.header.content}</span>
                              <div className="dv-hunk-actions">
                                <button
                                  className="dv-hunk-btn dv-hunk-btn--comment"
                                  onClick={() => {
                                    if (hunk.lines.length === 0) return;
                                    const first = hunk.lines[0];
                                    const last = hunk.lines[hunk.lines.length - 1];
                                    setCommentingRange({
                                      filePath: file.path,
                                      hunkIdx: i,
                                      startLi: 0,
                                      endLi: hunk.lines.length - 1,
                                      startLineNum: first.line_new ?? first.line_old ?? 1,
                                      endLineNum: last.line_new ?? last.line_old ?? hunk.lines.length,
                                    });
                                    setCommentDraft("");
                                  }}
                                >
                                  Comment on hunk
                                </button>
                              </div>
                            </div>
                            <div className="dv-hunk-body">
                              {hunk.lines.map((line, li) => {
                                const lineKey = `h${i}l${li}`;
                                const lineNum = line.line_new ?? line.line_old ?? li + 1;
                                const lineNotes = comments.filter(c => c.file === file.path && c.endLineKey === lineKey);
                                const inRange = commentingRange?.filePath === file.path && commentingRange?.hunkIdx === i
                                  && li >= commentingRange.startLi && li <= commentingRange.endLi;
                                const isRangeEnd = commentingRange?.filePath === file.path && commentingRange?.hunkIdx === i && li === commentingRange.endLi;
                                const isSingleActive = commentingRange?.filePath === file.path && commentingRange?.hunkIdx === i
                                  && commentingRange.startLi === li && commentingRange.endLi === li;
                                return (
                                  <div key={li} className="diff-line-wrap">
                                    {(() => {
                                      const isMultiRange = inRange && commentingRange!.startLi !== commentingRange!.endLi;
                                      const centerLi = isMultiRange ? Math.floor((commentingRange!.startLi + commentingRange!.endLi) / 2) : -1;
                                      return (
                                        <div className={`diff-line diff-${line.kind}${inRange ? " diff-line-selected" : ""}`}>
                                          {isMultiRange ? (
                                            li === centerLi ? (
                                              <button className="diff-comment-btn diff-comment-btn--center" type="button" title="Cancel range"
                                                onClick={() => { setCommentingRange(null); setCommentDraft(""); }}>
                                                <Plus size={9} />
                                              </button>
                                            ) : (
                                              <div className="diff-range-segment" />
                                            )
                                          ) : (
                                            <button
                                              className={`diff-comment-btn${isSingleActive ? " active" : ""}`}
                                              type="button"
                                              title={isSingleActive ? "Shift+click to extend range" : "Add comment · Shift+click to select range"}
                                              onClick={(e) => {
                                                if (commentingRange?.filePath === file.path && commentingRange?.hunkIdx === i && e.shiftKey) {
                                                  const newStart = Math.min(commentingRange.startLi, li);
                                                  const newEnd = Math.max(commentingRange.endLi, li);
                                                  const newStartNum = newStart === commentingRange.startLi ? commentingRange.startLineNum : lineNum;
                                                  const newEndNum = newEnd === commentingRange.endLi ? commentingRange.endLineNum : lineNum;
                                                  setCommentingRange({ filePath: file.path, hunkIdx: i, startLi: newStart, endLi: newEnd, startLineNum: newStartNum, endLineNum: newEndNum });
                                                } else if (isSingleActive) {
                                                  setCommentingRange(null);
                                                  setCommentDraft("");
                                                } else {
                                                  setCommentingRange({ filePath: file.path, hunkIdx: i, startLi: li, endLi: li, startLineNum: lineNum, endLineNum: lineNum });
                                                  setCommentDraft("");
                                                }
                                              }}
                                            >
                                              <Plus size={9} />
                                            </button>
                                          )}
                                          <span className="diff-num">{line.line_old ?? ""}</span>
                                          <span className="diff-num">{line.line_new ?? ""}</span>
                                          <span className="diff-content">{line.content}</span>
                                        </div>
                                      );
                                    })()}
                                    {lineNotes.map((note) => (
                                      <div key={note.id} className="diff-placed-comment">
                                        <span className="diff-placed-comment-meta">
                                          {note.startLine === note.endLine ? `line ${note.startLine}` : `lines ${note.startLine}–${note.endLine}`}
                                        </span>
                                        <span className="diff-placed-comment-text">{note.body}</span>
                                        <button className="diff-placed-comment-remove" type="button" onClick={() => removeComment(cwd, note.id)}>
                                          <X size={9} />
                                        </button>
                                      </div>
                                    ))}
                                    {isRangeEnd && (
                                      <div className="diff-comment-form" onClick={(e) => e.stopPropagation()}>
                                        <div className="diff-comment-form-hdr">
                                          <span className="diff-comment-form-who">You</span>
                                          <span className="diff-comment-form-line">
                                            {commentingRange!.startLineNum === commentingRange!.endLineNum
                                              ? `· line ${commentingRange!.startLineNum}`
                                              : `· lines ${commentingRange!.startLineNum}–${commentingRange!.endLineNum}`}
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
                                            if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                                              e.preventDefault();
                                              submitComment(hunk.lines);
                                            }
                                            if (e.key === "Escape") { setCommentingRange(null); setCommentDraft(""); }
                                          }}
                                        />
                                        <div className="diff-comment-form-actions">
                                          <button className="diff-comment-cancel" type="button"
                                            onClick={() => { setCommentingRange(null); setCommentDraft(""); }}>
                                            Cancel
                                          </button>
                                          <button
                                            className={`diff-comment-submit${commentDraft.trim() ? " ready" : ""}`}
                                            type="button"
                                            disabled={!commentDraft.trim()}
                                            onClick={() => submitComment(hunk.lines)}
                                          >
                                            Comment
                                          </button>
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

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
