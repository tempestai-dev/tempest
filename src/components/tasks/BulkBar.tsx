import { Icon } from "./icons";

export function BulkBar({
  count,
  onLaunch,
  onClear,
}: {
  count: number;
  onLaunch: () => void;
  onClear: () => void;
}) {
  if (count === 0) return null;
  return (
    <div className="bulk-bar">
      <span className="bulk-count"><b>{count}</b> selected</span>
      <button className="btn primary" onClick={onLaunch}>
        {Icon.bolt()} Launch <span>{count}</span> agents
      </button>
      <button className="btn secondary">Assign</button>
      <button className="btn secondary">Label</button>
      <button className="btn secondary">Status</button>
      <button className="btn ghost" onClick={onClear}>Clear</button>
    </div>
  );
}
