// Handoff cache for a WebSocket opened during pairing that will be reused
// as the phone-role RPC channel. Skips a reconnect (and the Cloudflare
// quick-tunnel edge-propagation race that reconnect used to hit) right
// after pair. Symmetric with the desktop's keepAliveOnPair on the laptop side.
//
// ponytail: 30s hard TTL — if Connected never mounts (crash / user backs
// out), the socket auto-closes instead of leaking until CF's 100s idle drop.

const AUTO_CLOSE_MS = 30_000;

let warm = null;
let closeTimer = null;

const clear = () => {
  if (closeTimer) { clearTimeout(closeTimer); closeTimer = null; }
  warm = null;
};

export const setWarmSocket = (sessionId, ws) => {
  if (warm) { try { warm.ws.close(); } catch {} clear(); }
  warm = { sessionId, ws };
  closeTimer = setTimeout(() => {
    if (warm?.ws === ws) { try { ws.close(); } catch {} clear(); }
  }, AUTO_CLOSE_MS);
};

export const takeWarmSocket = (sessionId) => {
  if (!warm || warm.sessionId !== sessionId) return null;
  const ws = warm.ws;
  clear();
  if (ws.readyState !== 1 /* OPEN */) { try { ws.close(); } catch {} return null; }
  return ws;
};
