import { createPortal } from "react-dom";
import { Trash2, AlertTriangle, Loader } from "lucide-react";
import type { Worktree } from "../../types/workspace";

export type DeleteDialogState = {
  worktree: Worktree;
  projectPath: string;
  projectId: string;
  sessionId: string | null;
  branchName: string | null;
  deleteBranch: boolean;
  step: 1 | 2;
  loading: boolean;
  error: string | null;
};

type Props = {
  dialog: DeleteDialogState;
  onChange: (updater: (d: DeleteDialogState | null) => DeleteDialogState | null) => void;
  onCancel: () => void;
  onConfirm: () => void;
};

export function DeleteWorkspaceDialog({ dialog, onChange, onCancel, onConfirm }: Props) {
  return createPortal(
    <div className="naming-modal-overlay" onClick={() => !dialog.loading && onCancel()}>
      <div className="naming-modal delete-dialog" onClick={(e) => e.stopPropagation()}>
        {dialog.step === 1 ? (
          <>
            <div className="naming-modal-header">
              <Trash2 size={15} />
              <span>Delete workspace?</span>
            </div>
            <p className="naming-modal-desc">
              This will permanently remove{" "}
              <strong className="delete-dialog-name">{dialog.worktree.name}</strong>{" "}
              from disk. Any uncommitted work in this worktree will be lost.
            </p>

            <label className="delete-dialog-branch-row">
              <input
                type="checkbox"
                checked={dialog.deleteBranch}
                onChange={(e) =>
                  onChange((d) => d ? { ...d, deleteBranch: e.target.checked, error: null } : null)
                }
              />
              <span>Also delete branch{dialog.branchName ? ` "${dialog.branchName}"` : ""}</span>
            </label>
            {dialog.deleteBranch && (
              <div className="delete-dialog-branch-warn">
                <AlertTriangle size={13} />
                You will be asked to confirm this separately.
              </div>
            )}

            {dialog.error && <p className="naming-modal-error">{dialog.error}</p>}

            <div className="naming-modal-actions">
              <button
                className="naming-modal-btn naming-modal-btn--cancel"
                disabled={dialog.loading}
                onClick={onCancel}
              >
                Cancel
              </button>
              <button
                className="naming-modal-btn naming-modal-btn--delete"
                disabled={dialog.loading}
                onClick={onConfirm}
              >
                {dialog.loading ? <Loader size={13} className="spin" /> : "Delete workspace"}
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="naming-modal-header delete-dialog-header--danger">
              <AlertTriangle size={15} />
              <span>Delete branch permanently?</span>
            </div>
            <p className="naming-modal-desc">
              Branch{" "}
              <code className="delete-dialog-branch-code">{dialog.branchName}</code>{" "}
              will be deleted from the repository. This cannot be undone.
            </p>
            <div className="delete-dialog-final-warn">
              All commits on this branch that are not merged will be permanently lost.
            </div>

            {dialog.error && <p className="naming-modal-error">{dialog.error}</p>}

            <div className="naming-modal-actions">
              <button
                className="naming-modal-btn naming-modal-btn--cancel"
                disabled={dialog.loading}
                onClick={onCancel}
              >
                Cancel
              </button>
              <button
                className="naming-modal-btn naming-modal-btn--delete"
                disabled={dialog.loading}
                onClick={onConfirm}
              >
                {dialog.loading ? <Loader size={13} className="spin" /> : "Delete branch & workspace"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body
  );
}
