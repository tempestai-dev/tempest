const KEY = "tempest-open-projects";

export interface StoredProject {
  id: string;
  name: string;
  path: string;
  expanded: boolean;
}

export function getOpenProjects(): StoredProject[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "[]");
  } catch {
    return [];
  }
}

export function saveOpenProjects(projects: StoredProject[]): void {
  localStorage.setItem(KEY, JSON.stringify(projects));
}
