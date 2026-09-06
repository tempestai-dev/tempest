// Bidirectional RPC over an E2EE frame channel. Same class runs on both
// sides — mobile calls request(), desktop calls handle() + emit().

import type {
  RpcMethod, RpcParams, RpcResult,
  ServerEvent, ServerEventPayload,
  WireFrame, RpcRequest, RpcResponse, RpcEvent,
} from "@tempest/core";
import { isRequest, isResponse, isEvent } from "@tempest/core";
import { encryptFrame, decryptFrame } from "./e2ee";

export interface RpcChannel {
  send(raw: string): void;
  onMessage(handler: (raw: string) => void): () => void;
  onClose(handler: () => void): () => void;
  close(): void;
}

export type RequestHandler<M extends RpcMethod> =
  (params: RpcParams[M]) => Promise<RpcResult[M]> | RpcResult[M];

interface Pending {
  resolve: (v: unknown) => void;
  reject: (e: Error) => void;
}

export class RpcPeer {
  private nextId = 1;
  private pending = new Map<string, Pending>();
  private handlers = new Map<RpcMethod, RequestHandler<RpcMethod>>();
  private listeners = new Map<ServerEvent, Set<(p: unknown) => void>>();
  private detachMsg: (() => void) | null = null;
  private detachClose: (() => void) | null = null;
  private closed = false;

  constructor(
    private readonly channel: RpcChannel,
    private readonly sessionKey: Uint8Array,
  ) {
    this.detachMsg = channel.onMessage((raw) => this.onFrame(raw));
    this.detachClose = channel.onClose(() => this.dispose(new Error("channel_closed")));
  }

  request<M extends RpcMethod>(method: M, params: RpcParams[M]): Promise<RpcResult[M]> {
    if (this.closed) return Promise.reject(new Error("rpc_closed"));
    const id = String(this.nextId++);
    const frame: RpcRequest<M> = { id, method, params };
    return new Promise<RpcResult[M]>((resolve, reject) => {
      this.pending.set(id, { resolve: resolve as (v: unknown) => void, reject });
      try {
        this.channel.send(encryptFrame(frame as WireFrame, this.sessionKey));
      } catch (e) {
        this.pending.delete(id);
        reject(e as Error);
      }
    });
  }

  handle<M extends RpcMethod>(method: M, handler: RequestHandler<M>): void {
    this.handlers.set(method, handler as unknown as RequestHandler<RpcMethod>);
  }

  emit<E extends ServerEvent>(event: E, payload: ServerEventPayload[E]): void {
    if (this.closed) { console.log(`[rpc/peer] emit(${event}) DROPPED — closed`); return; }
    const frame: RpcEvent<E> = { event, payload };
    try {
      this.channel.send(encryptFrame(frame as WireFrame, this.sessionKey));
    } catch (e) {
      console.error(`[rpc/peer] emit(${event}) send threw`, e);
    }
  }

  on<E extends ServerEvent>(event: E, handler: (payload: ServerEventPayload[E]) => void): () => void {
    let set = this.listeners.get(event);
    if (!set) { set = new Set(); this.listeners.set(event, set); }
    const wrapped = handler as (p: unknown) => void;
    set.add(wrapped);
    return () => { set!.delete(wrapped); };
  }

  close(): void {
    this.dispose(new Error("closed_by_local"));
    this.channel.close();
  }

  private dispose(err: Error): void {
    if (this.closed) return;
    console.log(`[rpc/peer] dispose reason=${err.message} pending=${this.pending.size} listeners=${this.listeners.size}`);
    this.closed = true;
    this.detachMsg?.(); this.detachMsg = null;
    this.detachClose?.(); this.detachClose = null;
    for (const p of this.pending.values()) p.reject(err);
    this.pending.clear();
  }

  private onFrame(raw: string): void {
    const frame = decryptFrame(raw, this.sessionKey);
    if (!frame) { console.log(`[rpc/peer] decrypt failed len=${raw.length}`); return; }

    if (isResponse(frame)) {
      const p = this.pending.get(frame.id);
      if (!p) { console.log(`[rpc/peer] response for unknown id=${frame.id}`); return; }
      this.pending.delete(frame.id);
      if ("error" in frame) p.reject(new Error(`${frame.error.code}: ${frame.error.msg}`));
      else p.resolve((frame as RpcResponse & { result: unknown }).result);
      return;
    }

    if (isEvent(frame)) {
      const set = this.listeners.get(frame.event);
      console.log(`[rpc/peer] ← event ${frame.event} listeners=${set?.size ?? 0}`);
      if (set) for (const fn of set) { try { fn(frame.payload); } catch (e) { console.error("[rpc] event handler", e); } }
      return;
    }

    if (isRequest(frame)) {
      const handler = this.handlers.get(frame.method);
      if (!handler) {
        this.reply(frame.id, { code: "no_handler", msg: frame.method });
        return;
      }
      Promise.resolve()
        .then(() => handler(frame.params))
        .then((result) => this.reply(frame.id, undefined, result))
        .catch((e: Error) => this.reply(frame.id, { code: "handler_threw", msg: e.message }));
    }
  }

  private reply(id: string, error?: { code: string; msg: string }, result?: unknown): void {
    if (this.closed) return;
    const frame: RpcResponse = error ? { id, error } : { id, result: result as never };
    try { this.channel.send(encryptFrame(frame as WireFrame, this.sessionKey)); }
    catch (e) { console.error("[rpc] reply send", e); }
  }
}
