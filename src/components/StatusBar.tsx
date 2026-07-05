import { Shield, Cpu, RefreshCw } from "lucide-react";

interface Props {
  /**
   * Isolation state of the active session.
   * `true`  = agent session, sandboxed via Hephaestus
   * `false` = agent session, not sandboxed
   * `undefined` = non-agent session (terminal/diff/editor) — shield hidden
   */
  sandboxed?: boolean;
  /** Project has a completed atlas index. */
  atlasIndexed?: boolean;
  /** Atlas is currently indexing the project. */
  atlasIndexing?: boolean;
  /** Called when the user clicks the atlas chip to trigger a re-sync. */
  onSyncAtlas?: () => void;
}

export function StatusBar({ sandboxed, atlasIndexed, atlasIndexing, onSyncAtlas }: Props) {
  const showShield = sandboxed !== undefined;
  const showAtlas = atlasIndexing || atlasIndexed;

  if (!showShield && !showAtlas) return null;

  return (
    <div className="status-bar" role="status">
      <div className="status-bar-left" />
      <div className="status-bar-right">
        {showAtlas && (
          atlasIndexing ? (
            <div
              className="status-bar-chip status-bar-chip--indexing"
              title="Atlas is indexing this project…"
            >
              <RefreshCw size={10} className="status-bar-chip-icon status-bar-chip-icon--spin" />
              <span className="status-bar-chip-label">Indexing</span>
            </div>
          ) : (
            <div
              className="status-bar-chip status-bar-chip--atlas-indexed"
              title="Atlas index is up to date — click to re-sync"
              onClick={onSyncAtlas}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => e.key === "Enter" && onSyncAtlas?.()}
            >
              <Cpu size={10} className="status-bar-chip-icon" />
              <span className="status-bar-chip-label">Indexed</span>
            </div>
          )
        )}
        {showShield && (
          <div
            className={`status-bar-chip status-bar-chip--shield${sandboxed ? " status-bar-chip--isolated" : ""}`}
            title={sandboxed ? "Isolated via Hephaestus (Job Object)" : "Not isolated — enable in Settings → Security"}
          >
            <Shield size={10} className="status-bar-chip-icon" />
            <span className="status-bar-chip-label">{sandboxed ? "Isolated" : "Not isolated"}</span>
          </div>
        )}
      </div>
    </div>
  );
}
