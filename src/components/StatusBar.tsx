import { Shield } from "lucide-react";

interface Props {
  /**
   * Isolation state of the active session.
   * `true`  = agent session, sandboxed via Hephaestus
   * `false` = agent session, not sandboxed
   * `undefined` = non-agent session (terminal/diff/editor) — shield hidden
   */
  sandboxed?: boolean;
}

export function StatusBar({ sandboxed }: Props) {
  if (sandboxed === undefined) return null;

  return (
    <div className="status-bar" role="status">
      <div className="status-bar-left" />
      <div className="status-bar-right">
        <div
          className={`status-bar-chip status-bar-chip--shield${sandboxed ? " status-bar-chip--isolated" : ""}`}
          title={sandboxed ? "Isolated via Hephaestus (Job Object)" : "Not isolated — enable in Settings → Security"}
        >
          <Shield size={10} className="status-bar-chip-icon" />
          <span className="status-bar-chip-label">{sandboxed ? "Isolated" : "Not isolated"}</span>
        </div>
      </div>
    </div>
  );
}
