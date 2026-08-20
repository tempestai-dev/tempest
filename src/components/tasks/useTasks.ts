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

// Module-level cache so switching presets/repos and coming back is instant.
// Keyed by (bump, key) — bump increments on manual refresh and invalidates
// every entry. Rust also caches for 60s, so a stale-hit that misses here
// still returns fast; this layer just skips the round-trip and the flicker.
// ponytail: unbounded Map; add LRU cap if it ever balloons in a long session.
const CACHE = new Map<string, unknown>();

function useAsync<T>(
  key: string,
  fn: () => Promise<T>,
  bump: number,
): Async<T> {
  const cacheKey = `${bump}:${key}`;
  const cached = CACHE.has(cacheKey) ? (CACHE.get(cacheKey) as T) : null;
  const [data, setData] = useState<T | null>(cached);
  const [loading, setLoading] = useState<boolean>(cached === null);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    // Serve cached value instantly on re-mount / key revisit.
    if (CACHE.has(cacheKey) && tick === 0) {
      setData(CACHE.get(cacheKey) as T);
      setLoading(false);
      setError(null);
      return;
    }
    let live = true;
    setLoading(true);
    setError(null);
    fn()
      .then((v) => {
        if (!live) return;
        CACHE.set(cacheKey, v);
        setData(v);
        setLoading(false);
      })
      .catch((e) => { if (live) { setError(String(e)); setLoading(false); } });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cacheKey, tick]);

  return {
    data,
    loading,
    error,
    reload: () => { CACHE.delete(cacheKey); setTick((t) => t + 1); },
  };
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
