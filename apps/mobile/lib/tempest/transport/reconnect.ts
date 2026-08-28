export interface Backoff {
  next(): number;
  reset(): void;
}

export function makeBackoff({
  baseMs = 500,
  maxMs = 30_000,
  jitter = 0.25,
}: { baseMs?: number; maxMs?: number; jitter?: number } = {}): Backoff {
  let attempt = 0;
  return {
    next() {
      const exp = Math.min(maxMs, baseMs * 2 ** attempt++);
      const jitterMs = exp * jitter * (Math.random() * 2 - 1);
      return Math.max(0, Math.round(exp + jitterMs));
    },
    reset() { attempt = 0; },
  };
}
