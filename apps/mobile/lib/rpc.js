// Mobile RPC client — dial the tunnel with role=phone, run RpcPeer over the
// paired session key, auto-reconnect with backoff while the pairing is live.

import { RpcPeer, wsChannel, makeBackoff } from '@tempest/transport';
import { b64 } from '@tempest/crypto';

/**
 * Start a self-reconnecting RPC client for a paired desktop.
 *
 * @param {object} opts
 * @param {string} opts.relayUrl  wss://<name>.trycloudflare.com/ws
 * @param {string} opts.sessionId
 * @param {string} opts.sessionKeyB64
 * @param {(state: 'connecting'|'open'|'closed') => void} [opts.onState]
 * @returns {{ request: Function, on: Function, close: () => void, isOpen: () => boolean }}
 */
export function startRpcClient({ relayUrl, sessionId, sessionKeyB64, onState }) {
  const sessionKey = b64.dec(sessionKeyB64);
  const backoff = makeBackoff();
  const listeners = new Map(); // event -> Set<handler>
  let peer = null;
  let ws = null;
  let disposed = false;
  let reconnectTimer = null;

  // CF quick tunnels drop idle client sockets in ~100s. Send `__ping` every
  // 25s and force-close the socket if we hear nothing for 60s — that trips
  // the existing reconnect path, so the UI comes back on its own.
  // ponytail: app-level ping since RN's WebSocket doesn't expose ws.ping().
  const PING_MS = 25_000;
  const STALL_MS = 60_000;
  let pingTimer = null;
  let stallTimer = null;

  const emitState = (s) => { try { onState?.(s); } catch {} };

  const armStallTimer = () => {
    if (stallTimer) clearTimeout(stallTimer);
    stallTimer = setTimeout(() => {
      // Nothing heard in STALL_MS — the socket is likely a zombie behind a
      // dropped CF edge. Close it; onclose triggers reconnect.
      try { ws?.close(); } catch {}
    }, STALL_MS);
  };

  const clearTimers = () => {
    if (pingTimer) { clearInterval(pingTimer); pingTimer = null; }
    if (stallTimer) { clearTimeout(stallTimer); stallTimer = null; }
  };

  const dial = () => {
    if (disposed) return;
    emitState('connecting');
    const url = `${relayUrl}?session=${encodeURIComponent(sessionId)}&role=phone`;
    try {
      ws = new WebSocket(url);
    } catch {
      scheduleReconnect();
      return;
    }

    // Every inbound frame — pong, relay control, or E2EE payload — resets
    // the stall deadline. RpcPeer's own message handler is attached below,
    // but this listener runs alongside and only observes.
    const onAnyMessage = () => { armStallTimer(); };
    ws.addEventListener('message', onAnyMessage);

    ws.onopen = () => {
      backoff.reset();
      peer = new RpcPeer(wsChannel(ws), sessionKey);
      // Re-attach every listener the caller registered.
      for (const [event, set] of listeners) {
        for (const fn of set) peer.on(event, fn);
      }
      emitState('open');
      armStallTimer();
      pingTimer = setInterval(() => {
        try { ws?.send('__ping'); } catch {}
      }, PING_MS);
    };
    ws.onerror = () => { /* handled by onclose */ };
    ws.onclose = () => {
      clearTimers();
      try { ws?.removeEventListener('message', onAnyMessage); } catch {}
      peer = null;
      ws = null;
      emitState('closed');
      scheduleReconnect();
    };
  };

  const scheduleReconnect = () => {
    if (disposed) return;
    const delay = backoff.next();
    reconnectTimer = setTimeout(dial, delay);
  };

  const request = (method, params) => {
    if (!peer) return Promise.reject(new Error('rpc_not_connected'));
    return peer.request(method, params);
  };

  const on = (event, handler) => {
    let set = listeners.get(event);
    if (!set) { set = new Set(); listeners.set(event, set); }
    set.add(handler);
    let detach = peer?.on(event, handler);
    return () => {
      set.delete(handler);
      detach?.();
    };
  };

  const close = () => {
    disposed = true;
    if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
    clearTimers();
    peer?.close();
    peer = null;
    try { ws?.close(); } catch {}
    ws = null;
  };

  dial();

  return {
    request,
    on,
    close,
    isOpen: () => !!peer,
  };
}
