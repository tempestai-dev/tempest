# tempest-relay

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
