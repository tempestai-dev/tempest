// Mobile pairing crypto + relay client. Mirrors src/lib/pairing/ on the
// desktop — keep the two in sync until Phase 2 extracts a shared package.

import nacl from 'tweetnacl';
import naclUtil from 'tweetnacl-util';
import * as Crypto from 'expo-crypto';

// Seed tweetnacl's PRNG from expo-crypto so it works in Expo Go without
// pulling in react-native-get-random-values (which would require a dev
// build). expo-crypto's sync getRandomBytes is fine here — small
// allocations only.
nacl.setPRNG((x, n) => {
  const buf = Crypto.getRandomBytes(n);
  for (let i = 0; i < n; i++) x[i] = buf[i];
});

export const b64 = {
  enc: (b) => naclUtil.encodeBase64(b),
  dec: (s) => naclUtil.decodeBase64(s),
};

export const utf8 = {
  enc: (s) => naclUtil.decodeUTF8(s),
  dec: (b) => naclUtil.encodeUTF8(b),
};

export const newKeyPair = () => {
  const kp = nacl.box.keyPair();
  return { publicKey: kp.publicKey, secretKey: kp.secretKey };
};

export const randomBytes = (n) => nacl.randomBytes(n);

export const fingerprint = (pubkey) => {
  const h = nacl.hash(pubkey);
  const hex = Array.from(h.slice(0, 4))
    .map((x) => x.toString(16).padStart(2, '0'))
    .join('');
  return `${hex.slice(0, 4)}-${hex.slice(4, 8)}`;
};

const concatBytes = (...parts) => {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const p of parts) { out.set(p, off); off += p.length; }
  return out;
};

const bytesEqual = (a, b) => {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
};

const seal = (plaintext, key) => {
  const nonce = nacl.randomBytes(nacl.secretbox.nonceLength);
  const box = nacl.secretbox(plaintext, nonce, key);
  return { nonce: b64.enc(nonce), box: b64.enc(box) };
};

const open = (nonceB64, boxB64, key) => {
  const nonce = b64.dec(nonceB64);
  const box = b64.dec(boxB64);
  return nacl.secretbox.open(box, nonce, key);
};

const deriveSessionKey = (peerPubkey, mySecretkey) =>
  nacl.box.before(peerPubkey, mySecretkey);

// Parse the JSON payload the desktop encoded in the QR. Returns null if
// the string is not a valid v1 pairing payload.
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
// promise resolves with { pubkey (b64), name, fingerprint } on success.
// The WSS dial is retried on connect failure — TryCloudflare's public
// DNS/edge routing can take ~30s to propagate after cloudflared reports ready.
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
  let settled = false;
  let cancelled = false;
  const startedAt = Date.now();

  const cleanup = () => {
    cancelled = true;
    if (ttlTimer) { clearTimeout(ttlTimer); ttlTimer = null; }
    if (retryTimer) { clearTimeout(retryTimer); retryTimer = null; }
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

      ws.onopen = () => { opened = true; console.log('[pairing] ws open'); };

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
        let frame;
        try { frame = JSON.parse(typeof ev.data === 'string' ? ev.data : String(ev.data)); }
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
      // Stop retrying past the TTL — the ttlTimer will fire and fail the
      // whole thing regardless, but no point burning cycles.
      if (Date.now() - startedAt > ttlMs - 1000) return;
      onStatus?.('waiting_for_laptop');
      retryTimer = setTimeout(dial, 2000);
    };

    dial();
  });

  return { promise, cancel: cleanup };
};
