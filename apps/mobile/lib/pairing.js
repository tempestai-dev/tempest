// Phone-side pairing handshake. Crypto primitives live in @tempest/crypto;
// the WS runner below owns the phone_hello / laptop_ok / phone_ack dance
// specifically. If we ever move this into @tempest/transport, it stays
// symmetrical with the desktop-side dialer.

import * as Crypto from 'expo-crypto';
import {
  b64,
  utf8,
  seal,
  open,
  concatBytes,
  bytesEqual,
  deriveSessionKey,
  fingerprint,
  newKeyPair,
  seedPrng,
} from '@tempest/crypto';
import nacl from 'tweetnacl';

// Expo Go has no webcrypto; seed once before any keygen.
seedPrng((n) => Crypto.getRandomBytes(n));

export { b64, fingerprint };

// Parse the JSON payload the desktop encoded in the QR. Returns null on any
// shape mismatch.
export const parseQrPayload = (raw) => {
  let p;
  try { p = JSON.parse(raw); } catch { return null; }
  if (!p || p.v !== 1) return null;
  if (typeof p.relay_url !== 'string' || !p.relay_url.startsWith('ws')) return null;
  if (typeof p.session_id !== 'string' || !p.session_id) return null;
  if (typeof p.laptop_pubkey !== 'string') return null;
  if (typeof p.pairing_secret !== 'string') return null;
  return p;
};

// Run the phone-side handshake. Returns { promise, cancel }.
// Retries the dial while the TTL window is open — TryCloudflare DNS/edge
// propagation can trail cloudflared's `/ready` by ~30s.
export const runPhonePairing = (payload, { onStatus, ttlMs = 60_000 } = {}) => {
  const url = `${payload.relay_url}?session=${encodeURIComponent(payload.session_id)}&role=phone`;

  const laptopPubkey = b64.dec(payload.laptop_pubkey);
  const pairingSecret = b64.dec(payload.pairing_secret);
  if (laptopPubkey.length !== 32) {
    return { promise: Promise.reject(new Error('bad_laptop_pubkey_len')), cancel: () => {} };
  }
  if (pairingSecret.length !== nacl.secretbox.keyLength) {
    return { promise: Promise.reject(new Error('bad_pairing_secret_len')), cancel: () => {} };
  }

  const phoneKp = newKeyPair();
  const sessionKey = deriveSessionKey(laptopPubkey, phoneKp.secretKey);

  let ws = null;
  let ttlTimer = null;
  let retryTimer = null;
  let pingTimer = null;
  let settled = false;
  let cancelled = false;
  const startedAt = Date.now();

  const cleanup = () => {
    cancelled = true;
    if (ttlTimer) { clearTimeout(ttlTimer); ttlTimer = null; }
    if (retryTimer) { clearTimeout(retryTimer); retryTimer = null; }
    if (pingTimer) { clearInterval(pingTimer); pingTimer = null; }
    if (ws) { try { ws.close(); } catch {} ws = null; }
  };

  const promise = new Promise((resolve, reject) => {
    const fail = (status, err) => {
      if (settled) return;
      settled = true;
      onStatus?.(status);
      cleanup();
      reject(err instanceof Error ? err : new Error(String(err)));
    };
    const done = (r) => {
      if (settled) return;
      settled = true;
      onStatus?.('paired');
      cleanup();
      resolve(r);
    };

    ttlTimer = setTimeout(() => fail('expired', new Error('pairing_ttl_expired')), ttlMs);

    const dial = () => {
      if (cancelled || settled) return;
      onStatus?.('connecting');
      try {
        ws = new WebSocket(url);
      } catch (e) { scheduleRetry(); return; }

      let opened = false;

      const sendHello = () => {
        onStatus?.('handshaking');
        const helloPlain = concatBytes(phoneKp.publicKey, utf8.enc(payload.session_id));
        const boxed = seal(helloPlain, pairingSecret);
        ws.send(JSON.stringify({
          t: 'phone_hello',
          pubkey: b64.enc(phoneKp.publicKey),
          nonce: boxed.nonce,
          box: boxed.box,
        }));
      };

      ws.onopen = () => {
        opened = true;
        console.log('[pairing] ws open');
        // CF quick tunnels drop idle client sockets in ~100s. During the
        // "waiting for laptop" window nothing else is sent — keep the pipe
        // warm with the router's `__ping` intercept.
        pingTimer = setInterval(() => {
          try { ws?.send('__ping'); } catch {}
        }, 25_000);
      };

      ws.onerror = (e) => {
        console.log('[pairing] ws error opened=' + opened, e?.message || e);
        if (!opened) { scheduleRetry(); return; }
        fail('error', new Error('websocket_error'));
      };
      ws.onclose = (e) => {
        console.log('[pairing] ws close opened=' + opened + ' code=' + e?.code + ' reason=' + e?.reason);
        if (settled) return;
        if (!opened) { scheduleRetry(); return; }
        fail('error', new Error(`websocket_closed code=${e?.code ?? '?'}`));
      };

      ws.onmessage = (ev) => {
        const raw = typeof ev.data === 'string' ? ev.data : String(ev.data);
        if (raw === '__pong') return;
        let frame;
        try { frame = JSON.parse(raw); }
        catch { console.log('[pairing] bad frame', ev.data); return; }
        console.log('[pairing] frame', frame.__relay || frame.t);

        if (frame.__relay === 'attached') {
          if (frame.peer_present) sendHello();
          else onStatus?.('waiting_for_laptop');
          return;
        }
        if (frame.__relay === 'peer_connected' && frame.role === 'laptop') {
          sendHello();
          return;
        }
        if (frame.__relay === 'peer_disconnected') {
          fail('error', new Error('laptop_disconnected'));
          return;
        }

        if (frame.t === 'laptop_ok') {
          try {
            if (!frame.nonce || !frame.box) throw new Error('bad_ok');
            const okPlain = open(frame.nonce, frame.box, sessionKey);
            if (!okPlain) throw new Error('ok_decrypt_failed');
            const expected = utf8.enc(`ok:${payload.session_id}`);
            if (!bytesEqual(okPlain, expected)) throw new Error('ok_payload_mismatch');

            const ack = seal(utf8.enc(`ack:${payload.session_id}`), sessionKey);
            ws.send(JSON.stringify({ t: 'phone_ack', nonce: ack.nonce, box: ack.box }));

            done({
              pubkey: payload.laptop_pubkey,
              name: payload.name || 'Tempest desktop',
              fingerprint: fingerprint(laptopPubkey),
              sessionKey: b64.enc(sessionKey),
              relayUrl: payload.relay_url,
              sessionId: payload.session_id,
            });
          } catch (e) {
            try { ws.send(JSON.stringify({ t: 'error', reason: e.message })); } catch {}
            fail('error', e);
          }
          return;
        }

        if (frame.t === 'error') {
          fail('error', new Error(`laptop_reported:${frame.reason ?? 'unknown'}`));
        }
      };
    };

    const scheduleRetry = () => {
      if (settled || cancelled) return;
      if (ws) { try { ws.close(); } catch {} ws = null; }
      if (Date.now() - startedAt > ttlMs - 1000) return;
      onStatus?.('waiting_for_laptop');
      retryTimer = setTimeout(dial, 2000);
    };

    dial();
  });

  return { promise, cancel: cleanup };
};
