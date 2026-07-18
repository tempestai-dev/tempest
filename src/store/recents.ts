import { dbLoadRecents, dbUpsertRecent, dbDeleteRecent } from "../lib/db";

export interface RecentWorkspace {
  id: string;
  name: string;
  path: string;
  lastOpened: string;
}

// In-memory mirror of the recents table (newest first).
let _recents: RecentWorkspace[] = [];

const logErr = (op: string) => (e: unknown) => console.error(`[recents] ${op} failed:`, e);

export async function loadRecents(): Promise<void> {
  _recents = (await dbLoadRecents()).map((r) => ({
    id: r.id, name: r.name, path: r.path, lastOpened: r.lastOpened,
  }));
}

export function getRecents(): RecentWorkspace[] {
  return _recents;
}

export function addRecent(ws: Pick<RecentWorkspace, "name" | "path">): void {
  const rec: RecentWorkspace = {
    id: crypto.randomUUID(),
    name: ws.name,
    path: ws.path,
    lastOpened: new Date().toISOString(),
  };
  _recents = [rec, ..._recents.filter((r) => r.path !== ws.path)].slice(0, 50);
  dbUpsertRecent(rec).catch(logErr("upsert recent"));
}

export function removeRecent(path: string): void {
  _recents = _recents.filter((r) => r.path !== path);
  dbDeleteRecent(path).catch(logErr("delete recent"));
}
