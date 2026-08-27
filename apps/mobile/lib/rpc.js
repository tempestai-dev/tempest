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

  const emitState = (s) => { try { onState?.(s); } catch {} };

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

    ws.onopen = () => {
      backoff.reset();
      peer = new RpcPeer(wsChannel(ws), sessionKey);
      // Re-attach every listener the caller registered.
      for (const [event, set] of listeners) {
        for (const fn of set) peer.on(event, fn);
      }
      emitState('open');
    };
    ws.onerror = () => { /* handled by onclose */ };
    ws.onclose = () => {
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
