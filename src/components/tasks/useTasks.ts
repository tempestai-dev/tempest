import { useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
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

type RefreshPayload = { key: string; data: unknown };

// The Rust layer serves stale SQLite rows instantly and revalidates in a
// background thread; when the fresh payload lands it emits
// `tasks:cache-refreshed` tagged with the exact cache key. Hooks register
// their current remote key here so the UI hot-swaps without a refresh click.
function useCacheRefreshed(handler: (key: string, data: unknown) => void) {
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let dead = false;
    listen<RefreshPayload>("tasks:cache-refreshed", (e) => {
      if (!dead) ref.current(e.payload.key, e.payload.data);
    }).then((u) => { if (dead) u(); else unlisten = u; });
    return () => { dead = true; unlisten?.(); };
  }, []);
}

// Drop this hook's previous cache entry whenever its key moves on — otherwise
// a long session accumulates every preset/repo/page/bump ever visited in the
// module-level map forever.
function usePrunePrevKey(cacheKey: string) {
  const prev = useRef(cacheKey);
  useEffect(() => {
    if (prev.current !== cacheKey) {
      CACHE.delete(prev.current);
      prev.current = cacheKey;
    }
  }, [cacheKey]);
}

function useAsync<T>(
  key: string,
  fn: () => Promise<T>,
  bump: number,
  remoteKey?: string | null,
): Async<T> {
  const cacheKey = `${bump}:${key}`;
  usePrunePrevKey(cacheKey);
  useCacheRefreshed((rKey, data) => {
    if (remoteKey && rKey === remoteKey) {
      CACHE.set(cacheKey, data);
      setData(data as T);
      setLoading(false);
      setError(null);
    }
  });
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

export type Paged<T> = {
  data: T[] | null;
  loading: boolean;
  loadingMore: boolean;
  error: string | null;
  hasMore: boolean;
  loadMore: () => void;
};

// How many rows the caller has asked for per scope, so remounting the Tasks
// page (e.g. navigating away and back) resumes at the same limit instead of
// dropping back to the first page — CACHE is module-level and would still
// have the accumulated page, but a `limit` reset to `pageSize` on remount
// made it unreachable since the cache key includes `limit`.
const LIMITS = new Map<string, number>();

function usePersistentLimit(scopeKey: string, pageSize: number): [number, (updater: number | ((l: number) => number)) => void] {
  const [limit, setLimitState] = useState(() => LIMITS.get(scopeKey) ?? pageSize);
  const prevScopeKey = useRef(scopeKey);
  useEffect(() => {
    if (prevScopeKey.current !== scopeKey) {
      prevScopeKey.current = scopeKey;
      setLimitState(LIMITS.get(scopeKey) ?? pageSize);
    }
  }, [scopeKey, pageSize]);
  const setLimit = (updater: number | ((l: number) => number)) => {
    setLimitState((l) => {
      const next = typeof updater === "function" ? (updater as (l: number) => number)(l) : updater;
      LIMITS.set(scopeKey, next);
      return next;
    });
  };
  return [limit, setLimit];
}

// `gh search` / `gh repo list` have no cursor, only `--limit` — "load more"
// re-runs the whole query with a bigger limit. Cached per (scope, limit) so
// stepping back to a smaller limit (or revisiting the tab) is instant.
function usePagedByLimit<T>(
  scopeKey: string,
  limit: number,
  fetchPage: (limit: number) => Promise<{ items: T[]; has_more: boolean }>,
  bump: number,
  remoteKeyFor: (limit: number) => string | null,
): Omit<Paged<T>, "loadMore"> {
  const cacheKey = `${bump}:${scopeKey}:${limit}`;
  usePrunePrevKey(cacheKey);
  useCacheRefreshed((rKey, data) => {
    const page = data as { items?: unknown; has_more?: boolean };
    if (remoteKeyFor(limit) === rKey && page && Array.isArray(page.items)) {
      const fresh = { items: page.items as T[], has_more: !!page.has_more };
      CACHE.set(cacheKey, fresh);
      setResult(fresh);
      setLoading(false);
      setError(null);
    }
  });
  const cached = CACHE.has(cacheKey) ? (CACHE.get(cacheKey) as { items: T[]; has_more: boolean }) : null;
  const [result, setResult] = useState(cached);
  const [loading, setLoading] = useState(cached === null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (CACHE.has(cacheKey)) {
      setResult(CACHE.get(cacheKey) as { items: T[]; has_more: boolean });
      setLoading(false);
      setError(null);
      return;
    }
    let live = true;
    setLoading(true);
    setError(null);
    fetchPage(limit)
      .then((v) => {
        if (!live) return;
        CACHE.set(cacheKey, v);
        setResult(v);
        setLoading(false);
      })
      .catch((e) => { if (live) { setError(String(e)); setLoading(false); } });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cacheKey]);

  return {
    data: result?.items ?? null,
    // Once we already have a page rendered, a limit bump is a "load more" in
    // flight, not the initial fetch — keep showing what's there.
    loading: loading && result === null,
    loadingMore: loading && result !== null,
    error,
    hasMore: result?.has_more ?? false,
  };
}

export function useGhRepos(enabled: boolean, bump: number): Paged<GhRepo> {
  const pageSize = 100;
  const scopeKey = `gh:repos:${enabled}`;
  const [limit, setLimit] = usePersistentLimit(scopeKey, pageSize);
  const fetchPage = enabled
    ? (l: number) => fetchGhRepos(l)
    : async () => ({ items: [] as GhRepo[], has_more: false });
  // Mirrors the Rust cache key `gh:repos:{limit}` so a background revalidation
  // of the persisted row lands in the right entry.
  const page = usePagedByLimit(scopeKey, limit, fetchPage, bump, (l) =>
    enabled ? `gh:repos:${l}` : null,
  );
  return { ...page, loadMore: () => setLimit((l) => l + pageSize) };
}

export function useGhList(
  enabled: boolean,
  preset: GhPreset,
  repo: string,
  kind: GhKind,
  bump: number,
): Paged<GhItem> {
  const pageSize = 50;
  const scopeKey = `gh:list:${enabled}:${preset}:${repo}:${kind}`;
  const [limit, setLimit] = usePersistentLimit(scopeKey, pageSize);
  const fetchPage = enabled
    ? (l: number) => fetchGhList(preset, repo, kind, l)
    : async () => ({ items: [] as GhItem[], has_more: false });
  // Mirrors the Rust cache key `gh:list:{preset}:{repo}:{kind}:{limit}`.
  const page = usePagedByLimit(scopeKey, limit, fetchPage, bump, (l) =>
    enabled ? `gh:list:${preset}:${repo}:${kind}:${l}` : null,
  );
  return { ...page, loadMore: () => setLimit((l) => l + pageSize) };
}

export function useLinearBootstrap(enabled: boolean, bump: number): Async<LinearBootstrap | null> {
  const fn = enabled ? fetchLinearBootstrap : async () => null;
  return useAsync(`ln:bootstrap:${enabled}`, fn, bump, enabled ? "linear:bootstrap" : null);
}

const LN_LIST_PAGE = 50;
type LnAccum = { items: LinearItem[]; cursor: string | null; hasMore: boolean };

// Linear's GraphQL connection gives a real cursor, so unlike the GitHub
// lists above, "load more" appends a fresh page instead of re-fetching
// everything with a bigger limit.
export function useLinearList(
  enabled: boolean,
  scope: LinearScope,
  bump: number,
): Paged<LinearItem> {
  const scopeKey = `ln:list:${enabled}:${scope.kind}:${scope.id}`;
  const cacheKey = `${bump}:${scopeKey}`;
  usePrunePrevKey(cacheKey);
  useCacheRefreshed((rKey, data) => {
    // Only mirror the first-page revalidation while no deeper pages have been
    // appended — swapping would drop rows the user already loaded.
    if (accum && accum.cursor) return;
    const p = data as { items?: unknown; has_more?: boolean; end_cursor?: string | null };
    if (
      enabled &&
      rKey === `linear:list:${scope.kind}:${scope.id}::${LN_LIST_PAGE}` &&
      p && Array.isArray(p.items)
    ) {
      const next: LnAccum = { items: p.items as LinearItem[], cursor: p.end_cursor ?? null, hasMore: !!p.has_more };
      CACHE.set(cacheKey, next);
      setAccum(next);
      setLoading(false);
      setError(null);
    }
  });
  const cached = CACHE.has(cacheKey) ? (CACHE.get(cacheKey) as LnAccum) : null;
  const [accum, setAccum] = useState<LnAccum | null>(cached);
  const [loading, setLoading] = useState(cached === null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (CACHE.has(cacheKey)) {
      setAccum(CACHE.get(cacheKey) as LnAccum);
      setLoading(false);
      setError(null);
      return;
    }
    if (!enabled) {
      const empty: LnAccum = { items: [], cursor: null, hasMore: false };
      CACHE.set(cacheKey, empty);
      setAccum(empty);
      setLoading(false);
      return;
    }
    let live = true;
    setLoading(true);
    setError(null);
    fetchLinearList(scope, null, LN_LIST_PAGE)
      .then((p) => {
        if (!live) return;
        const next: LnAccum = { items: p.items, cursor: p.end_cursor, hasMore: p.has_more };
        CACHE.set(cacheKey, next);
        setAccum(next);
        setLoading(false);
      })
      .catch((e) => { if (live) { setError(String(e)); setLoading(false); } });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cacheKey]);

  const loadMore = () => {
    if (!accum || !accum.hasMore || loadingMore) return;
    setLoadingMore(true);
    fetchLinearList(scope, accum.cursor, LN_LIST_PAGE)
      .then((p) => {
        const next: LnAccum = { items: [...accum.items, ...p.items], cursor: p.end_cursor, hasMore: p.has_more };
        CACHE.set(cacheKey, next);
        setAccum(next);
        setLoadingMore(false);
      })
      .catch((e) => { setError(String(e)); setLoadingMore(false); });
  };

  return {
    data: accum?.items ?? null,
    loading,
    loadingMore,
    error,
    hasMore: accum?.hasMore ?? false,
    loadMore,
  };
}
