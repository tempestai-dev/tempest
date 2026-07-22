import { useEffect, useRef, useState } from "react";
import { dbLoadAppState, dbSetAppState } from "../../lib/db";
import { AGENT_CONFIGS } from "../NewSessionMenu";

// Per-project settings blob. Persisted as a single JSON row in the `app_state`
// table (key = "project-settings:{projectId}"), same key/value pattern as
// runtimeState.ts. One row per project, so tempest.yml can later override on top.
export interface ProjectSettings {
  sandbox: { mode: "off" | "monitor" | "enforce" };
  network: { policy: "permissive" | "restrictive"; allowHosts: string[]; blockHosts: string[] };
  filesystem: { rwPaths: string[]; roPaths: string[]; denyPaths: string[] };
  permissions: { allowSkipPermissions: boolean };
  agents: { permitted: string[] };
  database: { isolationEnabled: boolean };
}

// Defaults mirror each section's former local-useState initial values.
const DEFAULTS: ProjectSettings = {
  sandbox: { mode: "monitor" },
  network: { policy: "permissive", allowHosts: ["api.anthropic.com", "*.github.com"], blockHosts: [] },
  filesystem: { rwPaths: ["."], roPaths: [], denyPaths: [] },
  permissions: { allowSkipPermissions: true },
  agents: { permitted: AGENT_CONFIGS.map((a) => a.hint) },
  database: { isolationEnabled: false },
};

const keyFor = (projectId: string) => `project-settings:${projectId}`;

// Shallow-merge each slice over defaults so a partial/old DB blob still yields
// complete slices (and picks up fields added to ProjectSettings later).
function withDefaults(p: Partial<ProjectSettings>): ProjectSettings {
  return {
    sandbox: { ...DEFAULTS.sandbox, ...p.sandbox },
    network: { ...DEFAULTS.network, ...p.network },
    filesystem: { ...DEFAULTS.filesystem, ...p.filesystem },
    permissions: { ...DEFAULTS.permissions, ...p.permissions },
    agents: { ...DEFAULTS.agents, ...p.agents },
    database: { ...DEFAULTS.database, ...p.database },
  };
}

export function useProjectSettings(projectId: string, projectPath: string) {
  const [settings, setSettings] = useState<ProjectSettings>(DEFAULTS);
  const loaded = useRef(false);

  // Load from DB on mount (and whenever the project changes).
  useEffect(() => {
    loaded.current = false;
    let cancelled = false;
    (async () => {
      try {
        const rows = await dbLoadAppState();
        // ponytail: reads the whole app_state table to grab one row, exactly as
        // runtimeState.ts does. Add a single-key getter if the table gets large.
        const raw = new Map(rows).get(keyFor(projectId));
        const fromDb = raw ? (JSON.parse(raw) as Partial<ProjectSettings>) : {};
        // tempest.yml: load from projectPath here and merge OVER the DB blob
        //   (yml wins) before withDefaults — the file is the source of truth once it exists.
        if (!cancelled) setSettings(withDefaults(fromDb));
      } catch (e) {
        console.error("[projectSettings] load failed:", e);
      } finally {
        if (!cancelled) loaded.current = true;
      }
    })();
    return () => { cancelled = true; };
  }, [projectId, projectPath]);

  // Persist on every change once loaded. Writes are coarse (discrete toggles /
  // list adds), so no debounce.
  // ponytail: save-on-change, no debounce; add one if a section ever binds a
  //   text field straight to settings instead of local input state.
  useEffect(() => {
    if (!loaded.current) return;
    dbSetAppState(keyFor(projectId), JSON.stringify(settings))
      .catch((e) => console.error("[projectSettings] persist failed:", e));
  }, [projectId, settings]);

  return [settings, setSettings] as const;
}
