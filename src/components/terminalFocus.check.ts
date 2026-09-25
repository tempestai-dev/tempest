import assert from "node:assert/strict";
import { createFitScheduler, shouldFullRefresh, shouldSendResize } from "../lib/terminalFocusPolicy.ts";
import { createRestoreController } from "../lib/terminalRestore.ts";

// Ordinary focus with unchanged dims sends nothing: the restore path must not
// pay an IPC round-trip plus PTY resize and shell repaint for zero change.
assert.equal(shouldSendResize({ rows: 24, cols: 80 }, { rows: 24, cols: 80 }, false), false);
// First fit always asserts so the backend learns the size (initial font fit).
assert.equal(shouldSendResize(null, { rows: 24, cols: 80 }, false), true);
// Real resizes still go through on either axis.
assert.equal(shouldSendResize({ rows: 24, cols: 80 }, { rows: 25, cols: 80 }, false), true);
assert.equal(shouldSendResize({ rows: 24, cols: 80 }, { rows: 24, cols: 81 }, false), true);
// While a phone drives the session the backend owns dims: never send, even changed.
assert.equal(shouldSendResize(null, { rows: 24, cols: 80 }, true), false);
assert.equal(shouldSendResize({ rows: 24, cols: 80 }, { rows: 30, cols: 100 }, true), false);

// Restore genuinely needs a repaint only after content may have been dropped.
assert.equal(shouldFullRefresh(true), true, "minimize/tab-switch restore repaints");
assert.equal(shouldFullRefresh(false), false, "ordinary refocus keeps painted rows");

// Restore callbacks coalesce: concurrent focus + unhide + relayout claim one slot.
const scheduler = createFitScheduler();
assert.equal(scheduler.claim(), true, "first claimant schedules");
assert.equal(scheduler.claim(), false, "second claimant coalesces");
assert.equal(scheduler.claim(), false, "third claimant coalesces");
scheduler.release();
assert.equal(scheduler.claim(), true, "next restore window schedules again");
scheduler.release();

// --- Lifecycle/IPC coverage: drive the real controller with fakes. ---

interface Fake {
  dims: { rows: number; cols: number } | null;
  controlled: boolean;
  fits: number;
  sends: Array<{ rows: number; cols: number }>;
  refreshes: number;
  acquires: number;
  rejectNextSend: boolean;
  sendImpl: ((dims: { rows: number; cols: number }) => unknown) | null;
  frames: Array<() => void>;
  cancelled: number[];
  nextId: number;
}

function makeFake(): Fake {
  return {
    dims: { rows: 24, cols: 80 },
    controlled: false,
    fits: 0,
    sends: [],
    refreshes: 0,
    acquires: 0,
    rejectNextSend: false,
    sendImpl: null,
    frames: [],
    cancelled: [],
    nextId: 1,
  };
}

function makeController(fake: Fake) {
  return createRestoreController({
    fit: () => {
      fake.fits++;
      return fake.dims;
    },
    sendResize: (dims) => {
      fake.sends.push({ ...dims });
      if (fake.sendImpl) return fake.sendImpl(dims);
      return fake.rejectNextSend
        ? Promise.reject(new Error("pty gone"))
        : Promise.resolve();
    },
    refreshAll: () => { fake.refreshes++; },
    acquireRenderer: () => { fake.acquires++; },
    isControlled: () => fake.controlled,
    frames: {
      requestFrame: (fn) => {
        fake.frames.push(fn);
        return fake.nextId++;
      },
      cancelFrame: (id) => { fake.cancelled.push(id); },
    },
  });
}

function flush(fake: Fake) {
  const pending = fake.frames.splice(0);
  for (const fn of pending) fn();
  // Unhandled rejections from failed sends must not escape the check run.
  return new Promise((resolve) => setTimeout(resolve, 0));
}

// Ordinary focus, unchanged dims: acquire + one fit, no IPC, no repaint.
{
  const fake = makeFake();
  const controller = makeController(fake);
  controller.restoreOnFocus();
  assert.equal(fake.acquires, 1, "every focus re-acquires (covers context-loss recovery)");
  await flush(fake);
  await flush(fake);
  assert.equal(fake.fits, 1);
  assert.deepEqual(fake.sends, [{ rows: 24, cols: 80 }], "first fit asserts backend size");
  assert.equal(fake.refreshes, 0, "ordinary refocus keeps painted rows");
  // Ten more refocuses with unchanged dims: still exactly one IPC total.
  for (let i = 0; i < 10; i++) {
    controller.restoreOnFocus();
    await flush(fake);
    await flush(fake);
  }
  assert.equal(fake.sends.length, 1, "unchanged dims never re-send");
  assert.equal(fake.refreshes, 0);
}

// Restore after hide: the visible event arriving before focus must NOT clear
// the latched hidden state, or the required repaint is skipped (issue 1).
{
  const fake = makeFake();
  const controller = makeController(fake);
  controller.restoreOnFocus();
  await flush(fake);
  await flush(fake);
  controller.noteVisibility(true);
  controller.noteVisibility(false);
  controller.restoreOnFocus();
  await flush(fake);
  await flush(fake);
  assert.equal(fake.refreshes, 1, "latched hide survives an early visible event");
  controller.restoreOnFocus();
  await flush(fake);
  await flush(fake);
  assert.equal(fake.refreshes, 1, "latch is consumed once by recovery");
}

// Real resize goes through; failed sends invalidate only the matching request.
{
  const fake = makeFake();
  const controller = makeController(fake);
  controller.fitNow();
  assert.equal(fake.sends.length, 1);
  fake.dims = { rows: 30, cols: 80 };
  fake.rejectNextSend = true;
  controller.fitNow();
  assert.equal(fake.sends.length, 2, "changed dims re-send");
  await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
  // Failure invalidated the cache: same dims send again.
  controller.fitNow();
  assert.equal(fake.sends.length, 3, "failed send is retried, not cached as sent");

  // A newer update must survive an older failure (per-request scope).
  fake.rejectNextSend = false;
  fake.dims = { rows: 31, cols: 80 };
  controller.fitNow();
  assert.equal(fake.sends.length, 4);
}

// Deferred failure: resize A stays pending while B succeeds, then A rejects.
// B's cached dimensions must survive the stale failure.
{
  const fake = makeFake();
  const controller = makeController(fake);
  let rejectA!: (reason?: unknown) => void;
  let firstSend = true;
  fake.sendImpl = () => {
    if (firstSend) {
      firstSend = false;
      return new Promise((_, reject) => { rejectA = reject; });
    }
    return Promise.resolve();
  };
  fake.dims = { rows: 24, cols: 80 };
  controller.fitNow();
  assert.equal(fake.sends.length, 1, "resize A dispatched and pending");
  fake.dims = { rows: 30, cols: 80 };
  controller.fitNow();
  assert.equal(fake.sends.length, 2, "resize B dispatched and cached");
  rejectA(new Error("pty gone"));
  await new Promise((resolve) => setTimeout(resolve, 0));
  controller.fitNow();
  assert.equal(fake.sends.length, 2, "stale failure of A must not clobber B");
  fake.dims = { rows: 31, cols: 80 };
  controller.fitNow();
  assert.equal(fake.sends.length, 3, "newer changes still send after the stale failure");
}

// Mobile handoff: acquisition invalidates the cache so takeback reasserts.
{
  const fake = makeFake();
  const controller = makeController(fake);
  controller.fitNow();
  assert.equal(fake.sends.length, 1);
  fake.controlled = true;
  controller.controlAcquired();
  controller.fitNow();
  assert.equal(fake.sends.length, 1, "nothing sent while phone-driven");
  fake.controlled = false;
  controller.fitNow();
  assert.equal(fake.sends.length, 2, "takeback reasserts desktop dims");
}

// Lifecycle: dispose cancels queued frames and neuters later callbacks, so
// old restores can never run against a remounted session.
{
  const fake = makeFake();
  const controller = makeController(fake);
  controller.scheduleRestoreFit();
  controller.restoreOnFocus();
  controller.dispose();
  assert.ok(fake.cancelled.length > 0, "queued frame ids are cancelled");
  await flush(fake);
  await flush(fake);
  assert.equal(fake.fits, 0, "disposed controller never fits");
  assert.equal(fake.refreshes, 0, "disposed controller never repaints");
  assert.equal(fake.sends.length, 0, "disposed controller never sends");
  // A fresh mount is unaffected by the disposed instance.
  const fake2 = makeFake();
  const controller2 = makeController(fake2);
  controller2.restoreOnFocus();
  await flush(fake2);
  await flush(fake2);
  assert.equal(fake2.fits, 1, "remounted session restores normally");
}

// Font-load correction: an early fit that ran before fonts resolved may have
// cached wrong cols (measured against fallback). notifyFontReady must clear
// the cache and force a corrective resize even when dims "match" the cache.
{
  const fake = makeFake();
  const controller = makeController(fake);
  fake.dims = { rows: 24, cols: 60 }; // wrong cols measured against fallback font
  controller.fitNow();
  assert.equal(fake.sends.length, 1, "early fit sends whatever it measures");
  // Font finally resolves — measurement is unchanged in this fake, but the
  // real symptom is xterm now reports the correct dims. The controller must
  // not skip the resend just because the cached dims equal the current dims.
  controller.notifyFontReady();
  await flush(fake);
  await flush(fake);
  assert.equal(fake.sends.length, 2, "font-ready forces a corrective resize past the cache");
}

// Coalescing across sources: focus + show + scheduled fit share one slot.
{
  const fake = makeFake();
  const controller = makeController(fake);
  controller.restoreOnFocus();
  controller.restoreOnShow();
  controller.scheduleRestoreFit();
  await flush(fake);
  await flush(fake);
  assert.equal(fake.fits, 1, "concurrent restore triggers coalesce");
  assert.equal(fake.acquires, 2, "each trigger still re-acquires (idempotent)");
}

console.log("terminalFocus: all checks passed");
