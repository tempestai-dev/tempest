import { createPortal } from "react-dom";
import { UiIcon } from "../../icons/UiIcon";
const Download = (p: any) => <UiIcon name="download" {...p} />;
const AlertTriangle = (p: any) => <UiIcon name="alert-triangle" {...p} />;
const Loader = (p: any) => <UiIcon name="loader" {...p} />;

type Props = {
  version: string;
  /// Open sessions that will be torn down with the app.
  sessionCount: number;
  /// Of those, the agents mid-turn right now — the only work that cannot be
  /// picked back up afterwards.
  workingCount: number;
  installing: boolean;
  error: string | null;
  onCancel: () => void;
  onConfirm: () => void;
};

/// Shown only from the workspace status bar, where sessions are running. The
/// Overview notice installs directly — there is nothing to interrupt there.
export function UpdateConfirmDialog({
  version, sessionCount, workingCount, installing, error, onCancel, onConfirm,
}: Props) {
  return createPortal(
    <div className="naming-modal-overlay" onClick={() => !installing && onCancel()}>
      <div className="naming-modal" onClick={(e) => e.stopPropagation()}>
        <div className="naming-modal-header">
          <Download size={15} />
          <span>Update to {version}?</span>
        </div>
        <p className="naming-modal-desc">
          Tempest will download the update, install it, and restart.
          {sessionCount > 0 && (
            <> Your {sessionCount === 1 ? "open session" : `${sessionCount} open sessions`} will
            close and reopen — agents that support resuming will pick up their conversation.</>
          )}
        </p>

        {workingCount > 0 && (
          <div className="delete-dialog-branch-warn">
            <AlertTriangle size={13} />
            {workingCount === 1
              ? "1 agent is working right now. Its current turn will be lost."
              : `${workingCount} agents are working right now. Their current turns will be lost.`}
          </div>
        )}

        {error && <p className="naming-modal-error">{error}</p>}

        <div className="naming-modal-actions">
          <button
            className="naming-modal-btn naming-modal-btn--cancel"
            disabled={installing}
            onClick={onCancel}
          >
            Cancel
          </button>
          <button
            className="naming-modal-btn naming-modal-btn--create"
            disabled={installing}
            onClick={onConfirm}
          >
            {installing ? <Loader size={13} className="spin" /> : "Update & restart"}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
