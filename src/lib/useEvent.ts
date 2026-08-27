import { useCallback, useLayoutEffect, useRef } from "react";

// Stable-identity callback that always calls the latest closure.
// Same behavior as React's forthcoming useEvent RFC — lets memoized
// children skip re-renders even when the parent recreates its handlers.
export function useEvent<A extends unknown[], R>(fn: (...args: A) => R): (...args: A) => R {
  const ref = useRef(fn);
  useLayoutEffect(() => { ref.current = fn; });
  return useCallback((...args: A) => ref.current(...args), []);
}
