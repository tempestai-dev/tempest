# Remote config

Static files fetched by the app at startup, served from this repo via jsDelivr
(`https://cdn.jsdelivr.net/gh/tempestai-dev/tempest@main/config/…`). They let
data change without cutting an app release. jsDelivr caches ~12h; purge with
`curl https://purge.jsdelivr.net/gh/tempestai-dev/tempest@main/config/<file>`.

| File | Fetched? | Signed? | Why |
|------|----------|---------|-----|
| `models.json` | yes | no | display data (model ids/labels/context sizes) |
| `agents.json` | yes | **yes** | describes a CLI command + flags that get **spawned** |
| `providers.json` | **no** | n/a | rewrites an agent's API base URL and carries its key |

## `providers.json` — provider presets (bundled, NOT fetched)

Vendors that sell a coding plan with no CLI of their own (MiniMax, Z.ai/GLM) are used by
redirecting an existing agent with a handful of environment variables. This file holds each
vendor's documented recipe, keyed by provider then by agent id, with `{API_KEY}` as the one
substituted placeholder. Settings → Agents turns a selection plus a pasted key into that env
at spawn; the key itself goes to the OS credential manager, never into this file or the
persisted config blob.

**It is deliberately bundle-only — there is no fetch.** A preset sets `ANTHROPIC_BASE_URL` and
names the variable a user's API key is exported into, which is exactly the "endpoints,
allowlists, commands" class that `src/lib/remoteConfig.ts` says must not ride the unsigned
channel: whoever could edit a fetched `providers.json` could redirect every user's agent
traffic — and their key — to their own endpoint. It lives here as data-not-code for
reviewability, imported at build time like `agents.json`'s floor. Adding a preset is a
release. If it ever needs out-of-band updates it joins `agents.json` under minisign, never
`models.json`'s tier.

Recipes must be copied from vendor documentation, not inferred — the variables differ per CLI,
and a guessed one silently breaks authentication. `src/lib/agentProviders.check.ts` asserts
every shipped recipe carries `{API_KEY}`, sets a base URL, and cites a `docsUrl`.

## `agents.json` — signed agent manifest

**The single source of truth for every agent.** There is no hardcoded agent
list: this file is imported at build time as the always-present floor (so agents
work instantly and offline, exactly as before) AND re-downloaded at runtime to
override it. Editing it adds or updates CLI agents without a release, as long as
the agent fits the generic **`cli` adapter** (a command plus structured flag
templates + optional output-capture). A genuinely new execution model needs a
bundled adapter shipped in the app — the manifest can only reference adapters the
signed app already contains.

Agent icons live in **Tempest's own repo**, never a third-party host. Built-in
icons ship as bundled assets (referenced by key, e.g. `"icon": "claude"`); a new
agent commits its icon under `config/agent-icons/` and references it by filename
(e.g. `"icon": "amp.svg"`), served via jsDelivr from this repo.

### Why it's signed

Every entry carries `command` (spawned, and it reaches a shell **unquoted**) and
`flags.autoApprove` (the flag that disables an agent's own sandbox). An unsigned
channel would turn repo write / a merged PR / a CDN cache-poison into remote code
execution on every client. The app verifies a detached minisign signature over
the raw file before applying it; on any failure it keeps the built-in floor.
`command` is additionally restricted to bare tokens (`^[A-Za-z0-9_.-]+( …)*$`);
a `capture` regex is compiled from the (signed) manifest with a length cap and a
compile guard.

### Schema

```jsonc
{
  "schema": 1,
  "updatedAt": "2026-07-25",
  "agents": [
    {
      "id": "amp",                       // stable key; overrides an agent of the same id
      "name": "Amp",
      "command": "amp",                  // program name, or a few tokens e.g. "gh copilot"
      "adapter": "cli",                  // only "cli" is accepted
      "mono": true,                      // monochrome icon → inverted in dark mode
      "icon": "amp.svg",                 // bundled key OR a file in config/agent-icons/; no external URLs
      "downloadUrl": "https://…",        // https only; shown when not on PATH
      "minAppVersion": "0.1.6",          // optional; entry ignored on older apps
      "flags": {                         // all optional, structured by purpose
        "session":     ["--session-id", "{UUID}"],  // first run; {UUID} = new session id
        "resume":      ["--resume", "{UUID}"],       // resuming; {UUID} = stored conversation id
        "model":       ["--model", "{MODEL}"],       // {MODEL} = chosen model
        "autoApprove": ["--yolo"]                    // applied ONLY when the user's Auto is on
      },
      "capture": {                       // optional: agents that print their own session id
        "pattern": "\\b([0-9a-f-]{36})\\b",          // regex; a capture group holds the id
        "flags": "i",
        "resume": ["-s", "{UUID}"]
      }
    }
  ]
}
```

Fields an override omits are inherited from the agent it replaces (rename or add
a flag without re-supplying the icon or capture). To add a genuinely new agent,
append an entry and drop its icon in `config/agent-icons/`.

Fields the manifest omits for an id that also exists in the bundle are inherited
from the bundled agent (so you can rename or add a flag without re-supplying the
icon). `autoApprove` describes the flag syntax only — the app applies it solely
when the user's local Auto setting is on; the manifest can never force Auto on.

### One-time key ceremony

```
minisign -G -p tempest-agents.pub -s tempest-agents.key
```

Paste the `RW…` line from `tempest-agents.pub` into `AGENTS_PUBKEY` in
`src-tauri/src/lib.rs`, then ship that in a release (the pubkey is bundled).
Keep `tempest-agents.key` offline / as a CI secret. Until a real key is set,
`AGENTS_PUBKEY` is empty and the channel stays disabled (bundled agents only).

### Publishing an update

```
minisign -S -s tempest-agents.key -m config/agents.json     # → config/agents.json.minisig
git add config/agents.json config/agents.json.minisig && git commit && git push
```

Clients verify and pick it up on next startup (after the jsDelivr cache TTL, or a
purge). Keep the bundled list in `src/lib/agentRegistry.ts` roughly in sync so
offline/first-run installs don't drift.
