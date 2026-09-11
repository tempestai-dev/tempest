import { useState, useEffect, useRef } from "react";
import { Shield, Cpu, RefreshCw } from "lucide-react";
import { Tooltip } from "./Tooltip";
import { UpdateNotice } from "./UpdateNotice";
import { AgentQuotaStrip } from "./AgentQuotaStrip";

/// How long each row is held before the track rotates to the other one.
const CYCLE_MS = 7000;

/// Matches the track's transition in StatusBar.css — long enough for the
/// update row to finish sliding away before it is torn down.
const SLIDE_MS = 500;

export interface StatusBarUpdate {
  version: string;
  onNotes: () => void;
  onUpdate: () => void;
  onDismiss: () => void;
}

interface Props {
  sandboxed?: boolean;
  atlasIndexed?: boolean;
  atlasIndexing?: boolean;
  atlasEnabled?: boolean;
  onSyncAtlas?: () => void;
  /// Hint of the agent driving the active session — feeds the quota strip's
  /// "active only" mode. Omitted for non-agent tabs (diff, terminal, editor).
  activeAgentHint?: string;
  /// When set, the badge row rotates between the badges and an update line.
  /// Absent (the usual case) leaves the bar exactly as it was.
  update?: StatusBarUpdate;
}

export function StatusBar({ sandboxed, atlasIndexed, atlasIndexing, atlasEnabled, onSyncAtlas, activeAgentHint, update }: Props) {
  const showShield = sandboxed !== undefined;
  const showAtlas = atlasEnabled !== undefined;

  // Rotate rather than interrupt: the user is mid-session here, so the update
  // takes its turn alongside the badges instead of claiming the bar outright.
  // The badges hold the bar first — the notice arrives on the first rotation.
  const [showUpdate, setShowUpdate] = useState(false);
  const cycleRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!update) return;
    setShowUpdate(false);
    cycleRef.current = setInterval(() => setShowUpdate((v) => !v), CYCLE_MS);
    return () => { if (cycleRef.current) clearInterval(cycleRef.current); };
  }, [update]);

  /// Slide the update row away first, then tear it down — dismissing on the
  /// click would swap the whole track out mid-transition. The rotation is
  /// stopped so the timer cannot flip it back on the way out.
  function handleDismiss() {
    if (!update) return;
    if (cycleRef.current) clearInterval(cycleRef.current);
    setShowUpdate(false);
    setTimeout(update.onDismiss, SLIDE_MS);
  }

  if (!showShield && !showAtlas) return null;

  const badges = (
    <>
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
    </>
  );

  const stripRow = (
    <>
      <AgentQuotaStrip activeAgentHint={activeAgentHint} />
      <span className="status-bar-spacer" />
      {badges}
    </>
  );

  if (!update) {
    return <div className="status-bar" role="status">{stripRow}</div>;
  }

  return (
    <div className="status-bar" role="status">
      <div className="status-bar-cycle">
        <div className={`status-bar-cycle-track${showUpdate ? " status-bar-cycle-track--alt" : ""}`}>
          <div className="status-bar-cycle-row">{stripRow}</div>
          <div className="status-bar-cycle-row">
            <span className="status-bar-spacer" />
            <UpdateNotice
              version={update.version}
              onNotes={update.onNotes}
              onUpdate={update.onUpdate}
              onDismiss={handleDismiss}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
