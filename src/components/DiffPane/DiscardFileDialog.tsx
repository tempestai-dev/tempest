import { AlertTriangle } from "lucide-react";

export function DiscardFileDialog({ path, onConfirm, onCancel }: {
  path: string | null;
  onConfirm: (path: string) => void;
  onCancel: () => void;
}) {
  if (!path) return null;
  return (
    <div className="dp-overlay" onClick={onCancel}>
      <div className="dp-dialog" onClick={(e) => e.stopPropagation()}>
        <AlertTriangle size={20} className="dp-dialog-icon" />
        <p className="dp-dialog-title">Discard changes?</p>
        <code className="dp-dialog-path">{path}</code>
        <p className="dp-dialog-warn">This cannot be undone.</p>
        <div className="dp-dialog-actions">
          <button className="dp-dialog-cancel" onClick={onCancel}>Cancel</button>
          <button className="dp-dialog-confirm" onClick={() => onConfirm(path)}>Discard</button>
        </div>
      </div>
    </div>
  );
}
