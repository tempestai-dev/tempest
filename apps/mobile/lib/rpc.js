// Mobile RPC client — dial the tunnel with role=phone, run RpcPeer over the
// paired session key, auto-reconnect with backoff while the pairing is live.

import { RpcPeer, wsChannel, makeBackoff } from '@tempest/transport';
import { b64 } from '@tempest/crypto';
import { takeWarmSocket } from './warmSocket';

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
    console.log(`[rpc/mobile] dial sid=${sessionId.slice(0, 8)}`);

    // Reuse the pairing WS if it was handed off — same socket the desktop
    // bridge is talking to, no reconnect race, no CF-tunnel edge propagation
    // wait, no first-frame drop. Cold path (reconnect / no handoff) dials fresh.
    const warm = takeWarmSocket(sessionId);
    if (warm) {
      console.log(`[rpc/mobile] warm socket taken readyState=${warm.readyState}`);
      ws = warm;
    } else {
      const url = `${relayUrl}?session=${encodeURIComponent(sessionId)}&role=phone`;
      console.log(`[rpc/mobile] cold dial ${url}`);
      try {
        ws = new WebSocket(url);
      } catch (e) {
        console.log(`[rpc/mobile] WebSocket ctor threw`, e?.message || e);
        scheduleReconnect();
        return;
      }
    }

    // Every inbound frame — pong, relay control, or E2EE payload — resets
    // the stall deadline. RpcPeer's own message handler is attached below,
    // but this listener runs alongside and only observes.
    const onAnyMessage = () => { armStallTimer(); };
    ws.addEventListener('message', onAnyMessage);

    const setupOpen = () => {
      console.log(`[rpc/mobile] ws open, wiring peer`);
      backoff.reset();
      peer = new RpcPeer(wsChannel(ws), sessionKey);
      // Re-attach every listener the caller registered.
      let attached = 0;
      for (const [event, set] of listeners) {
        for (const fn of set) { peer.on(event, fn); attached++; }
      }
      console.log(`[rpc/mobile] peer ready, re-attached ${attached} listeners`);
      emitState('open');
      armStallTimer();
      pingTimer = setInterval(() => {
        try { ws?.send('__ping'); } catch {}
      }, PING_MS);
    };
    ws.onerror = (e) => { console.log(`[rpc/mobile] ws error`, e?.message || e); };
    ws.onclose = (e) => {
      console.log(`[rpc/mobile] ws close code=${e?.code} reason=${e?.reason}`);
      clearTimers();
      try { ws?.removeEventListener('message', onAnyMessage); } catch {}
      peer = null;
      ws = null;
      emitState('closed');
      scheduleReconnect();
    };

    if (ws.readyState === 1 /* OPEN */) setupOpen();
    else ws.onopen = setupOpen;
  };

  const scheduleReconnect = () => {
    if (disposed) return;
    const delay = backoff.next();
    reconnectTimer = setTimeout(dial, delay);
  };

  // Per-method timeouts. session.hop awaits create_pty_session on the desktop —
  // DB isolation clone + sandbox setup + agent spawn can push past 30s on a
  // cold cache. session.open is the same code path. agent.send is fire-and-
  // forget but the write_to_pty invoke it does can lag under load. Everything
  // else is a straight in-memory lookup — 30s is a shouting-loud upper bound.
  const TIMEOUT_MS = { 'session.hop': 90_000, 'session.open': 90_000, 'agent.send': 60_000 };
  const DEFAULT_TIMEOUT_MS = 30_000;

  // 3s window for peer to come up after startRpcClient returns. Effects fire
  // right after mount and can beat the WS open; without this, the first
  // request after cold pair reliably lost the race and threw rpc_not_connected.
  const CONNECT_WAIT_MS = 3_000;
  const waitForPeer = () => new Promise((resolve, reject) => {
    if (peer) return resolve();
    const start = Date.now();
    const iv = setInterval(() => {
      if (peer) { clearInterval(iv); resolve(); }
      else if (disposed) { clearInterval(iv); reject(new Error('rpc_disposed')); }
      else if (Date.now() - start > CONNECT_WAIT_MS) { clearInterval(iv); reject(new Error('rpc_not_connected')); }
    }, 50);
  });

  const request = async (method, params) => {
    if (!peer) { console.log(`[rpc/mobile] request(${method}) waiting for peer`); await waitForPeer(); }
    console.log(`[rpc/mobile] → ${method}`, params && Object.keys(params).length ? params : '');
    let timer;
    const timeoutMs = TIMEOUT_MS[method] ?? DEFAULT_TIMEOUT_MS;
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`rpc_timeout:${method}`)), timeoutMs);
    });
    return Promise.race([peer.request(method, params), timeout])
      .then((r) => { console.log(`[rpc/mobile] ← ${method} ok`); return r; })
      .catch((e) => { console.log(`[rpc/mobile] ← ${method} err`, e?.message); throw e; })
      .finally(() => clearTimeout(timer));
  };

  const on = (event, handler) => {
    let set = listeners.get(event);
    if (!set) { set = new Set(); listeners.set(event, set); }
    set.add(handler);
    let detach = peer?.on(event, handler);
    console.log(`[rpc/mobile] on(${event}) peer=${!!peer} total=${set.size}`);
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
