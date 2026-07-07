import { useState, useEffect, useRef, memo, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { invoke, Channel } from "@tauri-apps/api/core";
import { sessionManager } from "../store/sessionManager";
import { open } from "@tauri-apps/plugin-dialog";
import { openUrl } from "@tauri-apps/plugin-opener";
import { createWorktree, gitInit, NotAGitRepoError } from "../lib/worktree";
import { addRecent, getRecents, removeRecent } from "../store/recents";
import { getOpenProjects, saveOpenProjects } from "../store/openProjects";
import { getWorktreeSession, saveWorktreeSession, removeWorktreeSession, markWorktreeSessionClosed, markWorktreeSessionOpen, pruneOrphanedSessions, dedupeRootSessions, rootSessionKey, rootSessionIdFromKey, getRootSessionsForProject, type WorktreeSession } from "../store/sessions";
import { getRuntimeState, setRuntimeState, type PersistedTab } from "../lib/runtimeState";
import {
  LayoutGrid,
  Brain,
  FolderPlus,
  FolderOpen,
  Bug,
  Settings,
  Mail,
  PanelLeft,
  PanelRight,
  Sun,
  Moon,
  TerminalSquare,
  Eye,
  X,
  Plus,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Trash2,
  AlertTriangle,
  Loader,
  SquareSlash,
  Globe,
  FileCode,
  Megaphone,
  Columns2,
  Rows2,
  ListOrdered,
  BookOpen,
  Copy,
  Check,
  Cpu,
  Database,
} from "lucide-react";
import { useWorkState, setWorkState, clearWorkState } from "../store/workState";
import { useKeybindings, matchesEvent, formatShortcut } from "../store/keybindings";
import { useAttribution, getAttribution, COAUTHOR_LINE } from "../store/attribution";
import { useSettings, getSettings, updateSetting } from "../store/appSettings";
import { TopBar } from "./TopBar";
import { TerminalPane } from "./TerminalPane";
import { DiffPane } from "./DiffPane";
import { PreviewPane } from "./PreviewPane";
import { CodeMirrorPane } from "./CodeMirrorPane";
import { RightSidebar } from "./RightSidebar";
import { NewSessionMenu, NewSessionPlacement, AgentConfig, AGENT_CONFIGS, AgentIcon } from "./NewSessionMenu";
import { SettingsPanel } from "./SettingsPanel";
import { Tooltip } from "./Tooltip";
import { BroadcastDialog, BroadcastSession } from "./BroadcastDialog";
import "./BroadcastDialog.css";
import { QueuePanel } from "./QueuePanel";
import { dequeue, useQueue } from "../store/messageQueue";
import { getPrompts, type PromptEntry } from "../store/prompts";
import { useTheme, builtinThemes } from "../themes/ThemeContext";
import { Mark } from "../assets/Mark";
import { StatusBar } from "./StatusBar";
import { AtlasIndexModal } from "./AtlasIndexModal";
import { KnowledgeBasePage } from "./KnowledgeBasePage";
import "./StatusBar.css";
import "./WorkspaceView.css";

interface Props {
  zen?: true;
  name?: string;
  path?: string;
}

interface Session {
  id: string;
  name: string;
  cwd: string;
  projectId: string;
  kind?: "terminal" | "diff" | "preview" | "editor"; // defaults to "terminal" when absent
  previewUrl?: string; // current URL for preview tabs
  agent?: string; // CLI command when this is an agent session (e.g. "claude")
  conversationId?: string; // the Claude conversation UUID
  instanceId: string; // permanent canonical identity — minted once (= sessionId), never changes across resumes
  createdAt: string; // ISO timestamp
  isRootSession?: boolean; // true when session runs in the project root (no worktree)
  noGit?: boolean; // true when user skipped git init for this root session
  sandboxed?: boolean; // true when session is running inside a Hephaestus isolation sandbox
  parentSessionId?: string; // set when this session was spawned via a split from another
  storeKey?: string; // the sessions.ts key this session was saved under; undefined = not persisted
  metadata: {
    resumeCount: number;
    hasBeenResumed: boolean;
  };
}

interface Worktree {
  name: string;
  path: string;
}

interface Project {
  id: string;
  name: string;
  path: string;
  expanded: boolean;
  worktrees: Worktree[];
}

type NavSection = "overview" | "knowledge-base";

// Directories under .tempest/ that are internal to Tempest and must never be
// treated as git worktrees in the sidebar.
const TEMPEST_INTERNAL_DIRS = new Set(["atlas", "logs"]);

function folderName(p: string): string {
  return p.replace(/[/\\]+$/, "").split(/[/\\]/).pop() ?? p;
}

// ─── Split pane layout ────────────────────────────────────────────────────────
// "v" = vertical divider (panes side by side); "h" = horizontal divider (stacked).
type SplitDir = "h" | "v";
interface SplitLeaf   { type: "leaf";  sessionId: string; }
interface SplitBranch { type: "split"; id: string; dir: SplitDir; ratio: number; first: PaneNode; second: PaneNode; }
type PaneNode = SplitLeaf | SplitBranch;
interface PaneRect    { top: number; left: number; width: number; height: number; } // 0–1 fractions

function paneSessionIds(n: PaneNode): string[] {
  if (n.type === "leaf") return [n.sessionId];
  return [...paneSessionIds(n.first), ...paneSessionIds(n.second)];
}

function replaceLeaf(n: PaneNode, id: string, repl: PaneNode): PaneNode | null {
  if (n.type === "leaf") return n.sessionId === id ? repl : null;
  const a = replaceLeaf(n.first, id, repl); if (a) return { ...n, first: a } as SplitBranch;
  const b = replaceLeaf(n.second, id, repl); if (b) return { ...n, second: b } as SplitBranch;
  return null;
}

function removeLeaf(n: PaneNode, id: string): PaneNode | null {
  if (n.type === "leaf") return null;
  if (n.first.type  === "leaf" && n.first.sessionId  === id) return n.second;
  if (n.second.type === "leaf" && n.second.sessionId === id) return n.first;
  const a = removeLeaf(n.first, id);  if (a !== null) return { ...n, first: a }  as SplitBranch;
  const b = removeLeaf(n.second, id); if (b !== null) return { ...n, second: b } as SplitBranch;
  return null;
}

function patchRatio(n: PaneNode, splitId: string, ratio: number): PaneNode {
  if (n.type === "leaf") return n;
  const b = n as SplitBranch;
  if (b.id === splitId) return { ...b, ratio };
  return { ...b, first: patchRatio(b.first, splitId, ratio), second: patchRatio(b.second, splitId, ratio) };
}

function computeRects(n: PaneNode, r: PaneRect = { top: 0, left: 0, width: 1, height: 1 }): Map<string, PaneRect> {
  if (n.type === "leaf") return new Map([[n.sessionId, r]]);
  const { dir, ratio } = n as SplitBranch;
  const a: PaneRect = dir === "v" ? { ...r, width: r.width * ratio }                              : { ...r, height: r.height * ratio };
  const b: PaneRect = dir === "v" ? { ...r, left: r.left + r.width * ratio, width: r.width * (1 - ratio) } : { ...r, top: r.top + r.height * ratio, height: r.height * (1 - ratio) };
  return new Map([...computeRects(n.first, a), ...computeRects(n.second, b)]);
}

interface HandleInfo { id: string; dir: SplitDir; ratio: number; parentRect: PaneRect; }
function collectHandles(n: PaneNode, r: PaneRect = { top: 0, left: 0, width: 1, height: 1 }): HandleInfo[] {
  if (n.type === "leaf") return [];
  const { id, dir, ratio } = n as SplitBranch;
  const a: PaneRect = dir === "v" ? { ...r, width: r.width * ratio }                              : { ...r, height: r.height * ratio };
  const b: PaneRect = dir === "v" ? { ...r, left: r.left + r.width * ratio, width: r.width * (1 - ratio) } : { ...r, top: r.top + r.height * ratio, height: r.height * (1 - ratio) };
  return [{ id, dir, ratio, parentRect: r }, ...collectHandles(n.first, a), ...collectHandles(n.second, b)];
}
// ─────────────────────────────────────────────────────────────────────────────

// Right-side work state badge on a tab: spinner while working, dot when done.
// memo: re-renders only when this session's work state changes, not on any parent re-render.
const WorkStateBadge = memo(function WorkStateBadge({ sessionId }: { sessionId: string }) {
  const state = useWorkState(sessionId);
  if (state === "working") return <Loader size={11} className="spin work-spinner" />;
  if (state === "done") return <span className="work-done-dot" aria-label="Agent finished" />;
  return null;
});

// Queue count badge on a tab — re-renders only when this session's queue changes.
const QueueBadge = memo(function QueueBadge({ sessionId, onClick }: { sessionId: string; onClick: (e: React.MouseEvent) => void }) {
  const queue = useQueue(sessionId);
  if (!queue.length) return null;
  return (
    <button
      className="session-tab-queue-badge"
      onClick={onClick}
      title={`${queue.length} message${queue.length !== 1 ? "s" : ""} queued`}
    >
      {queue.length}
    </button>
  );
});

// Compact work-state indicator for sidebar rows (spinner while working, dot when done).
const SidebarWorkBadge = memo(function SidebarWorkBadge({ sessionId }: { sessionId: string }) {
  const state = useWorkState(sessionId);
  if (state === "working") return <Loader size={11} className="spin work-spinner" />;
  if (state === "done") return <span className="work-done-dot" aria-label="Agent finished" />;
  return null;
});


export function WorkspaceView({ zen, name, path }: Props) {
  const [activeSection, setActiveSection] = useState<NavSection>("overview");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [sessionMenuOpen, setSessionMenuOpen] = useState(false);
  const [sessionMenuRect, setSessionMenuRect] = useState<DOMRect | null>(null);
  const [sessionMenuPlacement, setSessionMenuPlacement] = useState<NewSessionPlacement>("below");
  const [showTerminalNaming, setShowTerminalNaming] = useState(false);
  const [terminalName, setTerminalName] = useState("");
  const [terminalPrompt, setTerminalPrompt] = useState("");
  const [terminalLaunching, setTerminalLaunching] = useState(false);
  const [terminalError, setTerminalError] = useState<string | null>(null);
  const [gitNotFound, setGitNotFound] = useState(false);
  const [gitNotFoundRoot, setGitNotFoundRoot] = useState(false);
  const [rootRemoteUrl, setRootRemoteUrl] = useState("");
  const [rootGitInitializing, setRootGitInitializing] = useState(false);
  const [rootGitError, setRootGitError] = useState<string | null>(null);
  const [useExistingBranch, setUseExistingBranch] = useState(false);
  const [existingBranchName, setExistingBranchName] = useState("");
  const [existingBranchList, setExistingBranchList] = useState<string[]>([]);

  const [sessions, setSessions] = useState<Session[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [renamingSessionId, setRenamingSessionId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [dragTabId, setDragTabId] = useState<string | null>(null);
  const [dragOverTabId, setDragOverTabId] = useState<string | null>(null);
  const [dragOverSide, setDragOverSide] = useState<"before" | "after">("before");
  const dragTabIdRef = useRef<string | null>(null);
  const dragOverTabIdRef = useRef<string | null>(null);
  const dragOverSideRef = useRef<"before" | "after">("before");

  const [activeBranch, setActiveBranch] = useState<string | null>(null);
  const [rightSidebarOpen, setRightSidebarOpen] = useState(true);
  const [gitRevision, setGitRevision] = useState(0);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsInitialSection, setSettingsInitialSection] = useState<string>("appearance");
  const [broadcastOpen, setBroadcastOpen] = useState(false);
  const [atlasPromptPath, setAtlasPromptPath] = useState<string | null>(null);
  const [recentPage, setRecentPage] = useState(0);
  const [recentsVersion, setRecentsVersion] = useState(0);
  const [atlasAutoIndexLocal, setAtlasAutoIndexLocal] = useState(false);
  const [atlasIndexingPaths, setAtlasIndexingPaths] = useState<string[]>([]);
  const [atlasDebugModal, setAtlasDebugModal] = useState(false);
  const [queueOpenSessionId, setQueueOpenSessionId] = useState<string | null>(null);
  const [promptPickerOpen, setPromptPickerOpen] = useState(false);
  const [promptPickerItems, setPromptPickerItems] = useState<PromptEntry[]>([]);
  const [promptSentId, setPromptSentId] = useState<string | null>(null);
  const promptPickerRef = useRef<HTMLDivElement>(null);
  const [sidebarAtTop, setSidebarAtTop] = useState(true);
  const [sidebarAtBottom, setSidebarAtBottom] = useState(false);
  const sidebarScrollRef = useRef<HTMLDivElement>(null);

  // Split pane layout. null = single-pane mode (normal). Non-null = one or more
  // splits active. activeSessionId continues to track which pane has focus.
  const [paneLayout, setPaneLayout] = useState<PaneNode | null>(null);
  const paneLayoutRef = useRef<PaneNode | null>(null);
  paneLayoutRef.current = paneLayout; // always current for closure-captured handlers
  const sessionsRef = useRef<Session[]>([]);
  sessionsRef.current = sessions; // always current for post-restore active-session lookup
  const workspaceContentRef = useRef<HTMLDivElement>(null);
  const draggingHandle = useRef<{
    splitId: string; dir: SplitDir;
    startClient: number; startRatio: number; containerSize: number;
  } | null>(null);

  // Zen mode: flat worktree list for the single project
  const [zenWorktrees, setZenWorktrees] = useState<Worktree[]>([]);

  // Default mode: multi-project state (persisted to localStorage)
  const [projects, setProjects] = useState<Project[]>(() =>
    zen ? [] : getOpenProjects().map((p) => ({ ...p, worktrees: [] }))
  );
  const projectsRef = useRef<Project[]>([]);
  projectsRef.current = projects;
  const [pendingProjectId, setPendingProjectId] = useState<string | null>(null);
  const [pendingAgent, setPendingAgent] = useState<AgentConfig | null>(null);

  // (sessionChannels and outputCaptures replaced by SessionManager — it owns all
  // Channel subscriptions, per-session ring buffers, and capture callbacks.)

  // Tracks which cwd paths currently have an openSession call in flight.
  // Prevents duplicate spawns when the restore loop calls openSession for the
  // same path back-to-back before any state update has flushed (stale closure).
  const spawningPaths = useRef<Set<string>>(new Set());

  // Always-current keyboard shortcut handler (avoids stale closure on the listener).
  const shortcutHandlerRef = useRef<(e: KeyboardEvent) => void>(() => {});

  // Sidebar right-click context menu
  const [ctxMenu, setCtxMenu] = useState<{
    x: number; y: number;
    worktree: Worktree | null;
    projectPath: string;
    projectId: string;
    sessionId: string | null;
    isProjectHeader?: boolean; // true when right-clicking a project row (not a worktree)
    isRootSession?: boolean;   // true when right-clicking a root session or its ghost
    rootKey?: string;          // unique store key for a root-session ghost (sessionId is null)
  } | null>(null);

  // Delete workspace dialog state
  const [deleteDialog, setDeleteDialog] = useState<{
    worktree: Worktree;
    projectPath: string;
    projectId: string;
    sessionId: string | null;
    branchName: string | null;
    deleteBranch: boolean;
    step: 1 | 2;
    loading: boolean;
    error: string | null;
  } | null>(null);


  // Persist projects list to localStorage whenever it changes
  useEffect(() => {
    if (zen) return;
    saveOpenProjects(
      projects.map(({ id, name, path, expanded }) => ({ id, name, path, expanded }))
    );
  }, [projects, zen]);

  // Persist tab-bar order whenever sessions change.
  useEffect(() => {
    if (zen) return;
    setRuntimeState({ sessionOrder: sessions.map((s) => s.instanceId) });
  }, [sessions, zen]); // eslint-disable-line react-hooks/exhaustive-deps

  // Persist which session was last focused (by stable instanceId, not ephemeral PTY id).
  useEffect(() => {
    if (zen) return;
    const active = sessions.find((s) => s.id === activeSessionId);
    setRuntimeState({ activeInstanceId: active?.instanceId ?? null });
  }, [activeSessionId, sessions, zen]); // eslint-disable-line react-hooks/exhaustive-deps

  // On mount: scan every open project for valid worktrees, prune stale session
  // entries that no longer correspond to any path on disk, then restore only
  // the sessions that are still valid. This ensures deleted/removed projects
  // never re-appear as tabs on the next launch.
  useEffect(() => {
    if (zen) return;

    async function restoreAll() {
      // Phase 1 — discover which paths actually exist on disk across all projects.
      const validPaths = new Set<string>();
      const allProjectData: { project: Project; wts: { name: string; path: string }[] }[] = [];

      for (const project of projects) {
        const wts: { name: string; path: string }[] = [];
        // The project root is always a valid anchor for a persisted root session
        // (agent root ghosts live only in sessions store keyed by project.path — they
        // have no disk directory). This MUST be added unconditionally, outside the
        // try below: a project that only ever had root sessions has no .tempest/
        // directory, so list_directory throws and — if this lived inside the try —
        // project.path would be missing from validPaths and pruneOrphanedSessions
        // would wipe the agent root ghost on the next restore cycle.
        validPaths.add(project.path);
        // One-shot migration: collapse duplicate agent root-session entries left behind
        // by the old restore bug. Gated behind a flag so it never runs again once done.
        if (!getRuntimeState().migrations["sessions-v2"]) {
          dedupeRootSessions(project.path);
          setRuntimeState({ migrations: { ...getRuntimeState().migrations, "sessions-v2": true } });
        }
        // Root sessions (agent + terminal) live only in the sessions store under unique
        // keys (project.path + "::root::" + sessionId) with no disk directory. Mark
        // each as valid so pruneOrphanedSessions doesn't wipe them on restore.
        for (const { key } of getRootSessionsForProject(project.path)) {
          validPaths.add(key);
        }
        try {
          const entries = await invoke<{ name: string; path: string; is_dir: boolean }[]>(
            "list_directory",
            { path: `${project.path}/.tempest` }
          );
          entries.filter((e) => e.is_dir && !TEMPEST_INTERNAL_DIRS.has(e.name)).forEach((e) => {
            wts.push({ name: e.name, path: e.path });
            validPaths.add(e.path);
          });
        } catch {
          // .tempest/ doesn't exist or project path is gone
        }

        allProjectData.push({ project, wts });
        setProjects((prev) =>
          prev.map((p) => (p.id === project.id ? { ...p, worktrees: wts } : p))
        );
      }

      // Phase 2 — remove session entries whose paths no longer exist on disk.
      pruneOrphanedSessions(validPaths);

      // Phase 3 — collect every item to restore into a single sorted list.
      //
      // Sessions are opened in saved tab-bar order (sessionOrder) so the tab bar
      // looks exactly as the user left it. The saved active session is opened last
      // so the final setActiveSessionId call leaves it focused. Non-terminal tabs
      // (diff, preview, editor) are included in the same ordered list.
      const { sessionOrder, activeInstanceId: savedActiveId, tabs: savedTabs } = getRuntimeState();
      const orderMap = new Map(sessionOrder.map((id, i) => [id, i]));

      type RestoreItem = {
        instanceId: string;
        isActive: boolean;
        sortIndex: number;
        open: () => Promise<void>;
      };
      const items: RestoreItem[] = [];

      for (const { project, wts } of allProjectData) {
        // Worktree sessions
        for (const wt of wts) {
          const saved = getWorktreeSession(wt.path);
          if (!saved || saved.closed === true) continue;
          const instanceId = saved.instanceId ?? wt.path;
          items.push({
            instanceId,
            isActive: instanceId === savedActiveId,
            sortIndex: orderMap.get(instanceId) ?? Infinity,
            open: () => openSession(
              saved.name, wt.path, project.id, saved.agent,
              undefined, undefined,
              saved.agent ? saved.conversationId : undefined,
              undefined, undefined,
              true // dedupe
            ).catch(() => {}),
          });
        }

        // Root sessions (agent + plain terminal in project root)
        for (const { key: rootStoreKey, session: rootSaved } of getRootSessionsForProject(project.path)) {
          if (rootSaved.closed === true) continue;
          // Migrate: write instanceId to entries created before this field was introduced.
          if (!rootSaved.instanceId) {
            const inferredId = rootSessionIdFromKey(rootStoreKey);
            if (inferredId) saveWorktreeSession(rootStoreKey, { ...rootSaved, instanceId: inferredId });
          }
          const instanceId = rootSaved.instanceId ?? rootSessionIdFromKey(rootStoreKey);
          items.push({
            instanceId,
            isActive: instanceId === savedActiveId,
            sortIndex: orderMap.get(instanceId) ?? Infinity,
            open: () => openSession(
              rootSaved.name, project.path, project.id, rootSaved.agent,
              undefined, undefined,
              rootSaved.agent ? rootSaved.conversationId : undefined,
              true, rootSaved.noGit,
              true, // dedupe
              rootSessionIdFromKey(rootStoreKey)
            ).catch(() => {}),
          });
        }
      }

      // Non-terminal tabs (diff, preview, editor) — only for projects still open.
      const openProjectIds = new Set(projects.map((p) => p.id));
      for (const tab of savedTabs.filter((t) => openProjectIds.has(t.projectId))) {
        const newId = crypto.randomUUID();
        items.push({
          instanceId: tab.instanceId,
          isActive: tab.instanceId === savedActiveId,
          sortIndex: orderMap.get(tab.instanceId) ?? Infinity,
          open: async () => {
            setSessions((prev) => {
              if (prev.some((s) => s.instanceId === tab.instanceId)) return prev;
              return [...prev, {
                id: newId,
                instanceId: tab.instanceId,
                name: tab.name,
                cwd: tab.cwd,
                projectId: tab.projectId,
                kind: tab.kind,
                previewUrl: tab.previewUrl,
                createdAt: new Date().toISOString(),
                metadata: { resumeCount: 0, hasBeenResumed: false },
              }];
            });
            setActiveSessionId(newId);
          },
        });
      }

      // Sort: non-active sessions in saved order, active session unconditionally last
      // so its setActiveSessionId call wins and it is visually focused on launch.
      items.sort((a, b) => {
        if (a.isActive !== b.isActive) return a.isActive ? 1 : -1;
        if (a.sortIndex !== b.sortIndex) return a.sortIndex - b.sortIndex;
        return 0;
      });

      // Phase 4 — open all in order.
      for (const item of items) {
        await item.open();
      }
    }

    restoreAll();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Load worktrees for the zen-mode project on mount
  useEffect(() => {
    if (!zen || !path) return;
    invoke<{ name: string; path: string; is_dir: boolean }[]>("list_directory", {
      path: `${path}/.tempest`,
    })
      .then((entries) =>
        setZenWorktrees(
          entries.filter((e) => e.is_dir && !TEMPEST_INTERNAL_DIRS.has(e.name)).map((e) => ({ name: e.name, path: e.path }))
        )
      )
      .catch(() => {});
  }, [path]);

  const keybinds = useKeybindings();
  const attribution = useAttribution();
  const { sidebarFontSize, branchPrefix, atlasEnabled } = useSettings();

  // Apply or remove the co-author hook across all projects when the setting changes.
  const prevAttribution = useRef<boolean | null>(null);
  useEffect(() => {
    if (prevAttribution.current === null) { prevAttribution.current = attribution; return; }
    if (prevAttribution.current === attribution) return;
    prevAttribution.current = attribution;
    projects.forEach((p) => {
      if (attribution) {
        invoke("write_coauthor_hook", { repoPath: p.path, coauthorLine: COAUTHOR_LINE }).catch(() => {});
      } else {
        invoke("remove_coauthor_hook", { repoPath: p.path }).catch(() => {});
      }
    });
  }, [attribution, projects]); // eslint-disable-line react-hooks/exhaustive-deps

  // Keep keyboard shortcut handler up-to-date without re-registering the listener.
  useEffect(() => {
    shortcutHandlerRef.current = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const tag = target.tagName;
      // xterm.js routes keystrokes through a hidden helper <textarea>. Let those
      // events through so app shortcuts still work while a terminal is focused;
      // TerminalPane's custom key handler keeps the matching keys off the PTY.
      const isTerminalInput = target.classList.contains("xterm-helper-textarea");
      if ((tag === "INPUT" || tag === "TEXTAREA") && !isTerminalInput) return;

      if (matchesEvent(keybinds.toggleTheme, e)) {
        e.preventDefault(); toggleTheme();
      } else if (matchesEvent(keybinds.toggleLeftSidebar, e)) {
        e.preventDefault(); setSidebarOpen((o) => !o);
      } else if (matchesEvent(keybinds.toggleRightSidebar, e)) {
        e.preventDefault(); setRightSidebarOpen((o) => !o);
      } else if (matchesEvent(keybinds.openSettings, e)) {
        e.preventDefault(); setSettingsOpen((o) => !o);
      } else if (matchesEvent(keybinds.openProject, e)) {
        e.preventDefault(); addWorkspace();
      } else if (matchesEvent(keybinds.newWorkspace, e)) {
        e.preventDefault();
        const projId = activeSession?.projectId ?? (projects[0]?.id ?? null);
        openSessionMenu({ currentTarget: document.body } as unknown as React.MouseEvent<HTMLElement>, projId, "below");
      } else if (matchesEvent(keybinds.broadcast, e)) {
        e.preventDefault(); setBroadcastOpen(true);
      } else if (e.altKey && !e.ctrlKey && !e.shiftKey && e.key.toLowerCase() === "m") {
        e.preventDefault(); setAtlasDebugModal((v) => !v);
      } else if (matchesEvent(keybinds.closeTab, e)) {
        e.preventDefault(); if (activeSessionId) closeSession(activeSessionId);
      } else if (matchesEvent(keybinds.nextTab, e)) {
        e.preventDefault();
        if (sessions.length > 0) {
          const idx = sessions.findIndex((s) => s.id === activeSessionId);
          setActiveSessionId(sessions[(idx + 1) % sessions.length].id);
        }
      } else if (matchesEvent(keybinds.prevTab, e)) {
        e.preventDefault();
        if (sessions.length > 0) {
          const idx = sessions.findIndex((s) => s.id === activeSessionId);
          setActiveSessionId(sessions[(idx - 1 + sessions.length) % sessions.length].id);
        }
      } else if (matchesEvent(keybinds.splitPaneV, e)) {
        e.preventDefault(); splitPane("v");
      } else if (matchesEvent(keybinds.splitPaneH, e)) {
        e.preventDefault(); splitPane("h");
      } else if (matchesEvent(keybinds.openQueue, e)) {
        e.preventDefault();
        if (activeSession?.agent) {
          setQueueOpenSessionId((prev) => prev === activeSession.id ? null : activeSession.id);
        }
      }
    };
  });

  // Register the keyboard shortcut listener once in capture phase so it fires
  // before xterm.js (or any focused element) can consume the event.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => shortcutHandlerRef.current(e);
    window.addEventListener("keydown", handler, true);
    return () => window.removeEventListener("keydown", handler, true);
  }, []);

  // Global pointer handlers for pane-resize drag. Registered once; reads
  // layout through paneLayoutRef to avoid the stale-closure problem.
  useEffect(() => {
    function onMouseMove(e: MouseEvent) {
      const drag = draggingHandle.current;
      if (!drag || !paneLayoutRef.current) return;
      const delta = (drag.dir === "v" ? e.clientX : e.clientY) - drag.startClient;
      const newRatio = Math.min(0.9, Math.max(0.1, drag.startRatio + delta / drag.containerSize));
      setPaneLayout(patchRatio(paneLayoutRef.current, drag.splitId, newRatio));
    }
    function onMouseUp() {
      draggingHandle.current = null;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    }
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, []);

  function resetTerminalModal() {
    setShowTerminalNaming(false);
    setTerminalName("");
    setTerminalPrompt("");
    setTerminalError(null);
    setGitNotFound(false);
    setGitNotFoundRoot(false);
    setRootRemoteUrl("");
    setRootGitError(null);
    setPendingProjectId(null);
    setPendingAgent(null);
    setUseExistingBranch(false);
    setExistingBranchName("");
    setExistingBranchList([]);
  }

  // Fetch branches when the naming modal opens so the "use existing branch" toggle
  // has a list ready without the user having to wait after clicking it.
  useEffect(() => {
    if (!showTerminalNaming) return;
    const projectPath = projects.find((p) => p.id === pendingProjectId)?.path ?? (zen ? path ?? "" : "");
    if (!projectPath) return;
    invoke<{ name: string; is_current: boolean }[]>("git_list_branches", { repoPath: projectPath })
      .then((branches) => setExistingBranchList(branches.map((b) => b.name)))
      .catch(() => {});
  }, [showTerminalNaming]); // eslint-disable-line react-hooks/exhaustive-deps

  function openCtxMenu(
    e: React.MouseEvent,
    worktree: Worktree | null,
    projectPath: string,
    projectId: string,
    sessionId: string | null,
    isProjectHeader = false,
    isRootSession = false,
    rootKey?: string
  ) {
    e.preventDefault();
    e.stopPropagation();
    setCtxMenu({ x: e.clientX, y: e.clientY, worktree, projectPath, projectId, sessionId, isProjectHeader, isRootSession, rootKey });
  }

  function removeProject(projectId: string) {
    // Close all active sessions belonging to this project
    const projectSessions = sessions.filter((s) => s.projectId === projectId);
    projectSessions.forEach((s) => {
      if (s.kind !== "diff" && s.kind !== "preview" && s.kind !== "editor") {
        invoke("close_pty_session", { sessionId: s.id }).catch(() => {});
        sessionManager.unregister(s.id);
      }
      clearWorkState(s.id);
    });
    const removedIds = projectSessions.map((s) => s.id);
    setPaneLayout((prev) => {
      if (!prev) return null;
      let updated: PaneNode | null = prev;
      for (const sid of removedIds) {
        if (updated) updated = removeLeaf(updated, sid);
      }
      if (!updated || updated.type === "leaf") return null;
      return updated;
    });
    setSessions((prev) => prev.filter((s) => s.projectId !== projectId));
    if (projectSessions.some((s) => s.id === activeSessionId)) setActiveSessionId(null);
    const removedProject = projects.find((p) => p.id === projectId);
    setProjects((prev) => prev.filter((p) => p.id !== projectId));
    // Remove persisted non-terminal tabs for this project.
    const st = getRuntimeState();
    setRuntimeState({ tabs: st.tabs.filter((t) => t.projectId !== projectId) });
    // Stop the atlas file-watcher daemon for this project if one is running.
    if (removedProject) {
      invoke("stop_atlas_daemon", { projectPath: removedProject.path }).catch(() => {});
    }
    setCtxMenu(null);
  }

  function openDeleteDialog(
    worktree: Worktree,
    projectPath: string,
    projectId: string,
    sessionId: string | null
  ) {
    setCtxMenu(null);
    // Tempest always creates the branch with the same name as the worktree folder
    setDeleteDialog({
      worktree, projectPath, projectId, sessionId,
      branchName: worktree.name,
      deleteBranch: false,
      step: 1,
      loading: false,
      error: null,
    });
  }

  async function performDeleteWorkspace(withBranch: boolean) {
    if (!deleteDialog) return;
    // Capture everything before any async ops so we can close the dialog early
    const { worktree, projectPath, projectId, sessionId, branchName } = deleteDialog;
    setDeleteDialog((d) => d ? { ...d, loading: true, error: null } : null);
    try {
      // Single Rust round-trip: kill the PTY child, wait for it to exit, then
      // remove the worktree directory. Collapsing these two operations into one
      // invoke is the fix for the delete race — there is no longer any window
      // where React state can update mid-sequence and drop the pending callback,
      // which previously left the PowerShell process alive and the directory
      // locked (os error 32). All state updates happen only AFTER this resolves.
      await invoke("close_and_remove_worktree", {
        sessionId: sessionId ?? "",
        repoPath: projectPath,
        worktreePath: worktree.path,
      });

      if (sessionId) {
        clearWorkState(sessionId);
        setSessions((prev) => prev.filter((s) => s.id !== sessionId));
        if (activeSessionId === sessionId) setActiveSessionId(null);
      }
      removeWorktreeSession(worktree.path);
      if (zen) {
        setZenWorktrees((prev) => prev.filter((w) => w.path !== worktree.path));
      } else {
        setProjects((prev) =>
          prev.map((p) =>
            p.id === projectId
              ? { ...p, worktrees: p.worktrees.filter((w) => w.path !== worktree.path) }
              : p
          )
        );
      }
      // Dismiss the dialog as soon as the workspace is gone from disk
      setDeleteDialog(null);
      // Branch deletion runs after the dialog closes; errors are non-blocking
      if (withBranch && branchName) {
        await invoke("git_branch_delete", { repoPath: projectPath, branchName }).catch(() => {});
      }
    } catch (e) {
      setDeleteDialog((d) => d ? { ...d, loading: false, error: String(e) } : null);
    }
  }

  function handleDeleteConfirm() {
    if (!deleteDialog) return;
    if (deleteDialog.step === 1) {
      if (deleteDialog.deleteBranch) {
        setDeleteDialog((d) => d ? { ...d, step: 2 } : null);
      } else {
        performDeleteWorkspace(false);
      }
    } else {
      performDeleteWorkspace(true);
    }
  }

  // Builds the complete argument list passed to an agent CLI. Session/resume flags
  // come from the per-agent AGENT_CONFIGS entry, with "{UUID}" substituted for the
  // appropriate conversation id. Agents whose config has null session/resume args
  // receive no session flags and simply start fresh.
  function buildAgentArgs(
    agent: string,
    sessionId: string, // the new PTY session UUID, minted as the conversation id on first spawn
    conversationId?: string, // stored UUID, present only when resuming
    prompt?: string
  ): string[] {
    const config = AGENT_CONFIGS.find((a) => a.hint === agent);
    const args: string[] = [];

    if (config && conversationId && config.resumeArgs) {
      // Standard ID-based resume (Claude Code, Gemini CLI)
      for (const arg of config.resumeArgs) {
        args.push(arg.replace("{UUID}", conversationId));
      }
    } else if (config && conversationId && config.captureResumeArgs) {
      // Captured-ID resume (Opencode — session ID was extracted from PTY output)
      for (const arg of config.captureResumeArgs) {
        args.push(arg.replace("{UUID}", conversationId));
      }
    } else if (config && !conversationId && config.sessionIdArgs) {
      // First spawn — mint this session's UUID as the conversation id
      for (const arg of config.sessionIdArgs) {
        args.push(arg.replace("{UUID}", sessionId));
      }
    }
    // If all arg arrays are null (e.g. Aider, plain opencode first spawn),
    // no session flags are added and the agent starts fresh or uses CWD state.

    // Auto-approve: append the agent's skip-permissions flag before the prompt
    // so it's not parsed as task content by the CLI.
    if (config?.autoApproveArgs && getSettings().autoApprove) {
      for (const arg of config.autoApproveArgs) {
        args.push(arg);
      }
    }

    if (prompt) args.push(prompt);
    return args;
  }

  async function openSession(
    sessionName: string,
    cwd: string,
    projectId = "",
    agent?: string,
    prompt?: string,
    _sessionMetadata?: { resumeCount: number; hasBeenResumed: boolean },
    originalId?: string, // original conversation UUID for resuming an existing agent session
    isRootSession?: boolean,
    noGit?: boolean,
    dedupe = false, // true only in the restore loop — prevents duplicate PTY spawns from stale-closure races
    providedSessionId?: string, // pre-minted ID so splitPane() can set up the tree before the PTY spawns
    parentSessionId?: string // set when spawned via a split — makes this a sub-session of another
  ) {
    // Guard is scoped to the restore loop (dedupe=true). User-triggered opens never block
    // each other, so two root sessions at the same cwd can be opened intentionally.
    if (dedupe && spawningPaths.current.has(cwd)) return;
    if (dedupe) spawningPaths.current.add(cwd);

    try {
      const sessionId = providedSessionId ?? crypto.randomUUID();

      // The localStorage key this session persists under. Root sessions (agent OR
      // plain terminal) use a per-session unique key so they don't collide at the
      // shared cwd = project root. Worktree sessions key on cwd, and only when they
      // carry an agent worth resuming — plain terminal worktrees aren't persisted.
      const rootKey = isRootSession ? rootSessionKey(cwd, sessionId) : null;
      const storeKey = rootKey ?? (agent ? cwd : undefined);

      // Worktree sessions: the store key (path) is the stable identity — reuse it so
      // instanceId never changes across restarts. Root sessions have no path anchor, so
      // the session UUID (stable via providedSessionId on resume) is the right choice.
      const instanceId = isRootSession
        ? (providedSessionId ?? sessionId)
        : (storeKey ?? sessionId);

      // Assemble the agent's full argument list (session/resume flags + prompt) here in
      // TypeScript so Rust receives a ready-to-run command. originalId is present only
      // when resuming an existing conversation.
      const args = agent ? buildAgentArgs(agent, sessionId, originalId, prompt) : null;

      const config = agent ? AGENT_CONFIGS.find((a) => a.hint === agent) : null;
      const usesCapturePattern = !!(config?.capturePattern && config.captureResumeArgs);
      const conversationId = usesCapturePattern && !originalId ? undefined : (originalId ?? sessionId);

      // Save metadata immediately after the PTY spawns so it survives tab close.
      // Skip during restore (dedupe): the entry already exists and is correct, and
      // re-writing it would create a duplicate under a freshly minted key.
      if (storeKey && !dedupe && !parentSessionId) {
        saveWorktreeSession(storeKey, { name: sessionName, agent, conversationId, instanceId, projectId, isRootSession, noGit });
      }

      // Build the optional capture callback for agents that mint their own session ID
      // from PTY output (e.g. opencode). The callback is registered with the Manager
      // and removed once the ID is found.
      let captureOnChunk: ((data: string) => void) | undefined;
      if (agent && config?.capturePattern && config.captureResumeArgs && !originalId) {
        const pattern = config.capturePattern;
        captureOnChunk = (data: string) => {
          const match = pattern.exec(data);
          if (match?.[1]) {
            const capturedId = match[1];
            const captureKey = storeKey ?? cwd;
            const stored = getWorktreeSession(captureKey);
            if (stored) saveWorktreeSession(captureKey, { ...stored, conversationId: capturedId });
            setSessions((prev) =>
              prev.map((s) => (s.id === sessionId ? { ...s, conversationId: capturedId } : s))
            );
            sessionManager.setOnChunk(sessionId, null);
          }
        };
      }

      const channel = new Channel<{ session_id: string; data: string }>();

      // Build isolation spec for ALL PTY sessions when isolation is enabled.
      // Agent sessions: full sandbox (network filter on Linux/macOS, Job Object on Windows).
      // Terminal sessions: lifecycle-only (Job Object on Windows, process group on Linux/macOS).
      const shouldIsolate = getSettings().isolateAgents;
      const sandboxParam = shouldIsolate ? (agent ? {
        mode: "enforce",
        allowed_hosts: [
          "*.anthropic.com",
          "*.openai.com",
          "*.google.com",
          "*.googleapis.com",
          "github.com",
          "*.github.com",
          "*.githubusercontent.com",
          "registry.npmjs.org",
          "*.npmjs.org",
          "pypi.org",
          "*.pypi.org",
        ],
        rw_paths: [cwd],
        ro_paths: [] as string[],
      } : {
        mode: "lifecycle",
        allowed_hosts: [] as string[],
        rw_paths: [] as string[],
        ro_paths: [] as string[],
      }) : null;

      await invoke<void>("create_pty_session", {
        sessionId,
        cwd,
        rows: 24,
        cols: 80,
        command: agent ?? null,
        args,
        sandbox: sandboxParam,
        onEvent: channel,
      });

      // Hand the channel to the Session Manager. It owns the subscription, runs
      // work-done detection on raw bytes, and maintains the replay buffer.
      sessionManager.register(
        sessionId,
        channel,
        !!agent,
        agent ? () => {
          setGitRevision((r) => r + 1);
          const item = dequeue(sessionId);
          if (item) {
            const bytes = Array.from(new TextEncoder().encode(item.text + "\r"));
            invoke("write_to_pty", { sessionId, data: bytes }).catch(() => {});
            sessionManager.markUserInput(sessionId);
          }
        } : undefined,
        captureOnChunk,
        agent ?? undefined,
      );

      const newSession: Session = {
        id: sessionId,
        name: sessionName,
        cwd,
        projectId,
        agent,
        conversationId,
        instanceId,
        isRootSession,
        noGit,
        sandboxed: shouldIsolate ? true : false,
        parentSessionId,
        storeKey,
        createdAt: new Date().toISOString(),
        metadata: { resumeCount: 0, hasBeenResumed: false },
      };

      // Always append as a new tab. Never replace an existing active session at the
      // same cwd — doing so would silently evict its tab while leaving the old PTY
      // alive and orphaned in the Rust backend.
      setSessions((prev) => [...prev, newSession]);
      setActiveSessionId(sessionId);
    } finally {
      // Always release the guard — even if create_pty_session rejects — so a failed
      // spawn never permanently blocks this path from opening future sessions.
      spawningPaths.current.delete(cwd);
    }
  }

  function openDiffTab(cwd: string, projectId: string) {
    // If a diff tab for this cwd is already open, just focus it.
    const existing = sessionsRef.current.find((s) => s.kind === "diff" && s.cwd === cwd);
    if (existing) { setActiveSessionId(existing.id); return; }
    const sessionId = crypto.randomUUID();
    const tab: PersistedTab = { instanceId: sessionId, kind: "diff", projectId, cwd, name: "Diff" };
    const st = getRuntimeState();
    setRuntimeState({ tabs: [...st.tabs.filter((t) => !(t.kind === "diff" && t.cwd === cwd)), tab] });
    setSessions((prev) => [...prev, {
      id: sessionId, instanceId: sessionId, name: "Diff", cwd, projectId, kind: "diff",
      createdAt: new Date().toISOString(),
      metadata: { resumeCount: 0, hasBeenResumed: false },
    }]);
    setActiveSessionId(sessionId);
  }

  function openPreviewTab(projectId: string) {
    const sessionId = crypto.randomUUID();
    const tab: PersistedTab = { instanceId: sessionId, kind: "preview", projectId, cwd: "", name: "Live Preview" };
    const st = getRuntimeState();
    setRuntimeState({ tabs: [...st.tabs, tab] });
    setSessions((prev) => [...prev, {
      id: sessionId, instanceId: sessionId, name: "Live Preview", cwd: "", projectId, kind: "preview",
      createdAt: new Date().toISOString(),
      metadata: { resumeCount: 0, hasBeenResumed: false },
    }]);
    setActiveSessionId(sessionId);
  }

  function openEditorTab(filePath: string, projectId: string) {
    const existing = sessionsRef.current.find((s) => s.kind === "editor" && s.cwd === filePath);
    if (existing) { setActiveSessionId(existing.id); return; }
    const sessionId = crypto.randomUUID();
    const fileName = filePath.replace(/\\/g, "/").split("/").pop() ?? filePath;
    const tab: PersistedTab = { instanceId: sessionId, kind: "editor", projectId, cwd: filePath, name: fileName };
    const st = getRuntimeState();
    setRuntimeState({ tabs: [...st.tabs.filter((t) => !(t.kind === "editor" && t.cwd === filePath)), tab] });
    setSessions((prev) => [...prev, {
      id: sessionId, instanceId: sessionId, name: fileName, cwd: filePath, projectId, kind: "editor",
      createdAt: new Date().toISOString(),
      metadata: { resumeCount: 0, hasBeenResumed: false },
    }]);
    setActiveSessionId(sessionId);
  }

  function updateSessionPreviewUrl(sessionId: string, url: string) {
    setSessions((prev) => prev.map((s) => s.id === sessionId ? { ...s, previewUrl: url } : s));
    // Persist the updated URL to the tabs slice.
    const session = sessionsRef.current.find((s) => s.id === sessionId);
    if (session) {
      const st = getRuntimeState();
      setRuntimeState({ tabs: st.tabs.map((t) => t.instanceId === session.instanceId ? { ...t, previewUrl: url } : t) });
    }
  }

  // The path to use for worktree operations (zen uses the prop; default uses the pending project)
  function getActivePath(): string {
    if (zen) return path ?? "";
    return projects.find((p) => p.id === pendingProjectId)?.path ?? "";
  }

  function addWorktreeToState(wt: Worktree, workingProjectId: string | null) {
    if (zen) {
      setZenWorktrees((prev) =>
        prev.some((w) => w.path === wt.path) ? prev : [...prev, wt]
      );
    } else {
      setProjects((prev) =>
        prev.map((p) =>
          p.id === workingProjectId
            ? { ...p, worktrees: p.worktrees.some((w) => w.path === wt.path) ? p.worktrees : [...p.worktrees, wt] }
            : p
        )
      );
    }
  }

  async function launchTerminalWorktree() {
    const activePath = getActivePath();
    const workingProjectId = pendingProjectId;
    const agent = pendingAgent?.hint;
    const prompt = terminalPrompt.trim() || undefined;

    let branchName: string;
    let existingBranch: string | undefined;
    if (useExistingBranch) {
      if (!existingBranchName.trim()) return;
      branchName = existingBranchName.trim().replace(/\//g, "-");
      existingBranch = existingBranchName.trim();
    } else {
      if (!terminalName.trim()) return;
      const fullName = branchPrefix ? `${branchPrefix}${terminalName}` : terminalName;
      branchName = fullName;
    }
    const sessionName = branchName || (pendingAgent ? pendingAgent.name : "Terminal");

    setTerminalLaunching(true);
    setTerminalError(null);
    try {
      const result = await createWorktree({ projectPath: activePath, name: branchName, existingBranch });
      addWorktreeToState({ name: branchName, path: result.path }, workingProjectId);
      await openSession(sessionName, result.path, workingProjectId ?? "", agent, prompt, undefined);
      resetTerminalModal();
    } catch (e) {
      if (e instanceof NotAGitRepoError) {
        setGitNotFound(true);
      } else {
        setTerminalError(String(e));
      }
    } finally {
      setTerminalLaunching(false);
    }
  }

  async function initGitAndLaunch() {
    setTerminalLaunching(true);
    setTerminalError(null);
    const activePath = getActivePath();
    const workingProjectId = pendingProjectId;
    const agent = pendingAgent?.hint;
    const prompt = terminalPrompt.trim() || undefined;
    const fullName = branchPrefix ? `${branchPrefix}${terminalName}` : terminalName;
    const sessionName = fullName || (pendingAgent ? pendingAgent.name : "Terminal");
    try {
      await gitInit(activePath);
      const result = await createWorktree({ projectPath: activePath, name: fullName });
      addWorktreeToState({ name: fullName, path: result.path }, workingProjectId);
      await openSession(sessionName, result.path, workingProjectId ?? "", agent, prompt, undefined);
      resetTerminalModal();
    } catch (e) {
      setTerminalError(String(e));
      setGitNotFound(false);
    } finally {
      setTerminalLaunching(false);
    }
  }

  async function continueWithoutGit() {
    setTerminalLaunching(true);
    setTerminalError(null);
    const activePath = getActivePath();
    const workingProjectId = pendingProjectId;
    const agent = pendingAgent?.hint;
    const sessionName = terminalName.trim() || (pendingAgent ? pendingAgent.name : "Terminal");
    const prompt = terminalPrompt.trim() || undefined;
    try {
      await openSession(sessionName, activePath, workingProjectId ?? "", agent, prompt, undefined, undefined, true);
      resetTerminalModal();
    } catch (e) {
      setTerminalError(String(e));
    } finally {
      setTerminalLaunching(false);
    }
  }

  // Launch directly in the project root without creating a worktree branch.
  // Checks for a git repo first — if absent, shows the git-init dialog.
  async function launchInRoot() {
    setTerminalLaunching(true);
    setTerminalError(null);
    const activePath = getActivePath();
    const workingProjectId = pendingProjectId;
    const agent = pendingAgent?.hint;
    const sessionName = terminalName.trim() || (pendingAgent ? pendingAgent.name : "Terminal");
    const prompt = terminalPrompt.trim() || undefined;
    try {
      const hasGit = await invoke<boolean>("check_git_initialized", { path: activePath });
      if (!hasGit) {
        setGitNotFoundRoot(true);
        return;
      }
      await openSession(sessionName, activePath, workingProjectId ?? "", agent, prompt, undefined, undefined, true);
      resetTerminalModal();
    } catch (e) {
      setTerminalError(String(e));
    } finally {
      setTerminalLaunching(false);
    }
  }

  async function initGitForRoot() {
    setRootGitInitializing(true);
    setRootGitError(null);
    const activePath = getActivePath();
    const workingProjectId = pendingProjectId;
    const agent = pendingAgent?.hint;
    const sessionName = terminalName.trim() || (pendingAgent ? pendingAgent.name : "Terminal");
    const prompt = terminalPrompt.trim() || undefined;
    try {
      await invoke("git_init", { projectPath: activePath });
      const trimmedUrl = rootRemoteUrl.trim();
      if (trimmedUrl) {
        await invoke("git_add_remote", { repoPath: activePath, remoteUrl: trimmedUrl });
      }
      await openSession(sessionName, activePath, workingProjectId ?? "", agent, prompt, undefined, undefined, true, false);
      resetTerminalModal();
    } catch (e) {
      setRootGitError(String(e));
    } finally {
      setRootGitInitializing(false);
    }
  }

  async function skipGitForRoot() {
    setRootGitInitializing(true);
    setRootGitError(null);
    const activePath = getActivePath();
    const workingProjectId = pendingProjectId;
    const agent = pendingAgent?.hint;
    const sessionName = terminalName.trim() || (pendingAgent ? pendingAgent.name : "Terminal");
    const prompt = terminalPrompt.trim() || undefined;
    try {
      await openSession(sessionName, activePath, workingProjectId ?? "", agent, prompt, undefined, undefined, true, true);
      resetTerminalModal();
    } catch (e) {
      setRootGitError(String(e));
    } finally {
      setRootGitInitializing(false);
    }
  }

  function clearTabDrag() {
    dragTabIdRef.current = null;
    dragOverTabIdRef.current = null;
    setDragTabId(null);
    setDragOverTabId(null);
  }

  function startRename(sessionId: string, currentName: string) {
    setRenamingSessionId(sessionId);
    setRenameValue(currentName);
  }

  function commitRename() {
    if (renamingSessionId) {
      const trimmed = renameValue.trim();
      if (trimmed) {
        setSessions((prev) =>
          prev.map((s) => {
            if (s.id === renamingSessionId) {
              return { ...s, name: trimmed };
            }
            return s;
          })
        );
      }
    }
    setRenamingSessionId(null);
  }

  function closeSession(sessionId: string) {
    // Closing a session also closes every sub-session spawned from it via a split.
    const toClose: string[] = [];
    const collect = (id: string) => {
      toClose.push(id);
      sessions.filter((s) => s.parentSessionId === id).forEach((c) => collect(c.id));
    };
    collect(sessionId);

    for (const id of toClose) {
      const closing = sessions.find((s) => s.id === id);
      if (closing?.kind !== "diff" && closing?.kind !== "preview" && closing?.kind !== "editor") {
        invoke("close_pty_session", { sessionId: id }).catch(() => {});
        // Use storeKey (not cwd) so a session that was never persisted (e.g. a plain terminal
        // root session sharing cwd with an agent root session) cannot corrupt the agent's entry.
        if (closing?.storeKey) markWorktreeSessionClosed(closing.storeKey);
        sessionManager.unregister(id);
      } else if (closing) {
        // Remove the persisted tab entry for non-terminal tabs.
        const st = getRuntimeState();
        setRuntimeState({ tabs: st.tabs.filter((t) => t.instanceId !== closing.instanceId) });
      }
      clearWorkState(id);
    }

    setPaneLayout((prev) => {
      if (!prev) return null;
      let updated: PaneNode | null = prev;
      for (const id of toClose) {
        if (updated) updated = removeLeaf(updated, id);
      }
      if (!updated || updated.type === "leaf") return null;
      return updated;
    });
    const closeSet = new Set(toClose);
    const remaining = sessions.filter((s) => !closeSet.has(s.id));
    setSessions(remaining);
    if (activeSessionId && closeSet.has(activeSessionId)) {
      setActiveSessionId(remaining.length > 0 ? remaining[remaining.length - 1].id : null);
    }
  }

  async function splitPane(dir: SplitDir) {
    if (!activeSessionId) return;
    const session = sessions.find((s) => s.id === activeSessionId);
    if (!session || session.kind) return; // only split terminal panes
    const newId = crypto.randomUUID();
    const branch: SplitBranch = {
      type: "split",
      id: crypto.randomUUID(),
      dir,
      ratio: 0.5,
      first:  { type: "leaf", sessionId: activeSessionId },
      second: { type: "leaf", sessionId: newId },
    };
    setPaneLayout((prev) => {
      if (!prev) return branch;
      return replaceLeaf(prev, activeSessionId, branch) ?? prev;
    });
    await openSession(
      session.name,
      session.cwd,
      session.projectId,
      undefined,
      undefined,
      undefined,
      undefined,
      session.isRootSession,
      session.noGit,
      false,
      newId,
      activeSessionId
    );
  }

  const { theme, setTheme } = useTheme();
  const isDark = theme.name === "Tempest Dark";

  function toggleTheme() {
    const next = builtinThemes.find((t) => t.name === (isDark ? "Tempest Light" : "Tempest Dark"));
    if (next) setTheme(next);
  }

  async function handleBroadcast(message: string, sessionIds: string[]) {
    const bytes = Array.from(new TextEncoder().encode(message + "\r"));
    await Promise.all(
      sessionIds.map((id) => {
        setWorkState(id, "working");
        return invoke("write_to_pty", { sessionId: id, data: bytes }).catch(() => {});
      })
    );
    setBroadcastOpen(false);
  }

  function openSessionMenu(
    e: React.MouseEvent<HTMLElement>,
    projectId: string | null,
    placement: NewSessionPlacement
  ) {
    setSessionMenuRect((e.currentTarget as HTMLElement).getBoundingClientRect());
    setSessionMenuPlacement(placement);
    setPendingProjectId(projectId);
    setSessionMenuOpen(true);
  }

  function navBtn(section: NavSection) {
    const isActive = !activeSessionId && activeSection === section;
    return `sidebar-nav-btn${isActive ? " sidebar-nav-btn--active" : ""}`;
  }

  function goTo(section: NavSection) {
    setActiveSection(section);
    setActiveSessionId(null);
  }

  function checkSidebarScroll() {
    const el = sidebarScrollRef.current;
    if (!el) return;
    setSidebarAtTop(el.scrollTop < 8);
    setSidebarAtBottom(el.scrollTop + el.clientHeight >= el.scrollHeight - 8);
  }

  const activeSession = sessions.find((s) => s.id === activeSessionId) ?? null;

  const activeProjectPath = activeSession
    ? projects.find((p) => p.id === activeSession.projectId)?.path
    : undefined;
  const isAtlasIndexing = !!activeProjectPath && atlasIndexingPaths.includes(activeProjectPath);
  const isAtlasIndexed =
    !!activeProjectPath &&
    (getRuntimeState().atlasProjects ?? {})[activeProjectPath] === true;

  // Derived split-pane state. Recomputed every render — tree is tiny so no memo needed.
  const activeSplitIds = paneLayout ? new Set(paneSessionIds(paneLayout)) : null;
  const paneRects      = paneLayout ? computeRects(paneLayout) : null;
  const splitHandles   = paneLayout ? collectHandles(paneLayout) : [];

  useEffect(() => {
    if (!activeSession) { setActiveBranch(null); return; }
    invoke<string>("get_git_branch", { path: activeSession.cwd })
      .then(setActiveBranch)
      .catch(() => setActiveBranch(null));
  }, [activeSession?.cwd]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!promptPickerOpen) return;
    setPromptPickerItems(getPrompts().filter((p) => p.enabled));
    function onDown(e: MouseEvent) {
      if (promptPickerRef.current && !promptPickerRef.current.contains(e.target as Node)) {
        setPromptPickerOpen(false);
      }
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [promptPickerOpen]);

  // Re-check sidebar scroll fades after layout settles (rAF ensures DOM is measured post-paint)
  useEffect(() => { requestAnimationFrame(checkSidebarScroll); }, [projects, sessions]); // eslint-disable-line react-hooks/exhaustive-deps

  // Atlas daemon heartbeat — ping every 3 minutes. If a daemon exited (e.g. idle
  // self-reap or OOM) the Rust command restarts it, keeping the file watcher alive.
  useEffect(() => {
    const id = setInterval(() => {
      if (!getSettings().atlasEnabled) return;
      const atlasProjects = getRuntimeState().atlasProjects ?? {};
      for (const project of projectsRef.current) {
        if (atlasProjects[project.path] === true) {
          invoke("start_atlas_daemon", { projectPath: project.path }).catch(() => {});
        }
      }
    }, 3 * 60 * 1000);
    return () => clearInterval(id);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function worktreeLabel(cwd: string): string {
    return cwd.split(/[/\\]/).filter(Boolean).pop() ?? cwd;
  }

  // Zen mode: merge worktrees from disk with any non-worktree sessions
  const zenSidebarItems: Worktree[] = zen
    ? [
        ...zenWorktrees,
        ...sessions
          .filter((s) => !zenWorktrees.some((w) => w.path === s.cwd))
          .map((s) => ({ name: s.name, path: s.cwd })),
      ]
    : [];

  // Default mode: badge project name
  const activeSessionProject = zen
    ? null
    : projects.find((p) => p.id === activeSession?.projectId) ?? null;
  const badgeName = zen ? name : activeSessionProject?.name;

  // Default mode helpers
  function toggleProject(projectId: string) {
    setProjects((prev) =>
      prev.map((p) => (p.id === projectId ? { ...p, expanded: !p.expanded } : p))
    );
  }

  function timeAgo(iso: string): string {
    const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
    if (s < 60) return "just now";
    if (s < 3600) return `${Math.floor(s / 60)}m ago`;
    if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
    if (s < 604800) return `${Math.floor(s / 86400)}d ago`;
    return `${Math.floor(s / 604800)}w ago`;
  }

  async function openProjectByPath(selected: string) {
    const projName = folderName(selected);
    addRecent({ name: projName, path: selected });
    const existing = projects.find((p) => p.path === selected);
    if (existing) {
      setProjects((prev) => prev.map((p) => p.id === existing.id ? { ...p, expanded: true } : p));
      return;
    }
    const newProject: Project = { id: crypto.randomUUID(), name: projName, path: selected, expanded: true, worktrees: [] };
    setProjects((prev) => [...prev, newProject]);
    invoke<{ name: string; path: string; is_dir: boolean }[]>("list_directory", { path: `${selected}/.tempest` })
      .then((entries) => {
        setProjects((prev) => prev.map((p) => p.id === newProject.id ? { ...p, worktrees: entries.filter((e) => e.is_dir && !TEMPEST_INTERNAL_DIRS.has(e.name)).map((e) => ({ name: e.name, path: e.path })) } : p));
      })
      .catch(() => {});
    if (getAttribution()) {
      invoke("write_coauthor_hook", { repoPath: selected, coauthorLine: COAUTHOR_LINE }).catch(() => {});
    }
    const atlasSettings = getSettings();
    if (atlasSettings.atlasEnabled) {
      const decided = getRuntimeState().atlasProjects ?? {};
      if (decided[selected] === true) {
        // Project already indexed — start the file-watcher daemon immediately.
        invoke("start_atlas_daemon", { projectPath: selected }).catch(() => {});
      } else if (atlasSettings.atlasAutoIndex) {
        if (decided[selected] === undefined) {
          setRuntimeState({ atlasProjects: { ...decided, [selected]: true } });
          invoke("start_atlas_index", { projectPath: selected })
            .then(() => invoke("start_atlas_daemon", { projectPath: selected }).catch(() => {}))
            .catch((e) => console.error("[Atlas] start_atlas_index failed:", e));
          setAtlasIndexingPaths((prev) => prev.includes(selected) ? prev : [...prev, selected]);
        }
      } else if (decided[selected] === undefined) {
        setAtlasAutoIndexLocal(false);
        setAtlasPromptPath(selected);
      }
    }
  }

  async function addWorkspace() {
    const selected = await open({ directory: true, multiple: false });
    if (!selected || typeof selected !== "string") return;
    await openProjectByPath(selected);
  }

  // Build the workspace list shown in OverviewPage from live session state.
  return (
    <div className="workspace-layout">
      <TopBar />
      <div className="sub-bar">
        <Tooltip content="Toggle sidebar" placement="bottom">
          <button
            className="sub-bar-icon-btn"
            aria-label="Toggle sidebar"
            onClick={() => setSidebarOpen((o) => !o)}
          >
            <PanelLeft size={15} />
          </button>
        </Tooltip>
        <Tooltip content="Switch theme" placement="bottom">
          <button
            className="sub-bar-icon-btn"
            aria-label="Switch theme"
            onClick={toggleTheme}
          >
            {isDark ? <Sun size={15} /> : <Moon size={15} />}
          </button>
        </Tooltip>
        {activeSession && (
          <>
            <span className="sub-bar-divider">/</span>
            <span className="sub-bar-badge">
              <span className="sub-bar-badge-project">{badgeName}</span>
              <span className="sub-bar-badge-sep">/</span>
              <span className="sub-bar-badge-worktree">{worktreeLabel(activeSession.cwd)}</span>
              {activeBranch && (
                <span className="sub-bar-badge-branch">
                  <span className="sub-bar-badge-on">on</span> {activeBranch}
                </span>
              )}
            </span>
          </>
        )}

        {activeSession && (
          <div className="sub-bar-right">
            <div className="sub-bar-prompt-wrap" ref={promptPickerRef}>
              <Tooltip content="Prompts" placement="bottom">
                <button
                  className={`sub-bar-icon-btn${promptPickerOpen ? " sub-bar-icon-btn--active" : ""}`}
                  aria-label="Prompt library"
                  onClick={() => setPromptPickerOpen((o) => !o)}
                >
                  <BookOpen size={15} />
                </button>
              </Tooltip>
              {promptPickerOpen && (
                <div className="sub-bar-prompt-picker">
                  <div className="sub-bar-prompt-picker-header">
                    <span>Prompts</span>
                  </div>
                  <div className="sub-bar-prompt-picker-items">
                    {promptPickerItems.length > 0 ? (
                      promptPickerItems.map((p) => {
                        const sent = promptSentId === p.id;
                        return (
                          <button
                            key={p.id}
                            className={`sub-bar-prompt-item${sent ? " sub-bar-prompt-item--sent" : ""}`}
                            onMouseDown={(e) => {
                              e.preventDefault();
                              if (sent) return;
                              navigator.clipboard.writeText(p.body);
                              setPromptSentId(p.id);
                              setTimeout(() => {
                                setPromptPickerOpen(false);
                                setPromptSentId(null);
                              }, 800);
                            }}
                          >
                            <span className="sub-bar-prompt-item-icon">
                              {sent ? <Check size={12} /> : <Copy size={12} />}
                            </span>
                            <span className="sub-bar-prompt-item-text">
                              <span className="sub-bar-prompt-title">{p.title}</span>
                              <span className="sub-bar-prompt-preview">
                                {p.body.length > 64 ? p.body.slice(0, 64) + "…" : p.body}
                              </span>
                            </span>
                          </button>
                        );
                      })
                    ) : (
                      <div className="sub-bar-prompt-empty">No prompts yet</div>
                    )}
                  </div>
                  <div className="sub-bar-prompt-picker-footer">
                    <button
                      className="sub-bar-prompt-manage-btn"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        setPromptPickerOpen(false);
                        setSettingsInitialSection("prompts");
                        setSettingsOpen(true);
                      }}
                    >
                      <Plus size={11} />
                      <span>Manage prompts</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
            <Tooltip content="Toggle right panel" placement="bottom">
              <button
                className="sub-bar-icon-btn"
                aria-label="Toggle right panel"
                onClick={() => setRightSidebarOpen((o) => !o)}
              >
                <PanelRight size={15} />
              </button>
            </Tooltip>
          </div>
        )}
      </div>

      <div className="workspace-body">
        <aside className={`sidebar${sidebarOpen ? "" : " sidebar--collapsed"}`} style={{ "--sidebar-fs": `${sidebarFontSize}px` } as CSSProperties}>

          {/* Fixed top: Overview */}
          <button className={navBtn("overview")} onClick={() => goTo("overview")}>
            <LayoutGrid size={16} />
            <span>Overview</span>
          </button>
          <button className={navBtn("knowledge-base")} onClick={() => goTo("knowledge-base")}>
            <Brain size={16} />
            <span>Knowledge Base</span>
          </button>

          {/* Scrollable middle */}
          <div className="sidebar-scroll-wrap">
          <div className={`sidebar-fade-top${sidebarAtTop ? " sidebar-fade--hidden" : ""}`} />
          <div className="sidebar-scroll" ref={sidebarScrollRef} onScroll={checkSidebarScroll}>
          {zen ? (
            /* ── Zen mode sidebar ── */
            <>
              <button
                className="sidebar-nav-btn"
                onClick={(e) => openSessionMenu(e, null, "right")}
              >
                <FolderPlus size={16} />
                <span>New Workspace</span>
              </button>
              <div className="sidebar-section-label">Workspaces</div>
              {zenSidebarItems.length === 0 ? (
                <div className="agents-empty">No open workspaces</div>
              ) : (
                zenSidebarItems.map((item) => {
                  const session = sessions.find((s) => s.cwd === item.path);
                  const savedMeta = !session ? getWorktreeSession(item.path) : null;
                  const isAgent = !!(session?.agent || savedMeta?.agent);
                  const isActive = session?.id === activeSessionId;
                  return (
                    <button
                      key={item.path}
                      className={`sidebar-nav-btn${isActive ? " sidebar-nav-btn--active" : ""}`}
                      onClick={() => {
                        if (session) {
                          setActiveSessionId(session.id);
                        } else {
                          const saved = savedMeta ?? getWorktreeSession(item.path);
                          if (saved) {
                            openSession(saved.name, item.path, "", saved.agent, undefined, undefined, saved.agent ? saved.conversationId : undefined).catch(() => {});
                            markWorktreeSessionOpen(item.path);
                          } else {
                            openSession("Terminal", item.path, "").catch(() => {});
                          }
                        }
                      }}
                      onContextMenu={(e) =>
                        openCtxMenu(e, item, path ?? "", "", session?.id ?? null)
                      }
                    >
                      {isAgent ? <AgentIcon hint={session?.agent ?? savedMeta?.agent} size={15} /> : <TerminalSquare size={15} />}
                      <span className="sidebar-session-name">{item.name}</span>
                      {session?.agent && <SidebarWorkBadge sessionId={session.id} />}
                    </button>
                  );
                })
              )}
            </>
          ) : (
            /* ── Default mode sidebar ── */
            <>
              <div className="sidebar-section-label">Projects</div>
              {projects.length === 0 ? (
                <div className="agents-empty">No projects added</div>
              ) : (
                projects.map((project) => {
                  const projectSessions = sessions.filter((s) => s.projectId === project.id);
                  // Sub-sessions (spawned via split) are never top-level rows — they render
                  // nested under their parent.
                  const renderSubSessions = (parentId: string): React.ReactNode =>
                    projectSessions
                      .filter((s) => s.parentSessionId === parentId)
                      .map((sub) => (
                        <div key={sub.id} className="sidebar-session-group">
                          <button
                            className={`sidebar-project-session sidebar-project-session--sub${sub.id === activeSessionId ? " sidebar-project-session--active" : ""}`}
                            onClick={() => setActiveSessionId(sub.id)}
                          >
                            {sub.agent ? <AgentIcon hint={sub.agent} size={12} /> : <TerminalSquare size={12} />}
                            <span className="sidebar-session-name">{sub.name}</span>
                            {sub.agent && <SidebarWorkBadge sessionId={sub.id} />}
                            <span
                              className="sidebar-session-close"
                              role="button"
                              tabIndex={0}
                              aria-label={`Close ${sub.name}`}
                              onClick={(e) => { e.stopPropagation(); closeSession(sub.id); }}
                              onKeyDown={(e) => {
                                if (e.key === "Enter" || e.key === " ") { e.stopPropagation(); closeSession(sub.id); }
                              }}
                            >
                              <X size={11} />
                            </span>
                          </button>
                          {renderSubSessions(sub.id)}
                        </div>
                      ));
                  // Canonical root session map: one entry per instanceId, live sessions
                  // take precedence over ghosts. Guarantees exactly one sidebar row per
                  // logical conversation regardless of how many storage records exist.
                  const liveRootSessions = projectSessions.filter((s) => s.isRootSession && s.kind !== "diff" && !s.parentSessionId);
                  const storedRootEntries = getRootSessionsForProject(project.path);
                  const canonRoots = new Map<string, { session?: Session; ghost?: { key: string; session: WorktreeSession } }>();
                  for (const s of liveRootSessions) canonRoots.set(s.instanceId, { session: s });
                  for (const e of storedRootEntries) {
                    const id = e.session.instanceId ?? rootSessionIdFromKey(e.key);
                    if (!canonRoots.has(id)) canonRoots.set(id, { ghost: e });
                  }
                  return (
                    <div key={project.id} className="sidebar-project">
                      <div
                        className="sidebar-project-header"
                        onContextMenu={(e) =>
                          openCtxMenu(e, null, project.path, project.id, null, true)
                        }
                      >
                        <button
                          className="sidebar-project-toggle"
                          onClick={() => toggleProject(project.id)}
                        >
                          {project.expanded
                            ? <ChevronDown size={12} />
                            : <ChevronRight size={12} />}
                          <span>{project.name}</span>
                        </button>
                        {atlasEnabled && getRuntimeState().atlasProjects[project.path] === true && (
                          <Cpu size={11} className="sidebar-project-atlas-icon" aria-label="Token Intelligence indexed" />
                        )}
                        <Tooltip content="New session" placement="right">
                          <button
                            className="sidebar-project-add-btn"
                            onClick={(e) => openSessionMenu(e, project.id, "right")}
                            aria-label="New session"
                          >
                            <Plus size={12} />
                          </button>
                        </Tooltip>
                      </div>
                      {project.expanded && (
                        <div className="sidebar-project-sessions">
                          {/* Root sessions — one row per canonical identity (live or ghost) */}
                          {[...canonRoots.values()].map((entry) => {
                            if (entry.session) {
                              const s = entry.session;
                              return (
                                <div key={s.instanceId} className="sidebar-session-group">
                                  <button
                                    className={`sidebar-project-session sidebar-project-session--root${s.id === activeSessionId ? " sidebar-project-session--active" : ""}`}
                                    onClick={() => setActiveSessionId(s.id)}
                                    onContextMenu={(e) =>
                                      openCtxMenu(e, null, project.path, project.id, s.id, false, true, s.storeKey)
                                    }
                                  >
                                    <SquareSlash size={12} />
                                    <span className="sidebar-session-name">{s.name}</span>
                                    <span className="sidebar-root-badge">main</span>
                                    {s.agent && atlasEnabled && getRuntimeState().atlasProjects[project.path] === true && (
                                      <Cpu size={10} className="sidebar-session-atlas-badge" aria-label="Token Intelligence active" />
                                    )}
                                    {s.agent && <SidebarWorkBadge sessionId={s.id} />}
                                  </button>
                                  {renderSubSessions(s.id)}
                                </div>
                              );
                            }
                            const { key, session: ghost } = entry.ghost!;
                            const resumeId = ghost.instanceId ?? rootSessionIdFromKey(key);
                            return (
                              <button
                                key={key}
                                className="sidebar-project-session sidebar-project-session--root sidebar-project-session--closed"
                                onClick={() => {
                                  openSession(ghost.name, project.path, project.id, ghost.agent, undefined, undefined, ghost.agent ? ghost.conversationId : undefined, true, ghost.noGit, false, resumeId).catch(() => {});
                                }}
                                onContextMenu={(e) =>
                                  openCtxMenu(e, null, project.path, project.id, null, false, true, key)
                                }
                              >
                                <SquareSlash size={12} />
                                <span className="sidebar-session-name">{ghost.name}</span>
                                <span className="sidebar-root-badge">main</span>
                              </button>
                            );
                          })}
                          {/* Worktree sessions */}
                          {project.worktrees.map((wt) => {
                            const session = sessions.find((s) => s.cwd === wt.path && !s.parentSessionId);
                            const savedMeta = !session ? getWorktreeSession(wt.path) : null;
                            const isAgent = !!(session?.agent || savedMeta?.agent);
                            const isActive = session?.id === activeSessionId;
                            return (
                              <div key={wt.path} className="sidebar-session-group">
                                <button
                                  className={`sidebar-project-session${isActive ? " sidebar-project-session--active" : ""}`}
                                  onClick={() => {
                                    if (session) {
                                      setActiveSessionId(session.id);
                                    } else {
                                      const saved = savedMeta ?? getWorktreeSession(wt.path);
                                      if (saved) {
                                        openSession(saved.name, wt.path, project.id, saved.agent, undefined, undefined, saved.agent ? saved.conversationId : undefined).catch(() => {});
                                        markWorktreeSessionOpen(wt.path);
                                      } else {
                                        openSession("Terminal", wt.path, project.id).catch(() => {});
                                      }
                                    }
                                  }}
                                  onContextMenu={(e) =>
                                    openCtxMenu(e, wt, project.path, project.id, session?.id ?? null)
                                  }
                                >
                                  {isAgent ? <AgentIcon hint={session?.agent ?? savedMeta?.agent} size={12} /> : <TerminalSquare size={12} />}
                                  <span>{wt.name}</span>
                                  {isAgent && atlasEnabled && getRuntimeState().atlasProjects[project.path] === true && (
                                    <Cpu size={10} className="sidebar-session-atlas-badge" aria-label="Token Intelligence active" />
                                  )}
                                  {session?.agent && <SidebarWorkBadge sessionId={session.id} />}
                                </button>
                                {session && renderSubSessions(session.id)}
                              </div>
                            );
                          })}
                          {/* Diff tabs and other non-root non-worktree sessions */}
                          {projectSessions
                            .filter((s) => !s.isRootSession && !s.parentSessionId && !project.worktrees.some((w) => w.path === s.cwd))
                            .map((s) => (
                              <div key={s.id} className="sidebar-session-group">
                                <button
                                  className={`sidebar-project-session${s.id === activeSessionId ? " sidebar-project-session--active" : ""}`}
                                  onClick={() => setActiveSessionId(s.id)}
                                  onContextMenu={(e) =>
                                    openCtxMenu(e, null, project.path, project.id, s.id)
                                  }
                                >
                                  {s.kind === "diff" ? <Eye size={12} /> : s.kind === "preview" ? <Globe size={12} /> : s.kind === "editor" ? <FileCode size={12} /> : s.agent ? <AgentIcon hint={s.agent} size={12} /> : <TerminalSquare size={12} />}
                                  <span>{s.name}</span>
                                  {s.agent && <SidebarWorkBadge sessionId={s.id} />}
                                </button>
                                {renderSubSessions(s.id)}
                              </div>
                            ))}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </>
          )}

          </div>{/* end sidebar-scroll */}
          <div className={`sidebar-fade-bottom${sidebarAtBottom ? " sidebar-fade--hidden" : ""}`} />
          </div>{/* end sidebar-scroll-wrap */}

          <div className="sidebar-bottom">
            <button className="sidebar-nav-btn" onClick={() => openUrl("https://github.com/tempestai-dev/tempest/issues")}>
              <Bug size={16} />
              <span>Report a Bug</span>
            </button>
            <button className="sidebar-nav-btn" onClick={() => openUrl("mailto:tempestai.dev@gmail.com")}>
              <Mail size={16} />
              <span>Email Us</span>
            </button>
            <button className="sidebar-nav-btn" onClick={() => setSettingsOpen(true)}>
              <Settings size={16} />
              <span>Settings</span>
            </button>
            {zen ? (
              <div className="zen-project-label">
                <FolderOpen size={14} />
                <span>{name}</span>
              </div>
            ) : (
              <button className="sidebar-nav-btn sidebar-add-workspace" onClick={addWorkspace}>
                <FolderPlus size={16} />
                <span>Add Project</span>
              </button>
            )}
          </div>
        </aside>

        <main className="workspace-main">
          {sessions.length > 0 && (
            <div
              className="session-tab-bar"
              onDragLeave={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                  setDragOverTabId(null);
                }
              }}
            >
              <div className="session-tab-scroll">
              {sessions.filter((s) => !s.parentSessionId).map((s) => {
                const isActive = s.id === activeSessionId;
                const isDragging = dragTabId === s.id;
                const isDropTarget = dragOverTabId === s.id && !isDragging;
                const tabClass = [
                  "session-tab",
                  isActive ? "session-tab--active" : "",
                  isDragging ? "session-tab--dragging" : "",
                  isDropTarget && dragOverSide === "before" ? "session-tab--drop-before" : "",
                  isDropTarget && dragOverSide === "after" ? "session-tab--drop-after" : "",
                ].filter(Boolean).join(" ");
                return (
                  <button
                    key={s.id}
                    draggable
                    className={tabClass}
                    onDragStart={(e) => {
                      setDragTabId(s.id);
                      dragTabIdRef.current = s.id;
                      e.dataTransfer.effectAllowed = "move";
                      e.dataTransfer.setData("text/plain", s.id);
                    }}
                    onDragOver={(e) => {
                      e.preventDefault();
                      e.dataTransfer.dropEffect = "move";
                      const rect = e.currentTarget.getBoundingClientRect();
                      const side = e.clientX < rect.left + rect.width / 2 ? "before" : "after";
                      setDragOverTabId(s.id);
                      setDragOverSide(side);
                      dragOverTabIdRef.current = s.id;
                      dragOverSideRef.current = side;
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      const fromId = dragTabIdRef.current;
                      const side = dragOverSideRef.current;
                      if (!fromId || fromId === s.id) { clearTabDrag(); return; }
                      setSessions((prev) => {
                        const from = prev.findIndex((x) => x.id === fromId);
                        let to = prev.findIndex((x) => x.id === s.id);
                        if (from === -1 || to === -1) return prev;
                        if (side === "after") to += 1;
                        const next = [...prev];
                        const [tab] = next.splice(from, 1);
                        next.splice(to > from ? to - 1 : to, 0, tab);
                        return next;
                      });
                      clearTabDrag();
                    }}
                    onDragEnd={clearTabDrag}
                    onClick={() => {
                      if (activeSplitIds && !activeSplitIds.has(s.id)) {
                        // Tab not in the current split → exit split mode, show full screen
                        setPaneLayout(null);
                      }
                      setActiveSessionId(s.id);
                      if (isActive && s.agent) setWorkState(s.id, "idle");
                    }}
                  >
                    {s.kind === "diff" ? <Eye size={12} /> : s.kind === "preview" ? <Globe size={12} /> : s.kind === "editor" ? <FileCode size={12} /> : s.agent ? <AgentIcon hint={s.agent} size={12} /> : <TerminalSquare size={12} />}
                    {renamingSessionId === s.id ? (
                      <input
                        className="session-tab-rename"
                        value={renameValue}
                        onChange={(e) => setRenameValue(e.target.value)}
                        onBlur={commitRename}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") commitRename();
                          if (e.key === "Escape") setRenamingSessionId(null);
                          e.stopPropagation();
                        }}
                        onClick={(e) => e.stopPropagation()}
                        autoFocus
                      />
                    ) : (
                      <span
                        className="session-tab-name"
                        onDoubleClick={(e) => {
                          e.stopPropagation();
                          startRename(s.id, s.name);
                        }}
                      >
                        {s.name}
                      </span>
                    )}
                    {s.agent && <WorkStateBadge sessionId={s.id} />}
                    {s.agent && (
                      <QueueBadge
                        sessionId={s.id}
                        onClick={(e) => {
                          e.stopPropagation();
                          setQueueOpenSessionId((prev) => prev === s.id ? null : s.id);
                        }}
                      />
                    )}
                    <Tooltip content="Close tab" placement="top">
                      <span
                        className="session-tab-close"
                        role="button"
                        tabIndex={0}
                        aria-label={`Close ${s.name}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          closeSession(s.id);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.stopPropagation();
                            closeSession(s.id);
                          }
                        }}
                      >
                        <X size={11} />
                      </span>
                    </Tooltip>
                  </button>
                );
              })}
                <Tooltip content="New tab" placement="top">
                  <button
                    className="session-tab-add"
                    onClick={(e) => openSessionMenu(e, activeSession?.projectId ?? null, "below")}
                    aria-label="New tab"
                  >
                    <Plus size={13} />
                  </button>
                </Tooltip>
              </div>
              <div className="session-tab-actions">
                {activeSession && !activeSession.kind && (
                  <>
                    <Tooltip content="Split vertical" placement="top">
                      <button
                        className="session-tab-split-btn session-tab-split-btn--v"
                        onClick={() => splitPane("v")}
                        aria-label="Split pane vertically"
                      >
                        <Columns2 size={13} />
                      </button>
                    </Tooltip>
                    <Tooltip content="Split horizontal" placement="top">
                      <button
                        className="session-tab-split-btn session-tab-split-btn--h"
                        onClick={() => splitPane("h")}
                        aria-label="Split pane horizontally"
                      >
                        <Rows2 size={13} />
                      </button>
                    </Tooltip>
                  </>
                )}
                {activeSession?.agent && (
                  <Tooltip content="Message queue" placement="top">
                    <button
                      className="session-tab-queue-btn"
                      onClick={() => setQueueOpenSessionId((prev) => prev === activeSession.id ? null : activeSession.id)}
                      aria-label="Message queue"
                    >
                      <ListOrdered size={13} />
                    </button>
                  </Tooltip>
                )}
                <Tooltip content="Broadcast to agents" placement="top">
                  <button
                    className="session-tab-broadcast"
                    onClick={() => setBroadcastOpen(true)}
                    aria-label="Broadcast to agents"
                  >
                    <Megaphone size={13} />
                  </button>
                </Tooltip>
              </div>
            </div>
          )}

          <div className="workspace-content" ref={workspaceContentRef}>
            {sessions.map((s) => {
              const rect = paneRects?.get(s.id);
              const isInSplit = !!(activeSplitIds?.has(s.id));
              // Sessions hidden because the split layout doesn't include them (PTY stays alive)
              const hiddenBySplit = activeSplitIds ? !activeSplitIds.has(s.id) : false;
              const hidden = hiddenBySplit || (!isInSplit && s.id !== activeSessionId);
              const slotStyle: React.CSSProperties = rect
                ? {
                    position: "absolute",
                    top:    `${rect.top    * 100}%`,
                    left:   `${rect.left   * 100}%`,
                    width:  `${rect.width  * 100}%`,
                    height: `${rect.height * 100}%`,
                  }
                : {};
              return (
                <div
                  key={s.id}
                  className={`pane-slot${isInSplit ? " pane-slot--split" : ""}${isInSplit && s.id === activeSessionId ? " pane-slot--focused" : ""}`}
                  style={hidden ? { ...slotStyle, pointerEvents: "none" } : slotStyle}
                  onClick={isInSplit ? () => setActiveSessionId(s.id) : undefined}
                >
                  {isInSplit && (
                    <Tooltip content="Close pane" placement="top">
                      <button
                        className="pane-close-btn"
                        onClick={(e) => { e.stopPropagation(); closeSession(s.id); }}
                        aria-label="Close pane"
                      >
                        <X size={10} />
                      </button>
                    </Tooltip>
                  )}
                  {!s.kind && s.agent && !hidden && queueOpenSessionId === s.id && (
                    <QueuePanel
                      sessionId={s.id}
                      onClose={() => setQueueOpenSessionId(null)}
                    />
                  )}
                  {s.kind === "diff" ? (
                    <DiffPane sessionId={s.id} cwd={s.cwd} hidden={hidden} gitRevision={gitRevision} />
                  ) : s.kind === "preview" ? (
                    <PreviewPane
                      sessionId={s.id}
                      hidden={hidden}
                      previewUrl={s.previewUrl}
                      onUrlChange={(url) => updateSessionPreviewUrl(s.id, url)}
                      suppressPanel={sessionMenuOpen || showTerminalNaming}
                    />
                  ) : s.kind === "editor" ? (
                    <CodeMirrorPane
                      filePath={s.cwd}
                      hidden={hidden}
                    />
                  ) : (
                    <TerminalPane
                      sessionId={s.id}
                      hidden={hidden}
                      isAgent={!!s.agent}
                    />
                  )}
                </div>
              );
            })}
            {splitHandles.map((h) => {
              const isV = h.dir === "v";
              const handleStyle: React.CSSProperties = isV
                ? {
                    position: "absolute",
                    top:    `${h.parentRect.top    * 100}%`,
                    left:   `${(h.parentRect.left + h.parentRect.width * h.ratio) * 100}%`,
                    width:  "4px",
                    height: `${h.parentRect.height * 100}%`,
                    transform: "translateX(-50%)",
                    cursor: "col-resize",
                  }
                : {
                    position: "absolute",
                    top:    `${(h.parentRect.top + h.parentRect.height * h.ratio) * 100}%`,
                    left:   `${h.parentRect.left  * 100}%`,
                    width:  `${h.parentRect.width  * 100}%`,
                    height: "4px",
                    transform: "translateY(-50%)",
                    cursor: "row-resize",
                  };
              return (
                <div
                  key={h.id}
                  className="pane-split-handle"
                  style={handleStyle}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    const container = workspaceContentRef.current;
                    if (!container) return;
                    const cbox = container.getBoundingClientRect();
                    draggingHandle.current = {
                      splitId: h.id,
                      dir: h.dir,
                      startClient: isV ? e.clientX : e.clientY,
                      startRatio: h.ratio,
                      containerSize: isV
                        ? cbox.width  * h.parentRect.width
                        : cbox.height * h.parentRect.height,
                    };
                    document.body.style.cursor = isV ? "col-resize" : "row-resize";
                    document.body.style.userSelect = "none";
                  }}
                />
              );
            })}
            {!activeSessionId && activeSection === "knowledge-base" && (
              <KnowledgeBasePage />
            )}
            {!activeSessionId && activeSection === "overview" && (
              <div className="overview-page">
                <div className="overview-container">

                  {/* Mark + shortcuts */}
                  <div className="overview-start">
                    <Mark size={96} color="var(--tempest-bg-active)" />

                    <div className="overview-btn-row">
                      <button className="overview-btn" onClick={addWorkspace}><FolderOpen size={13} />Open Project</button>
                      <button className="overview-btn" onClick={() => setSettingsOpen(true)}><Settings size={13} />Settings</button>
                    </div>

                    <div className="overview-actions">
                      {([
                        { label: "Switch Theme",        sc: keybinds.toggleTheme },
                        { label: "Toggle Left Sidebar", sc: keybinds.toggleLeftSidebar },
                        { label: "Settings",            sc: keybinds.openSettings },
                      ] as const).map(({ label, sc }) => {
                        const keys = sc ? formatShortcut(sc).split("+") : null;
                        return (
                          <div className="overview-action-item" key={label}>
                            <span className="overview-action-name">{label}</span>
                            <span className="overview-action-keys">
                              {keys ? keys.map((k, i) => (
                                <span key={i} className="overview-key-group">
                                  {i > 0 && <span className="overview-key-plus">+</span>}
                                  <span className="overview-key">{k}</span>
                                </span>
                              )) : <span className="overview-key-group"><span className="overview-key">—</span></span>}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <div className="overview-divider" />

                  {/* Recents */}
                  {(() => {
                    void recentsVersion;
                    const allRecents = getRecents();
                    const totalPages = Math.max(1, Math.ceil(allRecents.length / 5));
                    const page = Math.min(recentPage, totalPages - 1);
                    const pageRecents = allRecents.slice(page * 5, page * 5 + 5);
                    return (
                      <div className="overview-recents-card">
                        <div className="overview-recents-header">
                          <span className="overview-card-label">Recent</span>
                          {totalPages > 1 && (
                            <div className="overview-recents-pagination">
                              <button
                                className="overview-recents-page-btn"
                                disabled={page === 0}
                                onClick={() => setRecentPage(p => p - 1)}
                              >
                                <ChevronLeft size={12} />
                              </button>
                              <span className="overview-recents-page-info">{page + 1} / {totalPages}</span>
                              <button
                                className="overview-recents-page-btn"
                                disabled={page >= totalPages - 1}
                                onClick={() => setRecentPage(p => p + 1)}
                              >
                                <ChevronRight size={12} />
                              </button>
                            </div>
                          )}
                        </div>
                        {allRecents.length === 0 ? (
                          <span className="overview-recents-empty">No recent projects</span>
                        ) : (
                          pageRecents.map(({ name, path, lastOpened }) => (
                            <div className="overview-recent-row" key={path} onClick={() => openProjectByPath(path)}>
                              <div className="overview-recent-text">
                                <span className="overview-recent-name">{name}</span>
                                <span className="overview-recent-path">{path}</span>
                              </div>
                              <div className="overview-recent-right">
                                <span className="overview-recent-time">{timeAgo(lastOpened)}</span>
                                <button
                                  className="overview-recent-remove-btn"
                                  title="Remove from recents"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    removeRecent(path);
                                    const newTotal = allRecents.length - 1;
                                    const newTotalPages = Math.max(1, Math.ceil(newTotal / 5));
                                    if (page >= newTotalPages) setRecentPage(newTotalPages - 1);
                                    setRecentsVersion(v => v + 1);
                                  }}
                                >
                                  <X size={11} />
                                </button>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    );
                  })()}
                </div>
              </div>
            )}
          </div>

          <StatusBar
            sandboxed={activeSession?.sandboxed}
            atlasIndexed={atlasEnabled && isAtlasIndexed ? true : undefined}
            atlasIndexing={atlasEnabled && isAtlasIndexing ? true : undefined}
            onSyncAtlas={atlasEnabled && isAtlasIndexed && !isAtlasIndexing && activeProjectPath ? () => {
              const decided = getRuntimeState().atlasProjects ?? {};
              setRuntimeState({ atlasProjects: { ...decided, [activeProjectPath]: true } });
              invoke("start_atlas_index", { projectPath: activeProjectPath })
                .then(() => invoke("start_atlas_daemon", { projectPath: activeProjectPath }).catch(() => {}))
                .catch((e) => console.error("[Atlas] sync failed:", e));
              setAtlasIndexingPaths((prev) =>
                prev.includes(activeProjectPath) ? prev : [...prev, activeProjectPath]
              );
            } : undefined}
          />

          {atlasIndexingPaths.length > 0 && (() => {
            const activePath = atlasIndexingPaths[0];
            const dismiss = () => setAtlasIndexingPaths((prev) => prev.filter((x) => x !== activePath));
            return (
              <AtlasIndexModal
                path={activePath}
                onCancel={dismiss}
                onComplete={dismiss}
              />
            );
          })()}

          {atlasDebugModal && (() => {
            const debugPath = projects[0]?.path ?? "debug";
            return (
              <AtlasIndexModal
                path={debugPath}
                onCancel={() => setAtlasDebugModal(false)}
                onComplete={() => setAtlasDebugModal(false)}
                persistent
              />
            );
          })()}
        </main>

        {activeSession && (
          <RightSidebar
            cwd={activeSession.kind === "editor" ? (projects.find((p) => p.id === activeSession.projectId)?.path ?? activeSession.cwd) : activeSession.cwd}
            rootPath={zen ? (path ?? null) : (projects.find((p) => p.id === activeSession.projectId)?.path ?? activeSession.cwd)}
            open={rightSidebarOpen}
            gitRevision={gitRevision}
            noGit={activeSession.noGit}
            onOpenDiff={activeSession.kind !== "diff" && activeSession.kind !== "preview" ? () => openDiffTab(activeSession.kind === "editor" ? (projects.find((p) => p.id === activeSession.projectId)?.path ?? activeSession.cwd) : activeSession.cwd, activeSession.projectId) : undefined}
            onOpenFile={(filePath) => openEditorTab(filePath, activeSession.projectId)}
          />
        )}
      </div>

      <NewSessionMenu
        open={sessionMenuOpen}
        anchorRect={sessionMenuRect}
        placement={sessionMenuPlacement}
        onClose={() => setSessionMenuOpen(false)}
        onNewTerminal={() => {
          setTerminalName("");
          setShowTerminalNaming(true);
        }}
        onAgentSession={(agent) => {
          setSessionMenuOpen(false);
          setPendingAgent(agent);
          setTerminalName("");
          setTerminalPrompt("");
          setShowTerminalNaming(true);
        }}
        onLivePreview={pendingProjectId ? () => {
          setSessionMenuOpen(false);
          openPreviewTab(pendingProjectId);
        } : undefined}
      />

      {/* Sidebar context menu */}
      {ctxMenu && createPortal(
        <div className="ctx-overlay" onClick={() => setCtxMenu(null)}>
          <div
            className="ctx-menu"
            style={{ top: ctxMenu.y, left: ctxMenu.x }}
            onClick={(e) => e.stopPropagation()}
          >
            {ctxMenu.sessionId && !ctxMenu.isRootSession && (
              <button
                className="ctx-item"
                onClick={() => {
                  closeSession(ctxMenu.sessionId!);
                  setCtxMenu(null);
                }}
              >
                <X size={13} />
                Close session
              </button>
            )}
            {ctxMenu.isRootSession && (
              <button
                className="ctx-item ctx-item--danger"
                onClick={() => {
                  const target = ctxMenu.sessionId ? sessions.find((s) => s.id === ctxMenu.sessionId) : null;
                  if (ctxMenu.sessionId) closeSession(ctxMenu.sessionId);
                  // Fully purge this root session's persisted entry. Each root session
                  // owns a unique store key: a live session carries it on storeKey, and a
                  // ghost carries it on ctxMenu.rootKey. Removing only that key leaves any
                  // other root session for the same project untouched.
                  const keyToRemove = target?.storeKey ?? ctxMenu.rootKey;
                  if (keyToRemove) removeWorktreeSession(keyToRemove);
                  setCtxMenu(null);
                }}
              >
                <Trash2 size={13} />
                Remove session
              </button>
            )}
            {ctxMenu.worktree && (
              <button
                className="ctx-item ctx-item--danger"
                onClick={() =>
                  openDeleteDialog(ctxMenu.worktree!, ctxMenu.projectPath, ctxMenu.projectId, ctxMenu.sessionId)
                }
              >
                <Trash2 size={13} />
                Delete workspace
              </button>
            )}
            {ctxMenu.isProjectHeader && getSettings().atlasEnabled && (
              <button
                className="ctx-item"
                onClick={() => {
                  const decided = getRuntimeState().atlasProjects ?? {};
                  setRuntimeState({ atlasProjects: { ...decided, [ctxMenu.projectPath]: true } });
                  invoke("start_atlas_index", { projectPath: ctxMenu.projectPath })
                    .then(() => invoke("start_atlas_daemon", { projectPath: ctxMenu.projectPath }).catch(() => {}))
                    .catch((e) => console.error("[Atlas] start_atlas_index failed:", e));
                  setAtlasIndexingPaths((prev) =>
                    prev.includes(ctxMenu.projectPath) ? prev : [...prev, ctxMenu.projectPath]
                  );
                  setCtxMenu(null);
                }}
              >
                <Database size={13} />
                {(getRuntimeState().atlasProjects ?? {})[ctxMenu.projectPath] === true
                  ? "Re-index project"
                  : "Index project"}
              </button>
            )}
            {ctxMenu.isProjectHeader && getSettings().atlasEnabled &&
              (getRuntimeState().atlasProjects ?? {})[ctxMenu.projectPath] === true && (
              <button
                className="ctx-item ctx-item--danger"
                onClick={() => {
                  invoke("remove_atlas_index", { projectPath: ctxMenu.projectPath })
                    .catch((e) => console.error("[Atlas] remove_atlas_index failed:", e));
                  const decided = getRuntimeState().atlasProjects ?? {};
                  const updated = { ...decided };
                  delete updated[ctxMenu.projectPath];
                  setRuntimeState({ atlasProjects: updated });
                  setCtxMenu(null);
                }}
              >
                <Database size={13} />
                Remove index
              </button>
            )}
            {ctxMenu.isProjectHeader && (
              <button
                className="ctx-item ctx-item--danger"
                onClick={() => removeProject(ctxMenu.projectId)}
              >
                <FolderOpen size={13} />
                Remove project
              </button>
            )}
          </div>
        </div>,
        document.body
      )}

      {/* Delete workspace dialog */}
      {deleteDialog && createPortal(
        <div className="naming-modal-overlay" onClick={() => !deleteDialog.loading && setDeleteDialog(null)}>
          <div className="naming-modal delete-dialog" onClick={(e) => e.stopPropagation()}>
            {deleteDialog.step === 1 ? (
              <>
                <div className="naming-modal-header">
                  <Trash2 size={15} />
                  <span>Delete workspace?</span>
                </div>
                <p className="naming-modal-desc">
                  This will permanently remove{" "}
                  <strong className="delete-dialog-name">{deleteDialog.worktree.name}</strong>{" "}
                  from disk. Any uncommitted work in this worktree will be lost.
                </p>

                <label className="delete-dialog-branch-row">
                  <input
                    type="checkbox"
                    checked={deleteDialog.deleteBranch}
                    onChange={(e) =>
                      setDeleteDialog((d) => d ? { ...d, deleteBranch: e.target.checked, error: null } : null)
                    }
                  />
                  <span>Also delete branch{deleteDialog.branchName ? ` "${deleteDialog.branchName}"` : ""}</span>
                </label>
                {deleteDialog.deleteBranch && (
                  <div className="delete-dialog-branch-warn">
                    <AlertTriangle size={13} />
                    You will be asked to confirm this separately.
                  </div>
                )}

                {deleteDialog.error && <p className="naming-modal-error">{deleteDialog.error}</p>}

                <div className="naming-modal-actions">
                  <button
                    className="naming-modal-btn naming-modal-btn--cancel"
                    disabled={deleteDialog.loading}
                    onClick={() => setDeleteDialog(null)}
                  >
                    Cancel
                  </button>
                  <button
                    className="naming-modal-btn naming-modal-btn--delete"
                    disabled={deleteDialog.loading}
                    onClick={handleDeleteConfirm}
                  >
                    {deleteDialog.loading ? <Loader size={13} className="spin" /> : "Delete workspace"}
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="naming-modal-header delete-dialog-header--danger">
                  <AlertTriangle size={15} />
                  <span>Delete branch permanently?</span>
                </div>
                <p className="naming-modal-desc">
                  Branch{" "}
                  <code className="delete-dialog-branch-code">{deleteDialog.branchName}</code>{" "}
                  will be deleted from the repository. This cannot be undone.
                </p>
                <div className="delete-dialog-final-warn">
                  All commits on this branch that are not merged will be permanently lost.
                </div>

                {deleteDialog.error && <p className="naming-modal-error">{deleteDialog.error}</p>}

                <div className="naming-modal-actions">
                  <button
                    className="naming-modal-btn naming-modal-btn--cancel"
                    disabled={deleteDialog.loading}
                    onClick={() => setDeleteDialog(null)}
                  >
                    Cancel
                  </button>
                  <button
                    className="naming-modal-btn naming-modal-btn--delete"
                    disabled={deleteDialog.loading}
                    onClick={handleDeleteConfirm}
                  >
                    {deleteDialog.loading ? <Loader size={13} className="spin" /> : "Delete branch & workspace"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>,
        document.body
      )}

      {/* Terminal naming modal */}
      {showTerminalNaming && createPortal(
        <div className="naming-modal-overlay" onClick={resetTerminalModal}>
          <div className="naming-modal" onClick={(e) => e.stopPropagation()}>
            {gitNotFoundRoot ? (
              <>
                <div className="naming-modal-header">
                  {pendingAgent ? <AgentIcon hint={pendingAgent.hint} size={15} /> : <TerminalSquare size={15} />}
                  <span>No Git Repository Found</span>
                </div>
                <p className="naming-modal-desc">
                  This folder isn't a Git repository. Initialize one to enable version
                  control and the Changes tab, or continue without Git (the Changes tab
                  will show a notice instead).
                </p>
                <div className="naming-modal-prompt-block">
                  <label className="naming-modal-prompt-label">
                    Remote URL
                    <span className="naming-modal-prompt-hint"> — optional</span>
                  </label>
                  <input
                    className="naming-modal-input"
                    type="text"
                    placeholder="https://github.com/user/repo.git"
                    value={rootRemoteUrl}
                    onChange={(e) => setRootRemoteUrl(e.target.value)}
                  />
                </div>
                {rootGitError && <p className="naming-modal-error">{rootGitError}</p>}
                <div className="naming-modal-actions naming-modal-actions--git">
                  <div className="naming-modal-actions-row">
                    <button
                      className="naming-modal-btn naming-modal-btn--cancel"
                      disabled={rootGitInitializing}
                      onClick={skipGitForRoot}
                    >
                      {rootGitInitializing ? <Loader size={13} className="spin" /> : "Continue without Git"}
                    </button>
                    <button
                      className="naming-modal-btn naming-modal-btn--create"
                      disabled={rootGitInitializing}
                      onClick={initGitForRoot}
                    >
                      {rootGitInitializing ? <Loader size={13} className="spin" /> : "Initialize Git"}
                    </button>
                  </div>
                  <button
                    className="naming-modal-btn naming-modal-btn--back"
                    onClick={() => { setGitNotFoundRoot(false); setRootGitError(null); }}
                  >
                    Back
                  </button>
                </div>
              </>
            ) : gitNotFound ? (
              <>
                <div className="naming-modal-header">
                  {pendingAgent ? <AgentIcon hint={pendingAgent.hint} size={15} /> : <TerminalSquare size={15} />}
                  <span>No Git Repository Found</span>
                </div>
                <p className="naming-modal-desc">
                  This folder isn't a Git repository. Tempest can initialize one for you, or
                  you can continue in a basic terminal-only environment with limited functionality.
                </p>
                {terminalError && <p className="naming-modal-error">{terminalError}</p>}
                <div className="naming-modal-actions naming-modal-actions--git">
                  <div className="naming-modal-actions-row">
                    <button
                      className="naming-modal-btn naming-modal-btn--cancel"
                      disabled={terminalLaunching}
                      onClick={continueWithoutGit}
                    >
                      {terminalLaunching ? <Loader size={13} className="spin" /> : "Continue without Git"}
                    </button>
                    <button
                      className="naming-modal-btn naming-modal-btn--create"
                      disabled={terminalLaunching}
                      onClick={initGitAndLaunch}
                    >
                      {terminalLaunching ? <Loader size={13} className="spin" /> : "Initialize Git & Launch"}
                    </button>
                  </div>
                  <button
                    className="naming-modal-btn naming-modal-btn--back"
                    onClick={() => setGitNotFound(false)}
                  >
                    Back
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="naming-modal-header">
                  {pendingAgent ? <AgentIcon hint={pendingAgent.hint} size={15} /> : <TerminalSquare size={15} />}
                  <span>{pendingAgent ? `New ${pendingAgent.name} Session` : "New Workspace"}</span>
                </div>
                <p className="naming-modal-desc">Give your workspace a name to get started.</p>
                <div className="naming-modal-branch-toggle">
                  <button
                    className={`naming-modal-branch-opt${!useExistingBranch ? " active" : ""}`}
                    onClick={() => setUseExistingBranch(false)}
                  >New branch</button>
                  <button
                    className={`naming-modal-branch-opt${useExistingBranch ? " active" : ""}`}
                    onClick={() => setUseExistingBranch(true)}
                  >Use existing</button>
                </div>
                {useExistingBranch ? (
                  existingBranchList.length > 0 ? (
                    <select
                      className="naming-modal-input naming-modal-select"
                      value={existingBranchName}
                      onChange={(e) => setExistingBranchName(e.target.value)}
                      autoFocus
                    >
                      <option value="">Select a branch…</option>
                      {existingBranchList.map((b) => (
                        <option key={b} value={b}>{b}</option>
                      ))}
                    </select>
                  ) : (
                    <input
                      className="naming-modal-input"
                      type="text"
                      placeholder="Branch name"
                      value={existingBranchName}
                      onChange={(e) => setExistingBranchName(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") launchTerminalWorktree(); }}
                      autoFocus
                    />
                  )
                ) : (
                  <input
                    className="naming-modal-input"
                    type="text"
                    placeholder="e.g. my-feature"
                    value={terminalName}
                    onChange={(e) => setTerminalName(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") launchTerminalWorktree(); }}
                    autoFocus
                  />
                )}
                {pendingAgent && (
                  <div className="naming-modal-prompt-block">
                    <div className="naming-modal-prompt-label">
                      Custom Prompt
                      <span className="naming-modal-prompt-hint">Sent to the agent the moment it starts — leave blank to begin manually.</span>
                    </div>
                    <textarea
                      className="naming-modal-prompt"
                      placeholder="e.g. Refactor the auth module to use JWT tokens"
                      value={terminalPrompt}
                      onChange={(e) => setTerminalPrompt(e.target.value)}
                      rows={3}
                    />
                  </div>
                )}
                {terminalError && <p className="naming-modal-error">{terminalError}</p>}
                <div className="naming-modal-actions">
                  <button className="naming-modal-btn naming-modal-btn--cancel" onClick={resetTerminalModal}>
                    Cancel
                  </button>
                  <button
                    className="naming-modal-btn naming-modal-btn--root"
                    disabled={terminalLaunching}
                    onClick={launchInRoot}
                    title="Open directly in the project root — no branch created"
                  >
                    {terminalLaunching ? <Loader size={13} className="spin" /> : <><SquareSlash size={13} />in Root</>}
                  </button>
                  <button
                    className="naming-modal-btn naming-modal-btn--create"
                    disabled={(useExistingBranch ? !existingBranchName.trim() : !terminalName.trim()) || terminalLaunching}
                    onClick={launchTerminalWorktree}
                  >
                    {terminalLaunching ? <Loader size={13} className="spin" /> : useExistingBranch ? "Open Branch" : "in Branch"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>,
        document.body
      )}


      {settingsOpen && <SettingsPanel onClose={() => setSettingsOpen(false)} initialSection={settingsInitialSection as any} />}

      {atlasPromptPath && createPortal(
        <div className="naming-modal-overlay" onClick={() => setAtlasPromptPath(null)}>
          <div className="naming-modal atlas-prompt" onClick={(e) => e.stopPropagation()}>
            <div className="naming-modal-header">
              <Cpu size={15} />
              Index this project?
            </div>
            <p className="naming-modal-desc">
              Token Intelligence can analyze <strong>{folderName(atlasPromptPath)}</strong> locally
              and give AI agents a pre-built code graph — reducing repeated file reads and token usage.
              Everything stays on your machine.
            </p>
            <label className="atlas-prompt-checkbox-row">
              <input
                type="checkbox"
                checked={atlasAutoIndexLocal}
                onChange={(e) => setAtlasAutoIndexLocal(e.target.checked)}
              />
              <span>Auto-index all future projects</span>
            </label>
            <div className="naming-modal-actions">
              <button
                className="naming-modal-btn naming-modal-btn--cancel"
                onClick={() => {
                  const decided = getRuntimeState().atlasProjects ?? {};
                  setRuntimeState({ atlasProjects: { ...decided, [atlasPromptPath]: false } });
                  setAtlasPromptPath(null);
                }}
              >
                Skip
              </button>
              <button
                className="naming-modal-btn naming-modal-btn--create"
                onClick={() => {
                  const decided = getRuntimeState().atlasProjects ?? {};
                  setRuntimeState({ atlasProjects: { ...decided, [atlasPromptPath]: true } });
                  if (atlasAutoIndexLocal) {
                    updateSetting("atlasAutoIndex", true);
                  }
                  invoke("start_atlas_index", { projectPath: atlasPromptPath })
                    .then(() => invoke("start_atlas_daemon", { projectPath: atlasPromptPath }).catch(() => {}))
                    .catch((e) => console.error("[Atlas] start_atlas_index failed:", e));
                  setAtlasIndexingPaths((prev) => prev.includes(atlasPromptPath) ? prev : [...prev, atlasPromptPath]);
                  setAtlasPromptPath(null);
                }}
              >
                Index Project
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {broadcastOpen && (() => {
        const agentSessions: BroadcastSession[] = sessions
          .filter((s) => s.agent && (!s.kind || s.kind === "terminal"))
          .map((s) => ({
            id: s.id,
            name: s.name,
            agent: s.agent!,
            projectName: projects.find((p) => p.id === s.projectId)?.name ?? s.projectId,
          }));
        return (
          <BroadcastDialog
            sessions={agentSessions}
            onClose={() => setBroadcastOpen(false)}
            onSend={handleBroadcast}
          />
        );
      })()}


    </div>
  );
}
