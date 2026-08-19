import { useEffect, useState } from "react";
import {
  fetchGhAuth,
  fetchGhList,
  fetchGhRepos,
  fetchLinearBootstrap,
  fetchLinearList,
} from "./api";
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

export type Async<T> = {
  data: T | null;
  loading: boolean;
  error: string | null;
  reload: () => void;
};

function useAsync<T>(
  key: string,
  fn: () => Promise<T>,
  bump: number,
): Async<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let live = true;
    setLoading(true);
    setError(null);
    fn()
      .then((v) => { if (live) { setData(v); setLoading(false); } })
      .catch((e) => { if (live) { setError(String(e)); setLoading(false); } });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, bump, tick]);

  return { data, loading, error, reload: () => setTick((t) => t + 1) };
}

export function useGhAuth(bump: number): Async<GhAuthState> {
  return useAsync("gh:auth", fetchGhAuth, bump);
}

export function useGhRepos(enabled: boolean, bump: number): Async<GhRepo[]> {
  const fn = enabled ? fetchGhRepos : async () => [] as GhRepo[];
  return useAsync(`gh:repos:${enabled}`, fn, bump);
}

export function useGhList(
  enabled: boolean,
  preset: GhPreset,
  repo: string,
  kind: GhKind,
  bump: number,
): Async<GhItem[]> {
  const fn = enabled ? () => fetchGhList(preset, repo, kind) : async () => [] as GhItem[];
  return useAsync(`gh:list:${enabled}:${preset}:${repo}:${kind}`, fn, bump);
}

export function useLinearBootstrap(enabled: boolean, bump: number): Async<LinearBootstrap | null> {
  const fn = enabled ? fetchLinearBootstrap : async () => null;
  return useAsync(`ln:bootstrap:${enabled}`, fn, bump);
}

export function useLinearList(
  enabled: boolean,
  scope: LinearScope,
  bump: number,
): Async<LinearItem[]> {
  const fn = enabled ? () => fetchLinearList(scope) : async () => [] as LinearItem[];
  return useAsync(`ln:list:${enabled}:${scope.kind}:${scope.id}`, fn, bump);
}
