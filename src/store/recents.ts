import { getRuntimeState, setRuntimeState } from "../lib/runtimeState";

export interface RecentWorkspace {
  id: string;
  name: string;
  path: string;
  lastOpened: string;
}

export function getRecents(): RecentWorkspace[] {
  return getRuntimeState().recents;
}

export function addRecent(ws: Pick<RecentWorkspace, "name" | "path">): void {
  const all = getRecents().filter((r) => r.path !== ws.path);
  all.unshift({ ...ws, id: crypto.randomUUID(), lastOpened: new Date().toISOString() });
  setRuntimeState({ recents: all.slice(0, 50) });
}
