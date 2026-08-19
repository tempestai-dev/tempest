import { invoke } from "@tauri-apps/api/core";
import type {
  GhAuthState,
  GhItem,
  GhKind,
  GhPreset,
  GhRepo,
  LinearBootstrap,
  LinearItem,
  LinearScope,
} from "./types";

export async function fetchGhAuth(): Promise<GhAuthState> {
  return invoke<GhAuthState>("tasks_github_auth");
}

export async function fetchGhRepos(): Promise<GhRepo[]> {
  return invoke<GhRepo[]>("tasks_github_repos");
}

export async function fetchGhList(
  preset: GhPreset,
  repo: string,
  kind: GhKind,
): Promise<GhItem[]> {
  return invoke<GhItem[]>("tasks_github_list", { preset, repo, kind });
}

export async function fetchLinearBootstrap(): Promise<LinearBootstrap> {
  return invoke<LinearBootstrap>("tasks_linear_bootstrap");
}

export async function fetchLinearList(scope: LinearScope): Promise<LinearItem[]> {
  return invoke<LinearItem[]>("tasks_linear_list", {
    scopeKind: scope.kind,
    scopeId: scope.id,
  });
}

export async function invalidateTasksCache(): Promise<void> {
  await invoke("tasks_cache_invalidate");
}

// Format a UTC ISO datetime as a compact relative string ("3h", "2d") for the
// row's Updated column. Falls back to the raw string for unparseable input so
// the UI never renders "NaN".
export function relativeTime(iso: string): string {
  if (!iso) return "";
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return iso;
  const diff = Math.max(0, Date.now() - t) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d`;
  if (diff < 2629800) return `${Math.floor(diff / 604800)}w`;
  return `${Math.floor(diff / 2629800)}mo`;
}
