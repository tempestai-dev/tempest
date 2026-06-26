import { useState, useEffect, useRef, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { openUrl } from "@tauri-apps/plugin-opener";
import { createWorktree, gitInit, NotAGitRepoError } from "../lib/worktree";
import { addRecent, getRecents } from "../store/recents";
import { getOpenProjects, saveOpenProjects } from "../store/openProjects";
import { getWorktreeSession, saveWorktreeSession, removeWorktreeSession, markWorktreeSessionClosed, markWorktreeSessionOpen, pruneOrphanedSessions, rootSessionKey, getRootSessionsForProject } from "../store/sessions";
import {
  LayoutGrid,
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
  ChevronRight,
  ChevronDown,
  Trash2,
  AlertTriangle,
  Loader,
  SquareSlash,
  Globe,
  FileCode,
} from "lucide-react";
import { useWorkState, setWorkState, clearWorkState } from "../store/workState";
import { useKeybindings, matchesEvent, formatShortcut } from "../store/keybindings";
import { useAttribution, getAttribution, COAUTHOR_LINE } from "../store/attribution";
import { useSettings } from "../store/appSettings";
import { TopBar } from "./TopBar";
import { TerminalPane } from "./TerminalPane";
import { DiffPane } from "./DiffPane";
import { PreviewPane } from "./PreviewPane";
import { CodeMirrorPane } from "./CodeMirrorPane";
import { RightSidebar } from "./RightSidebar";
import { NewSessionMenu, NewSessionPlacement, AgentConfig, AGENT_CONFIGS, AgentIcon } from "./NewSessionMenu";
import { SettingsPanel } from "./SettingsPanel";
import { useTheme, builtinThemes } from "../themes/ThemeContext";
import { Mark } from "../assets/Mark";
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
  createdAt: string; // ISO timestamp
  isRootSession?: boolean; // true when session runs in the project root (no worktree)
  noGit?: boolean; // true when user skipped git init for this root session
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

type NavSection = "overview";

function folderName(p: string): string {
  return p.replace(/[/\\]+$/, "").split(/[/\\]/).pop() ?? p;
}

// Right-side work state badge on a tab: spinner while working, dot when done.
function WorkStateBadge({ sessionId }: { sessionId: string }) {
  const state = useWorkState(sessionId);
  if (state === "working") return <Loader size={11} className="spin work-spinner" />;
  if (state === "done") return <span className="work-done-dot" aria-label="Agent finished" />;
  return null;
}

// Compact work-state indicator for sidebar rows (spinner while working, dot when done).
function SidebarWorkBadge({ sessionId }: { sessionId: string }) {
  const state = useWorkState(sessionId);
  if (state === "working") return <Loader size={11} className="spin work-spinner" />;
  if (state === "done") return <span className="work-done-dot" aria-label="Agent finished" />;
  return null;
}

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

  // Zen mode: flat worktree list for the single project
  const [zenWorktrees, setZenWorktrees] = useState<Worktree[]>([]);

  // Default mode: multi-project state (persisted to localStorage)
  const [projects, setProjects] = useState<Project[]>(() =>
    zen ? [] : getOpenProjects().map((p) => ({ ...p, worktrees: [] }))
  );
  const [pendingProjectId, setPendingProjectId] = useState<string | null>(null);
  const [pendingAgent, setPendingAgent] = useState<AgentConfig | null>(null);

  // Per-session PTY output capture callbacks — used to sniff agent-minted session IDs
  // (e.g. opencode) from raw output on first spawn. Entries are removed once the ID
  // is found. Reading the Map in JSX is always fresh because it's a ref, not state.
  const outputCaptures = useRef<Map<string, (data: string) => void>>(new Map());

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

  // On mount: scan every open project for valid worktrees, prune stale session
  // entries that no longer correspond to any path on disk, then restore only
  // the sessions that are still valid. This ensures deleted/removed projects
  // never re-appear as tabs on the next launch.
  useEffect(() => {
    if (zen) return;

    async function restoreAll() {
      // Phase 1 — discover which paths actually exist on disk across all projects
      const validPaths = new Set<string>();
      const projectWorktreeMap = new Map<
        string,
        { project: Project; wts: { name: string; path: string }[] }
      >();

      for (const project of projects) {
        const wts: { name: string; path: string }[] = [];
        // The project root is always a valid anchor for a persisted root session
        // (agent root ghosts live only in localStorage keyed by project.path — they
        // have no disk directory). This MUST be added unconditionally, outside the
        // try below: a project that only ever had root sessions has no .tempest/
        // directory, so list_directory throws and — if this lived inside the try —
        // project.path would be missing from validPaths and pruneOrphanedSessions
        // would wipe the agent root ghost on the next restore cycle.
        validPaths.add(project.path);
        // Root sessions (agent + terminal) live only in localStorage under unique
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
          entries.filter((e) => e.is_dir).forEach((e) => {
            wts.push({ name: e.name, path: e.path });
            validPaths.add(e.path);
          });
        } catch {
          // .tempest/ doesn't exist or project path is gone
        }

        projectWorktreeMap.set(project.id, { project, wts });
        setProjects((prev) =>
          prev.map((p) => (p.id === project.id ? { ...p, worktrees: wts } : p))
        );
      }

      // Phase 2 — remove session entries whose paths no longer exist on disk
      pruneOrphanedSessions(validPaths);

      // Phase 3 — restore sessions for the paths that survived pruning
      for (const { project, wts } of projectWorktreeMap.values()) {
        for (const wt of wts) {
          const saved = getWorktreeSession(wt.path);
          if (!saved || saved.closed === true) continue;
          await openSession(
            saved.name,
            wt.path,
            project.id,
            saved.agent,
            undefined,
            undefined,
            saved.agent ? saved.conversationId : undefined,
            undefined,
            undefined,
            true // dedupe: prevent stale-closure double-spawn in restore loop
          ).catch(() => {});
        }

        // Restore every non-closed root session for this project. Each lives under
        // its own unique key, so both an agent root and a terminal root can coexist.
        for (const { session: rootSaved } of getRootSessionsForProject(project.path)) {
          if (rootSaved.closed === true) continue;
          await openSession(
            rootSaved.name,
            project.path,
            project.id,
            rootSaved.agent,
            undefined,
            undefined,
            rootSaved.agent ? rootSaved.conversationId : undefined,
            true, // isRootSession
            rootSaved.noGit,
            true  // dedupe: prevent stale-closure double-spawn in restore loop
          ).catch(() => {});
        }
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
          entries.filter((e) => e.is_dir).map((e) => ({ name: e.name, path: e.path }))
        )
      )
      .catch(() => {});
  }, [path]);

  const keybinds = useKeybindings();
  const attribution = useAttribution();
  const { sidebarFontSize, branchPrefix } = useSettings();

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
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;

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
  }

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
      if (s.kind !== "diff" && s.kind !== "preview" && s.kind !== "editor") invoke("close_pty_session", { sessionId: s.id }).catch(() => {});
      clearWorkState(s.id);
    });
    setSessions((prev) => prev.filter((s) => s.projectId !== projectId));
    if (projectSessions.some((s) => s.id === activeSessionId)) setActiveSessionId(null);
    setProjects((prev) => prev.filter((p) => p.id !== projectId));
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
    dedupe = false // true only in the restore loop — prevents duplicate PTY spawns from stale-closure races
  ) {
    // Guard is scoped to the restore loop (dedupe=true). User-triggered opens never block
    // each other, so two root sessions at the same cwd can be opened intentionally.
    if (dedupe && spawningPaths.current.has(cwd)) return;
    if (dedupe) spawningPaths.current.add(cwd);

    try {
      const sessionId = crypto.randomUUID();

      // Assemble the agent's full argument list (session/resume flags + prompt) here in
      // TypeScript so Rust receives a ready-to-run command. originalId is present only
      // when resuming an existing conversation.
      const args = agent ? buildAgentArgs(agent, sessionId, originalId, prompt) : null;

      await invoke<void>("create_pty_session", {
        sessionId,
        cwd,
        rows: 24,
        cols: 80,
        command: agent ?? null,
        args,
      });

      // If resuming, conversationId stays as the original UUID. If new, conversationId = the
      // PTY sessionId which was registered with --session-id.
      // For capture-based agents (opencode), conversationId starts undefined and is filled
      // in asynchronously once the ID is found in the PTY output.
      const config = agent ? AGENT_CONFIGS.find((a) => a.hint === agent) : null;
      const usesCapturePattern = !!(config?.capturePattern && config.captureResumeArgs);
      const conversationId = usesCapturePattern && !originalId ? undefined : (originalId ?? sessionId);

      // The localStorage key this session persists under. Root sessions (agent OR
      // plain terminal) use a per-session unique key so they don't collide at the
      // shared cwd = project root. Worktree sessions key on cwd, and only when they
      // carry an agent worth resuming — plain terminal worktrees aren't persisted.
      const rootKey = isRootSession ? rootSessionKey(cwd, sessionId) : null;
      const storeKey = rootKey ?? (agent ? cwd : undefined);

      // Save metadata immediately after the PTY spawns so it survives tab close.
      // Both agent and plain terminal root sessions are saved (each under its own
      // unique rootKey); worktree sessions are saved only when they have an agent.
      if (storeKey) {
        saveWorktreeSession(storeKey, { name: sessionName, agent, conversationId, projectId, isRootSession, noGit });
      }

      // For capture-pattern agents on first spawn: register an output listener that
      // extracts the agent-minted session ID and persists it as conversationId.
      if (agent && config?.capturePattern && config.captureResumeArgs && !originalId) {
        const pattern = config.capturePattern;
        outputCaptures.current.set(sessionId, (data: string) => {
          const match = pattern.exec(data);
          if (match?.[1]) {
            const capturedId = match[1];
            const captureKey = storeKey ?? cwd;
            const stored = getWorktreeSession(captureKey);
            if (stored) saveWorktreeSession(captureKey, { ...stored, conversationId: capturedId });
            setSessions((prev) =>
              prev.map((s) => (s.id === sessionId ? { ...s, conversationId: capturedId } : s))
            );
            outputCaptures.current.delete(sessionId);
          }
        });
      }

      const newSession: Session = {
        id: sessionId,
        name: sessionName,
        cwd,
        projectId,
        agent,
        conversationId,
        isRootSession,
        noGit,
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
    const existing = sessions.find((s) => s.kind === "diff" && s.cwd === cwd);
    if (existing) { setActiveSessionId(existing.id); return; }
    const sessionId = crypto.randomUUID();
    setSessions((prev) => [...prev, {
      id: sessionId, name: "Diff", cwd, projectId, kind: "diff",
      createdAt: new Date().toISOString(),
      metadata: { resumeCount: 0, hasBeenResumed: false },
    }]);
    setActiveSessionId(sessionId);
  }

  function openPreviewTab(projectId: string) {
    const sessionId = crypto.randomUUID();
    setSessions((prev) => [...prev, {
      id: sessionId, name: "Live Preview", cwd: "", projectId, kind: "preview",
      createdAt: new Date().toISOString(),
      metadata: { resumeCount: 0, hasBeenResumed: false },
    }]);
    setActiveSessionId(sessionId);
  }

  function openEditorTab(filePath: string, projectId: string) {
    const existing = sessions.find((s) => s.kind === "editor" && s.cwd === filePath);
    if (existing) { setActiveSessionId(existing.id); return; }
    const sessionId = crypto.randomUUID();
    const fileName = filePath.replace(/\\/g, "/").split("/").pop() ?? filePath;
    setSessions((prev) => [...prev, {
      id: sessionId, name: fileName, cwd: filePath, projectId, kind: "editor",
      createdAt: new Date().toISOString(),
      metadata: { resumeCount: 0, hasBeenResumed: false },
    }]);
    setActiveSessionId(sessionId);
  }

  function updateSessionPreviewUrl(sessionId: string, url: string) {
    setSessions((prev) => prev.map((s) => s.id === sessionId ? { ...s, previewUrl: url } : s));
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
    if (!terminalName.trim()) return;
    setTerminalLaunching(true);
    setTerminalError(null);
    const activePath = getActivePath();
    const workingProjectId = pendingProjectId;
    const agent = pendingAgent?.hint;
    const prompt = terminalPrompt.trim() || undefined;
    const fullName = branchPrefix ? `${branchPrefix}${terminalName}` : terminalName;
    const sessionName = fullName || (pendingAgent ? pendingAgent.name : "Terminal");
    try {
      const result = await createWorktree({ projectPath: activePath, name: fullName });
      addWorktreeToState({ name: fullName, path: result.path }, workingProjectId);
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
    const closing = sessions.find((s) => s.id === sessionId);
    if (closing?.kind !== "diff" && closing?.kind !== "preview" && closing?.kind !== "editor") {
      invoke("close_pty_session", { sessionId }).catch(() => {});
      // Use storeKey (not cwd) so a session that was never persisted (e.g. a plain terminal
      // root session sharing cwd with an agent root session) cannot corrupt the agent's entry.
      if (closing?.storeKey) markWorktreeSessionClosed(closing.storeKey);
    }
    clearWorkState(sessionId);
    const remaining = sessions.filter((s) => s.id !== sessionId);
    setSessions(remaining);
    if (activeSessionId === sessionId) {
      setActiveSessionId(remaining.length > 0 ? remaining[remaining.length - 1].id : null);
    }
  }

  const { theme, setTheme } = useTheme();
  const isDark = theme.name === "Tempest Dark";

  function toggleTheme() {
    const next = builtinThemes.find((t) => t.name === (isDark ? "Tempest Light" : "Tempest Dark"));
    if (next) setTheme(next);
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

  const activeSession = sessions.find((s) => s.id === activeSessionId) ?? null;

  useEffect(() => {
    if (!activeSession) { setActiveBranch(null); return; }
    invoke<string>("get_git_branch", { path: activeSession.cwd })
      .then(setActiveBranch)
      .catch(() => setActiveBranch(null));
  }, [activeSession?.cwd]); // eslint-disable-line react-hooks/exhaustive-deps

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
        setProjects((prev) => prev.map((p) => p.id === newProject.id ? { ...p, worktrees: entries.filter((e) => e.is_dir).map((e) => ({ name: e.name, path: e.path })) } : p));
      })
      .catch(() => {});
    if (getAttribution()) {
      invoke("write_coauthor_hook", { repoPath: selected, coauthorLine: COAUTHOR_LINE }).catch(() => {});
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
        <button
          className="sub-bar-icon-btn"
          title="Toggle sidebar"
          aria-label="Toggle sidebar"
          onClick={() => setSidebarOpen((o) => !o)}
        >
          <PanelLeft size={15} />
        </button>
        <button
          className="sub-bar-icon-btn"
          title="Switch theme"
          aria-label="Switch theme"
          onClick={toggleTheme}
        >
          {isDark ? <Sun size={15} /> : <Moon size={15} />}
        </button>
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
            <button
              className="sub-bar-icon-btn"
              title="Toggle right panel"
              aria-label="Toggle right panel"
              onClick={() => setRightSidebarOpen((o) => !o)}
            >
              <PanelRight size={15} />
            </button>
          </div>
        )}
      </div>

      <div className="workspace-body">
        <aside className={`sidebar${sidebarOpen ? "" : " sidebar--collapsed"}`} style={{ "--sidebar-fs": `${sidebarFontSize}px` } as CSSProperties}>

          {zen ? (
            /* ── Zen mode sidebar ── */
            <>
              <button className={navBtn("overview")} onClick={() => goTo("overview")}>
                <LayoutGrid size={16} />
                <span>Overview</span>
              </button>
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
              <button className={navBtn("overview")} onClick={() => goTo("overview")}>
                <LayoutGrid size={16} />
                <span>Overview</span>
              </button>
              <div className="sidebar-section-label">Projects</div>
              {projects.length === 0 ? (
                <div className="agents-empty">No projects added</div>
              ) : (
                projects.map((project) => {
                  const projectSessions = sessions.filter((s) => s.projectId === project.id);
                  const activeRootSessions = projectSessions.filter((s) => s.isRootSession && s.kind !== "diff");
                  // Show closed root sessions in the sidebar so the user can click to resume them.
                  // Worktrees persist via their .tempest/ directories; root sessions have no disk
                  // anchor, so we read the store directly. Each root session — agent OR plain
                  // terminal — is stored under its own unique key, so both kinds coexist as ghosts.
                  // Render a ghost for every persisted root entry that isn't currently live.
                  const closedRootEntries = getRootSessionsForProject(project.path).filter(
                    (entry) => !activeRootSessions.some((s) => s.storeKey === entry.key)
                  );
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
                        <button
                          className="sidebar-project-add-btn"
                          onClick={(e) => openSessionMenu(e, project.id, "right")}
                          title="New session"
                          aria-label="New session"
                        >
                          <Plus size={12} />
                        </button>
                      </div>
                      {project.expanded && (
                        <div className="sidebar-project-sessions">
                          {/* Root sessions — shown above worktrees */}
                          {activeRootSessions.map((s) => (
                            <button
                              key={s.id}
                              className={`sidebar-project-session sidebar-project-session--root${s.id === activeSessionId ? " sidebar-project-session--active" : ""}`}
                              onClick={() => setActiveSessionId(s.id)}
                              onContextMenu={(e) =>
                                openCtxMenu(e, null, project.path, project.id, s.id, false, true, s.storeKey)
                              }
                            >
                              <SquareSlash size={12} />
                              <span className="sidebar-session-name">{s.name}</span>
                              <span className="sidebar-root-badge">main</span>
                              {s.agent && <SidebarWorkBadge sessionId={s.id} />}
                            </button>
                          ))}
                          {/* Closed root session ghosts — persist in sidebar so the user can resume.
                              Both agent and plain terminal root sessions appear here, each keyed by
                              its unique store key. */}
                          {closedRootEntries.map((entry) => (
                            <button
                              key={entry.key}
                              className="sidebar-project-session sidebar-project-session--root sidebar-project-session--closed"
                              onClick={() => {
                                const saved = entry.session;
                                // Resuming mints a fresh session under a new unique key, so drop the
                                // old entry to avoid leaving a duplicate ghost behind.
                                removeWorktreeSession(entry.key);
                                openSession(saved.name, project.path, project.id, saved.agent, undefined, undefined, saved.agent ? saved.conversationId : undefined, true, saved.noGit).catch(() => {});
                              }}
                              onContextMenu={(e) =>
                                openCtxMenu(e, null, project.path, project.id, null, false, true, entry.key)
                              }
                            >
                              <SquareSlash size={12} />
                              <span className="sidebar-session-name">{entry.session.name}</span>
                              <span className="sidebar-root-badge">main</span>
                            </button>
                          ))}
                          {/* Worktree sessions */}
                          {project.worktrees.map((wt) => {
                            const session = sessions.find((s) => s.cwd === wt.path);
                            const savedMeta = !session ? getWorktreeSession(wt.path) : null;
                            const isAgent = !!(session?.agent || savedMeta?.agent);
                            const isActive = session?.id === activeSessionId;
                            return (
                              <button
                                key={wt.path}
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
                                {session?.agent && <SidebarWorkBadge sessionId={session.id} />}
                              </button>
                            );
                          })}
                          {/* Diff tabs and other non-root non-worktree sessions */}
                          {projectSessions
                            .filter((s) => !s.isRootSession && !project.worktrees.some((w) => w.path === s.cwd))
                            .map((s) => (
                              <button
                                key={s.id}
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
                            ))}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </>
          )}

          <div className="sidebar-bottom">
            <button className="sidebar-nav-btn" onClick={() => openUrl("https://github.com/gsvprharsha/tempest/issues")}>
              <Bug size={16} />
              <span>Report a Bug</span>
            </button>
            <button className="sidebar-nav-btn" onClick={() => openUrl("mailto:gsvprharsha.work@gmail.com")}>
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
              {sessions.map((s) => {
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
                  </button>
                );
              })}
              <button
                className="session-tab-add"
                onClick={(e) => openSessionMenu(e, activeSession?.projectId ?? null, "below")}
                aria-label="New tab"
              >
                <Plus size={13} />
              </button>
            </div>
          )}

          <div className="workspace-content">
            {sessions.map((s) =>
              s.kind === "diff" ? (
                <DiffPane key={s.id} sessionId={s.id} cwd={s.cwd} hidden={s.id !== activeSessionId} gitRevision={gitRevision} />
              ) : s.kind === "preview" ? (
                <PreviewPane
                  key={s.id}
                  sessionId={s.id}
                  hidden={s.id !== activeSessionId}
                  previewUrl={s.previewUrl}
                  onUrlChange={(url) => updateSessionPreviewUrl(s.id, url)}
                />
              ) : s.kind === "editor" ? (
                <CodeMirrorPane
                  key={s.id}
                  filePath={s.cwd}
                  hidden={s.id !== activeSessionId}
                />
              ) : (
                <TerminalPane
                  key={s.id}
                  sessionId={s.id}
                  hidden={s.id !== activeSessionId}
                  isAgent={!!s.agent}
                  onAgentDone={s.agent ? () => setGitRevision((r) => r + 1) : undefined}
                  onOutputChunk={outputCaptures.current.get(s.id)}
                />
              )
            )}
            {!activeSessionId && (
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
                  <div className="overview-recents-card">
                    <span className="overview-card-label">Recent</span>
                    {getRecents().slice(0, 5).length === 0 ? (
                      <span className="overview-recents-empty">No recent projects</span>
                    ) : (
                      getRecents().slice(0, 5).map(({ name, path, lastOpened }) => (
                        <div className="overview-recent-row" key={path} onClick={() => openProjectByPath(path)}>
                          <div className="overview-recent-text">
                            <span className="overview-recent-name">{name}</span>
                            <span className="overview-recent-path">{path}</span>
                          </div>
                          <span className="overview-recent-time">{timeAgo(lastOpened)}</span>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </main>

        {activeSession && (
          <RightSidebar
            cwd={activeSession.cwd}
            rootPath={zen ? (path ?? null) : (projects.find((p) => p.id === activeSession.projectId)?.path ?? activeSession.cwd)}
            open={rightSidebarOpen}
            gitRevision={gitRevision}
            noGit={activeSession.noGit}
            onOpenDiff={activeSession.kind !== "diff" && activeSession.kind !== "preview" ? () => openDiffTab(activeSession.cwd, activeSession.projectId) : undefined}
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
                <input
                  className="naming-modal-input"
                  type="text"
                  placeholder="e.g. my-feature"
                  value={terminalName}
                  onChange={(e) => setTerminalName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") launchTerminalWorktree(); }}
                  autoFocus
                />
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
                    disabled={!terminalName.trim() || terminalLaunching}
                    onClick={launchTerminalWorktree}
                  >
                    {terminalLaunching ? <Loader size={13} className="spin" /> : "in Branch"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>,
        document.body
      )}


      {settingsOpen && <SettingsPanel onClose={() => setSettingsOpen(false)} />}

    </div>
  );
}
