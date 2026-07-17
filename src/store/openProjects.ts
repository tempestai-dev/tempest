import { getRuntimeState, setRuntimeState } from "../lib/runtimeState";

export interface StoredProject {
  id: string;
  name: string;
  path: string;
  expanded: boolean;
  worktreeOrder?: string[];
}

export function getOpenProjects(): StoredProject[] {
  return getRuntimeState().openProjects;
}

export function saveOpenProjects(projects: StoredProject[]): void {
  setRuntimeState({ openProjects: projects });
}
