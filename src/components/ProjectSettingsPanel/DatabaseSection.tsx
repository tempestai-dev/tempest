import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

interface Props {
  workspacePath: string;
  projectName: string;
  value: { isolationEnabled: boolean };
  onChange: (v: { isolationEnabled: boolean }) => void;
}

export function DatabaseSection({ workspacePath, projectName, value, onChange }: Props) {
  const [dockerAvailable, setDockerAvailable] = useState<boolean | null>(null);
  const [baseReady, setBaseReady] = useState(false);
  const [building, setBuilding] = useState(false);
  const [log, setLog] = useState<string[]>([]);
  const [connStr, setConnStr] = useState("");
  const [method, setMethod] = useState("pgdump");
  const [showSetup, setShowSetup] = useState(false);

  function checkDocker() {
    setDockerAvailable(null);
    invoke<boolean>("db_check_docker").then(setDockerAvailable).catch(() => setDockerAvailable(false));
  }

  useEffect(() => {
    checkDocker();
    invoke<boolean>("db_check_ready", { workspacePath }).then(setBaseReady).catch(() => {});
  }, [workspacePath]);

  async function runSetup() {
    if (!connStr.trim()) return;
    setBuilding(true);
    setLog([]);
    const unlisten = await listen<string>("db:log", (e) => {
      setLog((prev) => [...prev.slice(-199), e.payload]);
    });
    try {
      await invoke("db_build", { connStr: connStr.trim(), method, workspacePath, projectName });
      setBaseReady(true);
      setShowSetup(false);
    } catch (err) {
      setLog((prev) => [...prev, `Error: ${err}`]);
    } finally {
      setBuilding(false);
      unlisten();
    }
  }

  return (
    <div className="sp-section">
      <div className="sp-section-heading">Database Isolation</div>
      <p className="sp-section-desc">
        Give each agent session its own isolated clone of this project's database.
        Agents can run migrations and seed data freely without touching each other
        or your live data. Requires Docker.
      </p>

      <div className="sp-rows">
        <div
          className="sp-toggle-row"
          onClick={() => onChange({ isolationEnabled: !value.isolationEnabled })}
        >
          <div className="sp-toggle-text">
            <span className="sp-toggle-label">Isolate agent databases</span>
            <span className="sp-toggle-desc">
              {baseReady
                ? "Base image ready — each new session gets its own DB branch."
                : "No base image yet. Set up a source connection below."}
            </span>
          </div>
          <button
            className={`sp-toggle${value.isolationEnabled ? " sp-toggle--on" : ""}`}
            onClick={(e) => {
              e.stopPropagation();
              onChange({ isolationEnabled: !value.isolationEnabled });
            }}
            role="switch"
            aria-checked={value.isolationEnabled}
          >
            <span className="sp-toggle-thumb" />
          </button>
        </div>
      </div>

      {dockerAvailable === false && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 8 }}>
          <p className="sp-section-desc" style={{ color: "var(--tempest-fg-warning, #e5a00d)", margin: 0 }}>
            Docker not detected — start Docker Desktop to use this feature.
          </p>
          <button className="sp-global-agent-install" onClick={checkDocker} style={{ flexShrink: 0 }}>
            Recheck
          </button>
        </div>
      )}

      {dockerAvailable && !baseReady && !showSetup && (
        <div style={{ marginTop: 12 }}>
          <button onClick={() => setShowSetup(true)} style={{ width: "100%", background: "transparent", border: "none", cursor: "pointer", color: "var(--tempest-fg-muted)", fontSize: 12, padding: "6px 0", textAlign: "center" }}>
            Set up base image
          </button>
        </div>
      )}

      {baseReady && !showSetup && (
        <div style={{ marginTop: 12 }}>
          <button onClick={() => setShowSetup(true)} style={{ width: "100%", background: "transparent", border: "none", cursor: "pointer", color: "var(--tempest-fg-muted)", fontSize: 12, padding: "6px 0", textAlign: "center" }}>
            Rebuild base image
          </button>
        </div>
      )}

      {showSetup && (
        <div className="psp-fields" style={{ marginTop: 16 }}>
          <div className="psp-field">
            <div className="psp-field-label">Connection string</div>
            <div className="psp-field-input-row">
              <input
                className="psp-input psp-input--mono"
                type="password"
                placeholder="postgresql://user:pass@host:5432/db"
                value={connStr}
                onChange={(e) => setConnStr(e.target.value)}
                disabled={building}
              />
            </div>
          </div>

          <div className="psp-field">
            <div className="psp-field-label">Snapshot method</div>
            <div className="psp-field-input-row">
              <select
                className="psp-input"
                value={method}
                onChange={(e) => setMethod(e.target.value)}
                disabled={building}
              >
                <option value="pgdump">Full copy (pg_dump) — works with Supabase pooler</option>
                <option value="basebackup">Base backup — requires replication privilege</option>
                <option value="schema-only">Schema only — no data</option>
              </select>
            </div>
          </div>

          {log.length > 0 && (
            <pre className="psp-db-log">{log.join("\n")}</pre>
          )}

          <div className="psp-instructions-actions">
            <button
              className="sp-global-agent-install"
              onClick={runSetup}
              disabled={building || !connStr.trim()}
            >
              {building ? "Building…" : "Build base image"}
            </button>
            <button
              className="sp-global-agent-install psp-btn-ghost"
              onClick={() => { setShowSetup(false); setLog([]); }}
              disabled={building}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
