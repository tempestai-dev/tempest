// Tempest pairing relay — Cloudflare Worker + Durable Object.
//
// Two peers (roles: "laptop" / "phone") open WebSockets carrying the same
// `session` query param. Each session is a Durable Object; every frame from
// one role is forwarded verbatim to the other. Payloads are opaque — E2EE is
// layered on top so the relay never sees plaintext.
//
// Uses the WebSocket Hibernation API: idle sessions cost near-zero DO
// duration because the runtime evicts our JS state between messages and
// restores it on the next event.

const attach = (ws, role) => ws.serializeAttachment({ role });
const roleOf = (ws) => ws.deserializeAttachment()?.role;
const peerRoleOf = (r) => (r === 'laptop' ? 'phone' : 'laptop');

const send = (ws, data) => { try { ws.send(data); } catch {} };

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === '/health') return new Response('ok');

    if (url.pathname !== '/ws') return new Response('not found', { status: 404 });

    const sessionId = url.searchParams.get('session');
    const role = url.searchParams.get('role');
    if (!sessionId || (role !== 'laptop' && role !== 'phone')) {
      return new Response('missing session or role', { status: 400 });
    }
    if (request.headers.get('Upgrade') !== 'websocket') {
      return new Response('expected websocket', { status: 426 });
    }

    const id = env.SESSION.idFromName(sessionId);
    return env.SESSION.get(id).fetch(request);
  },
};

export class Session {
  constructor(state, env) {
    this.state = state;
  }

  peers() {
    // Reconstruct role → ws map from whatever the runtime restored after
    // hibernation. Cheap: usually 0-2 sockets per DO.
    const out = new Map();
    for (const ws of this.state.getWebSockets()) {
      const r = roleOf(ws);
      if (r) out.set(r, ws);
    }
    return out;
  }

  async fetch(request) {
    const url = new URL(request.url);
    const role = url.searchParams.get('role');

    const pair = new WebSocketPair();
    const [client, server] = [pair[0], pair[1]];

    // Evict any existing socket for the same role (reconnect race).
    const before = this.peers();
    const existing = before.get(role);
    if (existing) { try { existing.close(4409, 'replaced'); } catch {} }

    this.state.acceptWebSocket(server);
    attach(server, role);

    const peer = before.get(peerRoleOf(role));
    send(peer, JSON.stringify({ __relay: 'peer_connected', role }));
    send(server, JSON.stringify({ __relay: 'attached', role, peer_present: !!peer }));

    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws, data) {
    const role = roleOf(ws);
    if (!role) return;
    const peer = this.peers().get(peerRoleOf(role));
    if (peer) send(peer, data);
  }

  async webSocketClose(ws) {
    const role = roleOf(ws);
    if (!role) return;
    // Runtime removes ws from getWebSockets() by the time this fires, so
    // peers() sees only the survivor.
    const peer = this.peers().get(peerRoleOf(role));
    send(peer, JSON.stringify({ __relay: 'peer_disconnected', role }));
  }

  async webSocketError(ws) {
    return this.webSocketClose(ws);
  }
}
