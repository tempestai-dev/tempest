import { Shield, Cpu, RefreshCw } from "lucide-react";
import { Tooltip } from "./Tooltip";

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
            <Tooltip content="Indexing codebase…" placement="top">
              <div
                className="status-bar-chip status-bar-chip--indexing"
              >
                <RefreshCw size={10} className="status-bar-chip-icon status-bar-chip-icon--spin" />
                <span className="status-bar-chip-label">Indexing</span>
              </div>
            </Tooltip>
          ) : (
            <Tooltip content="Click to re-index" placement="top">
              <div
                className="status-bar-chip status-bar-chip--atlas-indexed"
                onClick={onSyncAtlas}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => e.key === "Enter" && onSyncAtlas?.()}
              >
                <Cpu size={10} className="status-bar-chip-icon" />
                <span className="status-bar-chip-label">Indexed</span>
              </div>
            </Tooltip>
          )
        )}
        {showShield && (
          <Tooltip content={sandboxed ? "Process isolated" : "Not isolated"} placement="top">
            <div
              className={`status-bar-chip status-bar-chip--shield${sandboxed ? " status-bar-chip--isolated" : ""}`}
            >
              <Shield size={10} className="status-bar-chip-icon" />
              <span className="status-bar-chip-label">{sandboxed ? "Isolated" : "Not isolated"}</span>
            </div>
          </Tooltip>
        )}
      </div>
    </div>
  );
}
