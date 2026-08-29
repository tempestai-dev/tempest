// Module-level handle onto the live WorkspaceView so the mobile bridge can
// drive session lifecycle without holding a React ref. WorkspaceView.setApi()s
// on mount, clears on unmount. The bridge calls getWorkspaceApi() lazily so
// a phone that connects before WorkspaceView mounts gets a clean error.

export interface WorkspaceApi {
  openSession(input: {
    projectId: string;
    branchId?: string;
    agent?: string;
    name?: string;
  }): Promise<{ id: string }>;
  closeSession(id: string): void;
  hopSession(id: string): Promise<void>;
}

let api: WorkspaceApi | null = null;

export function setWorkspaceApi(a: WorkspaceApi | null): void {
  api = a;
}

export function getWorkspaceApi(): WorkspaceApi {
  if (!api) throw new Error("desktop_not_ready");
  return api;
}
