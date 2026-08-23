import { invoke } from "@tauri-apps/api/core";
import type {
  GhAuthState,
  GhKind,
  GhListPage,
  GhPreset,
  GhRepoPage,
  LinearBootstrap,
  LinearListPage,
  LinearScope,
  PrCheck,
  PrFile,
  TaskThread,
} from "./types";

export async function fetchGhAuth(): Promise<GhAuthState> {
  return invoke<GhAuthState>("tasks_github_auth");
}

export async function fetchGhRepos(limit: number): Promise<GhRepoPage> {
  return invoke<GhRepoPage>("tasks_github_repos", { limit });
}

export async function fetchGhList(
  preset: GhPreset,
  repo: string,
  kind: GhKind,
  limit: number,
): Promise<GhListPage> {
  return invoke<GhListPage>("tasks_github_list", { preset, repo, kind, limit });
}

export async function fetchLinearBootstrap(): Promise<LinearBootstrap> {
  return invoke<LinearBootstrap>("tasks_linear_bootstrap");
}

export async function fetchLinearList(
  scope: LinearScope,
  after: string | null,
  first: number,
): Promise<LinearListPage> {
  return invoke<LinearListPage>("tasks_linear_list", {
    scopeKind: scope.kind,
    scopeId: scope.id,
    after,
    first,
  });
}

export async function fetchGhThread(repo: string, number: number): Promise<TaskThread> {
  return invoke<TaskThread>("tasks_github_thread", { repo, number });
}

export async function fetchLinearThread(id: string): Promise<TaskThread> {
  return invoke<TaskThread>("tasks_linear_thread", { id });
}

export async function fetchGhPrFiles(repo: string, number: number): Promise<PrFile[]> {
  return invoke<PrFile[]>("tasks_github_pr_files", { repo, number });
}

export async function fetchGhPrChecks(repo: string, number: number): Promise<PrCheck[]> {
  return invoke<PrCheck[]>("tasks_github_pr_checks", { repo, number });
}

export async function invalidateTasksCache(prefix?: string): Promise<void> {
  await invoke("tasks_cache_invalidate", { prefix: prefix ?? null });
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
