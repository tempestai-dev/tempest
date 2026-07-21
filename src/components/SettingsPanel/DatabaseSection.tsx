import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useSettings, updateSetting } from "../../store/appSettings";

export function DatabaseSection() {
  const s = useSettings();
  const [dockerAvailable, setDockerAvailable] = useState<boolean | null>(null);
  const [baseReady, setBaseReady] = useState(false);
  const [building, setBuilding] = useState(false);
  const [log, setLog] = useState<string[]>([]);
  const [connStr, setConnStr] = useState("");
  const [method, setMethod] = useState("pgdump");
  const [showSetup, setShowSetup] = useState(false);

  useEffect(() => {
    invoke<boolean>("db_check_docker").then(setDockerAvailable).catch(() => setDockerAvailable(false));
    invoke<boolean>("db_check_ready").then(setBaseReady).catch(() => {});
  }, []);

  async function runSetup() {
    if (!connStr.trim()) return;
    setBuilding(true);
    setLog([]);
    const unlisten = await listen<string>("db:log", (e) => {
      setLog((prev) => [...prev.slice(-199), e.payload]);
    });
    try {
      await invoke("db_build", { connStr: connStr.trim(), method });
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
        Give each agent session its own isolated clone of your project database.
        Agents can run migrations and seed data freely without touching each other
        or your live data. Requires Docker.
      </p>

      <div className="sp-rows">
        <div
          className="sp-toggle-row"
          onClick={() => updateSetting("dbIsolation", !s.dbIsolation)}
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
            className={`sp-toggle${s.dbIsolation ? " sp-toggle--on" : ""}`}
            onClick={(e) => {
              e.stopPropagation();
              updateSetting("dbIsolation", !s.dbIsolation);
            }}
            role="switch"
            aria-checked={s.dbIsolation}
          />
        </div>
      </div>

      {dockerAvailable === false && (
        <p className="sp-section-desc" style={{ color: "var(--tempest-fg-warning, #e5a00d)", marginTop: 8 }}>
          Docker not detected — start Docker Desktop to use this feature.
        </p>
      )}

      {dockerAvailable && !baseReady && !showSetup && (
        <div style={{ marginTop: 12 }}>
          <button className="sp-global-agent-install" onClick={() => setShowSetup(true)}>
            Set up base image
          </button>
        </div>
      )}

      {baseReady && !showSetup && (
        <div style={{ marginTop: 12 }}>
          <button
            className="sp-global-agent-install"
            onClick={() => setShowSetup(true)}
            style={{ marginRight: 8 }}
          >
            Rebuild base image
          </button>
        </div>
      )}

      {showSetup && (
        <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <label className="sp-toggle-label" style={{ fontSize: 12 }}>
              Connection string
            </label>
            <input
              className="sp-input"
              type="password"
              placeholder="postgresql://user:pass@host:5432/db"
              value={connStr}
              onChange={(e) => setConnStr(e.target.value)}
              disabled={building}
              style={{ fontFamily: "var(--tempest-font-mono, monospace)", fontSize: 12 }}
            />
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <label className="sp-toggle-label" style={{ fontSize: 12 }}>Snapshot method</label>
            <select
              className="sp-input"
              value={method}
              onChange={(e) => setMethod(e.target.value)}
              disabled={building}
              style={{ fontSize: 12 }}
            >
              <option value="pgdump">Full copy (pg_dump) — works with Supabase pooler</option>
              <option value="basebackup">Base backup — requires replication privilege</option>
              <option value="schema-only">Schema only — no data</option>
            </select>
          </div>

          {log.length > 0 && (
            <div
              style={{
                background: "var(--tempest-bg-subtle)",
                border: "1px solid var(--tempest-border-default)",
                borderRadius: 6,
                padding: "8px 10px",
                fontSize: 11,
                fontFamily: "var(--tempest-font-mono, monospace)",
                maxHeight: 160,
                overflowY: "auto",
                color: "var(--tempest-fg-muted)",
                whiteSpace: "pre-wrap",
              }}
            >
              {log.join("\n")}
            </div>
          )}

          <div style={{ display: "flex", gap: 8 }}>
            <button
              className="sp-global-agent-install"
              onClick={runSetup}
              disabled={building || !connStr.trim()}
            >
              {building ? "Building…" : "Build base image"}
            </button>
            <button
              className="sp-global-agent-install"
              onClick={() => { setShowSetup(false); setLog([]); }}
              disabled={building}
              style={{ background: "transparent", border: "1px solid var(--tempest-border-default)" }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
