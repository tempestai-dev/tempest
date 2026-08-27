// Smoke check: spawn `wrangler dev`, then run the full pairing handshake
// (phone_hello / laptop_ok / phone_ack) end-to-end against it. Proves both
// that the DO routes opaque frames and that the tweetnacl protocol both
// clients speak actually round-trips. Windows-friendly: wrangler stdout
// stays visible so a slow first-run workerd download doesn't look like a
// hang. `node smoke.mjs` after `npm install`.

import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { WebSocket } from 'ws';
import nacl from 'tweetnacl';
import naclUtil from 'tweetnacl-util';

const PORT = 18789;
const SESSION_ID = 's1';
const log = (...a) => console.error('[smoke]', ...a);

const proc = spawn(
  process.execPath,
  ['node_modules/wrangler/bin/wrangler.js', 'dev', '--port', String(PORT), '--ip', '127.0.0.1', '--log-level', 'warn'],
  { cwd: process.cwd(), stdio: ['ignore', 'inherit', 'inherit'] },
);

const ready = (async () => {
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/health`);
      if (r.ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`relay did not answer /health within 120s`);
})();

// Pre-attach a queue on every socket. `ws.once('message')` drops frames
// that arrive between awaits — peer_connected races phone's `attached`,
// so we queue everything and read sequentially.
const openWs = (role) => new Promise((res, rej) => {
  const ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws?session=${SESSION_ID}&role=${role}`);
  const queue = [];
  const waiters = [];
  ws.on('message', (data) => {
    const msg = String(data);
    if (waiters.length) waiters.shift()(msg);
    else queue.push(msg);
  });
  ws.next = () => new Promise((r) => {
    if (queue.length) r(queue.shift());
    else waiters.push(r);
  });
  ws.once('open', () => res(ws));
  ws.once('error', rej);
});
const nextJson = async (ws) => JSON.parse(await ws.next());

const utf8 = (s) => naclUtil.decodeUTF8(s);
const b64 = (b) => naclUtil.encodeBase64(b);
const concat = (...parts) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let off = 0;
  for (const p of parts) { out.set(p, off); off += p.length; }
  return out;
};
const seal = (plain, key) => {
  const nonce = nacl.randomBytes(nacl.secretbox.nonceLength);
  return { nonce: b64(nonce), box: b64(nacl.secretbox(plain, nonce, key)) };
};
const open = (nonceB64, boxB64, key) =>
  nacl.secretbox.open(naclUtil.decodeBase64(boxB64), naclUtil.decodeBase64(nonceB64), key);

const shutdown = (code) => { try { proc.kill(); } catch {} process.exit(code); };

try {
  log('waiting for /health');
  await ready;
  log('/health up');

  // Laptop generates keypair + pairing_secret (what would go in the QR).
  const laptopKp = nacl.box.keyPair();
  const pairingSecret = nacl.randomBytes(nacl.secretbox.keyLength);

  const laptop = await openWs('laptop');
  log('laptop open');
  const laptopAttached = await nextJson(laptop);
  log('laptop attached', laptopAttached);
  assert.equal(laptopAttached.__relay, 'attached');
  assert.equal(laptopAttached.peer_present, false);

  const phone = await openWs('phone');
  log('phone open');
  const phoneAttached = await nextJson(phone);
  log('phone attached', phoneAttached);
  assert.equal(phoneAttached.__relay, 'attached');
  assert.equal(phoneAttached.peer_present, true);

  const peerConnected = await nextJson(laptop);
  log('laptop peer_connected', peerConnected);
  assert.equal(peerConnected.__relay, 'peer_connected');
  assert.equal(peerConnected.role, 'phone');

  // Phone: hello.
  const phoneKp = nacl.box.keyPair();
  const helloBox = seal(concat(phoneKp.publicKey, utf8(SESSION_ID)), pairingSecret);
  phone.send(JSON.stringify({
    t: 'phone_hello',
    pubkey: b64(phoneKp.publicKey),
    nonce: helloBox.nonce,
    box: helloBox.box,
  }));

  // Laptop: verify hello, derive session key, send ok.
  const hello = await nextJson(laptop);
  assert.equal(hello.t, 'phone_hello');
  const phonePubkey = naclUtil.decodeBase64(hello.pubkey);
  const helloPlain = open(hello.nonce, hello.box, pairingSecret);
  assert.ok(helloPlain, 'hello box decrypt');
  assert.deepEqual(helloPlain, concat(phonePubkey, utf8(SESSION_ID)));
  const laptopSessionKey = nacl.box.before(phonePubkey, laptopKp.secretKey);
  const okBox = seal(utf8(`ok:${SESSION_ID}`), laptopSessionKey);
  laptop.send(JSON.stringify({ t: 'laptop_ok', nonce: okBox.nonce, box: okBox.box }));

  // Phone: verify ok, send ack.
  const ok = await nextJson(phone);
  assert.equal(ok.t, 'laptop_ok');
  const phoneSessionKey = nacl.box.before(laptopKp.publicKey, phoneKp.secretKey);
  const okPlain = open(ok.nonce, ok.box, phoneSessionKey);
  assert.ok(okPlain, 'ok box decrypt');
  assert.deepEqual(okPlain, utf8(`ok:${SESSION_ID}`));
  const ackBox = seal(utf8(`ack:${SESSION_ID}`), phoneSessionKey);
  phone.send(JSON.stringify({ t: 'phone_ack', nonce: ackBox.nonce, box: ackBox.box }));

  // Laptop: verify ack.
  const ack = await nextJson(laptop);
  assert.equal(ack.t, 'phone_ack');
  const ackPlain = open(ack.nonce, ack.box, laptopSessionKey);
  assert.ok(ackPlain, 'ack box decrypt');
  assert.deepEqual(ackPlain, utf8(`ack:${SESSION_ID}`));

  // Peer disconnect signalling still works.
  const peerGone = nextJson(laptop);
  phone.close();
  const gone = await peerGone;
  assert.equal(gone.__relay, 'peer_disconnected');
  assert.equal(gone.role, 'phone');

  laptop.close();
  console.log('ok');
  shutdown(0);
} catch (e) {
  console.error('FAIL', e);
  shutdown(1);
}
