import { useStore } from "@xyflow/react";

export function useZoomCounterScale(): number {
  const zoom = useStore((s) => s.transform[2]);
  return Math.max(1, 1 / zoom);
}
