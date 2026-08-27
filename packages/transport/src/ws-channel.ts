// Adapt a browser / RN WebSocket to the RpcChannel interface used by
// RpcPeer. Same class works on both platforms because both expose the
// standard WebSocket API.

import type { RpcChannel } from "./rpc";

export interface WsLike {
  send(data: string): void;
  close(code?: number, reason?: string): void;
  addEventListener(type: "message", handler: (ev: { data: unknown }) => void): void;
  addEventListener(type: "close", handler: () => void): void;
  removeEventListener(type: "message", handler: (ev: { data: unknown }) => void): void;
  removeEventListener(type: "close", handler: () => void): void;
}

export function wsChannel(ws: WsLike): RpcChannel {
  return {
    send(raw) { ws.send(raw); },
    close() { try { ws.close(); } catch { /* already dead */ } },
    onMessage(handler) {
      const listener = (ev: { data: unknown }) => {
        const raw = typeof ev.data === "string" ? ev.data : String(ev.data);
        handler(raw);
      };
      ws.addEventListener("message", listener);
      return () => ws.removeEventListener("message", listener);
    },
    onClose(handler) {
      ws.addEventListener("close", handler);
      return () => ws.removeEventListener("close", handler);
    },
  };
}
