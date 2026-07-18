import { dbLoad, dbUpsertProject, dbDeleteProject, type DbProject } from "../lib/db";

export interface StoredProject {
  id: string;
  name: string;
  path: string;
  expanded: boolean;
  worktreeOrder?: string[];
}

// In-memory mirror of the projects table (insertion order = display order).
// Hydrated once at startup; reads are synchronous, writes flush to SQLite.
const _projects = new Map<string, StoredProject>();

const logErr = (op: string) => (e: unknown) => console.error(`[openProjects] ${op} failed:`, e);

function toDb(p: StoredProject): DbProject {
  return {
    id: p.id, name: p.name, path: p.path, expanded: p.expanded,
    worktreeOrder: p.worktreeOrder ? JSON.stringify(p.worktreeOrder) : null,
    // Owned by other stores; ignored by db_upsert_project.
    atlasIndexed: false, contextTokens: null, systemPrompt: null,
  };
}

export async function loadProjects(): Promise<void> {
  const snap = await dbLoad();
  _projects.clear();
  for (const p of snap.projects) {
    _projects.set(p.id, {
      id: p.id,
      name: p.name,
      path: p.path,
      expanded: p.expanded,
      worktreeOrder: p.worktreeOrder ? (JSON.parse(p.worktreeOrder) as string[]) : undefined,
    });
  }
}

export function getOpenProjects(): StoredProject[] {
  return [..._projects.values()];
}

// Replace the full project list (the caller always passes the complete set).
// Projects dropped from the list are deleted — cascading to their branches,
// sessions, tabs, and chat at the DB level.
export function saveOpenProjects(projects: StoredProject[]): void {
  const nextIds = new Set(projects.map((p) => p.id));
  for (const id of [..._projects.keys()]) {
    if (!nextIds.has(id)) dbDeleteProject(id).catch(logErr("delete project"));
  }
  _projects.clear();
  for (const p of projects) {
    _projects.set(p.id, p);
    dbUpsertProject(toDb(p)).catch(logErr("upsert project"));
  }
}
