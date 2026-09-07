// Attach a paired mobile RPC peer to the live desktop stores. Read-only
// handlers land here in Phase 2 — writes (session.open/close/hop, queue.*,
// agent.*, permission.decide) join in Task #9, push events in Task #10.

// Bump DESKTOP_PROTOCOL_VERSION for any BREAKING wire change (removed method,
// changed field semantics, new framing). Bump MIN_COMPATIBLE_MOBILE_VERSION
// when a mobile client below that number can no longer function safely.
// Mobile app lags via App Store review, so a bump here forces users to update.
export const DESKTOP_PROTOCOL_VERSION = 1;
export const MIN_COMPATIBLE_MOBILE_VERSION = 1;

import { invoke } from "@tauri-apps/api/core";
import { RpcPeer, wsChannel } from "@tempest/transport";
import { projectListSnapshot, projectSession, projectQueue, projectListOrdered } from "./projectors";
import { subscribeSessionLifecycle, markSessionClosed } from "../../store/sessions";
import { subscribeProjects } from "../../store/openProjects";
import { subscribeWorktrees } from "../../store/worktrees";
import {
  subscribeAllQueueChanges,
  enqueue, dequeue, removeFromQueue, clearQueue, reorderQueue,
} from "../../store/messageQueue";
import { subscribeAllWorkStateChanges, clearWorkState, getWorkState } from "../../store/workState";
import { getWorkspaceApi } from "./workspaceApi";
import { sessionManager } from "../../store/sessionManager";
import { addController, removeController, onTakeBack } from "../../store/mobileControlledSessions";

export interface AttachedBridge {
  peer: RpcPeer;
  close(): void;
}

/**
 * Wire an already-open WebSocket + derived session key to the desktop's
 * agent-protocol handlers. Returns the peer + a close() that tears both
 * halves down.
 */
export function attachBridge(ws: WebSocket, sessionKey: Uint8Array): AttachedBridge {
  const channel = wsChannel(ws);
  const peer = new RpcPeer(channel, sessionKey);

  // First RPC after connect. Rejects the handshake if either side is below
  // the other's minimum — the mobile client renders a ProtocolBlock screen
  // on the error, so an incompatible pair fails loudly instead of drifting.
  peer.handle("protocol.hello", async ({ mobile, minCompatibleDesktop }) => {
    if (DESKTOP_PROTOCOL_VERSION < minCompatibleDesktop) {
      throw new Error(`desktop_too_old:${DESKTOP_PROTOCOL_VERSION}<${minCompatibleDesktop}`);
    }
    if (mobile < MIN_COMPATIBLE_MOBILE_VERSION) {
      throw new Error(`mobile_too_old:${mobile}<${MIN_COMPATIBLE_MOBILE_VERSION}`);
    }
    return { desktop: DESKTOP_PROTOCOL_VERSION, minCompatibleMobile: MIN_COMPATIBLE_MOBILE_VERSION };
  });

  peer.handle("session.list", async () => projectListSnapshot());

  peer.handle("session.get", async ({ id }) => {
    const s = projectSession(id);
    if (!s) throw new Error(`unknown session ${id}`);
    return s;
  });

  peer.handle("queue.list", async ({ sessionId }) => projectQueue(sessionId));

  // ── Writes ──────────────────────────────────────────────────────────
  peer.handle("queue.enqueue", async ({ sessionId, text }) => { enqueue(sessionId, text); });
  peer.handle("queue.remove", async ({ sessionId, itemId }) => { removeFromQueue(sessionId, itemId); });
  peer.handle("queue.clear", async ({ sessionId }) => { clearQueue(sessionId); });
  peer.handle("queue.reorder", async ({ sessionId, itemId, toIndex }) => { reorderQueue(sessionId, itemId, toIndex); });

  peer.handle("session.close", async ({ id }) => {
    // Tear down the PTY on the Rust side; the tab UI reacts via its own
    // session-done channel. markSessionClosed writes the ghost row + fires
    // our lifecycle emitter so the mobile side sees the update.
    await invoke("close_pty_session", { sessionId: id }).catch(() => {});
    markSessionClosed(id);
    clearWorkState(id);
  });

  // Session lifecycle writes reach WorkspaceView through a module-level ref
  // it publishes on mount (see workspaceApi.ts). A phone that connects before
  // WorkspaceView mounts gets a clean `desktop_not_ready` error.
  peer.handle("session.open", async (input) => getWorkspaceApi().openSession(input));
  peer.handle("session.hop", async ({ id }) => {
    console.log(`[bridge] session.hop enter id=${id.slice(0, 8)}`);
    try { await getWorkspaceApi().hopSession(id); console.log(`[bridge] session.hop ok id=${id.slice(0, 8)}`); }
    catch (e) { console.error(`[bridge] session.hop err id=${id.slice(0, 8)}`, e); throw e; }
  });

  // agent.send mirrors the desktop QueuePanel Send button. Reply is
  // fire-and-forget: enqueue synchronously, kick the drain in the background
  // if the session is idle, and return immediately. The actual PTY write and
  // its follow-up UI signal reach the phone via the existing push channels
  // (queue.changed → session.updated, then agent.output). Awaiting the write
  // here is what wedged the RPC on a lost/slow tunnel reply and tripped the
  // 30s client timeout.
  const kickDrain = (sessionId: string) => {
    if (getWorkState(sessionId) === "working") return;
    const item = dequeue(sessionId);
    if (!item) return;
    const bytes = Array.from(new TextEncoder().encode(item.text + "\r"));
    invoke("write_to_pty", { sessionId, data: bytes })
      .catch((e) => console.error(`[bridge] agent.send write_to_pty failed sid=${sessionId.slice(0, 8)}`, e));
    try { sessionManager.markUserInput(sessionId); }
    catch (e) { console.error(`[bridge] agent.send markUserInput failed sid=${sessionId.slice(0, 8)}`, e); }
  };
  peer.handle("agent.send", async ({ sessionId, text }) => {
    console.log(`[bridge] agent.send sid=${sessionId.slice(0, 8)} text=${JSON.stringify(text.slice(0, 60))} workState=${getWorkState(sessionId)} sm_has=${sessionManager.has(sessionId)}`);
    enqueue(sessionId, text);
    // queueMicrotask so the queue.changed emit for the enqueue lands on the
    // phone before any status flip from the dequeue below.
    queueMicrotask(() => kickDrain(sessionId));
  });
  // Interrupt = Ctrl-C into the PTY. Session stays alive; the agent cancels
  // its current generation. Queue is left intact so the next drain resumes it.
  // Fire-and-forget for the same reason as agent.send — a lost tunnel reply
  // must never wedge the mobile Interrupt button.
  peer.handle("agent.interrupt", async ({ sessionId }) => {
    invoke("write_to_pty", { sessionId, data: [0x03] })
      .catch((e) => console.error(`[bridge] agent.interrupt failed sid=${sessionId.slice(0, 8)}`, e));
  });
  // Stop = hard tear-down; same code path as session.close.
  peer.handle("agent.stop", async ({ sessionId }) => {
    getWorkspaceApi().closeSession(sessionId);
  });

  // Terminal streaming — one active subscription per (peer, sessionId). The
  // subscribe reply carries the current replay buffer so xterm on the phone
  // catches up before live chunks arrive. Unsubscribe on request AND on peer
  // close; otherwise sessionManager would keep forwarding into a dead socket.
  const streamOff = new Map<string, () => void>();
  // Sessions this peer holds a mobile-controller ref for. Kept in sync with
  // the global store so peer close correctly decrements each ref.
  const controlled = new Set<string>();
  // Desktop take-back the user just fired. Mobile resize pushes on these are
  // rejected until this peer resubscribes.
  const yielded = new Set<string>();
  const detachStream = (sessionId: string) => {
    const off = streamOff.get(sessionId);
    if (off) { off(); streamOff.delete(sessionId); }
    if (controlled.delete(sessionId)) removeController(sessionId);
  };
  peer.handle("agent.subscribe", async ({ sessionId }) => {
    detachStream(sessionId);
    yielded.delete(sessionId);
    let count = 0;
    const listener = (chunk: string) => {
      count++;
      console.log(`[bridge] agent.output → phone sid=${sessionId.slice(0, 8)} #${count} bytes=${chunk.length} first=${JSON.stringify(chunk.slice(0, 40))}`);
      peer.emit("agent.output", { sessionId, chunk });
    };
    const replay = sessionManager.attach(sessionId, listener);
    streamOff.set(sessionId, () => sessionManager.detach(sessionId, listener));
    controlled.add(sessionId);
    addController(sessionId);
    const replayBytes = replay.reduce((n, s) => n + s.length, 0);
    console.log(`[bridge] agent.subscribe sid=${sessionId.slice(0, 8)} replay_chunks=${replay.length} replay_bytes=${replayBytes} sm_has=${sessionManager.has(sessionId)}`);
    return { replay };
  });
  peer.handle("agent.unsubscribe", async ({ sessionId }) => { detachStream(sessionId); });

  peer.handle("agent.resize", async ({ sessionId, cols, rows }) => {
    if (!Number.isInteger(cols) || !Number.isInteger(rows) || cols < 1 || rows < 1) return;
    // Desktop reclaimed this session — ignore further phone-driven resizes
    // until the peer resubscribes.
    if (yielded.has(sessionId)) return;
    await invoke("resize_pty", { sessionId, cols, rows }).catch((e) =>
      console.error(`[bridge] agent.resize failed sid=${sessionId.slice(0, 8)}`, e));
  });

  // Desktop pressed "Take back". Every peer that holds this session gets a
  // controllerYielded push and a poisoned resize gate. The store already
  // zero'd the ref-count so we just drop our own ref without decrementing.
  const unTakeBack = onTakeBack((sessionId) => {
    if (!controlled.has(sessionId)) return;
    controlled.delete(sessionId);
    yielded.add(sessionId);
    peer.emit("session.controllerYielded", { sessionId });
  });

  // ponytail: permission.decide waits on Phase 4 (agent-hook approve/deny
  // plumbing lands with Expo Push). Until then, mobile gets a clean error.
  peer.handle("permission.decide", async () => { throw new Error("not_implemented:permission.decide"); });

  // Placeholder permission list — real source lands when agentHooks state
  // gets a queryable index (Phase 4).
  peer.handle("permission.list", async () => []);

  // ── Server-push subscriptions ────────────────────────────────────────
  // Coalesce rapid updates per session in a microtask so a burst of
  // workState + queue mutations pushes one frame per session, not five.
  const dirty = new Set<string>();
  let flushing = false;
  const scheduleFlush = () => {
    if (flushing) return;
    flushing = true;
    queueMicrotask(() => {
      flushing = false;
      const ids = [...dirty];
      dirty.clear();
      for (const id of ids) {
        const summary = projectSession(id);
        if (summary) {
          console.log(`[bridge] emit session.updated id=${id.slice(0, 8)} status=${summary.status} closed=${summary.closed}`);
          peer.emit("session.updated", summary);
        } else {
          console.log(`[bridge] emit session.removed id=${id.slice(0, 8)} (projector null)`);
          peer.emit("session.removed", { id });
        }
      }
    });
  };

  const unLifecycle = subscribeSessionLifecycle((e) => {
    console.log(`[bridge] session lifecycle ${e.kind} id=${e.id.slice(0, 8)}`);
    if (e.kind === "removed") {
      peer.emit("session.removed", { id: e.id });
      dirty.delete(e.id);
      return;
    }
    dirty.add(e.id);
    scheduleFlush();
  });
  const unWork = subscribeAllWorkStateChanges((id) => {
    dirty.add(id); scheduleFlush();
    // Agent just went idle/done → drain anything mobile enqueued while it was
    // working. Mirrors WorkspaceView.onWorkDone, but for items added by the
    // mobile peer between turns.
    if (getWorkState(id) !== "working") kickDrain(id);
  });
  const unQueue = subscribeAllQueueChanges((sessionId) => {
    peer.emit("queue.changed", { sessionId, queue: projectQueue(sessionId) });
    // Queue length affects the SessionSummary — schedule that too.
    dirty.add(sessionId);
    scheduleFlush();
  });
  const unProjects = subscribeProjects(() => {
    peer.emit("projects.changed", { projects: projectListOrdered() });
  });
  // Fire the same event when disk-scanned worktrees or the isGit hint change.
  // Same shape, same wire event — mobile refreshes the whole project list.
  const unWorktrees = subscribeWorktrees(() => {
    peer.emit("projects.changed", { projects: projectListOrdered() });
  });

  return {
    peer,
    close() {
      unLifecycle(); unWork(); unQueue(); unProjects(); unWorktrees();
      unTakeBack();
      for (const off of streamOff.values()) off();
      streamOff.clear();
      for (const sid of controlled) removeController(sid);
      controlled.clear();
      peer.close();
    },
  };
}
