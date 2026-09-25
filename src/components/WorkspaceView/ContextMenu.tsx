import { createPortal } from "react-dom";
import { Eye, X, Database, Trash2, FolderOpen } from "lucide-react";
import { getSettings } from "../../store/appSettings";
import { getRuntimeState, setRuntimeState } from "../../lib/runtimeState";
import { removeSession } from "../../store/sessions";
import { invoke } from "@tauri-apps/api/core";
import { track } from "../../lib/telemetry";
import type { Session, Worktree } from "../../types/workspace";

export type CtxMenuState = {
  x: number; y: number;
  worktree: Worktree | null;
  projectPath: string;
  projectId: string;
  sessionId: string | null;
  isProjectHeader?: boolean;
  isRootSession?: boolean;
  rootKey?: string;
};

type Props = {
  menu: CtxMenuState;
  sessions: Session[];
  onClose: () => void;
  onOpenDiff: (path: string, projectId: string) => void;
  onCloseSession: (sessionId: string) => void;
  onOpenDeleteDialog: (
    worktree: Worktree,
    projectPath: string,
    projectId: string,
    sessionId: string | null,
    withBranch?: boolean
  ) => void;
  onRemoveProject: (projectId: string) => void;
  onAtlasIndexingStart: (projectPath: string) => void;
};

export function ContextMenu({
  menu, sessions, onClose,
  onOpenDiff, onCloseSession,
  onOpenDeleteDialog, onRemoveProject, onAtlasIndexingStart,
}: Props) {
  const m = menu;
  const targetSession = m.sessionId ? sessions.find((s) => s.id === m.sessionId) : null;
  const atlasOn = getSettings().atlasEnabled;
  const indexed = (getRuntimeState().atlasProjects ?? {})[m.projectPath] === true;
  const canClose = !!m.sessionId;
  const diffPath = m.worktree ? m.worktree.path : m.projectPath;

  const indexProject = () => {
    const decided = getRuntimeState().atlasProjects ?? {};
    setRuntimeState({ atlasProjects: { ...decided, [m.projectPath]: true } });
    void track("feature_used", { feature: "atlas" });
    invoke("start_atlas_index", { projectPath: m.projectPath, semantic: getSettings().atlasSemantic })
      .then(() => invoke("start_atlas_daemon", { projectPath: m.projectPath }).catch(() => {}))
      .catch((e) => { console.error("[Atlas] start_atlas_index failed:", e); void track("atlas_index_failed", { reason_kind: "index_error" }); });
    onAtlasIndexingStart(m.projectPath);
    onClose();
  };
  const removeIndex = () => {
    invoke("remove_atlas_index", { projectPath: m.projectPath })
      .catch((e) => console.error("[Atlas] remove_atlas_index failed:", e));
    const decided = getRuntimeState().atlasProjects ?? {};
    const updated = { ...decided };
    delete updated[m.projectPath];
    setRuntimeState({ atlasProjects: updated });
    onClose();
  };

  const hasToolItems = atlasOn;
  const hasDestructiveWorktree = !!m.worktree;
  // "Remove session" deletes the persisted session row so no ghost reappears.
  // Show it for any right-clicked PTY session (terminal/agent — `kind` unset) and
  // for ghost rows (m.rootKey carries the persisted id). Non-terminal tabs
  // (diff/preview/editor/thread) have a `kind` and no persisted row, so they're excluded.
  const hasDestructiveSession =
    m.isRootSession || !!m.rootKey || (!!targetSession && !targetSession.kind);

  return createPortal(
    <div className="ctx-overlay" onClick={onClose}>
      <div
        className="ctx-menu"
        style={{ top: m.y, left: m.x }}
        onClick={(e) => e.stopPropagation()}
      >
        <button className="ctx-item" onClick={() => { onOpenDiff(diffPath, m.projectId); onClose(); }}>
          <Eye size={13} /> Open diff
        </button>
        {canClose && (
          <button className="ctx-item" onClick={() => { onCloseSession(m.sessionId!); onClose(); }}>
            <X size={13} /> Close
          </button>
        )}

        {hasToolItems && <div className="ctx-sep" />}
        {atlasOn && (
          <button className="ctx-item" onClick={indexProject}>
            <Database size={13} /> {indexed ? "Re-index project" : "Index project"}
          </button>
        )}

        <div className="ctx-sep" />
        {hasDestructiveWorktree && (
          <>
            <button className="ctx-item ctx-item--danger" onClick={() => onOpenDeleteDialog(m.worktree!, m.projectPath, m.projectId, m.sessionId)}>
              <Trash2 size={13} /> Delete workspace
            </button>
            <button className="ctx-item ctx-item--danger" onClick={() => onOpenDeleteDialog(m.worktree!, m.projectPath, m.projectId, m.sessionId, true)}>
              <Trash2 size={13} /> Delete branch
            </button>
          </>
        )}
        {hasDestructiveSession && (
          <button
            className="ctx-item ctx-item--danger"
            onClick={() => {
              // Remove FIRST so the subsequent onCloseSession → markSessionClosed
              // is a no-op (session already gone from the mirror). Otherwise
              // markSessionClosed enqueues an upsert that races the delete and
              // the row reappears as a ghost.
              const idToRemove = targetSession?.id ?? m.rootKey;
              if (idToRemove) removeSession(idToRemove);
              if (m.sessionId) onCloseSession(m.sessionId);
              onClose();
            }}
          >
            <Trash2 size={13} /> Remove session
          </button>
        )}
        {atlasOn && indexed && (
          <button className="ctx-item ctx-item--danger" onClick={removeIndex}>
            <Database size={13} /> Remove index
          </button>
        )}
        <button className="ctx-item ctx-item--danger" onClick={() => { onRemoveProject(m.projectId); onClose(); }}>
          <FolderOpen size={13} /> Remove project
        </button>
      </div>
    </div>,
    document.body
  );
}
