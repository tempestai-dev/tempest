import { useState, useEffect, useCallback, useRef } from "react";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import {
  Folder,
  FolderOpen,
  File,
  RefreshCw,
  ChevronRight,
  ChevronDown,
  Loader,
  WrapText,
  ChevronsUpDown,
  ChevronsDownUp,
  SplitSquareHorizontal,
  Database,
  Play,
  Square,
  Plus,
  X as XIcon,
  Terminal,
} from "lucide-react";
import { Tooltip } from "./Tooltip";
import type { DiffLine, FileStats } from "../types/git";
import "./RightSidebar.css";

type RightTab = "files" | "changes";
type BottomTab = "db-clones" | "run" | "terminal";

interface DbClone {
  name: string;
  port: number;
  connection_string: string;
  created_at: string;
}

function relTime(ts: string): string {
  const secs = Math.floor(Date.now() / 1000) - parseInt(ts, 10);
  if (secs < 60) return "just now";
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;
  return `${Math.floor(secs / 86400)}d ago`;
}

interface TreeNode {
  name: string;
  path: string;
  is_dir: boolean;
  expanded: boolean;
  children: TreeNode[] | null;
}

interface GitChange {
  xy?: string;
  status: string;
  path: string;
  adds?: number;
  dels?: number;
}

interface Props {
  cwd: string | null;
  rootPath: string | null;
  open: boolean;
  gitRevision?: number;
  noGit?: boolean;
  onOpenDiff?: () => void;
  onOpenFile?: (filePath: string) => void;
}

const HIDDEN_FILE_NAMES = new Set([".tempest-pid"]);

function entriesToNodes(
  entries: { name: string; path: string; is_dir: boolean }[]
): TreeNode[] {
  return entries
    .filter((e) => !HIDDEN_FILE_NAMES.has(e.name))
    .map((e) => ({
      name: e.name,
      path: e.path,
      is_dir: e.is_dir,
      expanded: false,
      children: null,
    }));
}

function setChildrenInTree(
  nodes: TreeNode[],
  targetPath: string,
  children: TreeNode[]
): TreeNode[] {
  return nodes.map((n) => {
    if (n.path === targetPath) return { ...n, children, expanded: true };
    if (n.children)
      return { ...n, children: setChildrenInTree(n.children, targetPath, children) };
    return n;
  });
}

function toggleInTree(nodes: TreeNode[], targetPath: string): TreeNode[] {
  return nodes.map((n) => {
    if (n.path === targetPath) return { ...n, expanded: !n.expanded };
    if (n.children)
      return { ...n, children: toggleInTree(n.children, targetPath) };
    return n;
  });
}

function statusLabel(s: string): string {
  switch (s.toUpperCase()) {
    case "M": return "M";
    case "A": return "A";
    case "D": return "D";
    case "R": return "R";
    case "C": return "C";
    default:  return "?";
  }
}

function statusClass(s: string): string {
  switch (s.toUpperCase()) {
    case "M": return "rs-change-status--m";
    case "A": return "rs-change-status--a";
    case "D": return "rs-change-status--d";
    case "R": return "rs-change-status--r";
    default:  return "rs-change-status--u";
  }
}

function FileTreeNodes({
  nodes,
  depth,
  onToggle,
  onOpenFile,
}: {
  nodes: TreeNode[];
  depth: number;
  onToggle: (node: TreeNode) => void;
  onOpenFile?: (filePath: string) => void;
}) {
  return (
    <>
      {nodes.map((node) => (
        <div key={node.path}>
          <div
            className={`rs-file-item${node.is_dir ? " rs-file-item--dir" : ""}${!node.is_dir ? " rs-file-item--file" : ""}`}
            style={{ paddingLeft: 8 + depth * 14 }}
            onClick={() => node.is_dir ? onToggle(node) : onOpenFile?.(node.path)}
            title={node.path}
          >
            <span className="rs-file-chevron">
              {node.is_dir &&
                (node.expanded ? <ChevronDown size={10} /> : <ChevronRight size={10} />)}
            </span>
            <span className="rs-file-icon">
              {node.is_dir ? (
                node.expanded ? <FolderOpen size={13} /> : <Folder size={13} />
              ) : (
                <File size={13} />
              )}
            </span>
            <span className="rs-file-name">{node.name}</span>
          </div>
          {node.expanded && node.children && node.children.length > 0 && (
            <FileTreeNodes nodes={node.children} depth={depth + 1} onToggle={onToggle} onOpenFile={onOpenFile} />
          )}
          {node.expanded && node.children && node.children.length === 0 && (
            <div className="rs-file-empty" style={{ paddingLeft: 8 + (depth + 1) * 14 }}>
              Empty
            </div>
          )}
        </div>
      ))}
    </>
  );
}

const MIN_WIDTH = 180;
const MAX_WIDTH = 560;
const DEFAULT_WIDTH = 260;

export function RightSidebar({ cwd, rootPath, open, gitRevision, noGit, onOpenDiff, onOpenFile }: Props) {
  const [activeTab, setActiveTab] = useState<RightTab>("files");
  const [bottomTab, setBottomTab] = useState<BottomTab>("db-clones");
  const [dbBranches, setDbBranches] = useState<DbClone[]>([]);
  const [pkgScripts, setPkgScripts] = useState<Record<string, string>>({});
  const [customCmds, setCustomCmds] = useState<string[]>([]);
  const [newCustomCmd, setNewCustomCmd] = useState("");
  const [runLog, setRunLog] = useState<string[]>([]);
  const [runningId, setRunningId] = useState<string | null>(null);
  const runLogRef = useRef<HTMLDivElement>(null);
  const [tree, setTree] = useState<TreeNode[]>([]);
  const [changes, setChanges] = useState<GitChange[]>([]);
  const [reloading, setReloading] = useState(false);
  const [gitError, setGitError] = useState<string | null>(null);
  const [width, setWidth] = useState(DEFAULT_WIDTH);
  const dragState = useRef<{ startX: number; startWidth: number } | null>(null);
  const sidebarRef = useRef<HTMLDivElement>(null);

  // Inline diff state
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set());
  const [diffCache, setDiffCache] = useState<Record<string, DiffLine[]>>({});
  const [diffLoadingPaths, setDiffLoadingPaths] = useState<Set<string>>(new Set());
  const [wrapLines, setWrapLines] = useState(false);

  const allExpanded = changes.length > 0 && changes.every((c) => expandedPaths.has(c.path));

  useEffect(() => {
    setExpandedPaths(new Set());
    setDiffCache({});
    setDiffLoadingPaths(new Set());
  }, [cwd]);

  const handleExpandAll = useCallback(async () => {
    if (!cwd) return;
    setExpandedPaths(new Set(changes.map((c) => c.path)));
    const uncached = changes.filter((c) => !(c.path in diffCache));
    if (uncached.length === 0) return;
    setDiffLoadingPaths((prev) => new Set([...prev, ...uncached.map((c) => c.path)]));
    await Promise.all(uncached.map(async (c) => {
      try {
        const isUntracked = c.xy === "??";
        const hasUnstaged = !isUntracked && (c.xy?.[1] ?? " ") !== " ";
        const staged = !isUntracked && !hasUnstaged;
        const lines = await invoke<DiffLine[]>("git_diff_file", {
          path: cwd, filePath: c.path, staged, untracked: isUntracked,
        });
        setDiffCache((prev) => ({ ...prev, [c.path]: lines }));
      } catch {
        setDiffCache((prev) => ({ ...prev, [c.path]: [] }));
      } finally {
        setDiffLoadingPaths((prev) => { const s = new Set(prev); s.delete(c.path); return s; });
      }
    }));
  }, [cwd, changes, diffCache]);

  const handleCollapseAll = useCallback(() => {
    setExpandedPaths(new Set());
  }, []);

  const toggleExpand = useCallback(async (c: GitChange) => {
    const { path } = c;
    const isExpanded = expandedPaths.has(path);
    setExpandedPaths((prev) => {
      const next = new Set(prev);
      isExpanded ? next.delete(path) : next.add(path);
      return next;
    });
    if (!isExpanded && !(path in diffCache) && cwd) {
      setDiffLoadingPaths((prev) => new Set(prev).add(path));
      try {
        const isUntracked = c.xy === "??";
        const hasUnstaged = !isUntracked && (c.xy?.[1] ?? " ") !== " ";
        const staged = !isUntracked && !hasUnstaged;
        const lines = await invoke<DiffLine[]>("git_diff_file", {
          path: cwd, filePath: path, staged, untracked: isUntracked,
        });
        setDiffCache((prev) => ({ ...prev, [path]: lines }));
      } catch {
        setDiffCache((prev) => ({ ...prev, [path]: [] }));
      } finally {
        setDiffLoadingPaths((prev) => { const s = new Set(prev); s.delete(path); return s; });
      }
    }
  }, [expandedPaths, diffCache, cwd]);

  // Drag resize
  function onDragStart(e: React.MouseEvent) {
    if (!open) return;
    e.preventDefault();
    dragState.current = { startX: e.clientX, startWidth: width };
    document.body.style.userSelect = "none";
    document.body.style.cursor = "col-resize";
    if (sidebarRef.current) sidebarRef.current.style.transition = "none";

    function onMove(ev: MouseEvent) {
      if (!dragState.current || !sidebarRef.current) return;
      const delta = dragState.current.startX - ev.clientX;
      const next = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, dragState.current.startWidth + delta));
      sidebarRef.current.style.width = `${next}px`;
      dragState.current.startWidth = next;
      dragState.current.startX = ev.clientX;
    }
    function onUp() {
      if (sidebarRef.current) {
        const finalWidth = parseInt(sidebarRef.current.style.width) || width;
        sidebarRef.current.style.transition = "";
        setWidth(finalWidth);
      }
      dragState.current = null;
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    }
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }

  // Data loading
  const loadFiles = useCallback(async (path: string) => {
    const entries = await invoke<{ name: string; path: string; is_dir: boolean }[]>(
      "list_directory", { path }
    );
    setTree(entriesToNodes(entries));
  }, []);

  const loadChanges = useCallback(async (path: string) => {
    try {
      const [result, stats] = await Promise.all([
        invoke<GitChange[]>("git_status", { path }),
        invoke<FileStats[]>("git_numstat", { repoPath: path }).catch(() => [] as FileStats[]),
      ]);
      const statsMap: Record<string, { adds: number; dels: number }> = {};
      for (const s of stats) statsMap[s.path] = { adds: s.adds, dels: s.dels };
      const merged = result
        .filter((c) => !c.path.includes(".tempest-pid"))
        .map((c) => ({ ...c, ...statsMap[c.path] }));
      setChanges(merged);
      setGitError(null);
    } catch (e) {
      setChanges([]);
      setGitError(String(e));
    }
  }, []);

  const reload = useCallback(
    async (filesPath: string, changesPath: string | null) => {
      setReloading(true);
      try {
        await Promise.all([
          loadFiles(filesPath),
          changesPath ? loadChanges(changesPath) : Promise.resolve(),
          new Promise<void>((r) => setTimeout(r, 600)),
        ]);
      } catch {}
      setReloading(false);
    },
    [loadFiles, loadChanges]
  );

  useEffect(() => {
    setTree([]);
    setChanges([]);
    setGitError(null);
    const filesPath = rootPath ?? cwd;
    if (!filesPath) return;
    reload(filesPath, noGit ? null : (cwd ?? null));
  }, [cwd, rootPath, noGit]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!cwd) { setDbBranches([]); return; }
    invoke<DbClone[]>("db_list_branches", { workspacePath: cwd })
      .then(setDbBranches)
      .catch(() => setDbBranches([]));
  }, [cwd]);

  useEffect(() => {
    if (!cwd) { setPkgScripts({}); return; }
    invoke<string>("read_file", { path: `${cwd}/package.json` })
      .then(content => {
        const pkg = JSON.parse(content) as { scripts?: Record<string, string> };
        setPkgScripts(pkg.scripts ?? {});
      })
      .catch(() => setPkgScripts({}));
  }, [cwd]);

  useEffect(() => {
    if (!cwd) { setCustomCmds([]); return; }
    const saved = localStorage.getItem(`tempest-run-custom:${cwd}`);
    setCustomCmds(saved ? (JSON.parse(saved) as string[]) : []);
    setNewCustomCmd("");
  }, [cwd]);

  useEffect(() => {
    if (runLogRef.current) runLogRef.current.scrollTop = runLogRef.current.scrollHeight;
  }, [runLog]);

  async function runScript(cmd: string) {
    if (!cwd || runningId) return;
    const id = crypto.randomUUID();
    setRunLog([`$ ${cmd}`]);
    setRunningId(id);
    setBottomTab("terminal");
    const unlistenLine = await listen<string>(`run:${id}`, (e) => {
      setRunLog((prev) => [...prev.slice(-999), e.payload]);
    });
    const unlistenDone = await listen<null>(`run:${id}:done`, () => {
      setRunningId(null);
      unlistenLine();
      unlistenDone();
    });
    try {
      await invoke("shell_run", { sessionId: id, cwd, cmd });
    } catch (e) {
      setRunLog((prev) => [...prev, `Error: ${e}`]);
      setRunningId(null);
      unlistenLine();
      unlistenDone();
    }
  }

  function stopRun() {
    if (!runningId) return;
    invoke("shell_kill", { sessionId: runningId }).catch(() => {});
    setRunningId(null);
  }

  function addCustomCmd() {
    const cmd = newCustomCmd.trim();
    if (!cmd || !cwd) return;
    const next = [...customCmds, cmd];
    setCustomCmds(next);
    localStorage.setItem(`tempest-run-custom:${cwd}`, JSON.stringify(next));
    setNewCustomCmd("");
  }

  function removeCustomCmd(cmd: string) {
    const next = customCmds.filter(c => c !== cmd);
    setCustomCmds(next);
    if (cwd) localStorage.setItem(`tempest-run-custom:${cwd}`, JSON.stringify(next));
  }

  const prevRevision = useRef(0);
  useEffect(() => {
    if (!gitRevision || gitRevision === prevRevision.current) return;
    prevRevision.current = gitRevision;
    if (cwd && !noGit) loadChanges(cwd);
  }, [gitRevision]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleToggle(node: TreeNode) {
    if (!node.is_dir) return;
    if (node.children === null) {
      try {
        const entries = await invoke<{ name: string; path: string; is_dir: boolean }[]>(
          "list_directory", { path: node.path }
        );
        setTree((prev) => setChildrenInTree(prev, node.path, entriesToNodes(entries)));
      } catch {
        setTree((prev) => setChildrenInTree(prev, node.path, []));
      }
    } else {
      setTree((prev) => toggleInTree(prev, node.path));
    }
  }

  return (
    <div
      ref={sidebarRef}
      className={`right-sidebar${open ? "" : " right-sidebar--collapsed"}`}
      style={open ? { width } : {}}
    >
      <div className="rs-drag-handle" onMouseDown={onDragStart} />

      {/* Header: pill tabs + action buttons */}
      <div className="rs-header">
        <div className="rs-tabs-pill">
          <button
            className={`rs-tab-pill${activeTab === "files" ? " rs-tab-pill--active" : ""}`}
            onClick={() => setActiveTab("files")}
          >
            All Files
          </button>
          <button
            className={`rs-tab-pill${activeTab === "changes" ? " rs-tab-pill--active" : ""}`}
            onClick={() => setActiveTab("changes")}
          >
            Changes
            {changes.length > 0 && (
              <span className="rs-tab-pill-badge">{changes.length}</span>
            )}
          </button>
        </div>
      </div>

      <div className="rs-body">

        {/* All Files tab */}
        {activeTab === "files" && (
          <div className="rs-scroll">
            {!rootPath && !cwd && (
              <div className="rs-empty">No active session</div>
            )}
            {(rootPath || cwd) && tree.length === 0 && !reloading && (
              <div className="rs-empty">Empty directory</div>
            )}
            {tree.length > 0 && (
              <FileTreeNodes nodes={tree} depth={0} onToggle={handleToggle} onOpenFile={onOpenFile} />
            )}
          </div>
        )}

        {/* Changes tab */}
        {activeTab === "changes" && (
          <>
            {!noGit && (
              <div className="rs-changes-toolbar">
                {!gitError && changes.length > 0 && (
                  <>
                    <Tooltip content={wrapLines ? "Scroll long lines" : "Wrap long lines"} placement="top">
                      <button
                        className={`rs-toolbar-btn${wrapLines ? " rs-toolbar-btn--active" : ""}`}
                        onClick={() => setWrapLines((v) => !v)}
                      >
                        <WrapText size={13} />
                      </button>
                    </Tooltip>
                    <Tooltip content={allExpanded ? "Collapse all" : "Expand all"} placement="top">
                      <button
                        className="rs-toolbar-btn"
                        onClick={allExpanded ? handleCollapseAll : handleExpandAll}
                      >
                        {allExpanded
                          ? <ChevronsDownUp size={13} />
                          : <ChevronsUpDown size={13} />}
                      </button>
                    </Tooltip>
                  </>
                )}
                {onOpenDiff && (
                  <Tooltip content="Open in Diff tab" placement="top">
                    <button className="rs-toolbar-btn" onClick={onOpenDiff}>
                      <SplitSquareHorizontal size={13} />
                    </button>
                  </Tooltip>
                )}
                <Tooltip content="Reload" placement="top">
                  <button
                    className={`rs-toolbar-btn${reloading ? " rs-toolbar-btn--spinning" : ""}`}
                    aria-label="Reload"
                    disabled={reloading || (!cwd && !rootPath)}
                    onClick={() => { const fp = rootPath ?? cwd; if (fp) reload(fp, cwd ?? null); }}
                  >
                    <RefreshCw size={13} />
                  </button>
                </Tooltip>
              </div>
            )}
            {noGit && (
              <div className="rs-git-no-init">Git needs to be initialized to view changes</div>
            )}
            {!noGit && gitError && (
              <div className="rs-git-error">{gitError}</div>
            )}
            {!noGit && !gitError && changes.length === 0 && (
              <div className="rs-no-changes-wrap">
                <div className="rs-no-changes-box">
                  <span className="rs-no-changes-text">All clear. No uncommitted changes in this workspace.</span>
                </div>
              </div>
            )}
            <div className="rs-scroll">
              {!noGit && !gitError && changes.map((c, i) => {
                const isExpanded = expandedPaths.has(c.path);
                const isLoading  = diffLoadingPaths.has(c.path);
                const lines      = diffCache[c.path] ?? [];

                return (
                  <div key={i} className="rs-change-group">
                    <button
                      className={`rs-change-row${isExpanded ? " rs-change-row--expanded" : ""}`}
                      onClick={() => toggleExpand(c)}
                      title={c.path}
                    >
                      <ChevronRight
                        size={9}
                        className={`rs-change-chevron${isExpanded ? " rs-change-chevron--open" : ""}`}
                      />
                      <span className={`rs-change-status ${statusClass(c.status)}`}>
                        {statusLabel(c.status)}
                      </span>
                      <span className="rs-change-path">{c.path}</span>
                      {(c.adds !== undefined || c.dels !== undefined) && (
                        <span className="rs-change-stats">
                          {c.adds !== undefined && <span className="rs-stat-adds">+{c.adds}</span>}
                          {c.dels !== undefined && <span className="rs-stat-dels">-{c.dels}</span>}
                        </span>
                      )}
                    </button>

                    {isExpanded && (
                      <div className={`rs-inline-diff${wrapLines ? " rs-inline-diff--wrap" : ""}`}>
                        {isLoading ? (
                          <div className="rs-diff-center">
                            <Loader size={12} className="rs-diff-spinner" />
                          </div>
                        ) : lines.length === 0 ? (
                          <div className="rs-diff-center rs-diff-empty">No diff available</div>
                        ) : (
                          lines.map((line, j) => (
                            <div key={j} className={`rs-diff-line rs-diff-line--${line.kind}`}>
                              <span className="rs-diff-num">
                                {line.kind === "hunk" ? "…" : (line.line_new ?? line.line_old ?? "")}
                              </span>
                              <span className="rs-diff-content">{line.content}</span>
                            </div>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}

      </div>

      {/* Bottom panel: DB Clones | Run | Terminal */}
      <div className="rs-bottom">
        <div className="rs-bottom-header">
          <div className="rs-btab-bar">
            <button
              className={`rs-btab${bottomTab === "db-clones" ? " rs-btab--active" : ""}`}
              onClick={() => setBottomTab("db-clones")}
            >
              <Database size={11} /> DB Clones
              {dbBranches.length > 0 && (
                <span className="rs-tab-pill-badge">{dbBranches.length}</span>
              )}
            </button>
            <span className="rs-btab-sep">|</span>
            <button
              className={`rs-btab${bottomTab === "run" ? " rs-btab--active" : ""}`}
              onClick={() => setBottomTab("run")}
            >
              <Play size={11} /> Run
            </button>
            <span className="rs-btab-sep">|</span>
            <button
              className={`rs-btab${bottomTab === "terminal" ? " rs-btab--active" : ""}`}
              onClick={() => setBottomTab("terminal")}
            >
              <Terminal size={11} /> Terminal
              {runningId && <span className="rs-btab-running" />}
            </button>
          </div>
        </div>

        <div className="rs-bottom-body">
          {bottomTab === "db-clones" && (
            <div className="rs-scroll">
              {dbBranches.length === 0 ? (
                <div className="rs-empty">No active DB clones</div>
              ) : (
                dbBranches.map((b) => (
                  <div key={b.name} className="rs-clone-row">
                    <Database size={11} className="rs-clone-icon" />
                    <span className="rs-clone-name" title={b.connection_string}>{b.name}</span>
                    <span className="rs-clone-port">:{b.port}</span>
                    <span className="rs-clone-time">{relTime(b.created_at)}</span>
                  </div>
                ))
              )}
            </div>
          )}

          {bottomTab === "run" && (
            <div className="rs-run">
              {Object.keys(pkgScripts).length > 0 && (
                <>
                  <div className="rs-run-section-label">package.json</div>
                  {Object.entries(pkgScripts).map(([name, script]) => (
                    <div key={name} className="rs-run-script-row">
                      <span className="rs-run-script-name">{name}</span>
                      <span className="rs-run-script-desc">{script}</span>
                      <button
                        className="rs-run-play-btn"
                        title={`npm run ${name}`}
                        disabled={!cwd || !!runningId}
                        onClick={() => runScript(`npm run ${name}`)}
                      >
                        <Play size={10} />
                      </button>
                    </div>
                  ))}
                </>
              )}

              {customCmds.length > 0 && (
                <>
                  <div className="rs-run-section-label">Custom</div>
                  {customCmds.map((cmd) => (
                    <div key={cmd} className="rs-run-script-row">
                      <span className="rs-run-script-name rs-run-script-name--full">{cmd}</span>
                      <button
                        className="rs-run-play-btn"
                        disabled={!cwd || !!runningId}
                        onClick={() => runScript(cmd)}
                      >
                        <Play size={10} />
                      </button>
                      <button
                        className="rs-run-del-btn"
                        onClick={() => removeCustomCmd(cmd)}
                      >
                        <XIcon size={10} />
                      </button>
                    </div>
                  ))}
                </>
              )}

              {Object.keys(pkgScripts).length === 0 && customCmds.length === 0 && (
                <div className="rs-empty rs-empty--sm">No scripts detected</div>
              )}

              <div className="rs-run-add-row">
                <input
                  className="rs-run-input"
                  value={newCustomCmd}
                  onChange={(e) => setNewCustomCmd(e.target.value)}
                  placeholder="Add command…"
                  onKeyDown={(e) => { if (e.key === "Enter") addCustomCmd(); }}
                />
                <button
                  className="rs-run-add-btn"
                  disabled={!newCustomCmd.trim()}
                  onClick={addCustomCmd}
                >
                  <Plus size={11} />
                </button>
              </div>
            </div>
          )}

          {bottomTab === "terminal" && (
            <div className="rs-terminal">
              {runLog.length > 0 ? (
                <div ref={runLogRef} className="rs-terminal-output">
                  <pre className="rs-terminal-pre">{runLog.join("\n")}</pre>
                </div>
              ) : (
                <div className="rs-terminal-output">
                  <span className="rs-terminal-placeholder">Run a script from the Run tab</span>
                </div>
              )}
              {runningId && (
                <div className="rs-terminal-row">
                  <span className="rs-terminal-ps rs-terminal-ps--running">●</span>
                  <span className="rs-terminal-running-label">Running…</span>
                  <button className="rs-terminal-stop-btn" onClick={stopRun} title="Stop">
                    <Square size={9} /> Stop
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

    </div>
  );
}
