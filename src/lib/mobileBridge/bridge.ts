// Attach a paired mobile RPC peer to the live desktop stores. Read-only
// handlers land here in Phase 2 — writes (session.open/close/hop, queue.*,
// agent.*, permission.decide) join in Task #9, push events in Task #10.

import { invoke } from "@tauri-apps/api/core";
import { RpcPeer, wsChannel } from "@tempest/transport";
import { projectListSnapshot, projectSession, projectQueue } from "./projectors";
import { subscribeSessionLifecycle, markSessionClosed } from "../../store/sessions";
import {
  subscribeAllQueueChanges,
  enqueue, removeFromQueue, clearQueue, reorderQueue,
} from "../../store/messageQueue";
import { subscribeAllWorkStateChanges, clearWorkState } from "../../store/workState";

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

  // ponytail: session.open / session.hop / agent.* require WorkspaceView-
  // scoped openSession() to also refresh the desktop tab layout. Deferred to
  // a follow-up that lifts openSession into a callable API; for now the
  // mobile side gets a clear error instead of a half-open session.
  const notImpl = (m: string) => async () => { throw new Error(`not_implemented:${m}`); };
  peer.handle("session.open", notImpl("session.open"));
  peer.handle("session.hop", notImpl("session.hop"));
  peer.handle("agent.send", notImpl("agent.send"));
  peer.handle("agent.interrupt", notImpl("agent.interrupt"));
  peer.handle("agent.stop", notImpl("agent.stop"));
  peer.handle("permission.decide", notImpl("permission.decide"));

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
        if (summary) peer.emit("session.updated", summary);
        else peer.emit("session.removed", { id });
      }
    });
  };

  const unLifecycle = subscribeSessionLifecycle((e) => {
    if (e.kind === "removed") {
      peer.emit("session.removed", { id: e.id });
      dirty.delete(e.id);
      return;
    }
    dirty.add(e.id);
    scheduleFlush();
  });
  const unWork = subscribeAllWorkStateChanges((id) => { dirty.add(id); scheduleFlush(); });
  const unQueue = subscribeAllQueueChanges((sessionId) => {
    peer.emit("queue.changed", { sessionId, queue: projectQueue(sessionId) });
    // Queue length affects the SessionSummary — schedule that too.
    dirty.add(sessionId);
    scheduleFlush();
  });

  return {
    peer,
    close() {
      unLifecycle(); unWork(); unQueue();
      peer.close();
    },
  };
}
