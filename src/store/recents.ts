const KEY = "tempest-recents";

export interface RecentWorkspace {
  id: string;
  name: string;
  path: string;
  lastOpened: string;
}

export function getRecents(): RecentWorkspace[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "[]");
  } catch {
    return [];
  }
}

export function addRecent(ws: Pick<RecentWorkspace, "name" | "path">): void {
  const all = getRecents().filter((r) => r.path !== ws.path);
  all.unshift({ ...ws, id: crypto.randomUUID(), lastOpened: new Date().toISOString() });
  localStorage.setItem(KEY, JSON.stringify(all.slice(0, 50)));
}
