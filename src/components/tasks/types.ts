export type Label = { n: string; c: string };

export type GhRepo = { id: string; full: string; favorite: boolean };

export type LinearTeam = { id: string; name: string; color: string };
export type LinearProject = { id: string; name: string; team: string };
export type LinearView = { id: string; name: string; builtin: boolean };

export type GhItem = {
  kind: "issue" | "pr";
  number: number;
  repo: string;         // owner/repo
  state: "open" | "closed";
  draft: boolean;
  title: string;
  author: string;
  assignees: string[];
  labels: Label[];
  comments: number;
  updated: string;      // ISO8601 from backend
  url: string;
  body: string;
};

export type LinearStatus = "backlog" | "todo" | "inprog" | "review" | "done" | "cancel";
export type LinearPriority = "urgent" | "high" | "med" | "low" | "none";

export type LinearItem = {
  id: string;           // e.g. ENG-88
  title: string;
  status: LinearStatus;
  priority: LinearPriority;
  assignee: string | null;
  labels: Label[];
  project: string | null;
  cycle: string | null;
  team: string;
  updated: string;
  url: string;
  body: string;
};

export type LinearBootstrap = {
  viewer_name: string;
  teams: LinearTeam[];
  projects: LinearProject[];
  views: LinearView[];
};

export type GhAuthState = {
  available: boolean;
  authenticated: boolean;
  host: string | null;
  user: string | null;
  message: string | null;
};

export type TaskComment = {
  id: string;
  author: string;
  body: string;
  created: string;
};

export type TaskActivity = {
  id: string;
  author: string;
  kind: string;
  detail: string;
  created: string;
};

export type TaskThread = {
  comments: TaskComment[];
  activity: TaskActivity[];
};

export type UnifiedItem = (GhItem | LinearItem) & { key: string };

export type Source = "unified" | "github" | "linear";
export type GhKind = "both" | "issues" | "prs";
export type GhPreset = "assigned" | "created" | "mentioned" | "review" | "open" | "closed";
export type LinearScope = { kind: "view" | "team" | "project" | "all"; id: string };

export type TasksState = {
  source: Source;
  ghKind: GhKind;
  ghRepo: string;
  ghPreset: GhPreset;
  lnScope: LinearScope;
  lnGroup: string;
  lnOrder: string;
  query: string;
  selected: Set<string>;
  expandedKey: string | null;
};

export function itemKey(it: GhItem | LinearItem): string {
  if ("number" in it) return `gh-${it.repo}-${it.number}`;
  return `ln-${it.id}`;
}

export function isGh(it: GhItem | LinearItem): it is GhItem {
  return (it as GhItem).number !== undefined;
}

// Minimal shape LaunchAgentModal needs to render the project picker without
// pulling the whole workspace Project type (which carries worktrees etc.).
export type LaunchTargetProject = { id: string; name: string; path: string };

// A git branch name derived from a task ID. Slug-safe: git forbids many
// characters (spaces, colons, tildes, etc.) so we normalize aggressively.
export function suggestBranch(it: GhItem | LinearItem): string {
  const raw = isGh(it)
    ? `${it.kind === "pr" ? "pr" : "fix"}-${it.number}`
    : it.id.toLowerCase();
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9._/-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    || "task";
}
