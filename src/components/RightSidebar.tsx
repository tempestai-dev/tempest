import { useState, useEffect, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  Folder,
  FolderOpen,
  File,
  RefreshCw,
  Eye,
  ChevronRight,
  ChevronDown,
  Loader,
  WrapText,
  ChevronsUpDown,
  ChevronsDownUp,
} from "lucide-react";
import { Tooltip } from "./Tooltip";
import "./RightSidebar.css";

type RightTab = "files" | "changes";

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

interface FileStats {
  path: string;
  adds: number;
  dels: number;
}

interface DiffLine {
  kind: "hunk" | "context" | "added" | "removed";
  line_old: number | null;
  line_new: number | null;
  content: string;
}

interface Props {
  cwd: string | null;      // session working dir — used for git status
  rootPath: string | null; // project root — used for file listing
  open: boolean;
  gitRevision?: number;    // increments when an agent finishes work; triggers changes refresh
  noGit?: boolean;         // true when user skipped git init — skip git_status, show notice
  onOpenDiff?: () => void; // undefined when a diff tab is already active (prevents duplicates)
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
    case "M": return "rs-change-status--modified";
    case "A": return "rs-change-status--added";
    case "D": return "rs-change-status--deleted";
    case "R": return "rs-change-status--renamed";
    default:  return "rs-change-status--untracked";
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
const DEFAULT_WIDTH = 300;

export function RightSidebar({ cwd, rootPath, open, gitRevision, noGit, onOpenDiff, onOpenFile }: Props) {
  const [activeTab, setActiveTab] = useState<RightTab>("files");
  const [tree, setTree] = useState<TreeNode[]>([]);
  const [changes, setChanges] = useState<GitChange[]>([]);
  const [reloading, setReloading] = useState(false);
  const [gitError, setGitError] = useState<string | null>(null);
  const [width, setWidth] = useState(DEFAULT_WIDTH);
  const dragState = useRef<{ startX: number; startWidth: number } | null>(null);
  const sidebarRef = useRef<HTMLDivElement>(null);

  // ── Inline diff state ─────────────────────────────────────────────────────
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set());
  const [diffCache, setDiffCache] = useState<Record<string, DiffLine[]>>({});
  const [diffLoadingPaths, setDiffLoadingPaths] = useState<Set<string>>(new Set());
  const [wrapLines, setWrapLines] = useState(false);

  const allExpanded = changes.length > 0 && changes.every((c) => expandedPaths.has(c.path));

  // Clear expand state when cwd changes (different project/session)
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
        // y-column non-blank → has unstaged changes; else staged-only
        const hasUnstaged = !isUntracked && (c.xy?.[1] ?? " ") !== " ";
        const staged = !isUntracked && !hasUnstaged;
        const lines = await invoke<DiffLine[]>("git_diff_file", {
          path: cwd,
          filePath: path,
          staged,
          untracked: isUntracked,
        });
        setDiffCache((prev) => ({ ...prev, [path]: lines }));
      } catch {
        setDiffCache((prev) => ({ ...prev, [path]: [] }));
      } finally {
        setDiffLoadingPaths((prev) => { const s = new Set(prev); s.delete(path); return s; });
      }
    }
  }, [expandedPaths, diffCache, cwd]);

  // ── Drag resize ───────────────────────────────────────────────────────────

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

  // ── Data loading ──────────────────────────────────────────────────────────

  const loadFiles = useCallback(async (path: string) => {
    const entries = await invoke<{ name: string; path: string; is_dir: boolean }[]>(
      "list_directory",
      { path }
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
          "list_directory",
          { path: node.path }
        );
        setTree((prev) => setChildrenInTree(prev, node.path, entriesToNodes(entries)));
      } catch {
        setTree((prev) => setChildrenInTree(prev, node.path, []));
      }
    } else {
      setTree((prev) => toggleInTree(prev, node.path));
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div
      ref={sidebarRef}
      className={`right-sidebar${open ? "" : " right-sidebar--collapsed"}`}
      style={open ? { width } : {}}
    >
      <div className="rs-drag-handle" onMouseDown={onDragStart} />
      <div className="rs-header">
        <div className="rs-tabs">
          <button
            className={`rs-tab${activeTab === "files" ? " rs-tab--active" : ""}`}
            onClick={() => setActiveTab("files")}
          >
            All Files
          </button>
          <button
            className={`rs-tab${activeTab === "changes" ? " rs-tab--active" : ""}`}
            onClick={() => setActiveTab("changes")}
          >
            Changes
            {changes.length > 0 && (
              <span className="rs-tab-count">{changes.length}</span>
            )}
          </button>
        </div>
        <Tooltip content="Open diff" placement="top">
          <button
            className="rs-reload-btn"
            aria-label="Open diff viewer"
            disabled={!onOpenDiff}
            onClick={onOpenDiff}
          >
            <Eye size={13} />
          </button>
        </Tooltip>
        <Tooltip content="Reload" placement="top">
          <button
            className={`rs-reload-btn${reloading ? " rs-reload-btn--spinning" : ""}`}
            aria-label="Reload"
            disabled={reloading || (!cwd && !rootPath)}
            onClick={() => { const fp = rootPath ?? cwd; if (fp) reload(fp, cwd ?? null); }}
          >
            <RefreshCw size={13} />
          </button>
        </Tooltip>
      </div>

      <div className="rs-body">
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

        {activeTab === "changes" && (
          <>
            {!noGit && !gitError && changes.length > 0 && (
              <div className="rs-changes-toolbar">
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
              </div>
            )}
          <div className="rs-scroll">
            {noGit && (
              <div className="rs-git-no-init">Git needs to be initialized to view changes</div>
            )}
            {!noGit && gitError && (
              <div className="rs-git-error">{gitError}</div>
            )}
            {!noGit && !gitError && changes.length === 0 && (
              <div className="rs-empty">No changes</div>
            )}
            {!noGit && changes.map((c, i) => {
              const isExpanded = expandedPaths.has(c.path);
              const isLoading = diffLoadingPaths.has(c.path);
              const lines = diffCache[c.path] ?? [];

              return (
                <div key={i} className="rs-change-group">
                  <div
                    className={`rs-change-item${isExpanded ? " rs-change-item--expanded" : ""}`}
                    title={c.path}
                    onClick={() => toggleExpand(c)}
                  >
                    <ChevronRight
                      size={10}
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
                  </div>

                  {isExpanded && (
                    <div className={`rs-diff-body${wrapLines ? " rs-diff-body--wrap" : ""}`}>
                      {isLoading ? (
                        <div className="rs-diff-center">
                          <Loader size={12} className="rs-diff-spinner" />
                        </div>
                      ) : lines.length === 0 ? (
                        <div className="rs-diff-center rs-diff-empty">No diff available</div>
                      ) : (
                        lines.map((line, j) => (
                          <div key={j} className={`rs-diff-line rs-diff-line--${line.kind}`}>
                            <span className="rs-diff-ln">
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
    </div>
  );
}
