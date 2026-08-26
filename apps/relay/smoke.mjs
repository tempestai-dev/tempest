// Smoke check: spawn `wrangler dev` as a subprocess, wait for its "Ready" line,
// then round-trip frames between two peers on the same session. Windows-friendly:
// stdout is visible so a slow first-run workerd download doesn't look like a hang.
// `node smoke.mjs` after `npm install`.

import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { WebSocket } from 'ws';

const PORT = 18787;

const proc = spawn(
  process.execPath,
  ['node_modules/wrangler/bin/wrangler.js', 'dev', '--port', String(PORT), '--ip', '127.0.0.1', '--log-level', 'warn'],
  { cwd: process.cwd(), stdio: ['ignore', 'inherit', 'inherit'] },
);

// Poll /health instead of grepping wrangler's stdout — its "Ready" line
// text drifts across versions, and the port answering is the actual
// invariant we care about. First run may take ~30-60s while workerd
// downloads; subsequent runs are ~2s.
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

const openWs = (role) => new Promise((res, rej) => {
  const ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws?session=s1&role=${role}`);
  ws.once('open', () => res(ws));
  ws.once('error', rej);
});
const nextText = (ws) => new Promise((res) => ws.once('message', (d) => res(String(d))));

const shutdown = (code) => { try { proc.kill(); } catch {} process.exit(code); };

try {
  await ready;

  const laptop = await openWs('laptop');
  assert.match(await nextText(laptop), /"__relay":"attached"/);

  const phone = await openWs('phone');
  assert.match(await nextText(phone), /"__relay":"attached"/);

  assert.match(await nextText(laptop), /"__relay":"peer_connected".*"phone"/);

  phone.send('ping-from-phone');
  assert.equal(await nextText(laptop), 'ping-from-phone');

  laptop.send('pong-from-laptop');
  assert.equal(await nextText(phone), 'pong-from-laptop');

  const peerGone = nextText(laptop);
  phone.close();
  assert.match(await peerGone, /"__relay":"peer_disconnected".*"phone"/);

  laptop.close();
  console.log('ok');
  shutdown(0);
} catch (e) {
  console.error('FAIL', e);
  shutdown(1);
}
