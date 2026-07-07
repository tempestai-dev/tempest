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
  status: string;
  path: string;
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

  const loadFiles = useCallback(async (path: string) => {
    const entries = await invoke<{ name: string; path: string; is_dir: boolean }[]>(
      "list_directory",
      { path }
    );
    setTree(entriesToNodes(entries));
  }, []);

  const loadChanges = useCallback(async (path: string) => {
    try {
      const result = await invoke<GitChange[]>("git_status", { path });
      setChanges(result.filter((c) => !c.path.includes(".tempest-pid")));
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
    // Skip git_status when the user explicitly chose to continue without git
    reload(filesPath, noGit ? null : (cwd ?? null));
  }, [cwd, rootPath, noGit]); // eslint-disable-line react-hooks/exhaustive-deps

  // When an agent finishes a turn, gitRevision increments — refresh only the
  // Changes tab so the file tree isn't disrupted mid-browse.
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
            {!noGit && changes.map((c, i) => (
              <div key={i} className="rs-change-item" title={c.path}>
                <span className={`rs-change-status ${statusClass(c.status)}`}>
                  {statusLabel(c.status)}
                </span>
                <span className="rs-change-path">{c.path}</span>
              </div>
            ))}
          </div>
        )}

      </div>
    </div>
  );
}
