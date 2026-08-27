import { memo, useEffect, useRef, useState, type CSSProperties } from "react";
import {
  LayoutGrid, Brain, List, Workflow, FolderPlus, TerminalSquare, Cpu,
  ChevronDown, ChevronRight, GitBranch, Plus, Cog, Waypoints, Trash2,
  Bug, Mail, SunMoon, Settings, FolderOpen, Eye, Globe, FileCode,
} from "lucide-react";
import { openUrl } from "@tauri-apps/plugin-opener";
import type { Session, Worktree, Project, NavSection } from "../../types/workspace";
import { getWorktreeAgentSession, getRootSessionsForProject, getBranchSessions, markSessionOpen, type WorktreeSession } from "../../store/sessions";
import { getRuntimeState } from "../../lib/runtimeState";
import { getProjectThreads } from "../../store/threads";
import { AgentIcon, type NewSessionPlacement } from "../NewSessionMenu";
import { Tooltip } from "../Tooltip";
import { SidebarWorkBadge, ProjectWorkBadge } from "../SessionBadges";

type SbRow = { id: string; at: string; live?: Session; ghost?: WorktreeSession };

function sbRows(live: Session[], ghosts: WorktreeSession[]): SbRow[] {
  const rows: SbRow[] = [
    ...live.map((s) => ({ id: s.id, at: s.createdAt ?? "", live: s })),
    ...ghosts.map((g) => ({ id: g.id, at: g.createdAt ?? "", ghost: g })),
  ];
  rows.sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));
  return rows;
}

export interface LeftSidebarProps {
  zen: boolean;
  path?: string;
  name?: string;
  sidebarOpen: boolean;
  sidebarFontSize: number;
  activeSection: NavSection;
  projects: Project[];
  sessions: Session[];
  activeSessionId: string | null;
  zenSidebarItems: Worktree[];
  gitProjectIds: Set<string>;
  atlasEnabled: boolean;
  threadsVersion: number;
  expandedWorktrees: Set<string>;

  // Cross-cutting setters (state lives in parent)
  setActiveSessionId: (id: string) => void;
  setProjects: React.Dispatch<React.SetStateAction<Project[]>>;
  setProjectSettingsPanelId: (id: string) => void;
  setSettingsOpen: (b: boolean) => void;

  // Handlers (defined in parent)
  goTo: (s: NavSection) => void;
  addWorkspace: () => void;
  openSessionMenu: (e: React.MouseEvent<HTMLElement>, projectId: string | null, placement: NewSessionPlacement) => void;
  openBranchSessionMenu: (e: React.MouseEvent<HTMLElement>, worktreePath: string, projectId: string, label: string, isRoot: boolean) => void;
  openCtxMenu: (
    e: React.MouseEvent,
    worktree: Worktree | null,
    projectPath: string,
    projectId: string,
    sessionId: string | null,
    isProjectHeader?: boolean,
    isRootSession?: boolean,
    rootKey?: string,
  ) => void;
  openSession: (
    name: string, cwd: string, projectId?: string, agent?: string,
    prompt?: string,
    _sessionMetadata?: { resumeCount: number; hasBeenResumed: boolean },
    originalId?: string,
    isRootSession?: boolean, noGit?: boolean, dedupe?: boolean,
    providedSessionId?: string, parentSessionId?: string,
    model?: string, placement?: "tab" | "canvas",
  ) => Promise<unknown>;
  openThreadTab: (projectId: string, threadId: string) => void;
  toggleProject: (id: string) => void;
  toggleWorktree: (key: string) => void;
  toggleTheme: () => void;
  ensureThreadsLoaded: (projectId: string) => void;
  createThread: (projectId: string) => void;
  renameThread: (id: string, name: string) => void;
  removeThread: (id: string) => void;
}

function LeftSidebarImpl(props: LeftSidebarProps) {
  const {
    zen, path, name,
    sidebarOpen, sidebarFontSize, activeSection,
    projects, sessions, activeSessionId, zenSidebarItems,
    gitProjectIds, atlasEnabled, threadsVersion, expandedWorktrees,
    setActiveSessionId, setProjects, setProjectSettingsPanelId, setSettingsOpen,
    goTo, addWorkspace, openSessionMenu, openBranchSessionMenu, openCtxMenu,
    openSession, openThreadTab, toggleProject, toggleWorktree, toggleTheme,
    ensureThreadsLoaded, createThread, renameThread, removeThread,
  } = props;

  const activeSession = sessions.find((s) => s.id === activeSessionId) ?? null;

  // ── Local state (moved from parent to isolate re-renders) ────────────────
  const sidebarScrollRef = useRef<HTMLDivElement>(null);
  const [sidebarAtTop, setSidebarAtTop] = useState(true);
  const [sidebarAtBottom, setSidebarAtBottom] = useState(false);
  const [sidebarDragOver, setSidebarDragOver] = useState<{ id: string; side: "before" | "after" } | null>(null);
  const [renamingThreadId, setRenamingThreadId] = useState<string | null>(null);
  const [threadRenameValue, setThreadRenameValue] = useState("");
  const [inlineCreateProjectId, setInlineCreateProjectId] = useState<string | null>(null);
  const [inlineCreateName, setInlineCreateName] = useState("");

  function checkSidebarScroll() {
    const el = sidebarScrollRef.current;
    if (!el) return;
    setSidebarAtTop(el.scrollTop < 8);
    setSidebarAtBottom(el.scrollTop + el.clientHeight >= el.scrollHeight - 8);
  }

  useEffect(() => { requestAnimationFrame(checkSidebarScroll); }, [projects, sessions]); // eslint-disable-line react-hooks/exhaustive-deps

  function navBtn(section: NavSection) {
    const isActive = !activeSessionId && activeSection === section;
    return `sidebar-nav-btn${isActive ? " sidebar-nav-btn--active" : ""}`;
  }

  function commitThreadRename(id: string) {
    renameThread(id, threadRenameValue);
    setRenamingThreadId(null);
  }

  return (
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
          <div className="sidebar-section-label sidebar-section-label--row">
            <span>Projects</span>
            <Tooltip content="Add project" placement="top">
              <FolderPlus size={13} className="sidebar-section-add" onClick={addWorkspace} />
            </Tooltip>
          </div>
          {projects.length === 0 ? (
            <div className="projects-empty-box">No projects added</div>
          ) : (
            <div className="sidebar-proj-list">
            {projects.map((project) => {
              const projectSessions = sessions.filter((s) => s.projectId === project.id);

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
                                  onBlur={() => commitThreadRename(c.id)}
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter") commitThreadRename(c.id);
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
  );
}

export const LeftSidebar = memo(LeftSidebarImpl);
