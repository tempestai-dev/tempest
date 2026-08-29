// Attach a paired mobile RPC peer to the live desktop stores. Read-only
// handlers land here in Phase 2 — writes (session.open/close/hop, queue.*,
// agent.*, permission.decide) join in Task #9, push events in Task #10.

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

  // Session lifecycle writes reach WorkspaceView through a module-level ref
  // it publishes on mount (see workspaceApi.ts). A phone that connects before
  // WorkspaceView mounts gets a clean `desktop_not_ready` error.
  peer.handle("session.open", async (input) => getWorkspaceApi().openSession(input));
  peer.handle("session.hop", async ({ id }) => { await getWorkspaceApi().hopSession(id); });

  // agent.send mirrors the desktop QueuePanel Send button: enqueue, then if
  // the session is idle, pop the head and write it to the PTY so the drain
  // starts now instead of waiting for the next work-done. If the session is
  // still working, we just enqueue — the existing dequeue hook picks it up.
  const writePtyLine = (sessionId: string, text: string) => {
    const bytes = Array.from(new TextEncoder().encode(text + "\r"));
    return invoke("write_to_pty", { sessionId, data: bytes });
  };
  peer.handle("agent.send", async ({ sessionId, text }) => {
    enqueue(sessionId, text);
    if (getWorkState(sessionId) !== "working") {
      const item = dequeue(sessionId);
      if (item) {
        await writePtyLine(sessionId, item.text).catch(() => {});
        sessionManager.markUserInput(sessionId);
      }
    }
  });
  // Interrupt = Ctrl-C into the PTY. Session stays alive; the agent cancels
  // its current generation. Queue is left intact so the next drain resumes it.
  peer.handle("agent.interrupt", async ({ sessionId }) => {
    await invoke("write_to_pty", { sessionId, data: [0x03] }).catch(() => {});
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
  const detachStream = (sessionId: string) => {
    const off = streamOff.get(sessionId);
    if (off) { off(); streamOff.delete(sessionId); }
  };
  peer.handle("agent.subscribe", async ({ sessionId }) => {
    detachStream(sessionId);
    let count = 0;
    const listener = (chunk: string) => {
      count++;
      if (count <= 3 || count % 50 === 0) {
        console.log(`[bridge] agent.output → phone session=${sessionId.slice(0, 8)} chunk#${count} bytes=${chunk.length}`);
      }
      peer.emit("agent.output", { sessionId, chunk });
    };
    const replay = sessionManager.attach(sessionId, listener);
    streamOff.set(sessionId, () => sessionManager.detach(sessionId, listener));
    console.log(`[bridge] agent.subscribe session=${sessionId.slice(0, 8)} replay_chunks=${replay.length}`);
    return { replay };
  });
  peer.handle("agent.unsubscribe", async ({ sessionId }) => { detachStream(sessionId); });

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
  const unWork = subscribeAllWorkStateChanges((id) => { dirty.add(id); scheduleFlush(); });
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
      for (const off of streamOff.values()) off();
      streamOff.clear();
      peer.close();
    },
  };
}
