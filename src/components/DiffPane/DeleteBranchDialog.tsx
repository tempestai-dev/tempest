import { Trash2 } from "lucide-react";

export function DeleteBranchDialog({ branch, alsoRemote, error, onSetAlsoRemote, onCancel, onDelete }: {
  branch: string | null;
  alsoRemote: boolean;
  error: string | null;
  onSetAlsoRemote: (v: boolean) => void;
  onCancel: () => void;
  onDelete: (force: boolean) => void;
}) {
  if (!branch) return null;
  return (
    <div className="dp-overlay" onClick={onCancel}>
      <div className="dp-dialog" onClick={(e) => e.stopPropagation()}>
        <Trash2 size={20} className="dp-dialog-icon dp-dialog-icon--delete" />
        <p className="dp-dialog-title">Delete branch?</p>
        <code className="dp-dialog-path">{branch}</code>
        {error ? (
          <>
            <p className="dp-dialog-warn dp-dialog-warn--error">{error}</p>
            <div className="dp-dialog-actions">
              <button className="dp-dialog-cancel" onClick={onCancel}>Cancel</button>
              <button className="dp-dialog-confirm" onClick={() => onDelete(true)}>Force Delete</button>
            </div>
          </>
        ) : (
          <>
            <label className="dp-delete-remote-row">
              <input type="checkbox" className="dp-toggle" checked={alsoRemote} onChange={(e) => onSetAlsoRemote(e.target.checked)} />
              <span className="dv-coauthor-label">Also delete from remote</span>
            </label>
            <div className="dp-dialog-actions">
              <button className="dp-dialog-cancel" onClick={onCancel}>Cancel</button>
              <button className="dp-dialog-confirm" onClick={() => onDelete(false)}>Delete</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
