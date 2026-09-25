// Lifecycle-guarded orchestration for terminal focus/restore work (issue #28).
// TerminalPane.tsx wires real DOM/xterm/IPC here; the self-check suite drives
// the same controller with fakes, so scheduling, IPC and repaint decisions are
// covered beyond pure-policy assertions. One controller instance lives exactly
// as long as one terminal mount: dispose() cancels every queued frame and
// neuters every later callback, so stale restores can never run against a
// remounted session.
import { shouldFullRefresh, shouldSendResize, type PtyDims } from "./terminalFocusPolicy.ts";

export interface RestoreFrameScheduler {
  requestFrame(fn: () => void): number;
  cancelFrame(id: number): void;
}

export interface RestoreControllerDeps {
  /** Measure + reflow; null when the pane is not visible. */
  fit: () => PtyDims | null;
  /** Backend resize. May reject; only the matching cached request is invalidated. */
  sendResize: (dims: PtyDims) => unknown;
  /** Full repaint of all visible rows. */
  refreshAll: () => void;
  /** Re-acquire GPU rendering. Idempotent; recreates the addon after context
   * loss, and xterm repaints on activation (RenderService.setRenderer ends in
   * _fullRefresh), so no manual refresh is needed for reacquisition itself. */
  acquireRenderer: () => void;
  /** True while an external driver owns PTY dims. */
  isControlled: () => boolean;
  frames: RestoreFrameScheduler;
}

export interface RestoreController {
  /** Immediate fit + conditional backend resize (settings, takeback paths). */
  fitNow(): void;
  /** Single-frame fit, coalesced while one is already queued. */
  scheduleFit(): void;
  /** Double-frame fit for restore paths (yields to layout, then reads it). */
  scheduleRestoreFit(): void;
  /** Window refocus: always re-acquire, coalesced fit, repaint only if hidden. */
  restoreOnFocus(): void;
  /** Pane unhidden: re-acquire plus coalesced fit (no repaint; rows kept). */
  restoreOnShow(): void;
  /** Latches hidden state. Deliberately one-way: a visible event must never
   * clear it before focus consumes the pending recovery. */
  noteVisibility(hidden: boolean): void;
  /** Mobile driver took over: force the next desktop fit to reassert dims. */
  controlAcquired(): void;
  /** Terminal font finished loading. Any earlier fit may have measured cell
   * width against the fallback font (too few cols → gap on the right); clear
   * the cache and schedule a corrective fit that will send regardless of the
   * previously "sent" dims. */
  notifyFontReady(): void;
  /** Cancel all queued frames; every later call and callback becomes a no-op. */
  dispose(): void;
}

export function createRestoreController(deps: RestoreControllerDeps): RestoreController {
  let lastSent: PtyDims | null = null;
  let fitPending = false;
  // Only pending frames are retained: each id is dropped as its callback
  // fires, so cancellation touches live callbacks and the set cannot grow
  // across the mount's lifetime.
  const pendingFrames = new Set<number>();
  let disposed = false;
  // Latched while the page is hidden; consumed once by the next focus that
  // schedules recovery. A visible event arriving first must not clear it.
  let wasHidden = false;

  function queueFrame(fn: () => void): void {
    if (disposed) return;
    const id = deps.frames.requestFrame(() => {
      pendingFrames.delete(id);
      if (disposed) return;
      fn();
    });
    pendingFrames.add(id);
  }

  function queueDoubleFrame(fn: () => void): void {
    queueFrame(() => queueFrame(fn));
  }

  function sendResize(dims: PtyDims): void {
    const sent = { ...dims };
    lastSent = sent;
    Promise.resolve(deps.sendResize(dims)).catch(() => {
      // Invalidate only the matching request: a newer fit may already have
      // updated the cache, and must not be clobbered by this stale failure.
      if (lastSent === sent) lastSent = null;
    });
  }

  function fitNow(): void {
    if (disposed) return;
    const dims = deps.fit();
    if (dims === null) return;
    if (deps.isControlled()) {
      lastSent = null;
      return;
    }
    if (!shouldSendResize(lastSent, dims, false)) return;
    sendResize(dims);
  }

  function scheduleFit(): void {
    if (disposed || fitPending) return;
    fitPending = true;
    queueFrame(() => {
      fitPending = false;
      fitNow();
    });
  }

  function scheduleRestoreFit(): void {
    if (disposed || fitPending) return;
    fitPending = true;
    queueDoubleFrame(() => {
      fitPending = false;
      fitNow();
    });
  }

  return {
    fitNow,
    scheduleFit,
    scheduleRestoreFit,
    restoreOnFocus(): void {
      if (disposed) return;
      deps.acquireRenderer();
      scheduleRestoreFit();
      if (shouldFullRefresh(wasHidden)) {
        // Refresh in its own frame chain so it lands after the reflow.
        queueDoubleFrame(() => deps.refreshAll());
      }
      wasHidden = false;
    },
    restoreOnShow(): void {
      if (disposed) return;
      deps.acquireRenderer();
      scheduleRestoreFit();
    },
    noteVisibility(hidden: boolean): void {
      if (disposed) return;
      if (hidden) wasHidden = true;
    },
    controlAcquired(): void {
      if (disposed) return;
      lastSent = null;
    },
    notifyFontReady(): void {
      if (disposed) return;
      lastSent = null;
      scheduleFit();
    },
    dispose(): void {
      disposed = true;
      fitPending = false;
      for (const id of pendingFrames) {
        try {
          deps.frames.cancelFrame(id);
        } catch {
          // Ignore — a fake scheduler in checks may throw on unknown ids.
        }
      }
      pendingFrames.clear();
    },
  };
}
