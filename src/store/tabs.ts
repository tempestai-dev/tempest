import { dbLoadTabs, dbUpsertTab, dbDeleteTab, type DbTab } from "../lib/db";

// A non-terminal tab (diff, preview, editor, chat) that survives app restarts.
export interface PersistedTab {
  instanceId: string;
  kind: "diff" | "preview" | "editor" | "chat";
  projectId: string;
  cwd: string;
  name: string;
  previewUrl?: string;
}

// In-memory mirror of the tabs table (insertion order = creation order).
const _tabs = new Map<string, PersistedTab>();

const logErr = (op: string) => (e: unknown) => console.error(`[tabs] ${op} failed:`, e);

const toDb = (t: PersistedTab): DbTab => ({
  id: t.instanceId, projectId: t.projectId, kind: t.kind,
  cwd: t.cwd, name: t.name, previewUrl: t.previewUrl ?? null,
});

export async function loadTabs(): Promise<void> {
  _tabs.clear();
  for (const t of await dbLoadTabs()) {
    _tabs.set(t.id, {
      instanceId: t.id, kind: t.kind as PersistedTab["kind"], projectId: t.projectId,
      cwd: t.cwd, name: t.name, previewUrl: t.previewUrl ?? undefined,
    });
  }
}

export function getTabs(): PersistedTab[] {
  return [..._tabs.values()];
}

export function upsertTab(tab: PersistedTab): void {
  _tabs.set(tab.instanceId, tab);
  dbUpsertTab(toDb(tab)).catch(logErr("upsert tab"));
}

export function removeTab(instanceId: string): void {
  if (_tabs.delete(instanceId)) dbDeleteTab(instanceId).catch(logErr("delete tab"));
}
