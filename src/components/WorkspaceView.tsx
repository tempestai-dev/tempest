import { useState, useEffect, useRef, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { invoke, Channel } from "@tauri-apps/api/core";
import { sessionManager } from "../store/sessionManager";
import { setActiveIslandSession, onIslandFocusRequest } from "../store/islandNotifs";
import { open } from "@tauri-apps/plugin-dialog";
import { openUrl } from "@tauri-apps/plugin-opener";
import { createWorktree, gitInit } from "../lib/worktree";
import { addRecent, getRecents, removeRecent } from "../store/recents";
import { getOpenProjects, saveOpenProjects } from "../store/openProjects";
import { track } from "../lib/telemetry";
import { getSession, getBranchSessions, getWorktreeAgentSession, getRootSessionsForProject, getAllSessions, getBranchPath, getProjectPath, saveSession, setSessionConversationId, markSessionClosed, markSessionOpen, removeBranchByPath, removeSession, pruneSessions, type WorktreeSession } from "../store/sessions";
import { getRuntimeState, setRuntimeState } from "../lib/runtimeState";
import { loadProjectSettings } from "./ProjectSettingsPanel/useProjectSettings";
import { loadTempestConfig } from "../lib/tempestConfig";
import { getTabs, upsertTab, removeTab, type PersistedTab } from "../store/tabs";
import type { BranchInfo } from "../types/git";
import type { Session, Worktree, Project, NavSection } from "../types/workspace";
import { DeleteWorkspaceDialog, type DeleteDialogState } from "./WorkspaceView/DeleteWorkspaceDialog";
import { UpdateConfirmDialog } from "./WorkspaceView/UpdateConfirmDialog";
import { DiffPickerModal } from "./WorkspaceView/DiffPickerModal";
import { PromptPickerPopover } from "./WorkspaceView/PromptPickerPopover";
import { NotesPopover } from "./WorkspaceView/NotesPopover";
import { ContextMenu, type CtxMenuState } from "./WorkspaceView/ContextMenu";
import { TitleBar } from "./WorkspaceView/TitleBar";
import {
  LayoutGrid,
  Brain,
  FolderPlus,
  FolderOpen,
  Bug,
  Settings,
  Mail,
  TerminalSquare,
  Eye,
  X,
  Plus,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Globe,
  FileCode,
  BookOpen,
  Cpu,
  SplitSquareHorizontal,
  PencilLine,
  Keyboard,
  PanelLeft,
  PanelRight,
  SunMoon,
  GitBranch,
  Cog,
  Loader,
  Waypoints,
  Trash2,
  Workflow,
  List,
} from "lucide-react";
import { setWorkState, clearWorkState, getWorkState, setAttention, getAttention } from "../store/workState";
import { useKeybindings, matchesEvent, formatShortcut } from "../store/keybindings";
import { useAttribution, getAttribution, COAUTHOR_LINE } from "../store/attribution";
import { useSettings, getSettings, updateSetting } from "../store/appSettings";
import { TerminalPane } from "./TerminalPane";
import { DiffPane } from "./DiffPane";
import { PreviewPane } from "./PreviewPane";
import { CodeMirrorPane } from "./CodeMirrorPane";
import { ThreadsView } from "./ThreadsView";
import {
  getProjectThreads, getThread, loadProjectThreads,
  saveThread, deleteThread as deleteThreadFromStore,
} from "../store/threads";
import { RightSidebar } from "./RightSidebar";
import { NewSessionMenu, NewSessionPlacement, AgentConfig, AGENT_CONFIGS, AgentIcon, type BranchLaunch } from "./NewSessionMenu";
import { BranchSessionMenu } from "./BranchSessionMenu";
import { SettingsPanel } from "./SettingsPanel";
import { ProjectSettingsPanel } from "./ProjectSettingsPanel";
import { Tooltip } from "./Tooltip";
import { BroadcastDialog, BroadcastSession } from "./BroadcastDialog";
import "./BroadcastDialog.css";
import { CommandPalette } from "./CommandPalette";
import { QueuePanel } from "./QueuePanel";
import { dequeue } from "../store/messageQueue";
import { getPrompts, type PromptEntry } from "../store/prompts";
import { useTheme, builtinThemes } from "../themes/ThemeContext";
import { Mark } from "../assets/Mark";
import { StatusBar } from "./StatusBar";
import { UpdateNotice } from "./UpdateNotice";
import { useAvailableUpdate, dismissUpdate, startUpdateChecks, installUpdate, openReleaseNotes } from "../store/updates";
import { startModelManifestFetch } from "../lib/remoteConfig";
import { startAgentHooks } from "../store/agentHooks";
import { AtlasIndexModal } from "./AtlasIndexModal";
import { KnowledgeBasePage } from "./KnowledgeBasePage";
import { TasksPage } from "./TasksPage";
import { AutomationsPage } from "./Automations/AutomationsPage";
import { Toolbar } from "./Toolbar";
import AgentTabs from "./AgentTabs";
import IconCapsule from "./IconCapsule";
import { SidebarWorkBadge, ProjectWorkBadge, AttentionPill } from "./SessionBadges";
import "./StatusBar.css";
import "./UpdateNotice.css";
import "./TopBar.css";
import "./WorkspaceView.css";
import "./Toolbar.css";

interface Props {
  zen?: true;
  name?: string;
  path?: string;
}

// Directories under .tempest/ that are internal to Tempest and must never be
// treated as git worktrees in the sidebar.
const TEMPEST_INTERNAL_DIRS = new Set(["atlas", "logs"]);

// One sidebar row: either a live session or the ghost of a closed one.
type SbRow = { id: string; at: string; live?: Session; ghost?: WorktreeSession };

// Interleave live and ghost rows in creation order. Rendering live rows first
// and ghosts after made a session jump position the moment it was closed or
// re-opened; ordering both by the persisted createdAt keeps every row put.
function sbRows(live: Session[], ghosts: WorktreeSession[]): SbRow[] {
  return [
    ...live.map((s): SbRow => ({ id: s.id, at: s.createdAt, live: s })),
    ...ghosts.map((g): SbRow => ({ id: g.id, at: g.createdAt, ghost: g })),
  ].sort((a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id));
}

import { folderName, timeAgo } from "../lib/format";
import { getHookCommands, runHook, type HookKind } from "../lib/worktreeHooks";
import { portForWorkspace, hostSlug, proxyUrl } from "../lib/servicePort";
import { buildAgentArgs } from "../lib/agentArgs";
import { getAgentConfig } from "../lib/runtimeState";
import {
  type SplitDir,
  type SplitBranch,
  type PaneNode,
  paneSessionIds,
  replaceLeaf,
  removeLeaf,
  patchRatio,
  computeRects,
  collectHandles,
} from "../lib/paneLayout";

// WorkStateBadge, QueueBadge, SidebarWorkBadge — imported from ./SessionBadges


export function WorkspaceView({ zen, name, path }: Props) {
  const [activeSection, setActiveSection] = useState<NavSection>("overview");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [tabsMode] = useState<"designed" | "tabbed" | "ver1" | "designer">("designer");
  const [sessionMenuOpen, setSessionMenuOpen] = useState(false);
  const [sessionMenuRect, setSessionMenuRect] = useState<DOMRect | null>(null);
  const [sessionMenuPlacement, setSessionMenuPlacement] = useState<NewSessionPlacement>("below");
  // Branch-level "+" menu: worktree context is already known, so sessions spawn
  // directly into pendingWorktreePath with no worktree-creation modal.
  const [branchMenuOpen, setBranchMenuOpen] = useState(false);
  const [branchMenuRect, setBranchMenuRect] = useState<DOMRect | null>(null);
  const [pendingWorktreePath, setPendingWorktreePath] = useState<string | null>(null);
  const [branchMenuLabel, setBranchMenuLabel] = useState<string>("");
  const [branchMenuIsRoot, setBranchMenuIsRoot] = useState(false);
  // Branch list + git status for the "+" menu's Branch tab, fetched when it opens.
  const [existingBranches, setExistingBranches] = useState<BranchInfo[]>([]);
  const [menuIsGitRepo, setMenuIsGitRepo] = useState(true);

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

  const [, setActiveBranch] = useState<string | null>(null);
  const [rightSidebarOpen, setRightSidebarOpen] = useState(true);
  const [gitRevision, setGitRevision] = useState(0);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [projectSettingsPanelId, setProjectSettingsPanelId] = useState<string | null>(null);
  const [compactOpen, setCompactOpen] = useState(false);
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
  const promptBtnRef = useRef<SVGSVGElement>(null);
  const [promptPickerPos, setPromptPickerPos] = useState<{ top: number; right: number } | null>(null);
  const [notesOpen, setNotesOpen] = useState(false);
  const [notesPos, setNotesPos] = useState<{ top: number; right: number } | null>(null);
  const notesBtnRef = useRef<SVGSVGElement>(null);
  const [diffPickerOpen, setDiffPickerOpen] = useState(false);
  const [diffPickerBranches, setDiffPickerBranches] = useState<Record<string, BranchInfo[]>>({});
  const [diffPickerLoading, setDiffPickerLoading] = useState(false);
  const [sidebarAtTop, setSidebarAtTop] = useState(true);
  const [sidebarAtBottom, setSidebarAtBottom] = useState(false);
  const sidebarScrollRef = useRef<HTMLDivElement>(null);
  const [expandedWorktrees, setExpandedWorktrees] = useState<Set<string>>(new Set());
  const [sidebarDragOver, setSidebarDragOver] = useState<{ id: string; side: "before" | "after" } | null>(null);

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

  // Default mode: multi-project state (persisted to SQLite via the projects store)
  const [projects, setProjects] = useState<Project[]>(() =>
    zen ? [] : getOpenProjects().map((p) => ({ ...p, worktrees: [] }))
  );
  const projectsRef = useRef<Project[]>([]);
  projectsRef.current = projects;
  const [pendingProjectId, setPendingProjectId] = useState<string | null>(null);
  // Project IDs confirmed to be git repos (detected via get_git_branch on open/restore).
  const [gitProjectIds, setGitProjectIds] = useState<Set<string>>(new Set());

  // (sessionChannels and outputCaptures replaced by SessionManager — it owns all
  // Channel subscriptions, per-session ring buffers, and capture callbacks.)

  // Tracks which cwd paths currently have an openSession call in flight.
  // Prevents duplicate spawns when the restore loop calls openSession for the
  // same path back-to-back before any state update has flushed (stale closure).
  const spawningPaths = useRef<Set<string>>(new Set());

  // Always-current keyboard shortcut handler (avoids stale closure on the listener).
  const shortcutHandlerRef = useRef<(e: KeyboardEvent) => void>(() => {});

  // Threads canvases (sidebar dropdown). Loaded lazily on first expand; the store
  // is the source of truth, this counter just forces a re-render after async load.
  const [threadsVersion, setThreadsVersion] = useState(0);
  const bumpThreads = () => setThreadsVersion((v) => v + 1);
  const loadedThreadProjects = useRef<Set<string>>(new Set());
  const [renamingThreadId, setRenamingThreadId] = useState<string | null>(null);
  const [threadRenameValue, setThreadRenameValue] = useState("");

  // Sidebar right-click context menu
  const [ctxMenu, setCtxMenu] = useState<CtxMenuState | null>(null);

  // Delete workspace dialog state
  const [deleteDialog, setDeleteDialog] = useState<DeleteDialogState | null>(null);
  /// Pending consent for a repo's tempest.yml hook. `resolve` is the awaiting
  /// hook runner — answering the dialog is what lets it continue.
  const [hookConsent, setHookConsent] = useState<
    { kind: HookKind; commands: string[]; cwd: string; resolve: (ok: boolean) => void } | null
  >(null);
  /// Latest output line while a hook is running, shown in whichever modal
  /// triggered it.
  const [hookRun, setHookRun] = useState<{ kind: HookKind; line: string } | null>(null);
  /// Message from a project-policy refusal at spawn time, or a failed update.
  /// Rendered as a dismissible notice near the bottom of the window.
  const [policyError, setPolicyError] = useState<string | null>(null);

  // Update checks: one now, then daily for as long as the app stays open.
  const availableUpdate = useAvailableUpdate();
  useEffect(() => { startUpdateChecks(); void startModelManifestFetch(); void startAgentHooks(); }, []);

  /// The Overview footer has to stay mounted while it retracts, so ✕ sets this
  /// instead of dismissing outright; the dismissal lands on animation end.
  const [noticeClosing, setNoticeClosing] = useState(false);

  /// Non-null while the workspace update confirmation is open.
  const [updateConfirm, setUpdateConfirm] = useState<{ installing: boolean; error: string | null } | null>(null);

  // Same line, two homes: the footer that drops in on Overview, and the
  // status bar cycle once the user is inside a session.
  const updateProps = availableUpdate && {
    version: availableUpdate.version,
    onNotes: () => openReleaseNotes(availableUpdate),
    onUpdate: () => { installUpdate(availableUpdate).catch((e) => setPolicyError(String(e))); },
    onDismiss: dismissUpdate,
  };

  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [inlineCreateProjectId, setInlineCreateProjectId] = useState<string | null>(null);
  const [inlineCreateName, setInlineCreateName] = useState("");


  // Persist projects list to SQLite whenever it changes
  useEffect(() => {
    if (zen) return;
    saveOpenProjects(
      projects.map(({ id, name, path, expanded, worktrees }) => ({
        id, name, path, expanded,
        worktreeOrder: worktrees.map(w => w.path),
      }))
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

  // Let the island suppress notifs for the tab the user is actively viewing.
  useEffect(() => { setActiveIslandSession(activeSessionId); }, [activeSessionId]);

  // "View Agent" in the island focuses that session's tab.
  useEffect(() => onIslandFocusRequest((id) => setActiveSessionId(id)), []);

  // On mount: scan every open project for valid worktrees, prune stale session
  // entries that no longer correspond to any path on disk, then restore only
  // the sessions that are still valid. This ensures deleted/removed projects
  // never re-appear as tabs on the next launch.
  useEffect(() => {
    if (zen) return;

    async function restoreAll() {
      // Detect git for all persisted projects so the "main" row shows even before any session exists.
      for (const p of projects) {
        invoke<string>("get_git_branch", { path: p.path })
          .then(() => setGitProjectIds((prev) => { if (prev.has(p.id)) return prev; const s = new Set(prev); s.add(p.id); return s; }))
          .catch(() => {});
      }

      // Discover which worktree directories / projects still exist on disk.
      const diskWorktreePaths = new Set<string>();
      const openProjectPaths = new Set<string>();
      const allProjectData: { project: Project; wts: { name: string; path: string }[] }[] = [];

      // Scan all projects' .tempest/ dirs concurrently — serialising this made
      // launch time scale linearly with project count.
      const scans = await Promise.all(
        projects.map((project) =>
          invoke<{ name: string; path: string; is_dir: boolean }[]>(
            "list_directory",
            { path: `${project.path}/.tempest` }
          ).catch(() => [] as { name: string; path: string; is_dir: boolean }[])
        )
      );

      for (const [i, project] of projects.entries()) {
        openProjectPaths.add(project.path);
        const wts: { name: string; path: string }[] = [];
        scans[i].filter((e) => e.is_dir && !TEMPEST_INTERNAL_DIRS.has(e.name)).forEach((e) => {
          wts.push({ name: e.name, path: e.path });
          diskWorktreePaths.add(e.path);
        });

        // Restore user's custom worktree order if persisted from a previous drag.
        const storedWtOrder = getOpenProjects().find(p => p.id === project.id)?.worktreeOrder;
        if (storedWtOrder?.length) {
          const orderIdx = new Map(storedWtOrder.map((p, i) => [p, i]));
          wts.sort((a, b) => (orderIdx.get(a.path) ?? Infinity) - (orderIdx.get(b.path) ?? Infinity));
        }

        allProjectData.push({ project, wts });
        setProjects((prev) =>
          prev.map((p) => (p.id === project.id ? { ...p, worktrees: wts } : p))
        );
      }

      // Prune sessions whose branch directory (branch sessions) or project (root
      // sessions) no longer exists. The DB is the source of truth for which
      // sessions exist; the filesystem scan only confirms which are still anchored.
      const validIds = new Set<string>();
      for (const s of getAllSessions()) {
        const branchPath = s.branchId ? getBranchPath(s.branchId) : undefined;
        const ok = s.branchId
          ? (branchPath !== undefined && diskWorktreePaths.has(branchPath))
          : openProjectPaths.has(getProjectPath(s.projectId) ?? "");
        if (ok) validIds.add(s.id);
      }
      pruneSessions(validIds);

      // Collect restore items in saved tab-bar order. Focus is restored in one
      // explicit call after the loop — opening the active session last would
      // shuffle it to the end of the order, and that mutated order is what the
      // sessionOrder effect writes back, so the tab bar drifted every launch.
      const { sessionOrder, activeInstanceId: savedActiveId } = getRuntimeState();
      const savedTabs = getTabs();
      const orderMap = new Map(sessionOrder.map((id, i) => [id, i]));
      const openedIds = new Set<string>();

      type RestoreItem = { id: string; sortIndex: number; open: () => Promise<unknown> };
      const items: RestoreItem[] = [];

      for (const { project, wts } of allProjectData) {
        // Primary (non-sub) sessions in each worktree — the branch's stable id is
        // reused as providedSessionId so sub-sessions' parent_session_id resolves.
        for (const wt of wts) {
          for (const saved of getBranchSessions(wt.path)) {
            if (saved.closed === true) continue;
            items.push({
              id: saved.id,
              sortIndex: orderMap.get(saved.id) ?? Infinity,
              open: () => openSession(
                saved.name, wt.path, project.id, saved.agent,
                undefined, undefined,
                saved.agent ? saved.conversationId : undefined,
                undefined, undefined,
                true, saved.id
              ).catch(() => {}),
            });
          }
        }

        // Root sessions (project root, no branch).
        for (const saved of getRootSessionsForProject(project.path)) {
          if (saved.closed === true) continue;
          items.push({
            id: saved.id,
            sortIndex: orderMap.get(saved.id) ?? Infinity,
            open: () => openSession(
              saved.name, project.path, project.id, saved.agent,
              undefined, undefined,
              saved.agent ? saved.conversationId : undefined,
              true, saved.noGit,
              true, saved.id
            ).catch(() => {}),
          });
        }
      }

      // Non-terminal tabs (diff, preview, editor) — only for projects still open.
      const openProjectIds = new Set(projects.map((p) => p.id));
      for (const tab of savedTabs.filter((t) => openProjectIds.has(t.projectId))) {
        items.push({
          id: tab.instanceId,
          sortIndex: orderMap.get(tab.instanceId) ?? Infinity,
          open: async () => {
            setSessions((prev) => {
              if (prev.some((s) => s.instanceId === tab.instanceId)) return prev;
              return [...prev, {
                // id === instanceId, as everywhere else a tab is opened. Minting a
                // separate id here left the saved active id unresolvable.
                id: tab.instanceId,
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
            setActiveSessionId(tab.instanceId);
          },
        });
      }

      items.sort((a, b) => a.sortIndex - b.sortIndex);

      // Open all top-level sessions in order.
      for (const item of items) { await item.open(); openedIds.add(item.id); }

      // Sub-sessions: open once their parent is live. Loop to honor arbitrary
      // nesting (a sub whose parent is itself a sub). Parents were opened with
      // providedSessionId = their stable id, so parent_session_id resolves directly.
      const pendingSubs = getAllSessions().filter(
        (s) => s.parentSessionId && s.closed !== true && validIds.has(s.id)
      );
      let progressed = true;
      while (progressed && pendingSubs.length) {
        progressed = false;
        for (let i = pendingSubs.length - 1; i >= 0; i--) {
          const sub = pendingSubs[i];
          if (!openedIds.has(sub.parentSessionId!)) continue;
          const cwd = sub.branchId ? (getBranchPath(sub.branchId) ?? "") : (getProjectPath(sub.projectId) ?? "");
          await openSession(
            sub.name, cwd, sub.projectId, sub.agent,
            undefined, undefined,
            sub.agent ? sub.conversationId : undefined,
            !sub.branchId, sub.noGit,
            false, sub.id, sub.parentSessionId
          ).catch(() => {});
          openedIds.add(sub.id);
          pendingSubs.splice(i, 1);
          progressed = true;
        }
      }

      // Every open above moved focus; put it back on the saved active session.
      // Covers tab kinds too, now that a restored tab's id is its instanceId.
      if (savedActiveId && openedIds.has(savedActiveId)) {
        setActiveSessionId(savedActiveId);
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

      if (matchesEvent(keybinds.commandPalette, e)) {
        e.preventDefault(); setCommandPaletteOpen((o) => { if (!o) void track("feature_used", { feature: "command_palette" }); return !o; });
      } else if (matchesEvent(keybinds.toggleTheme, e)) {
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
      } else if (matchesEvent(keybinds.jumpWaiting, e)) {
        e.preventDefault();
        const waiting = sessions.filter((s) => {
          if (getAttention(s.id)) return true;
          return getWorkState(s.id) === "done";
        }).sort((a, b) => {
          // attention before done so the jump lands on blocked agents first
          const rank = (id: string) => getAttention(id) ? 0 : 1;
          return rank(a.id) - rank(b.id);
        });
        if (waiting.length === 0) return;
        const curIdx = sessions.findIndex((s) => s.id === activeSessionId);
        const next = waiting.find((s) => sessions.indexOf(s) > curIdx) ?? waiting[0];
        setActiveSessionId(next.id);
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

  // When the "+" menu opens, detect git and fetch branches so the Branch tab is
  // ready without a wait after the user clicks it.
  useEffect(() => {
    if (!sessionMenuOpen) return;
    const projectPath = projects.find((p) => p.id === pendingProjectId)?.path ?? (zen ? path ?? "" : "");
    if (!projectPath) { setMenuIsGitRepo(false); return; }
    invoke<boolean>("check_git_initialized", { path: projectPath })
      .then(setMenuIsGitRepo)
      .catch(() => setMenuIsGitRepo(false));
    invoke<BranchInfo[]>("git_list_branches", { repoPath: projectPath })
      .then(setExistingBranches)
      .catch(() => setExistingBranches([]));
  }, [sessionMenuOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  function openCtxMenu(
    e: React.MouseEvent,
    worktree: Worktree | null,
    projectPath: string,
    projectId: string,
    sessionId: string | null,
    isProjectHeader = false,
    isRootSession = false,
    rootKey?: string,
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
    // Remove persisted non-terminal tabs for this project (project delete also
    // cascades them in the DB; this keeps the in-memory mirror in sync).
    for (const t of getTabs().filter((t) => t.projectId === projectId)) removeTab(t.instanceId);
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
    sessionId: string | null,
    preselectBranch = false
  ) {
    setCtxMenu(null);
    // Tempest always creates the branch with the same name as the worktree folder
    setDeleteDialog({
      worktree, projectPath, projectId, sessionId,
      branchName: worktree.name,
      deleteBranch: preselectBranch,
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
      // Teardown gets its turn while the worktree still exists. Failure is
      // reported but never blocks the delete: the directory is going away, and
      // a broken cleanup command must not strand a workspace on disk.
      const failure = await runWorktreeHook("teardown", projectPath, projectId, worktree.path);
      if (failure) console.warn(`[tempest.yml] teardown failed: ${failure}`);

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
      removeBranchByPath(worktree.path);
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
    parentSessionId?: string, // set when spawned via a split — makes this a sub-session of another
    model?: string, // specific model override passed as --model to supported agent CLIs
    placement: "tab" | "canvas" = "tab", // "canvas" = a Threads node owns it; no tab bar entry
  ) {
    // Guard is scoped to the restore loop (dedupe=true). User-triggered opens never block
    // each other, so two root sessions at the same cwd can be opened intentionally.
    if (dedupe && spawningPaths.current.has(cwd)) return;
    if (dedupe) spawningPaths.current.add(cwd);

    try {
      const sessionId = providedSessionId ?? crypto.randomUUID();
      // The session id IS the stable cross-restart identity — persisted as the row
      // primary key and reused via providedSessionId on resume. With row identity,
      // multiple agents/terminals can coexist and persist in the same worktree
      // (the old one-agent-per-cwd ceiling in §3.6 is gone).
      const instanceId = sessionId;

      // Assemble the agent's full argument list (session/resume flags + prompt) here in
      // TypeScript so Rust receives a ready-to-run command. originalId is present only
      // when resuming an existing conversation.
      const args = agent
        ? buildAgentArgs(agent, sessionId, originalId, prompt, model, { sessionName, cwd })
        : null;

      const config = agent ? AGENT_CONFIGS.find((a) => a.hint === agent) : null;
      // Per-agent launch defaults (global, set in Settings → Agents). Only agent
      // sessions have a type; plain terminals get none.
      const agentCfg = config ? getAgentConfig(config.id) : null;
      // The agent's configured working subdirectory is entered relative to the
      // worktree root. Session identity, sandbox rw paths, and DB isolation keep
      // using the worktree `cwd`; only the PTY's start directory moves.
      const effectiveCwd = agentCfg?.subdir ? `${cwd}/${agentCfg.subdir}` : cwd;
      const usesCapturePattern = !!(config?.capturePattern && config.captureResumeArgs);
      const conversationId = usesCapturePattern && !originalId ? undefined : (originalId ?? sessionId);

      // Persist metadata immediately after the PTY spawns so it survives tab close.
      // Skip during restore (dedupe=true): the row already exists in the mirror.
      if (!dedupe) {
        saveSession({
          id: sessionId, name: sessionName, agent, conversationId, projectId,
          cwd, isRootSession, parentSessionId, noGit, placement,
        });
      }

      // The global "isolate agents" switch — a sync read, hoisted so the tab can
      // render before the async config load + PTY spawn below.
      const shouldIsolate = getSettings().isolateAgents;

      // Instant tab: render the sidebar row + focus it NOW, synchronously, before
      // the config load and create_pty_session (which, with DB isolation, can take
      // seconds). The pane mounts and parks its listener in sessionManager.pending;
      // register() below adopts it once the PTY is live. Canvas sessions have no
      // tab (a Threads node is their home) so they skip this. On spawn failure the
      // catch below rolls the tab back.
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
        // The persisted stamp, not "now" — a restored or re-opened session must
        // keep the creation order the sidebar lists it in. saveSession/the mirror
        // already hold it by this point; the fallback covers unpersisted sessions.
        createdAt: getSession(sessionId)?.createdAt ?? new Date().toISOString(),
        metadata: { resumeCount: 0, hasBeenResumed: false },
      };
      const prevActiveId = activeSessionId;
      if (placement !== "canvas") {
        // Upsert by id: the Branch tab renders an optimistic placeholder row
        // under this same id before awaiting the worktree, so here we replace it
        // in place (keeping the already-mounted pane) rather than appending a dup.
        setSessions((prev) =>
          prev.some((s) => s.id === sessionId)
            ? prev.map((s) => (s.id === sessionId ? newSession : s))
            : [...prev, newSession],
        );
        setActiveSessionId(sessionId);
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
            setSessionConversationId(sessionId, capturedId);
            setSessions((prev) =>
              prev.map((s) => (s.id === sessionId ? { ...s, conversationId: capturedId } : s))
            );
            sessionManager.setOnChunk(sessionId, null);
          }
        };
      }

      const channel = new Channel<{ session_id: string; data: string }>();

      // Project settings govern every PTY session — agent tabs and plain
      // terminals alike. Loaded once here and mapped into the two backend
      // params below; previously only `database.isolationEnabled` was read and
      // the rest of the panel had no effect on anything.
      // The project root — not `cwd`, which may be a worktree. tempest.yml lives
      // at the root and governs every worktree cut from it.
      const projectRoot = getProjectPath(projectId);
      // Load in parallel: loadProjectSettings already reads tempest.yml internally,
      // so running the two sequentially doubled the disk round-trips (and a missing
      // tempest.yml costs two failing read_file calls each). Overlapping them keeps
      // the config load off the critical path before the tab renders.
      const [projectSettings, tempestConfig] = await Promise.all([
        loadProjectSettings(projectId, projectRoot),
        loadTempestConfig(projectRoot ?? ""),
      ]);

      // The global "isolate agents" switch is the master off-switch (read above,
      // before the tab rendered). With it on, the per-project sandbox mode decides
      // the posture. Terminals are no longer pinned to lifecycle-only: a shell can
      // reach the network exactly as an agent can, so it is governed exactly so.
      const sandboxParam = shouldIsolate ? {
        mode: projectSettings.sandbox.mode === "off" ? "lifecycle" : projectSettings.sandbox.mode,
        allowed_hosts: projectSettings.network.allowHosts,
        block_hosts: projectSettings.network.blockHosts,
        network_default_allow: projectSettings.network.policy === "permissive",
        // Filesystem confinement has no Windows implementation yet, so these
        // are carried for the platforms that can honour them and are inert here.
        rw_paths: [cwd, ...projectSettings.filesystem.rwPaths.filter((p) => p !== ".")],
        ro_paths: projectSettings.filesystem.roPaths,
        resources: {
          max_memory_mb: projectSettings.resources.maxMemoryMb,
          max_processes: projectSettings.resources.maxProcesses,
          max_disk_write_mb: projectSettings.resources.maxDiskWriteMb,
          cpu_weight: projectSettings.resources.cpuWeight,
        },
      } : null;

      // Launch policy — what may start, as opposed to how it is confined.
      // Enforced in Rust before the PTY is opened; the menu filtering is only
      // presentation.
      const policyParam = {
        permitted_agents: projectSettings.agents.permitted,
        allow_skip_permissions: projectSettings.permissions.allowSkipPermissions,
        skip_permission_flags: AGENT_CONFIGS.flatMap((a) => a.autoApproveArgs ?? []),
      };

      try {
        await invoke<void>("create_pty_session", {
          sessionId,
          cwd: effectiveCwd,
          rows: 24,
          cols: 80,
          command: agent ?? null,
          args,
          sandbox: sandboxParam,
          policy: policyParam,
          dbIsolation: projectSettings.database.isolationEnabled,
          // Env precedence, lowest → highest: per-agent global defaults, then the
          // repo's tempest.yml (project-specific wins over the org default), then
          // the reserved TEMPEST_SESSION. The last lets an installed agent hook
          // (see src/lib/agentHooks) attribute its lifecycle POSTs back to this
          // exact session, without touching the PTY spawn internals.
          env: { ...(agentCfg?.env ?? {}), ...(tempestConfig.env ?? {}), TEMPEST_SESSION: sessionId },
          onEvent: channel,
        });
      } catch (e) {
        // Spawn failed. The tab was rendered optimistically before this await, so
        // roll it back: drop the row, restore the previously-active tab, purge the
        // persisted session, and clear any pane listener parked in pending.
        if (placement !== "canvas") {
          setSessions((prev) => prev.filter((s) => s.id !== sessionId));
          setActiveSessionId(prevActiveId);
        }
        removeSession(sessionId);
        sessionManager.unregister(sessionId);
        // Surface the reason, then rethrow so existing caller-side cleanup runs.
        setPolicyError(String(e));
        void track("agent_launch_failed", {
          agent: agent ?? "terminal",
          reason_kind: /not permitted|policy|skip.?perm/i.test(String(e)) ? "policy" : "spawn_error",
        });
        throw e;
      }

      void track("session_created", {
        agent: agent ?? "terminal",
        scope: isRootSession ? "root" : "branch",
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

      // Kick the PTY with an initial resize immediately after spawn. Agent CLIs
      // (Claude Code, Gemini, etc.) don't begin rendering / running their task
      // until they receive a real terminal size + resize event. A pane launched
      // in the background (e.g. a canvas agent node whose canvas isn't focused, or
      // an unfocused tab) mounts its TerminalPane with display:none, so its container
      // is 0×0 and the visibility-gated fitAndResize/ResizeObserver never fires
      // resize_pty. Without this, the agent stays idle at the 24×80 spawn size
      // until the tab is focused. We size from the shared workspace area — which
      // is always laid out — so a hidden pane gets the same dimensions a focused
      // one would. The exact fit is corrected by the ResizeObserver once the pane
      // is shown.
      if (agent) {
        const area = workspaceContentRef.current;
        const fontSize = getSettings().terminalFontSize;
        // Approximate monospace cell metrics; the precise fit happens on show.
        const cellW = fontSize * 0.6;
        const cellH = fontSize * 1.2;
        const w = area?.clientWidth ?? 0;
        const h = area?.clientHeight ?? 0;
        const cols = w > 0 ? Math.max(20, Math.floor(w / cellW)) : 120;
        const rows = h > 0 ? Math.max(10, Math.floor(h / cellH)) : 40;
        invoke("resize_pty", { sessionId, rows, cols }).catch(() => {});
      }

      // The tab was already rendered synchronously before the awaits above; the
      // PTY, sessionManager registration, and persistence are now all in place.
      // Canvas sessions never had a tab — a Threads node is their sole home.
      return sessionId;
    } finally {
      // Always release the guard — even if create_pty_session rejects — so a failed
      // spawn never permanently blocks this path from opening future sessions.
      spawningPaths.current.delete(cwd);
    }
  }

  function openDiffTab(cwd: string, projectId: string, initialDiffPath?: string) {
    // If a diff tab for this cwd is already open, just focus it.
    const existing = sessionsRef.current.find((s) => s.kind === "diff" && s.cwd === cwd);
    if (existing) { setActiveSessionId(existing.id); return; }
    void track("feature_used", { feature: "diff_review" });
    const sessionId = crypto.randomUUID();
    const tab: PersistedTab = { instanceId: sessionId, kind: "diff", projectId, cwd, name: "Diff" };
    for (const t of getTabs().filter((t) => t.kind === "diff" && t.cwd === cwd)) removeTab(t.instanceId);
    upsertTab(tab);
    setSessions((prev) => [...prev, {
      id: sessionId, instanceId: sessionId, name: "Diff", cwd, projectId, kind: "diff",
      initialDiffPath,
      createdAt: new Date().toISOString(),
      metadata: { resumeCount: 0, hasBeenResumed: false },
    }]);
    setActiveSessionId(sessionId);
  }

  async function openDiffPicker() {
    setDiffPickerOpen((open) => !open);
    setPromptPickerOpen(false);
    if (diffPickerLoading || Object.keys(diffPickerBranches).length > 0) return;
    const pickerProjects = zen && path
      ? [{ id: "zen", name: name ?? folderName(path), path, expanded: true, worktrees: zenWorktrees }]
      : projects;
    if (pickerProjects.length === 0) return;
    setDiffPickerLoading(true);
    try {
      const pairs = await Promise.all(
        pickerProjects.map(async (project) => {
          try {
            const branches = await invoke<BranchInfo[]>("git_list_branches", { repoPath: project.path });
            return [project.id, branches] as const;
          } catch {
            return [project.id, []] as const;
          }
        })
      );
      setDiffPickerBranches(Object.fromEntries(pairs));
    } finally {
      setDiffPickerLoading(false);
    }
  }

  function openDiffForBranch(project: Project, branch: BranchInfo) {
    const cwd = branch.worktree_path ?? (branch.is_current ? project.path : null);
    if (!cwd) return;
    setDiffPickerOpen(false);
    openDiffTab(cwd, project.id);
  }

  async function openPreviewTab(projectId: string, cwd = "") {
    const existing = sessionsRef.current.find((s) => s.kind === "preview" && s.projectId === projectId && s.cwd === cwd);
    if (existing) { setActiveSessionId(existing.id); return; }
    void track("feature_used", { feature: "preview" });
    const sessionId = crypto.randomUUID();
    // A project that declares its dev-server port in tempest.yml opens straight
    // at the app; otherwise fall back to this workspace's allocated service port
    // (the same one the Run tab injects), so the preview points where the dev
    // server actually binds instead of the port picker.
    const projectPath = getProjectPath(projectId) ?? "";
    const port = (await loadTempestConfig(projectPath)).preview?.port ?? portForWorkspace(cwd || projectPath);
    // Route the branch-named hostname to the real dev port, and preview through
    // it — so the URL says which branch it is. Falls back to the direct port if
    // the proxy isn't up (register throws / :7000 taken).
    const slug = hostSlug(cwd || projectPath);
    let previewUrl = port ? `http://localhost:${port}` : undefined;
    try {
      const up = await invoke<boolean>("register_service_route", { slug, port });
      if (up && port) previewUrl = proxyUrl(cwd || projectPath);
    } catch { /* proxy dormant — keep the direct URL */ }
    const tab: PersistedTab = { instanceId: sessionId, kind: "preview", projectId, cwd, name: "Live Preview", previewUrl };
    upsertTab(tab);
    setSessions((prev) => [...prev, {
      id: sessionId, instanceId: sessionId, name: "Live Preview", cwd, projectId, kind: "preview",
      previewUrl,
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
    for (const t of getTabs().filter((t) => t.kind === "editor" && t.cwd === filePath)) removeTab(t.instanceId);
    upsertTab(tab);
    setSessions((prev) => [...prev, {
      id: sessionId, instanceId: sessionId, name: fileName, cwd: filePath, projectId, kind: "editor",
      createdAt: new Date().toISOString(),
      metadata: { resumeCount: 0, hasBeenResumed: false },
    }]);
    setActiveSessionId(sessionId);
  }

  // ── Threads (canvas chat) ──────────────────────────────────────────────────
  // A canvas is one top-level tab, keyed by its threadId (reused as session id +
  // instanceId), so reopening the same canvas dedups naturally.
  function openThreadTab(projectId: string, threadId: string) {
    const existing = sessionsRef.current.find((s) => s.kind === "thread" && s.id === threadId);
    if (existing) { setActiveSessionId(existing.id); return; }
    void track("feature_used", { feature: "canvas" });
    const name = getThread(threadId)?.name ?? "Thread";
    if (!getTabs().some((t) => t.instanceId === threadId)) {
      upsertTab({ instanceId: threadId, kind: "thread", projectId, cwd: "", name });
    }
    setSessions((prev) => [...prev, {
      id: threadId, instanceId: threadId, name, cwd: "", projectId, kind: "thread",
      createdAt: new Date().toISOString(),
      metadata: { resumeCount: 0, hasBeenResumed: false },
    }]);
    setActiveSessionId(threadId);
  }

  // Lazily hydrate a project's canvases the first time its Threads row is opened.
  function ensureThreadsLoaded(projectId: string) {
    if (loadedThreadProjects.current.has(projectId)) return;
    loadedThreadProjects.current.add(projectId);
    loadProjectThreads(projectId).then(bumpThreads).catch(() => {
      loadedThreadProjects.current.delete(projectId);
    });
  }

  function createThread(projectId: string) {
    const id = crypto.randomUUID();
    const order = getProjectThreads(projectId).reduce((m, t) => Math.max(m, t.sortOrder), -1) + 1;
    saveThread({ id, projectId, name: "New thread", viewport: null, sortOrder: order });
    bumpThreads();
    const path = projects.find((p) => p.id === projectId)?.path;
    if (path) setExpandedWorktrees((prev) => new Set([...prev, path + "::threads"]));
    openThreadTab(projectId, id);
  }

  function renameThread(threadId: string, name: string) {
    const t = getThread(threadId);
    const trimmed = name.trim();
    if (t && trimmed) {
      saveThread({ ...t, name: trimmed });
      // Keep an open tab's title in sync.
      setSessions((prev) => prev.map((s) => (s.id === threadId ? { ...s, name: trimmed } : s)));
      const tab = getTabs().find((tb) => tb.instanceId === threadId);
      if (tab) upsertTab({ ...tab, name: trimmed });
    }
    setRenamingThreadId(null);
    bumpThreads();
  }

  // Auto-name a canvas from the first chat message typed on it (plan §11.2).
  // Only fires while the canvas still holds its default name — a manual rename
  // (or a prior auto-name) wins. Reuses renameThread for store + tab-title sync.
  function autoNameThread(threadId: string, firstMessage: string) {
    if (getThread(threadId)?.name !== "New thread") return;
    const name = firstMessage.trim().replace(/\s+/g, " ").slice(0, 48).trim();
    if (name) renameThread(threadId, name.length === 48 ? name.replace(/\s\S*$/, "") + "…" : name);
  }

  function removeThread(threadId: string) {
    deleteThreadFromStore(threadId);
    // Close the tab if open; drop its PersistedTab so it can't restore.
    if (sessionsRef.current.some((s) => s.id === threadId)) closeSession(threadId);
    else removeTab(threadId);
    bumpThreads();
  }

  // Spawn a canvas-owned PTY session (no tab). Returns the new session id, or null
  // on failure. The agent/terminal Threads node is the session's sole home; a chat
  // node's launch proposal and a bare node's "Launch" button both route here.
  // A `worktreePath` binds the session to a branch (isRootSession=false → saveSession
  // mints/finds the branch row and stamps session.branchId, which resume then reads);
  // omitted = project root, as before.
  async function spawnCanvasSession(
    projectId: string,
    opts: { agent?: string; name?: string; prompt?: string; model?: string; worktreePath?: string },
  ): Promise<string | null> {
    const project = projects.find((p) => p.id === projectId);
    if (!project) return null;
    const cwd = opts.worktreePath ?? project.path;
    const isRoot = !opts.worktreePath;
    const cfg = opts.agent ? AGENT_CONFIGS.find((a) => a.hint === opts.agent) : null;
    const name = opts.name ?? (cfg
      ? `${cfg.name}${opts.model ? ` (${opts.model.split("-").slice(-2).join("-")})` : ""}`
      : (opts.agent ?? "Terminal"));
    const sessionId = crypto.randomUUID();
    try {
      await openSession(
        name, cwd, projectId, opts.agent, opts.prompt,
        undefined, undefined, isRoot, false, false,
        sessionId, undefined, opts.model, "canvas",
      );
      // Agents receive their prompt as a CLI arg — no markUserInput fires — so stamp
      // "working" here for the node badge, mirroring the old launch-from-chat path.
      if (opts.agent) setWorkState(sessionId, "working");
      return sessionId;
    } catch (e) {
      console.error("Failed to spawn canvas session:", e);
      return null;
    }
  }

  // Cut a new worktree for a canvas node's "New worktree…" pick. Reuses the same
  // createWorktree + setup-hook path the sidebar uses; returns the new path so the
  // caller can spawn a session into it. null on failure (e.g. not a git repo).
  async function createCanvasWorktree(projectId: string, name: string): Promise<string | null> {
    const project = projects.find((p) => p.id === projectId);
    if (!project || !name.trim()) return null;
    try {
      const result = await createWorktree({ projectPath: project.path, name });
      addWorktreeToState({ name: name.trim(), path: result.path }, projectId);
      await runWorktreeHook("setup", project.path, projectId, result.path);
      return result.path;
    } catch (e) {
      console.error("Failed to create canvas worktree:", e);
      return null;
    }
  }

  // Re-spawn a persisted canvas session whose PTY died (app restart). Idempotent:
  // no-op if already live. Agents resume via their stored conversationId; plain
  // terminals get a fresh shell (as tab terminals do on restart). Resolves once the
  // session is registered in sessionManager so the node can safely mount its pane.
  async function resumeCanvasSession(sessionId: string): Promise<void> {
    if (sessionManager.has(sessionId)) return;
    const s = getSession(sessionId);
    if (!s) return;
    const cwd = s.branchId ? getBranchPath(s.branchId) : getProjectPath(s.projectId);
    if (!cwd) return;
    await openSession(
      s.name, cwd, s.projectId, s.agent, undefined,
      undefined, s.agent ? s.conversationId : undefined, !s.branchId, s.noGit, false,
      s.id, s.parentSessionId, undefined, "canvas",
    ).catch((e) => console.error("Failed to resume canvas session:", e));
  }

  // Tear down a canvas session for good — its node was deleted. Unlike a tab close
  // (which ghosts the row for re-open), the session row is removed so it never
  // resumes or lingers. Kills the PTY, unregisters, and clears work state.
  function closeCanvasSession(sessionId: string) {
    invoke("close_pty_session", { sessionId }).catch(() => {});
    sessionManager.unregister(sessionId);
    clearWorkState(sessionId);
    removeSession(sessionId);
  }

  function updateSessionPreviewUrl(sessionId: string, url: string) {
    setSessions((prev) => prev.map((s) => s.id === sessionId ? { ...s, previewUrl: url } : s));
    // Persist the updated URL to the tabs slice.
    const session = sessionsRef.current.find((s) => s.id === sessionId);
    if (session) {
      const t = getTabs().find((t) => t.instanceId === session.instanceId);
      if (t) upsertTab({ ...t, previewUrl: url });
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

  // Pick a display name that is not already taken by another row at this path —
  // live tabs and the ghosts of closed sessions alike. Counting every session at
  // the path instead numbered a first Claude "#2" whenever a terminal or a diff
  // tab happened to be open, and ignoring ghosts minted duplicate "#2"s.
  function uniqueSessionName(baseName: string, cwd: string, isRootSession?: boolean): string {
    const persisted = isRootSession ? getRootSessionsForProject(cwd) : getBranchSessions(cwd);
    const taken = new Set([
      ...sessions.filter((s) => s.cwd === cwd).map((s) => s.name),
      ...persisted.map((s) => s.name),
    ]);
    let name = baseName;
    for (let n = 2; taken.has(name); n++) name = `${baseName} #${n}`;
    return name;
  }

  // ── tempest.yml worktree hooks ─────────────────────────────────────────────
  // `setup` runs once the worktree exists, `teardown` before it is removed.
  // The commands come from a file the repo carries, so unless the project has
  // opted into running them unprompted, the user is shown the exact commands
  // and asked. Declining is not an error — the worktree is simply left as git
  // made it.
  //
  // Returns the failure message, or null when the hook ran clean / was skipped.
  async function runWorktreeHook(
    kind: HookKind,
    projectPath: string,
    projectId: string,
    cwd: string,
  ): Promise<string | null> {
    let commands: string[];
    try {
      commands = await getHookCommands(projectPath, kind);
    } catch {
      return null; // unreadable config is "no hooks", same as everywhere else
    }
    if (!commands.length) return null;

    const settings = await loadProjectSettings(projectId, projectPath);
    if (!settings.permissions.allowRepoHooks) {
      const approved = await new Promise<boolean>((resolve) =>
        setHookConsent({ kind, commands, cwd, resolve })
      );
      setHookConsent(null);
      if (!approved) return null;
    }

    setHookRun({ kind, line: commands[0] });
    try {
      await runHook(projectPath, kind, cwd, (line) => setHookRun({ kind, line }));
      return null;
    } catch (e) {
      return String(e);
    } finally {
      setHookRun(null);
    }
  }

  // Main tab: spawn immediately in the project root. No git required — a non-repo
  // root opens as a no-git session; the menu footer offers to initialize.
  async function launchMain(agent: AgentConfig | null, prompt?: string) {
    const activePath = getActivePath();
    const workingProjectId = pendingProjectId;
    const hasGit = await invoke<boolean>("check_git_initialized", { path: activePath }).catch(() => false);
    const sessionName = uniqueSessionName(agent ? agent.name : "Terminal", activePath, true);
    await openSession(sessionName, activePath, workingProjectId ?? "", agent?.hint, prompt, undefined, undefined, true, !hasGit)
      .catch((e) => setPolicyError(String(e)));
  }

  // Branch tab: create (or reuse) a worktree, then spawn the session in it. Only
  // reachable when the project is a git repo, so no NotAGitRepo handling here.
  async function launchBranch(
    { agent, prompt, name, existingBranch }: BranchLaunch,
    override?: { projectPath: string; projectId: string; skipPrefix?: boolean; skipFocus?: boolean },
  ) {
    const activePath = override?.projectPath ?? getActivePath();
    const workingProjectId = override?.projectId ?? pendingProjectId;

    let branchName: string;
    let existingBranchArg: string | undefined;
    let directWorktreePath: string | undefined;

    if (existingBranch) {
      branchName = existingBranch.name.replace(/\//g, "-");
      if (existingBranch.is_worktree && existingBranch.worktree_path) {
        // Branch already lives in a worktree — open a session there directly.
        directWorktreePath = existingBranch.worktree_path;
      } else {
        existingBranchArg = existingBranch.name;
      }
    } else {
      branchName = (branchPrefix && !override?.skipPrefix) ? `${branchPrefix}${name}` : name;
    }

    // Sessions opened into an existing worktree get a numbered suffix so they stay
    // distinct from ones already there ("Claude", "Claude #2", …).
    const sessionName = directWorktreePath
      ? uniqueSessionName(agent?.name ?? "Terminal", directWorktreePath)
      : (branchName || (agent ? agent.name : "Terminal"));

    // Pre-mint the id so the placeholder row below and the real openSession row
    // share it (openSession upserts by id, keeping the already-mounted pane).
    const pendingId = crypto.randomUUID();
    try {
      let worktreePath: string;
      if (directWorktreePath) {
        worktreePath = directWorktreePath;
        addWorktreeToState({ name: branchName, path: worktreePath }, workingProjectId);
      } else {
        // Instant tab: render the session NOW (pointing at the project root) and
        // focus it, before the ~1-2s `git worktree add`. Without this the whole
        // area sat blank until the worktree existed. openSession replaces this
        // row with the real worktree cwd once creation returns. Mirrors the Main
        // tab's instant-tab spawn.
        setSessions((prev) => [...prev, {
          id: pendingId, instanceId: pendingId, name: sessionName, cwd: activePath,
          projectId: workingProjectId ?? "", agent: agent?.hint,
          sandboxed: getSettings().isolateAgents,
          createdAt: new Date().toISOString(),
          metadata: { resumeCount: 0, hasBeenResumed: false },
        }]);
        if (!override?.skipFocus) setActiveSessionId(pendingId);
        try {
          const result = await createWorktree({ projectPath: activePath, name: branchName, existingBranch: existingBranchArg });
          worktreePath = result.path;
        } catch (e) {
          // Worktree creation failed — roll back the optimistic tab.
          setSessions((prev) => prev.filter((s) => s.id !== pendingId));
          throw e;
        }
        addWorktreeToState({ name: branchName, path: worktreePath }, workingProjectId);
        // Run the setup hook in the BACKGROUND so the session appears the instant the
        // worktree exists, instead of waiting out installs/build steps first. The agent
        // can start working while setup finishes; a failure surfaces as a notice rather
        // than blocking the launch.
        runWorktreeHook("setup", activePath, workingProjectId ?? "", worktreePath)
          .then((failure) => { if (failure) setPolicyError(failure); })
          .catch((e) => setPolicyError(String(e)));
      }
      await openSession(sessionName, worktreePath, workingProjectId ?? "", agent?.hint, prompt, undefined, undefined, undefined, undefined, undefined, pendingId);
      return pendingId;
    } catch (e) {
      setPolicyError(String(e));
      return undefined;
    }
  }

  // Tasks tab entry point: spawn an agent into a fresh worktree of the picked
  // project, using the same code path Branch launches use. Called from
  // LaunchAgentModal for a single-item launch (Phase 3); Phase 7 loops this.
  async function launchTaskAgent(opts: {
    projectId: string;
    branchName: string;
    agent: AgentConfig;
    prompt: string;
  }): Promise<string | null> {
    const project = projectsRef.current.find((p) => p.id === opts.projectId);
    if (!project) throw new Error("Selected project is not open.");
    const hasGit = await invoke<boolean>("check_git_initialized", { path: project.path }).catch(() => false);
    if (!hasGit) throw new Error(`${project.name} is not a git repository. Run \`git init\` inside it, then retry.`);
    // Tasks always spawn in the background — the user stays on the Tasks page
    // and jumps to the agent via the "View agent" affordance on the row.
    const id = await launchBranch(
      { agent: opts.agent, prompt: opts.prompt, name: opts.branchName },
      { projectPath: project.path, projectId: opts.projectId, skipPrefix: true, skipFocus: true },
    );
    return id ?? null;
  }

  // Footer action: turn the project into a git repo in place so the Branch tab
  // unlocks without closing the menu.
  async function initGitInProject() {
    const activePath = getActivePath();
    const projectId = pendingProjectId;
    try {
      await gitInit(activePath);
      setMenuIsGitRepo(true);
      if (projectId) setGitProjectIds((prev) => { const s = new Set(prev); s.add(projectId); return s; });
      invoke<BranchInfo[]>("git_list_branches", { repoPath: activePath }).then(setExistingBranches).catch(() => {});
    } catch (e) {
      setPolicyError(String(e));
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
      if (closing?.kind !== "diff" && closing?.kind !== "preview" && closing?.kind !== "editor" && closing?.kind !== "thread") {
        invoke("close_pty_session", { sessionId: id }).catch(() => {});
        // Mark the persisted row closed (ghost). No-op for session-scoped sessions
        // that were never persisted (e.g. one with no resolvable project).
        markSessionClosed(id);
        sessionManager.unregister(id);
      } else if (closing) {
        // Remove the persisted tab entry for non-terminal tabs (diff, preview, editor, thread).
        removeTab(closing.instanceId);
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

  // Branch-level "+" — anchored to a worktree (or root) row. The worktree already
  // exists, so we record its path/project and open the direct-spawn menu.
  function openBranchSessionMenu(
    e: React.MouseEvent<HTMLElement>,
    worktreePath: string,
    projectId: string,
    label: string,
    isRoot: boolean
  ) {
    e.stopPropagation();
    setBranchMenuRect((e.currentTarget as HTMLElement).getBoundingClientRect());
    setPendingWorktreePath(worktreePath);
    setPendingProjectId(projectId);
    setBranchMenuLabel(label);
    setBranchMenuIsRoot(isRoot);
    setBranchMenuOpen(true);
  }

  // Spawn a session directly in an existing worktree (or project root). No
  // createWorktree / naming modal — the destination is already known. Sessions
  // after the first of their name at a path get a numbered suffix.
  async function launchInWorktree(
    worktreePath: string,
    projectId: string,
    agent?: AgentConfig,
    prompt?: string,
    isRootSession?: boolean
  ) {
    const sessionName = uniqueSessionName(agent ? agent.name : "Terminal", worktreePath, isRootSession);
    try {
      // The branch-level "+" always opens a top-level tab. Nesting as a sub-session
      // is reserved for splitPane(); if we auto-nested here whenever a live session
      // already ran at this cwd, the new tab would be filtered out of AgentTabs
      // (which hides parentSessionId sessions) and appear to vanish.
      await openSession(
        sessionName,
        worktreePath,
        projectId,
        agent?.hint,
        prompt?.trim() || undefined,
        undefined,
        undefined,
        isRootSession,
        undefined,
        false,
        undefined,
        undefined
      );
    } catch (e) {
      console.error("[BranchSession] launchInWorktree failed:", e);
    }
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
    ? (projects.find((p) => p.id === activeSession.projectId)?.path ?? (zen ? path : undefined))
    : zen
      ? path
      : (projects.find((p) => p.id === pendingProjectId)?.path ?? projects[0]?.path ?? undefined);
  const isAtlasIndexing = !!activeProjectPath && atlasIndexingPaths.includes(activeProjectPath);
  const isAtlasIndexed =
    !!activeProjectPath &&
    (getRuntimeState().atlasProjects ?? {})[activeProjectPath] === true;

  // Derived split-pane state. Recomputed every render — tree is tiny so no memo needed.
  const activeSplitIds = paneLayout ? new Set(paneSessionIds(paneLayout)) : null;
  const paneRects      = paneLayout ? computeRects(paneLayout) : null;
  const splitHandles   = paneLayout ? collectHandles(paneLayout) : [];

  // ─── Tab handlers for Toolbar ────────────────────────────────────────────
  function handleTabClick(id: string) {
    if (activeSplitIds && !activeSplitIds.has(id)) setPaneLayout(null);
    const s = sessions.find((x) => x.id === id);
    const wasActive = id === activeSessionId;
    setActiveSessionId(id);
    // Focusing an agent tab acknowledges any attention flag. State only clears
    // on click-when-already-active so a stray click doesn't reset a done bullet.
    if (s?.agent) setAttention(id, false);
    if (wasActive && s?.agent) setWorkState(id, "idle");
  }

  function handleTabDragStart(id: string, e: React.DragEvent<HTMLButtonElement>) {
    setDragTabId(id);
    dragTabIdRef.current = id;
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", id);
  }

  function handleTabDragOver(id: string, e: React.DragEvent<HTMLButtonElement>) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    const rect = e.currentTarget.getBoundingClientRect();
    const side = e.clientX < rect.left + rect.width / 2 ? "before" : "after";
    setDragOverTabId(id);
    setDragOverSide(side as "before" | "after");
    dragOverTabIdRef.current = id;
    dragOverSideRef.current  = side as "before" | "after";
  }

  function handleTabDrop(id: string, e: React.DragEvent<HTMLButtonElement>) {
    e.preventDefault();
    const fromId = dragTabIdRef.current;
    const side   = dragOverSideRef.current;
    if (!fromId || fromId === id) { clearTabDrag(); return; }
    setSessions((prev) => {
      const from = prev.findIndex((x) => x.id === fromId);
      let   to   = prev.findIndex((x) => x.id === id);
      if (from === -1 || to === -1) return prev;
      if (side === "after") to += 1;
      const next = [...prev];
      const [tab] = next.splice(from, 1);
      next.splice(to > from ? to - 1 : to, 0, tab);
      return next;
    });
    clearTabDrag();
  }

  function handleTabDragLeave(e: React.DragEvent) {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOverTabId(null);
  }
  // ─────────────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!activeSession) { setActiveBranch(null); return; }
    invoke<string>("get_git_branch", { path: activeSession.cwd })
      .then(setActiveBranch)
      .catch(() => setActiveBranch(null));
  }, [activeSession?.cwd]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!notesOpen) return;
    if (notesBtnRef.current) {
      const r = notesBtnRef.current.getBoundingClientRect();
      setNotesPos({ top: r.bottom + 8, right: window.innerWidth - r.right });
    }
    function onDown(e: MouseEvent) {
      const target = e.target as Node;
      const inBtn = notesBtnRef.current?.contains(target);
      const inPicker = (e.target as Element)?.closest?.(".sub-bar-notes-picker");
      if (!inBtn && !inPicker) setNotesOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [notesOpen]);

  useEffect(() => {
    if (!promptPickerOpen) return;
    setPromptPickerItems(getPrompts().filter((p) => p.enabled));
    if (promptBtnRef.current) {
      const r = promptBtnRef.current.getBoundingClientRect();
      setPromptPickerPos({ top: r.bottom + 8, right: window.innerWidth - r.right });
    }
    function onDown(e: MouseEvent) {
      const target = e.target as Node;
      const inBtn = promptBtnRef.current?.contains(target);
      const inPicker = (e.target as Element)?.closest?.(".sub-bar-prompt-picker");
      if (!inBtn && !inPicker) setPromptPickerOpen(false);
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

  // Zen mode: merge worktrees from disk with any non-worktree sessions
  const zenSidebarItems: Worktree[] = zen
    ? [
        ...zenWorktrees,
        ...sessions
          .filter((s) => !zenWorktrees.some((w) => w.path === s.cwd))
          .map((s) => ({ name: s.name, path: s.cwd })),
      ]
    : [];

  // Default mode: active project
  const activeSessionProject = zen
    ? null
    : projects.find((p) => p.id === activeSession?.projectId) ?? null;

  // Default mode helpers
  function toggleProject(projectId: string) {
    setProjects((prev) =>
      prev.map((p) => (p.id === projectId ? { ...p, expanded: !p.expanded } : p))
    );
  }

  function toggleWorktree(key: string) {
    setExpandedWorktrees((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }

  // Auto-expand the worktree row that contains the newly focused session.
  useEffect(() => {
    if (!activeSession) return;
    if (activeSession.isRootSession) {
      const proj = projects.find((p) => p.id === activeSession.projectId);
      if (proj) setExpandedWorktrees((prev) => new Set([...prev, proj.path + "::root"]));
    } else if (!activeSession.parentSessionId) {
      setExpandedWorktrees((prev) => new Set([...prev, activeSession.cwd]));
    }
  }, [activeSessionId]); // eslint-disable-line react-hooks/exhaustive-deps

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
    invoke<string>("get_git_branch", { path: selected })
      .then(() => { setGitProjectIds((prev) => { if (prev.has(newProject.id)) return prev; const s = new Set(prev); s.add(newProject.id); return s; }); void track("project_added", { is_git_repo: true }); })
      .catch(() => { void track("project_added", { is_git_repo: false }); });
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
          invoke("start_atlas_index", { projectPath: selected, semantic: getSettings().atlasSemantic })
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

  const diffPickerProjects: Project[] = zen && path
    ? [{ id: "zen", name: name ?? folderName(path), path, expanded: true, worktrees: zenWorktrees }]
    : projects;

  // Build the workspace list shown in OverviewPage from live session state.
  return (
    <div className="app">
      <TitleBar />

      <Toolbar
        tabsMode={tabsMode}
        projectName={activeSessionProject?.name ?? projects[0]?.name ?? ""}
        rightActions={
          <>
            <Tooltip content="Notes" placement="bottom">
              <PencilLine
                ref={notesBtnRef}
                className={`topbar-icon${notesOpen ? " active" : ""}`}
                onClick={() => setNotesOpen((o) => !o)}
              />
            </Tooltip>
            {notesOpen && notesPos && (
              <NotesPopover
                pos={notesPos}
                projectPath={activeSessionProject?.path ?? (zen ? path : projects[0]?.path)}
                projectName={activeSessionProject?.name ?? (zen ? name : projects[0]?.name)}
              />
            )}
            <Tooltip content="Open diff view" placement="bottom">
              <SplitSquareHorizontal
                className={`topbar-icon${diffPickerOpen || sessions.some(s => s.kind === "diff") ? " active" : ""}`}
                onClick={openDiffPicker}
              />
            </Tooltip>
            <Tooltip content="Keyboard shortcuts" placement="bottom">
              <Keyboard
                className="topbar-icon"
                onClick={() => { setSettingsInitialSection("keyboard"); setSettingsOpen(true); }}
              />
            </Tooltip>
            <div className="topbar-prompt-wrap" ref={promptPickerRef}>
              <Tooltip content="Prompts" placement="bottom">
                <BookOpen
                  ref={promptBtnRef}
                  className={`topbar-icon${promptPickerOpen ? " active" : ""}`}
                  onClick={() => setPromptPickerOpen((o) => !o)}
                />
              </Tooltip>
              {promptPickerOpen && promptPickerPos && (
                <PromptPickerPopover
                  pos={promptPickerPos}
                  items={promptPickerItems}
                  sentId={promptSentId}
                  onCopy={(p) => {
                    navigator.clipboard.writeText(p.body);
                    setPromptSentId(p.id);
                    setTimeout(() => {
                      setPromptPickerOpen(false);
                      setPromptSentId(null);
                    }, 800);
                  }}
                  onManage={() => {
                    setPromptPickerOpen(false);
                    setSettingsInitialSection("prompts");
                    setSettingsOpen(true);
                  }}
                />
              )}
            </div>
          </>
        }
      />

      <div className="body">
        <aside className={`sidebar-left${sidebarOpen ? "" : " sidebar-left--collapsed"}`} style={{ "--sidebar-fs": `${sidebarFontSize}px` } as CSSProperties}>

          {/* Fixed top: nav items */}
          <div className="sidebar-nav">
            <button className={navBtn("overview")} onClick={() => goTo("overview")}>
              <LayoutGrid size={16} />
              <span>Overview</span>
            </button>
            <button className={navBtn("knowledge-base")} onClick={() => goTo("knowledge-base")}>
              <Brain size={16} />
              <span>Knowledge Base</span>
            </button>
            <button className={navBtn("tasks")} onClick={() => goTo("tasks")}>
              <List size={16} />
              <span>My Tasks</span>
            </button>
            <button className={navBtn("automations")} onClick={() => goTo("automations")}>
              <Workflow size={16} />
              <span>Automations</span>
            </button>
          </div>

          {/* Scrollable middle */}
          <div className="sidebar-scroll-wrap">
          <div className={`sidebar-fade-top${sidebarAtTop ? " sidebar-fade--hidden" : ""}`} />
          <div className="sidebar-scroll" ref={sidebarScrollRef} onScroll={checkSidebarScroll}
            onContextMenu={(e) => {
              const proj = projects.find((p) => p.id === (activeSession?.projectId ?? null)) ?? projects[0];
              if (!proj) return;
              openCtxMenu(e, null, proj.path, proj.id, null);
            }}
          >
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
                  const savedMeta = !session ? getWorktreeAgentSession(item.path) : null;
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
                          const saved = savedMeta ?? getWorktreeAgentSession(item.path);
                          if (saved) {
                            openSession(saved.name, item.path, saved.projectId, saved.agent, undefined, undefined, saved.agent ? saved.conversationId : undefined, undefined, undefined, false, saved.id).catch(() => {});
                            markSessionOpen(saved.id);
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
                <div className="projects-empty-box">No projects added</div>
              ) : (
                <div className="sidebar-proj-list">
                {projects.map((project) => {
                  const projectSessions = sessions.filter((s) => s.projectId === project.id);

                  // Root rows — live sessions plus the ghosts of closed ones, in
                  // one creation-ordered list so neither group jumps the other.
                  const liveRootSessions = projectSessions.filter((s) => s.isRootSession && s.kind !== "diff" && !s.parentSessionId);
                  const liveRootIds = new Set(liveRootSessions.map((s) => s.id));
                  const storedRootEntries = getRootSessionsForProject(project.path);
                  const rootRows = sbRows(liveRootSessions, storedRootEntries.filter((g) => !liveRootIds.has(g.id)));

                  const rootKey = project.path + "::root";
                  const rootExpanded = expandedWorktrees.has(rootKey);
                  const rootAgentRows    = rootRows.filter((r) => !!(r.live ?? r.ghost)!.agent);
                  const rootTerminalRows = rootRows.filter((r) =>  !(r.live ?? r.ghost)!.agent);
                  const primaryRootAgent = rootAgentRows.find((r) => r.live)?.live;
                  const isGitProject = gitProjectIds.has(project.id) ||
                    project.worktrees.length > 0 ||
                    liveRootSessions.some((s) => !s.noGit) ||
                    storedRootEntries.some((e) => !e.noGit);

                  return (
                    <div
                      key={project.id}
                      className={`sidebar-project${sidebarDragOver?.id === project.id ? ` sidebar-drag-over--${sidebarDragOver.side}` : ""}`}
                      onDragOver={(e) => {
                        if (!e.dataTransfer.types.includes("sidebar/project")) return;
                        e.preventDefault();
                        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                        const side: "before" | "after" = e.clientY < rect.top + rect.height / 2 ? "before" : "after";
                        setSidebarDragOver(prev => prev?.id === project.id && prev.side === side ? prev : { id: project.id, side });
                      }}
                      onDragLeave={(e) => {
                        const rt = e.relatedTarget as Node | null;
                        if (!rt || !(e.currentTarget as HTMLElement).contains(rt)) setSidebarDragOver(null);
                      }}
                      onDrop={(e) => {
                        e.preventDefault();
                        const fromId = e.dataTransfer.getData("sidebar/project");
                        if (!fromId || fromId === project.id) { setSidebarDragOver(null); return; }
                        const side = sidebarDragOver?.id === project.id ? sidebarDragOver.side : "after";
                        setSidebarDragOver(null);
                        setProjects(prev => {
                          const result = [...prev];
                          const fromIdx = result.findIndex(p => p.id === fromId);
                          const [moved] = result.splice(fromIdx, 1);
                          const toIdx = result.findIndex(p => p.id === project.id);
                          result.splice(side === "before" ? toIdx : toIdx + 1, 0, moved);
                          return result;
                        });
                      }}
                      onContextMenu={(e) => openCtxMenu(e, null, project.path, project.id, null)}
                    >
                      {/* Project header — drag handle */}
                      <div
                        className="sidebar-project-header"
                        draggable
                        onDragStart={(e) => {
                          e.stopPropagation();
                          e.dataTransfer.effectAllowed = "move";
                          e.dataTransfer.setData("sidebar/project", project.id);
                        }}
                        onDragEnd={() => setSidebarDragOver(null)}
                        onContextMenu={(e) => openCtxMenu(e, null, project.path, project.id, null, true)}
                      >
                        <button
                          className="sidebar-project-toggle"
                          onClick={() => toggleProject(project.id)}
                        >
                          {project.expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                          <span>{project.name}</span>
                        </button>
                        {atlasEnabled && getRuntimeState().atlasProjects[project.path] === true && (
                          <Cpu size={11} className="sidebar-project-atlas-icon" aria-label="Token Intelligence indexed" />
                        )}
                        <ProjectWorkBadge sessionIds={sessions.filter((s) => s.projectId === project.id).map((s) => s.id)} />
                        {(isGitProject || rootRows.length > 0) && (
                          <span className="sidebar-project-count">{project.worktrees.length + (rootRows.length > 0 ? 1 : 0)}</span>
                        )}
                        <Tooltip content="Project settings" placement="right">
                          <button
                            className="sidebar-project-settings-btn"
                            onClick={(e) => {
                              e.stopPropagation();
                              setProjectSettingsPanelId(project.id);
                            }}
                            aria-label="Project settings"
                          >
                            <Cog size={12} />
                          </button>
                        </Tooltip>
                        <Tooltip content="New session" placement="right">
                          <button
                            className="sidebar-project-add-btn"
                            onClick={(e) => {
                              e.stopPropagation();
                              openSessionMenu(e, project.id, "right");
                            }}
                            onContextMenu={(e) => {
                              e.stopPropagation();
                              openSessionMenu(e, project.id, "right");
                            }}
                            aria-label="New session"
                          >
                            <Plus size={12} />
                          </button>
                        </Tooltip>
                      </div>

                      {project.expanded && (
                        <div className="sidebar-project-sessions">
                          {/* Root sessions — expandable row */}
                          {(isGitProject || rootRows.length > 0) && (
                            <div className="sb-worktree">
                              <div
                                className="sb-worktree-row"
                                onClick={() => toggleWorktree(rootKey)}
                                onContextMenu={(e) => openCtxMenu(e, null, project.path, project.id, null, false, true)}
                              >
                                <ChevronRight size={9} className={`sb-worktree-chevron${rootExpanded ? " open" : ""}`} />
                                <span className="sb-worktree-label">{isGitProject ? "main" : "root"}</span>
                                {isGitProject && <GitBranch size={10} className="sb-worktree-branch-icon" />}
                                {primaryRootAgent && <SidebarWorkBadge sessionId={primaryRootAgent.id} />}
                                <button
                                  className="sb-worktree-add"
                                  onClick={(e) => openBranchSessionMenu(e, project.path, project.id, "main", true)}
                                >
                                  <Plus size={10} />
                                </button>
                              </div>
                              {rootExpanded && (() => {
                                const rootAgentsEmpty = rootAgentRows.length === 0;
                                const rootTerminalsEmpty = rootTerminalRows.length === 0;
                                return (
                                  <div className="sb-worktree-dropdown">
                                    {rootAgentsEmpty && rootTerminalsEmpty ? (
                                      <div className="sb-dropdown-empty-box">
                                        <span className="sb-dropdown-empty-text">No sessions open. Start one with +</span>
                                      </div>
                                    ) : (
                                      <>
                                        <div className="sb-dropdown-section">
                                          <span className="sb-dropdown-label">Agent Sessions</span>
                                          {rootAgentRows.map(({ live: s, ghost }) => s ? (
                                            <button
                                              key={s.id}
                                              className={`sb-dropdown-item${s.id === activeSessionId ? " sb-dropdown-item--active" : ""}`}
                                              onClick={() => setActiveSessionId(s.id)}
                                              onContextMenu={(e) => openCtxMenu(e, null, project.path, project.id, s.id, false, true, s.id)}
                                            >
                                              <AgentIcon hint={s.agent} size={11} />
                                              <span className="sb-dropdown-item-name">{s.name}</span>
                                              {s.agent && atlasEnabled && getRuntimeState().atlasProjects[project.path] === true && (
                                                <Cpu size={10} className="sidebar-session-atlas-badge" />
                                              )}
                                              <SidebarWorkBadge sessionId={s.id} />
                                            </button>
                                          ) : (
                                            <button
                                              key={ghost!.id}
                                              className="sb-dropdown-item sb-dropdown-item--ghost"
                                              onClick={() => openSession(ghost!.name, project.path, project.id, ghost!.agent, undefined, undefined, ghost!.conversationId, true, ghost!.noGit, false, ghost!.id).catch(() => {})}
                                              onContextMenu={(e) => openCtxMenu(e, null, project.path, project.id, null, false, true, ghost!.id)}
                                            >
                                              <AgentIcon hint={ghost!.agent} size={11} />
                                              <span className="sb-dropdown-item-name">{ghost!.name}</span>
                                            </button>
                                          ))}
                                          {rootAgentsEmpty && (
                                            <div className="sb-dropdown-empty-box">
                                              <span className="sb-dropdown-empty-text">No agent sessions</span>
                                            </div>
                                          )}
                                        </div>
                                        <div className="sb-dropdown-section">
                                          <span className="sb-dropdown-label">Terminals</span>
                                          {rootTerminalRows.map(({ live: s, ghost }) => s ? (
                                            <button
                                              key={s.id}
                                              className={`sb-dropdown-item${s.id === activeSessionId ? " sb-dropdown-item--active" : ""}`}
                                              onClick={() => setActiveSessionId(s.id)}
                                              onContextMenu={(e) => openCtxMenu(e, null, project.path, project.id, s.id, false, true, s.id)}
                                            >
                                              <TerminalSquare size={11} />
                                              <span className="sb-dropdown-item-name">{s.name}</span>
                                            </button>
                                          ) : (
                                            <button
                                              key={ghost!.id}
                                              className="sb-dropdown-item sb-dropdown-item--ghost"
                                              onClick={() => openSession(ghost!.name, project.path, project.id, undefined, undefined, undefined, undefined, true, ghost!.noGit, false, ghost!.id).catch(() => {})}
                                              onContextMenu={(e) => openCtxMenu(e, null, project.path, project.id, null, false, true, ghost!.id)}
                                            >
                                              <TerminalSquare size={11} />
                                              <span className="sb-dropdown-item-name">{ghost!.name}</span>
                                            </button>
                                          ))}
                                          {rootTerminalsEmpty && (
                                            <div className="sb-dropdown-empty-box">
                                              <span className="sb-dropdown-empty-text">No terminals</span>
                                            </div>
                                          )}
                                        </div>
                                      </>
                                    )}
                                  </div>
                                );
                              })()}
                            </div>
                          )}

                          {/* Worktree rows — one expandable row per branch */}
                          {project.worktrees.map((wt) => {
                            const wtSessions = projectSessions.filter((s) => s.cwd === wt.path && !s.parentSessionId);
                            const subSessions = projectSessions.filter((s) => s.parentSessionId && wtSessions.some((ws) => ws.id === s.parentSessionId));
                            const allAtPath = [...wtSessions, ...subSessions];
                            const wtKindTabs = allAtPath.filter((s) => !s.agent && !!s.kind);
                            // Every persisted non-sub session in this branch. Anything not
                            // matched by a live session id renders as a ghost — so closing one
                            // session never affects another. Live and ghost rows share one
                            // creation-ordered list so a row keeps its place either way.
                            const liveIds = new Set(allAtPath.map((s) => s.id));
                            const ghostEntries = getBranchSessions(wt.path).filter((e) => !liveIds.has(e.id));
                            const wtRows = sbRows(allAtPath.filter((s) => !s.kind), ghostEntries);
                            const wtAgentRows    = wtRows.filter((r) => !!(r.live ?? r.ghost)!.agent);
                            const wtTerminalRows = wtRows.filter((r) =>  !(r.live ?? r.ghost)!.agent);
                            const primaryAgent = wtAgentRows.find((r) => r.live)?.live ?? null;
                            const wtExpanded = expandedWorktrees.has(wt.path);

                            return (
                              <div
                                key={wt.path}
                                className={`sb-worktree${sidebarDragOver?.id === wt.path ? ` sidebar-drag-over--${sidebarDragOver.side}` : ""}`}
                                onDragOver={(e) => {
                                  if (!e.dataTransfer.types.includes("sidebar/worktree")) return;
                                  e.preventDefault();
                                  e.stopPropagation();
                                  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                                  const side: "before" | "after" = e.clientY < rect.top + rect.height / 2 ? "before" : "after";
                                  setSidebarDragOver(prev => prev?.id === wt.path && prev.side === side ? prev : { id: wt.path, side });
                                }}
                                onDragLeave={(e) => {
                                  const rt = e.relatedTarget as Node | null;
                                  if (!rt || !(e.currentTarget as HTMLElement).contains(rt)) setSidebarDragOver(null);
                                }}
                                onDrop={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  const fromPath = e.dataTransfer.getData("sidebar/worktree");
                                  const fromProjectId = e.dataTransfer.getData("sidebar/projectId");
                                  if (!fromPath || fromPath === wt.path || fromProjectId !== project.id) { setSidebarDragOver(null); return; }
                                  const side = sidebarDragOver?.id === wt.path ? sidebarDragOver.side : "after";
                                  setSidebarDragOver(null);
                                  setProjects(prev => prev.map(p => {
                                    if (p.id !== project.id) return p;
                                    const ws = [...p.worktrees];
                                    const fi = ws.findIndex(w => w.path === fromPath);
                                    const [moved] = ws.splice(fi, 1);
                                    const ti = ws.findIndex(w => w.path === wt.path);
                                    ws.splice(side === "before" ? ti : ti + 1, 0, moved);
                                    return { ...p, worktrees: ws };
                                  }));
                                }}
                              >
                                <div
                                  className="sb-worktree-row"
                                  draggable
                                  onDragStart={(e) => {
                                    e.stopPropagation();
                                    e.dataTransfer.effectAllowed = "move";
                                    e.dataTransfer.setData("sidebar/worktree", wt.path);
                                    e.dataTransfer.setData("sidebar/projectId", project.id);
                                  }}
                                  onDragEnd={() => setSidebarDragOver(null)}
                                  onClick={() => toggleWorktree(wt.path)}
                                  onContextMenu={(e) => openCtxMenu(e, wt, project.path, project.id, wtSessions[0]?.id ?? null)}
                                >
                                  <ChevronRight size={9} className={`sb-worktree-chevron${wtExpanded ? " open" : ""}`} />
                                  <span className="sb-worktree-label">{wt.name}</span>
                                  <GitBranch size={10} className="sb-worktree-branch-icon" />
                                  {primaryAgent && <SidebarWorkBadge sessionId={primaryAgent.id} />}
                                  <button
                                    className="sb-worktree-add"
                                    onClick={(e) => openBranchSessionMenu(e, wt.path, project.id, wt.name, false)}
                                  >
                                    <Plus size={10} />
                                  </button>
                                </div>
                                {wtExpanded && (() => {
                                  const wtAgentsEmpty = wtAgentRows.length === 0;
                                  const wtTerminalsEmpty = wtTerminalRows.length === 0;
                                  return (
                                    <div className="sb-worktree-dropdown">
                                      {wtAgentsEmpty && wtTerminalsEmpty && wtKindTabs.length === 0 ? (
                                        <div className="sb-dropdown-empty-box">
                                          <span className="sb-dropdown-empty-text">No sessions open. Start one with +</span>
                                        </div>
                                      ) : (
                                        <>
                                          <div className="sb-dropdown-section">
                                            <span className="sb-dropdown-label">Agent Sessions</span>
                                            {wtAgentRows.map(({ live: s, ghost: g }) => s ? (
                                              <button
                                                key={s.id}
                                                className={`sb-dropdown-item${s.id === activeSessionId ? " sb-dropdown-item--active" : ""}`}
                                                onClick={() => setActiveSessionId(s.id)}
                                                onContextMenu={(e) => openCtxMenu(e, wt, project.path, project.id, s.id)}
                                              >
                                                <AgentIcon hint={s.agent} size={11} />
                                                <span className="sb-dropdown-item-name">{s.name}</span>
                                                {s.agent && atlasEnabled && getRuntimeState().atlasProjects[project.path] === true && (
                                                  <Cpu size={10} className="sidebar-session-atlas-badge" />
                                                )}
                                                <SidebarWorkBadge sessionId={s.id} />
                                              </button>
                                            ) : (
                                              <button
                                                key={g!.id}
                                                className="sb-dropdown-item sb-dropdown-item--ghost"
                                                onClick={() => { openSession(g!.name, wt.path, project.id, g!.agent, undefined, undefined, g!.conversationId, undefined, undefined, false, g!.id).catch(() => {}); markSessionOpen(g!.id); }}
                                                onContextMenu={(e) => openCtxMenu(e, wt, project.path, project.id, null, false, false, g!.id)}
                                              >
                                                <AgentIcon hint={g!.agent} size={11} />
                                                <span className="sb-dropdown-item-name">{g!.name}</span>
                                              </button>
                                            ))}
                                            {wtAgentsEmpty && (
                                              <div className="sb-dropdown-empty-box">
                                                <span className="sb-dropdown-empty-text">No agent sessions</span>
                                              </div>
                                            )}
                                          </div>
                                          <div className="sb-dropdown-section">
                                            <span className="sb-dropdown-label">Terminals</span>
                                            {wtTerminalRows.map(({ live: s, ghost: g }) => s ? (
                                              <button
                                                key={s.id}
                                                className={`sb-dropdown-item${s.id === activeSessionId ? " sb-dropdown-item--active" : ""}`}
                                                onClick={() => setActiveSessionId(s.id)}
                                                onContextMenu={(e) => openCtxMenu(e, wt, project.path, project.id, s.id)}
                                              >
                                                <TerminalSquare size={11} />
                                                <span className="sb-dropdown-item-name">{s.name}</span>
                                              </button>
                                            ) : (
                                              <button
                                                key={g!.id}
                                                className="sb-dropdown-item sb-dropdown-item--ghost"
                                                onClick={() => { openSession(g!.name, wt.path, project.id, undefined, undefined, undefined, undefined, undefined, undefined, false, g!.id).catch(() => {}); markSessionOpen(g!.id); }}
                                                onContextMenu={(e) => openCtxMenu(e, wt, project.path, project.id, null, false, false, g!.id)}
                                              >
                                                <TerminalSquare size={11} />
                                                <span className="sb-dropdown-item-name">{g!.name}</span>
                                              </button>
                                            ))}
                                            {wtTerminalsEmpty && (
                                              <div className="sb-dropdown-empty-box">
                                                <span className="sb-dropdown-empty-text">No terminals</span>
                                              </div>
                                            )}
                                          </div>
                                          {wtKindTabs.length > 0 && (
                                            <div className="sb-dropdown-section">
                                              {wtKindTabs.map((s) => (
                                                <button
                                                  key={s.id}
                                                  className={`sb-dropdown-item${s.id === activeSessionId ? " sb-dropdown-item--active" : ""}`}
                                                  onClick={() => setActiveSessionId(s.id)}
                                                  onContextMenu={(e) => openCtxMenu(e, wt, project.path, project.id, s.id)}
                                                >
                                                  <Globe size={11} />
                                                  <span className="sb-dropdown-item-name">{s.name}</span>
                                                </button>
                                              ))}
                                            </div>
                                          )}
                                        </>
                                      )}
                                    </div>
                                  );
                                })()}
                              </div>
                            );
                          })}

                          {/* Non-worktree tabs (diff, preview, editor, chat) — threads live in their own dropdown below */}
                          {projectSessions
                            .filter((s) => s.kind !== "thread" && !s.isRootSession && !s.parentSessionId && !project.worktrees.some((w) => w.path === s.cwd))
                            .map((s) => (
                              <div key={s.id} className="sidebar-session-group">
                                <button
                                  className={`sidebar-project-session${s.id === activeSessionId ? " sidebar-project-session--active" : ""}`}
                                  onClick={() => setActiveSessionId(s.id)}
                                  onContextMenu={(e) => openCtxMenu(e, null, project.path, project.id, s.id)}
                                >
                                  {s.kind === "diff" ? <Eye size={12} /> : s.kind === "preview" ? <Globe size={12} /> : s.kind === "editor" ? <FileCode size={12} /> : s.agent ? <AgentIcon hint={s.agent} size={12} /> : <TerminalSquare size={12} />}
                                  <span>{s.name}</span>
                                  {s.agent && <SidebarWorkBadge sessionId={s.id} />}
                                </button>
                              </div>
                            ))}

                          {/* Threads (canvas chat) — project-scoped collapsible dropdown */}
                          {(() => {
                            const threadsKey = project.path + "::threads";
                            const threadsExpanded = expandedWorktrees.has(threadsKey);
                            void threadsVersion; // re-render on lazy load
                            const canvases = getProjectThreads(project.id);
                            return (
                              <div className="sidebar-session-group">
                                <div
                                  className="sidebar-thread-session"
                                  style={{ cursor: "pointer" }}
                                  onClick={() => { ensureThreadsLoaded(project.id); toggleWorktree(threadsKey); }}
                                >
                                  {threadsExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                                  <span>Threads</span>
                                  <button
                                    className="sidebar-project-add-btn"
                                    onClick={(e) => { e.stopPropagation(); ensureThreadsLoaded(project.id); createThread(project.id); }}
                                    aria-label="New thread"
                                  >
                                    <Plus size={10} />
                                  </button>
                                </div>
                                {threadsExpanded && canvases.map((c) => (
                                  renamingThreadId === c.id ? (
                                    <input
                                      key={c.id}
                                      autoFocus
                                      className="sb-inline-create-input"
                                      value={threadRenameValue}
                                      onChange={(e) => setThreadRenameValue(e.target.value)}
                                      onBlur={() => renameThread(c.id, threadRenameValue)}
                                      onKeyDown={(e) => {
                                        if (e.key === "Enter") renameThread(c.id, threadRenameValue);
                                        else if (e.key === "Escape") setRenamingThreadId(null);
                                      }}
                                    />
                                  ) : (
                                    <div key={c.id} style={{ display: "flex", alignItems: "center" }}>
                                      <button
                                        className={`sidebar-thread-session${c.id === activeSessionId ? " sidebar-thread-session--active" : ""}`}
                                        style={{ flex: 1 }}
                                        onClick={() => openThreadTab(project.id, c.id)}
                                        onDoubleClick={() => { setThreadRenameValue(c.name); setRenamingThreadId(c.id); }}
                                      >
                                        <Waypoints size={12} />
                                        <span>{c.name}</span>
                                      </button>
                                      <button
                                        className="sidebar-project-settings-btn"
                                        onClick={() => removeThread(c.id)}
                                        aria-label="Delete thread"
                                      >
                                        <Trash2 size={12} />
                                      </button>
                                    </div>
                                  )
                                ))}
                                {threadsExpanded && canvases.length === 0 && (
                                  <div className="sb-dropdown-empty-box">
                                    <span className="sb-dropdown-empty-text">No threads yet. Create one with +</span>
                                  </div>
                                )}
                              </div>
                            );
                          })()}

                          {/* Project-level empty state */}
                          {(() => {
                            const hasGitRows = isGitProject;
                            const hasRootRows = !isGitProject && rootRows.length > 0;
                            const hasOtherSessions = projectSessions.some((s) => !s.isRootSession && !s.parentSessionId && !project.worktrees.some((w) => w.path === s.cwd));
                            if (!hasGitRows && !hasRootRows && !hasOtherSessions && inlineCreateProjectId !== project.id) {
                              return (
                                <div className="sb-dropdown-empty-box">
                                  <span className="sb-dropdown-empty-text">No sessions open. Start one with +</span>
                                </div>
                              );
                            }
                            return null;
                          })()}

                          {/* Inline quick-create row — click + on project header to show */}
                          {inlineCreateProjectId === project.id && (
                            <div className="sb-inline-create">
                              <input
                                autoFocus
                                className="sb-inline-create-input"
                                placeholder="Session name…"
                                value={inlineCreateName}
                                onChange={(e) => setInlineCreateName(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter" && inlineCreateName.trim()) {
                                    openSession(inlineCreateName.trim(), project.path, project.id, "claude", undefined, undefined, undefined, true).catch(() => {});
                                    setInlineCreateProjectId(null);
                                    setInlineCreateName("");
                                  } else if (e.key === "Escape") {
                                    setInlineCreateProjectId(null);
                                    setInlineCreateName("");
                                  }
                                }}
                                onBlur={() => {
                                  setInlineCreateProjectId(null);
                                  setInlineCreateName("");
                                }}
                              />
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
                </div>
              )}
            </>
          )}

          </div>{/* end sidebar-scroll */}
          <div className={`sidebar-fade-bottom${sidebarAtBottom ? " sidebar-fade--hidden" : ""}`} />
          </div>{/* end sidebar-scroll-wrap */}

          <div className="sidebar-bottom-wrap">
            <div className="sidebar-bottom-sep" />
            <div className="sidebar-bottom">
              <div className="sidebar-bottom-group">
                <Tooltip content="Report a bug" placement="top">
                  <Bug size={16} className="sidebar-bottom-icon" onClick={() => openUrl("https://github.com/tempestai-dev/tempest/issues")} />
                </Tooltip>
                <Tooltip content="Email us" placement="top">
                  <Mail size={16} className="sidebar-bottom-icon" onClick={() => openUrl("mailto:tempestai.dev@gmail.com")} />
                </Tooltip>
              </div>
              <div className="sidebar-bottom-group">
                <Tooltip content="Toggle theme" placement="top">
                  <SunMoon size={16} className="sidebar-bottom-icon" onClick={toggleTheme} />
                </Tooltip>
                <Tooltip content="Settings" placement="top">
                  <Settings size={16} className="sidebar-bottom-icon" onClick={() => setSettingsOpen(true)} />
                </Tooltip>
                {zen ? (
                  <Tooltip content={name ?? "Project"} placement="top">
                    <FolderOpen size={16} className="sidebar-bottom-icon" />
                  </Tooltip>
                ) : (
                  <Tooltip content="Add project" placement="top">
                    <FolderPlus size={16} className="sidebar-bottom-icon" onClick={addWorkspace} />
                  </Tooltip>
                )}
              </div>
            </div>
          </div>
        </aside>

        <div className="workspace">
          <div className="canvas-wrap">
            <div className="canvas">
              {(() => {
                const hasActiveSession = !!activeSessionId;
                return (
                <div className={`bar${tabsMode === "tabbed" ? " tabs-tabbed" : tabsMode === "ver1" ? " tabs-ver1" : tabsMode === "designer" ? " tabs-designer" : ""}`}>
                  <div className="bar-end">
                    <button className="sub-bar-icon-btn" onClick={() => setSidebarOpen((o) => !o)} title="Toggle sidebar">
                      <PanelLeft size={15} />
                    </button>
                    {hasActiveSession && <div className="sep" />}
                  </div>
                  {hasActiveSession && <AgentTabs
                    sessions={sessions.filter((s) => !s.parentSessionId)}
                    activeSessionId={activeSessionId}
                    tabsMode={tabsMode}
                    onTabClick={handleTabClick}
                    onTabClose={(id) => closeSession(id)}
                    dragTabId={dragTabId}
                    dragOverTabId={dragOverTabId}
                    dragOverSide={dragOverSide}
                    onDragStart={handleTabDragStart}
                    onDragOver={handleTabDragOver}
                    onDrop={handleTabDrop}
                    onDragEnd={clearTabDrag}
                    onDragLeave={handleTabDragLeave}
                    renamingSessionId={renamingSessionId}
                    renameValue={renameValue}
                    onRenameChange={setRenameValue}
                    onRenameCommit={commitRename}
                    onRenameClear={() => setRenamingSessionId(null)}
                    onRenameStart={startRename}
                    onQueueClick={(id, e) => { e.stopPropagation(); setQueueOpenSessionId((prev) => (prev === id ? null : id)); }}
                    onCloseGroup={(projectId) => sessions.filter(s => s.projectId === projectId).forEach(s => closeSession(s.id))}
                    projects={projects.map((p) => ({ id: p.id, name: p.name }))}
                  />}
                  <div className="bar-end">
                    <AttentionPill
                      sessionIds={sessions.map(s => s.id)}
                      onClick={() => {
                        const waiting = sessions.filter(s => {
                          if (getAttention(s.id)) return true;
                          return getWorkState(s.id) === "done";
                        }).sort((a, b) =>
                          (getAttention(a.id) ? 0 : 1) - (getAttention(b.id) ? 0 : 1)
                        );
                        if (!waiting.length) return;
                        const curIdx = sessions.findIndex(s => s.id === activeSessionId);
                        const next = waiting.find(s => sessions.indexOf(s) > curIdx) ?? waiting[0];
                        setActiveSessionId(next.id);
                      }}
                    />
                    {hasActiveSession && (
                      <>
                        <div className="collapse-btn-wrap">
                          <button className="collapse-btn" onClick={() => setCompactOpen((o) => !o)} title="Actions">
                            {compactOpen ? <ChevronRight size={13} /> : <ChevronLeft size={13} />}
                          </button>
                        </div>
                        <IconCapsule
                          open={compactOpen}
                          onSplitV={() => splitPane("v")}
                          onSplitH={() => splitPane("h")}
                          onQueue={() => { if (activeSession?.agent) setQueueOpenSessionId((p) => p === activeSession.id ? null : activeSession.id); }}
                          onBroadcast={() => setBroadcastOpen(true)}
                        />
                        <div className="sep" />
                        <button className="sub-bar-icon-btn" onClick={() => setRightSidebarOpen((o) => !o)} title="Toggle right sidebar">
                          <PanelRight size={15} />
                        </button>
                      </>
                    )}
                  </div>
                </div>
                );
              })()}
          <div className="workspace-content">
            {diffPickerOpen && (
              <DiffPickerModal
                projects={diffPickerProjects}
                branches={diffPickerBranches}
                loading={diffPickerLoading}
                onPick={openDiffForBranch}
              />
            )}
            <div className="panes-viewport" ref={workspaceContentRef}>
            {sessions.map((s) => {
              const rect = paneRects?.get(s.id);
              const isInSplit = !!(activeSplitIds?.has(s.id));
              // Sessions hidden because the split layout doesn't include them (PTY stays alive)
              const hiddenBySplit = activeSplitIds ? !activeSplitIds.has(s.id) : false;
              const hidden = hiddenBySplit || (!isInSplit && s.id !== activeSessionId);
              const slotStyle: React.CSSProperties = rect
                ? {
                    position: "absolute",
                    top:    `calc(${rect.top    * 100}% + 6px)`,
                    left:   `calc(${rect.left   * 100}% + 6px)`,
                    width:  `calc(${rect.width  * 100}% - 12px)`,
                    height: `calc(${rect.height * 100}% - 12px)`,
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
                    <button
                      className="pane-close-btn"
                      onClick={(e) => { e.stopPropagation(); closeSession(s.id); }}
                      aria-label="Close pane"
                      title="Close pane"
                    >
                      <X size={10} />
                    </button>
                  )}
                  {!s.kind && s.agent && !hidden && queueOpenSessionId === s.id && (
                    <QueuePanel
                      sessionId={s.id}
                      onClose={() => setQueueOpenSessionId(null)}
                    />
                  )}
                  {s.kind === "diff" ? (
                    <DiffPane
                      sessionId={s.id}
                      cwd={s.cwd}
                      hidden={hidden}
                      gitRevision={gitRevision}
                      agentSessions={sessions
                        .filter((sess) => !!sess.agent && !sess.kind)
                        .map((sess) => ({ id: sess.id, name: sess.name }))}
                    />
                  ) : s.kind === "preview" ? (
                    <PreviewPane
                      sessionId={s.id}
                      hidden={hidden}
                      previewUrl={s.previewUrl}
                      onUrlChange={(url) => updateSessionPreviewUrl(s.id, url)}
                      suppressPanel={sessionMenuOpen}
                    />
                  ) : s.kind === "editor" ? (
                    <CodeMirrorPane
                      filePath={s.cwd}
                      hidden={hidden}
                    />
                  ) : s.kind === "thread" ? (
                    <ThreadsView
                      threadId={s.id}
                      projectId={s.projectId}
                      hidden={hidden}
                      projectPath={projects.find((p) => p.id === s.projectId)?.path}
                      atlasIndexed={(() => {
                        const p = projects.find((pr) => pr.id === s.projectId)?.path;
                        return atlasEnabled && !!p && getRuntimeState().atlasProjects[p] === true;
                      })()}
                      spawnCanvasSession={spawnCanvasSession}
                      resumeCanvasSession={resumeCanvasSession}
                      closeCanvasSession={closeCanvasSession}
                      worktrees={projects.find((p) => p.id === s.projectId)?.worktrees ?? []}
                      createCanvasWorktree={createCanvasWorktree}
                      autoNameThread={autoNameThread}
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
                    top:    `calc(${h.parentRect.top    * 100}% + 8px)`,
                    left:   `${(h.parentRect.left + h.parentRect.width * h.ratio) * 100}%`,
                    width:  "4px",
                    height: `calc(${h.parentRect.height * 100}% - 16px)`,
                    transform: "translateX(-50%)",
                    cursor: "col-resize",
                  }
                : {
                    position: "absolute",
                    top:    `${(h.parentRect.top + h.parentRect.height * h.ratio) * 100}%`,
                    left:   `calc(${h.parentRect.left  * 100}% + 8px)`,
                    width:  `calc(${h.parentRect.width  * 100}% - 16px)`,
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
            </div>
            {!activeSessionId && activeSection === "knowledge-base" && (
              <KnowledgeBasePage />
            )}
            {!activeSessionId && activeSection === "tasks" && (
              <TasksPage
                projects={projects.map((p) => ({ id: p.id, name: p.name, path: p.path }))}
                defaultProjectId={pendingProjectId ?? projects[0]?.id ?? null}
                onLaunch={launchTaskAgent}
                activeSessionIds={sessions.map((s) => s.id)}
                onViewSession={setActiveSessionId}
              />
            )}
            {!activeSessionId && activeSection === "automations" && (
              <AutomationsPage />
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
            </div>{/* canvas */}
            {/* Overview has no footer of its own, so one drops in to carry the
                notice. Only here — inside a session the status bar cycle takes
                over rather than shifting the canvas out from under the user. */}
            {!activeSessionId && activeSection === "overview" && updateProps && (
              <div
                className={`canvas-wrap-footer canvas-wrap-footer--notice${noticeClosing ? " canvas-wrap-footer--notice-closing" : ""}`}
                onAnimationEnd={() => {
                  if (!noticeClosing) return;
                  setNoticeClosing(false);
                  dismissUpdate();
                }}
              >
                <UpdateNotice {...updateProps} onDismiss={() => setNoticeClosing(true)} />
              </div>
            )}
            {activeSession && (!activeSession.kind || activeSession.kind === "diff" || activeSession.kind === "terminal") && (atlasEnabled && activeProjectPath) && (
              <div className="canvas-wrap-footer">
                <StatusBar
                  // Sessions are running here, so the word opens a confirmation
                  // rather than restarting the app under the user.
                  update={updateProps ? { ...updateProps, onUpdate: () => setUpdateConfirm({ installing: false, error: null }) } : undefined}
                  sandboxed={activeSession?.sandboxed}
                  atlasEnabled={atlasEnabled && activeProjectPath ? true : undefined}
                  atlasIndexed={atlasEnabled && isAtlasIndexed ? true : undefined}
                  atlasIndexing={atlasEnabled && isAtlasIndexing ? true : undefined}
                  onSyncAtlas={atlasEnabled && isAtlasIndexed && !isAtlasIndexing && activeProjectPath ? () => {
                    const decided = getRuntimeState().atlasProjects ?? {};
                    setRuntimeState({ atlasProjects: { ...decided, [activeProjectPath]: true } });
                    invoke("start_atlas_index", { projectPath: activeProjectPath, semantic: getSettings().atlasSemantic })
                      .then(() => invoke("start_atlas_daemon", { projectPath: activeProjectPath }).catch(() => {}))
                      .catch((e) => console.error("[Atlas] sync failed:", e));
                    setAtlasIndexingPaths((prev) =>
                      prev.includes(activeProjectPath) ? prev : [...prev, activeProjectPath]
                    );
                  } : undefined}
                />
              </div>
            )}
          </div>{/* canvas-wrap */}
        </div>{/* workspace */}

        {activeSession && (
          <RightSidebar
            cwd={activeSession.kind === "editor" ? (projects.find((p) => p.id === activeSession.projectId)?.path ?? activeSession.cwd) : activeSession.cwd}
            rootPath={zen ? (path ?? null) : (projects.find((p) => p.id === activeSession.projectId)?.path ?? activeSession.cwd)}
            open={rightSidebarOpen}
            gitRevision={gitRevision}
            noGit={activeSession.noGit}
            onOpenDiff={activeSession.kind !== "diff" && activeSession.kind !== "preview" ? () => { const p = activeSession.kind === "editor" ? (projects.find((p) => p.id === activeSession.projectId)?.path ?? activeSession.cwd) : activeSession.cwd; openDiffTab(p, activeSession.projectId); } : undefined}
            onOpenFile={(filePath) => openEditorTab(filePath, activeSession.projectId)}
          />
        )}
      </div>

      <NewSessionMenu
        open={sessionMenuOpen}
        anchorRect={sessionMenuRect}
        placement={sessionMenuPlacement}
        isGitRepo={menuIsGitRepo}
        existingBranches={existingBranches}
        branchPrefix={branchPrefix}
        onClose={() => setSessionMenuOpen(false)}
        onLaunchMain={launchMain}
        onLaunchBranch={launchBranch}
        onThread={pendingProjectId ? () => createThread(pendingProjectId) : undefined}
        onLivePreview={pendingProjectId ? () => openPreviewTab(pendingProjectId) : undefined}
        onInitGit={initGitInProject}
      />

      <BranchSessionMenu
        open={branchMenuOpen}
        anchorRect={branchMenuRect}
        placement="right"
        branchLabel={branchMenuLabel}
        onClose={() => setBranchMenuOpen(false)}
        onTerminal={() => {
          if (pendingWorktreePath) {
            launchInWorktree(pendingWorktreePath, pendingProjectId ?? "", undefined, undefined, branchMenuIsRoot);
          }
        }}
        onAgent={(agent, prompt) => {
          if (pendingWorktreePath) {
            launchInWorktree(pendingWorktreePath, pendingProjectId ?? "", agent, prompt, branchMenuIsRoot);
          }
        }}
        onLivePreview={() => { if (pendingProjectId) openPreviewTab(pendingProjectId, branchMenuIsRoot ? "" : (pendingWorktreePath ?? "")); }}
      />

      {ctxMenu && (
        <ContextMenu
          menu={ctxMenu}
          sessions={sessions}
          onClose={() => setCtxMenu(null)}
          onOpenDiff={openDiffTab}
          onCloseSession={closeSession}
          onOpenDeleteDialog={openDeleteDialog}
          onRemoveProject={removeProject}
          onAtlasIndexingStart={(path) => setAtlasIndexingPaths((prev) => prev.includes(path) ? prev : [...prev, path])}
        />
      )}

      {/* Launch refused by project policy (non-permitted agent, blocked
          skip-permissions flag). The spawn throws before any PTY exists and
          every caller swallows that rejection, so without this the click would
          appear to do nothing at all. */}
      {policyError && (
        <div
          role="alert"
          onClick={() => setPolicyError(null)}
          style={{
            position: "fixed", bottom: 20, left: "50%", transform: "translateX(-50%)",
            zIndex: 9999, maxWidth: 460, cursor: "pointer",
            padding: "10px 14px", borderRadius: 8,
            background: "var(--tempest-bg-elevated)",
            border: "1px solid var(--tempest-border-default)",
            color: "var(--tempest-fg-default)",
            font: "13px/1.5 var(--tempest-font-sans)",
            boxShadow: "0 6px 24px rgba(0,0,0,0.28)",
          }}
        >
          {policyError}
          <span style={{ opacity: 0.55, marginLeft: 8, fontSize: 11 }}>click to dismiss</span>
        </div>
      )}

      {updateConfirm && availableUpdate && (
        <UpdateConfirmDialog
          version={availableUpdate.version}
          sessionCount={sessions.length}
          workingCount={sessions.filter((s) => s.agent && getWorkState(s.id) === "working").length}
          installing={updateConfirm.installing}
          error={updateConfirm.error}
          onCancel={() => setUpdateConfirm(null)}
          onConfirm={() => {
            setUpdateConfirm({ installing: true, error: null });
            installUpdate(availableUpdate).catch((e) =>
              setUpdateConfirm({ installing: false, error: String(e) })
            );
          }}
        />
      )}

      {/* Delete workspace dialog */}
      {deleteDialog && (
        <DeleteWorkspaceDialog
          dialog={deleteDialog}
          onChange={setDeleteDialog}
          onCancel={() => setDeleteDialog(null)}
          onConfirm={handleDeleteConfirm}
        />
      )}

      {/* Consent for a repo-supplied hook — the commands are shown verbatim,
          because approving this runs code the repo carries, not the user's. */}
      {hookConsent && createPortal(
        <div className="naming-modal-overlay">
          <div className="naming-modal hook-consent" onClick={(e) => e.stopPropagation()}>
            <div className="naming-modal-header">
              <TerminalSquare size={15} />
              Run this repo's {hookConsent.kind} commands?
            </div>
            <p className="naming-modal-desc">
              <strong>tempest.yml</strong> in this repository asks to run the following in{" "}
              <strong>{folderName(hookConsent.cwd)}</strong>. These commands come from the repo, not
              from Tempest.
            </p>
            <div className="hook-cmd-list">
              {hookConsent.commands.map((c, i) => (
                <code key={i} className="hook-cmd">{c}</code>
              ))}
            </div>
            <div className="naming-modal-actions">
              <button
                className="naming-modal-btn naming-modal-btn--cancel"
                onClick={() => hookConsent.resolve(false)}
              >
                Skip
              </button>
              <button
                className="naming-modal-btn naming-modal-btn--create"
                onClick={() => hookConsent.resolve(true)}
              >
                Run
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Hook progress — both callers block on it, so one overlay serves both. */}
      {hookRun && createPortal(
        <div className="naming-modal-overlay">
          <div className="naming-modal hook-progress">
            <div className="naming-modal-header">
              <Loader size={15} className="hook-spinner" />
              Running {hookRun.kind}…
            </div>
            <code className="hook-progress-line">{hookRun.line}</code>
          </div>
        </div>,
        document.body
      )}

      {settingsOpen && <SettingsPanel onClose={() => setSettingsOpen(false)} initialSection={settingsInitialSection as any} />}
      {projectSettingsPanelId && (() => {
        const p = projects.find((pr) => pr.id === projectSettingsPanelId);
        return p ? <ProjectSettingsPanel projectId={p.id} projectPath={p.path} projectName={p.name} onClose={() => setProjectSettingsPanelId(null)} /> : null;
      })()}

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
                  invoke("start_atlas_index", { projectPath: atlasPromptPath, semantic: getSettings().atlasSemantic })
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

      {commandPaletteOpen && (
        <CommandPalette
          onClose={() => setCommandPaletteOpen(false)}
          onToggleLeftSidebar={() => setSidebarOpen((o) => !o)}
          onToggleRightSidebar={() => setRightSidebarOpen((o) => !o)}
          onOpenSettings={() => setSettingsOpen(true)}
          onOpenProject={addWorkspace}
          onNewWorkspace={() => {
            const projId = activeSession?.projectId ?? (projects[0]?.id ?? null);
            openSessionMenu({ currentTarget: document.body } as unknown as React.MouseEvent<HTMLElement>, projId, "below");
          }}
          onCloseTab={() => { if (activeSessionId) closeSession(activeSessionId); }}
          onNextTab={() => {
            if (sessions.length > 0) {
              const idx = sessions.findIndex((s) => s.id === activeSessionId);
              setActiveSessionId(sessions[(idx + 1) % sessions.length].id);
            }
          }}
          onPrevTab={() => {
            if (sessions.length > 0) {
              const idx = sessions.findIndex((s) => s.id === activeSessionId);
              setActiveSessionId(sessions[(idx - 1 + sessions.length) % sessions.length].id);
            }
          }}
          onBroadcast={() => setBroadcastOpen(true)}
          onSplitV={() => splitPane("v")}
          onSplitH={() => splitPane("h")}
          onOpenQueue={() => {
            if (activeSession?.agent) {
              setQueueOpenSessionId((prev) => prev === activeSession.id ? null : activeSession.id);
            }
          }}
          onToggleTheme={toggleTheme}
        />
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
