import { useEffect, useMemo, useState } from "react";
import "./TasksPage.css";
import { invalidateTasksCache } from "./tasks/api";
import { BulkBar } from "./tasks/BulkBar";
import { ContextBar } from "./tasks/ContextBar";
import { LaunchAgentModal } from "./tasks/LaunchAgentModal";
import { SourceTabs } from "./tasks/SourceTabs";
import { TaskList } from "./tasks/TaskList";
import {
  useGhAuth,
  useGhList,
  useGhRepos,
  useLinearBootstrap,
  useLinearList,
} from "./tasks/useTasks";
import type { LaunchTargetProject, Source, TasksState, UnifiedItem } from "./tasks/types";
import { compareLinearItems, itemKey } from "./tasks/types";
import type { AgentConfig } from "../lib/agentRegistry";

const INITIAL: TasksState = {
  source: "github",
  ghKind: "both",
  ghRepo: "all",
  ghPreset: "assigned",
  lnScope: { kind: "view", id: "v-active" },
  lnGroup: "status",
  lnOrder: "priority",
  query: "",
  selected: new Set(),
  expandedKey: null,
};

// Persist the durable slice of TasksState across sessions. `selected` and
// `expandedKey` are intentionally excluded — they're ephemeral to the view.
const PERSIST_KEY = "tempest:tasks-page:v1";
type PersistShape = Pick<TasksState,
  "source" | "ghKind" | "ghRepo" | "ghPreset" | "lnScope" | "lnGroup" | "lnOrder" | "query">;

function loadPersisted(): Partial<PersistShape> {
  try {
    const raw = localStorage.getItem(PERSIST_KEY);
    return raw ? (JSON.parse(raw) as Partial<PersistShape>) : {};
  } catch { return {}; }
}
function savePersisted(s: TasksState) {
  const slim: PersistShape = {
    source: s.source, ghKind: s.ghKind, ghRepo: s.ghRepo, ghPreset: s.ghPreset,
    lnScope: s.lnScope, lnGroup: s.lnGroup, lnOrder: s.lnOrder, query: s.query,
  };
  try { localStorage.setItem(PERSIST_KEY, JSON.stringify(slim)); } catch { /* quota — skip */ }
}

export interface TasksPageProps {
  projects: LaunchTargetProject[];
  defaultProjectId: string | null;
  onLaunch: (opts: {
    projectId: string;
    branchName: string;
    agent: AgentConfig;
    prompt: string;
  }) => Promise<string | null>;
  activeSessionIds: string[];
  onViewSession: (id: string) => void;
}

export function TasksPage({
  projects,
  defaultProjectId,
  onLaunch,
  activeSessionIds,
  onViewSession,
}: TasksPageProps) {
  const [state, setState] = useState<TasksState>(() => ({ ...INITIAL, ...loadPersisted() }));
  const [bump, setBump] = useState(0); // increments to invalidate all fetches
  const [modalKeys, setModalKeys] = useState<string[] | null>(null);
  // Item key → session id for agents this page launched. In-memory only:
  // sessions themselves live in WorkspaceView; we just remember the mapping
  // so the row can offer a "View agent" jump while the session is alive.
  const [launchedByKey, setLaunchedByKey] = useState<Map<string, string>>(() => new Map());
  const activeSet = useMemo(() => new Set(activeSessionIds), [activeSessionIds]);

  useEffect(() => { savePersisted(state); }, [state]);

  const patch = (p: Partial<TasksState>) => setState((prev) => ({ ...prev, ...p }));

  const ghAuth = useGhAuth(bump);
  const ghAuthed = !!ghAuth.data?.authenticated;

  // Fetch every source in the background regardless of which tab is active, so
  // tab pills stay live and switching tabs is a pure view swap (no refetch,
  // no reset). The Rust side caches for 60s, so this is one call per source
  // per refresh cycle.
  const ghRepos = useGhRepos(ghAuthed, bump);
  const ghList = useGhList(
    ghAuthed,
    state.ghPreset,
    state.ghRepo,
    state.ghKind,
    bump,
  );
  const lnBoot = useLinearBootstrap(true, bump);
  const lnList = useLinearList(true, state.lnScope, bump);

  // Assemble the visible list based on the active source. Query is a
  // client-side title filter over already-loaded rows.
  const items: UnifiedItem[] = useMemo(() => {
    const q = state.query.trim().toLowerCase();
    const match = (t: string) => !q || t.toLowerCase().includes(q);
    if (state.source === "github") {
      return (ghList.data ?? [])
        .filter((i) => match(i.title))
        .map((i) => ({ ...i, key: itemKey(i) }));
    }
    if (state.source === "linear") {
      return (lnList.data ?? [])
        .filter((i) => match(i.title))
        .sort(compareLinearItems(state.lnOrder))
        .map((i) => ({ ...i, key: itemKey(i) }));
    }
    // unified
    const gh = (ghList.data ?? []).map((i) => ({ ...i, key: itemKey(i) }));
    const ln = (lnList.data ?? []).map((i) => ({ ...i, key: itemKey(i) }));
    return [...gh, ...ln]
      .filter((i) => match(i.title))
      .sort((a, b) => (b.updated ?? "").localeCompare(a.updated ?? ""));
  }, [state.source, state.query, state.lnOrder, ghList.data, lnList.data]);

  const counts: Record<Source, number | null> = {
    github: ghList.data?.length ?? null,
    linear: lnList.data?.length ?? null,
    unified: ghList.data && lnList.data ? ghList.data.length + lnList.data.length : null,
  };

  const scopeLabel = (() => {
    if (state.source === "github") {
      return state.ghRepo === "all" ? "All repos" : state.ghRepo;
    }
    if (state.source === "linear") {
      const s = state.lnScope;
      const boot = lnBoot.data;
      if (!boot) return "—";
      if (s.kind === "view") return boot.views.find((v) => v.id === s.id)?.name ?? "—";
      if (s.kind === "team") return boot.teams.find((t) => t.id === s.id)?.name ?? "—";
      if (s.kind === "project") return boot.projects.find((p) => p.id === s.id)?.name ?? "—";
      return "All issues";
    }
    return "Unified · GitHub + Linear";
  })();

  // Error surfacing: prefer auth message when there's no live GH, else the
  // fetch error. Same treatment for Linear.
  const activeError = (() => {
    if (state.source === "github") {
      if (!ghAuth.loading && !ghAuthed) return ghAuth.data?.message ?? "GitHub not authenticated.";
      return ghList.error;
    }
    if (state.source === "linear") return lnList.error ?? lnBoot.error;
    // unified — surface whichever failed
    return ghList.error ?? lnList.error;
  })();

  const activeEmptyHint = (() => {
    if (state.source === "github" && ghAuthed) {
      return "No matching issues or PRs. Try a different preset or repo.";
    }
    if (state.source === "linear") {
      // Empty because key missing → the fetch error path covers that; here
      // means the query returned zero rows.
      return "No matching Linear issues in this scope.";
    }
    if (state.source === "unified") {
      return "Nothing in your GitHub or Linear feeds right now.";
    }
    return null;
  })();

  const loading = (() => {
    if (state.source === "github") return ghAuth.loading || ghList.loading;
    if (state.source === "linear") return lnBoot.loading || lnList.loading;
    return ghList.loading || lnList.loading;
  })();

  const refresh = async () => {
    await invalidateTasksCache();
    setBump((b) => b + 1);
  };

  const toggleSelect = (key: string) => {
    setState((prev) => {
      const next = new Set(prev.selected);
      if (next.has(key)) next.delete(key); else next.add(key);
      return { ...prev, selected: next };
    });
  };
  const toggleExpanded = (key: string) => {
    setState((prev) => ({ ...prev, expandedKey: prev.expandedKey === key ? null : key }));
  };
  const clearSelection = () => setState((prev) => ({ ...prev, selected: new Set() }));

  // Keyboard: '/' focuses search, Esc collapses drawer, Ctrl/Cmd+Enter launches selection.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && state.expandedKey) {
        setState((prev) => ({ ...prev, expandedKey: null }));
      }
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (e.key === "/" && tag !== "INPUT" && tag !== "TEXTAREA") {
        e.preventDefault();
        (document.querySelector(".tasks-page .search input") as HTMLInputElement | null)?.focus();
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && state.selected.size > 0) {
        e.preventDefault();
        setModalKeys([...state.selected]);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [state.expandedKey, state.selected]);

  const openLaunchModal = (keys: string | string[]) => {
    setModalKeys(Array.isArray(keys) ? keys : [keys]);
  };

  const modalItems: UnifiedItem[] = modalKeys
    ? (modalKeys.map((k) => items.find((it) => it.key === k)).filter(Boolean) as UnifiedItem[])
    : [];

  return (
    <div className="tasks-page">
      <SourceTabs
        source={state.source}
        counts={counts}
        onChange={(s) => setState((prev) => ({ ...prev, source: s, selected: new Set() }))}
        onRefresh={refresh}
        refreshing={loading}
      />
      <ContextBar
        state={state}
        patch={patch}
        repos={ghRepos.data ?? []}
        linearBootstrap={lnBoot.data ?? null}
      />
      <main className="pane">
        <TaskList
          items={items}
          source={state.source}
          scopeLabel={scopeLabel}
          teams={lnBoot.data?.teams ?? []}
          projects={lnBoot.data?.projects ?? []}
          loading={loading}
          error={activeError ?? null}
          emptyHint={activeEmptyHint}
          selected={state.selected}
          expandedKey={state.expandedKey}
          linearGroupByStatus={state.lnGroup === "status"}
          onToggleSelect={toggleSelect}
          onToggleExpanded={toggleExpanded}
          onCollapse={() => setState((prev) => ({ ...prev, expandedKey: null }))}
          onLaunch={(key) => openLaunchModal(key)}
          launchedByKey={launchedByKey}
          activeSessionIds={activeSet}
          onViewSession={onViewSession}
        />
        <BulkBar
          count={state.selected.size}
          onLaunch={() => openLaunchModal([...state.selected])}
          onClear={clearSelection}
        />
      </main>

      {modalKeys && modalItems.length > 0 && (
        <LaunchAgentModal
          items={modalItems}
          projects={projects}
          defaultProjectId={defaultProjectId}
          onLaunch={onLaunch}
          onLaunched={(itemKey, sessionId) => {
            setLaunchedByKey((prev) => {
              const next = new Map(prev);
              next.set(itemKey, sessionId);
              return next;
            });
          }}
          onClose={() => setModalKeys(null)}
        />
      )}
    </div>
  );
}
