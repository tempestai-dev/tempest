import { Shield, Cpu, RefreshCw } from "lucide-react";
import { Tooltip } from "./Tooltip";

interface Props {
  sandboxed?: boolean;
  atlasIndexed?: boolean;
  atlasIndexing?: boolean;
  atlasEnabled?: boolean;
  onSyncAtlas?: () => void;
}

export function StatusBar({ sandboxed, atlasIndexed, atlasIndexing, atlasEnabled, onSyncAtlas }: Props) {
  const showShield = sandboxed !== undefined;
  const showAtlas = atlasEnabled !== undefined;

  if (!showShield && !showAtlas) return null;

  return (
    <div className="status-bar" role="status">
      {showAtlas && (
        atlasIndexing ? (
          <Tooltip content="Indexing codebase…" placement="top">
            <span className="status-bar-badge">
              <RefreshCw size={13} strokeWidth={2} className="status-bar-badge-icon status-bar-badge-icon--spin" />
              Indexing
            </span>
          </Tooltip>
        ) : atlasIndexed ? (
          <Tooltip content="Click to re-index" placement="top">
            <span
              className="status-bar-badge status-bar-badge--clickable"
              onClick={onSyncAtlas}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => e.key === "Enter" && onSyncAtlas?.()}
            >
              <Cpu size={13} strokeWidth={2} className="status-bar-badge-icon" />
              Indexed
            </span>
          </Tooltip>
        ) : (
          <Tooltip content="Project not indexed" placement="top">
            <span className="status-bar-badge status-bar-badge--error">
              <Cpu size={13} strokeWidth={2} className="status-bar-badge-icon" />
              Not indexed
            </span>
          </Tooltip>
        )
      )}
      {showAtlas && showShield && <span className="status-bar-sep" />}
      {showShield && (
        <Tooltip content={sandboxed ? "Process isolated" : "Not isolated"} placement="top">
          <span className="status-bar-badge">
            <Shield
              size={13}
              strokeWidth={2}
              className="status-bar-badge-icon"
              fill={sandboxed ? "currentColor" : "none"}
            />
            {sandboxed ? "Isolated" : "Not isolated"}
          </span>
        </Tooltip>
      )}
    </div>
  );
}
