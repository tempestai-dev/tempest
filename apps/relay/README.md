# tempest-relay

> **Not used by the current desktop app.** Pairing today runs through a
> local WebSocket router inside Tempest (`src-tauri/src/pairing_relay.rs`)
> exposed via a Cloudflare quick tunnel (`cloudflared tunnel --url …`).
> The Worker + Durable Object code in this directory is a working
> alternative — hosted, persistent URL, phone can reach a running Tempest
> without needing a fresh tunnel each session — kept for a future switch.
> The smoke test below still works; it just isn't wired into the desktop
> app right now.

Opaque WSS frame router for Tempest mobile pairing, hosted on Cloudflare
Workers + Durable Objects. Two peers open a WebSocket carrying the same
`session` id and opposing `role` values (`laptop` / `phone`); the DO for
that session forwards every frame verbatim to the other side. Payloads are
opaque — E2EE is layered on top so the Worker never sees plaintext.

Why Workers: WebSocket connections bill as one request per open (not per
message), egress is free on Cloudflare, and the Durable Object Hibernation
API drops idle-session cost near zero. Free plan handles low thousands of
active pairs; Workers Paid ($5/mo) scales into six figures.

## Wire URL

```
wss://<host>/ws?session=<sessionId>&role=laptop|phone
```

Health probe: `GET /health` → `ok`.

## Local dev + smoke test

```
npm install
npm run dev            # wrangler dev on http://localhost:8787
npm run smoke          # asserts routing end-to-end
```

First `wrangler dev` (or `smoke`) on a fresh machine downloads the
`workerd` runtime — ~30-60s on Windows, silent while it does. Subsequent
runs are ~2s.

For a fast pre-commit sanity check that avoids the workerd download,
`npx wrangler deploy --dry-run --outdir dist` validates the Worker
compiles, the DO binding resolves, and migrations are valid.

## Deploy

```
npx wrangler login
npm run deploy         # publishes to <name>.<subdomain>.workers.dev
```

Rename `name` in `wrangler.toml` before the first deploy if `tempest-relay`
is taken on your account.

After deploy, note the URL wrangler prints — that's the public
`https://<name>.<subdomain>.workers.dev`. The desktop and mobile apps
dial `wss://<same-host>/ws?session=…&role=laptop|phone`.

Wire the URL into the desktop by creating `.env.local` at the repo root:

```
VITE_RELAY_URL=wss://<name>.<subdomain>.workers.dev/ws
```

The mobile app does NOT need the relay URL configured — it comes from
the QR the desktop shows.

## What flows over the socket

The Worker is E2EE-blind. It sees only these frame types:

- `{"__relay":"attached", ...}` / `peer_connected` / `peer_disconnected` — control frames the DO emits itself.
- Everything else is opaque JSON forwarded verbatim.

The application-layer pairing frames (opaque to the Worker) are:

```
phone   → laptop  { t:"phone_hello", pubkey, nonce, box }
laptop  → phone   { t:"laptop_ok",   nonce, box }
phone   → laptop  { t:"phone_ack",   nonce, box }
```

`box` is `nacl.secretbox` under the pairing_secret (hello) or the
derived `nacl.box.before(peerPubkey, mySecretkey)` session key (ok / ack).

## End-to-end test with a real phone

Once per machine:

```
# in apps/relay
npm install
npx wrangler login
npm run deploy         # note the printed https://<name>.<subdomain>.workers.dev URL
```

Point the desktop at the deployed relay (repo root `.env.local`, gitignored):

```
VITE_RELAY_URL=wss://<name>.<subdomain>.workers.dev/ws
```

Then, in three terminals:

```
# 1. relay smoke — proves handshake round-trips locally
cd apps/relay && npm run smoke

# 2. desktop
npm run dev            # from repo root; opens Tauri app

# 3. mobile
cd apps/mobile
npm install
npx expo start         # scan Expo QR with Expo Go on your phone
```

In the desktop, open Settings → Mobile → *Generate pairing QR*. On the
phone, tap Get Started → Pair, then scan the desktop's QR. You should see:

- Desktop: `Waiting for phone…` → `Phone connected — verifying…` →
  `Handshaking…` → `Paired.` → the paired phone appears in the list with
  its real short fingerprint.
- Phone: `Verifying pairing secret…` → jumps to the Paired screen with
  the desktop's name and matching fingerprint.

The fingerprint shown on both sides is derived from the same pubkey — if
they match, the E2EE handshake completed end-to-end over the internet.
