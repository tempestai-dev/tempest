// Laptop-side pairing relay client. Dials the Cloudflare Worker as
// role=laptop, waits for the phone to appear, verifies the phone's
// pairing_secret-authenticated hello, and returns the derived session key
// plus the phone's long-term pubkey.

import {
  b64,
  utf8,
  bytesEqual,
  concatBytes,
  deriveSessionKey,
  open as boxOpen,
  seal as boxSeal,
} from "./nacl";

export interface LaptopSession {
  sessionId: string;
  pairingSecret: Uint8Array;
  laptopPubkey: Uint8Array;
  laptopSecretkey: Uint8Array;
}

export interface PairResult {
  phonePubkey: Uint8Array;
  sessionKey: Uint8Array;
}

export type PairStatus =
  | "connecting"
  | "waiting_for_phone"
  | "phone_connected"
  | "handshaking"
  | "paired"
  | "expired"
  | "error";

export interface RunOptions {
  relayUrl: string;
  session: LaptopSession;
  ttlMs: number;
  onStatus?: (s: PairStatus, detail?: string) => void;
  signal?: AbortSignal;
}

interface Frame {
  t?: string;
  __relay?: string;
  role?: "laptop" | "phone";
  peer_present?: boolean;
  pubkey?: string;
  nonce?: string;
  box?: string;
  reason?: string;
}

// One-shot handshake as the laptop role. Resolves with the phone's pubkey +
// derived session key once both sides have proven possession of the
// pairing_secret and derived matching session keys.
export function runLaptopPairing(opts: RunOptions): {
  result: Promise<PairResult>;
  cancel: () => void;
} {
  const { relayUrl, session, ttlMs, onStatus, signal } = opts;
  const url = `${relayUrl}?session=${encodeURIComponent(session.sessionId)}&role=laptop`;

  let ws: WebSocket | null = null;
  let ttlTimer: ReturnType<typeof setTimeout> | null = null;
  let settled = false;

  const cleanup = () => {
    if (ttlTimer) { clearTimeout(ttlTimer); ttlTimer = null; }
    if (ws) { try { ws.close(); } catch {} ws = null; }
  };

  const result = new Promise<PairResult>((resolve, reject) => {
    const fail = (status: PairStatus, err: unknown, detail?: string) => {
      if (settled) return;
      settled = true;
      onStatus?.(status, detail);
      cleanup();
      reject(err instanceof Error ? err : new Error(String(err)));
    };

    const done = (r: PairResult) => {
      if (settled) return;
      settled = true;
      onStatus?.("paired");
      cleanup();
      resolve(r);
    };

    onStatus?.("connecting");

    try {
      ws = new WebSocket(url);
    } catch (e) {
      fail("error", e);
      return;
    }

    signal?.addEventListener("abort", () => fail("error", new Error("cancelled")));

    ttlTimer = setTimeout(() => fail("expired", new Error("pairing_ttl_expired")), ttlMs);

    ws.onopen = () => {
      onStatus?.("waiting_for_phone");
    };

    ws.onerror = () => fail("error", new Error("websocket_error"));
    ws.onclose = () => {
      if (!settled) fail("error", new Error("websocket_closed"));
    };

    ws.onmessage = (ev) => {
      let frame: Frame;
      try {
        frame = JSON.parse(typeof ev.data === "string" ? ev.data : new TextDecoder().decode(ev.data));
      } catch {
        return; // ignore garbage
      }

      // Relay control frames.
      if (frame.__relay === "attached") return;
      if (frame.__relay === "peer_connected" && frame.role === "phone") {
        onStatus?.("phone_connected");
        return;
      }
      if (frame.__relay === "peer_disconnected") {
        fail("error", new Error("phone_disconnected"));
        return;
      }

      if (frame.t === "phone_hello") {
        onStatus?.("handshaking");
        try {
          if (!frame.pubkey || !frame.nonce || !frame.box) throw new Error("bad_hello");
          const phonePubkey = b64.dec(frame.pubkey);
          if (phonePubkey.length !== 32) throw new Error("bad_pubkey_len");

          const helloPlain = boxOpen(frame.nonce, frame.box, session.pairingSecret);
          if (!helloPlain) throw new Error("mac_mismatch");

          const expected = concatBytes(phonePubkey, utf8.enc(session.sessionId));
          if (!bytesEqual(helloPlain, expected)) throw new Error("hello_payload_mismatch");

          const sessionKey = deriveSessionKey(phonePubkey, session.laptopSecretkey);

          const ok = boxSeal(utf8.enc(`ok:${session.sessionId}`), sessionKey);
          ws!.send(JSON.stringify({ t: "laptop_ok", nonce: ok.nonce, box: ok.box }));

          // Stash for the ack step.
          pending = { phonePubkey, sessionKey };
        } catch (e) {
          try {
            ws!.send(JSON.stringify({ t: "error", reason: (e as Error).message }));
          } catch {}
          fail("error", e);
        }
        return;
      }

      if (frame.t === "phone_ack") {
        if (!pending) { fail("error", new Error("ack_without_hello")); return; }
        try {
          if (!frame.nonce || !frame.box) throw new Error("bad_ack");
          const ackPlain = boxOpen(frame.nonce, frame.box, pending.sessionKey);
          if (!ackPlain) throw new Error("ack_decrypt_failed");
          const expected = utf8.enc(`ack:${session.sessionId}`);
          if (!bytesEqual(ackPlain, expected)) throw new Error("ack_payload_mismatch");
          done(pending);
        } catch (e) {
          fail("error", e);
        }
        return;
      }

      if (frame.t === "error") {
        fail("error", new Error(`phone_reported:${frame.reason ?? "unknown"}`));
      }
    };

    let pending: PairResult | null = null;
  });

  return { result, cancel: () => cleanup() };
}
