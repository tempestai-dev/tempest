// Self-check for the provider-preset sanitizer + env resolver, and for the
// bundled `config/providers.json` itself. Run with
// `node src/lib/agentProviders.check.ts` (Node strips the types natively).
//
// The shipped table is validated here on purpose: a preset rewrites an agent's
// API base URL and carries the var its key is exported into, so a typo that
// makes an entry silently inert should fail the build, not ship.
import assert from "node:assert";
import { readFileSync } from "node:fs";
import {
  sanitizeProviders,
  providersForAgent,
  resolveProviderEnv,
  API_KEY_TOKEN,
  type AgentProvider,
} from "./agentProviders.ts";

const one = (p: unknown): AgentProvider | undefined => sanitizeProviders([p])[0];

// ── sanitize: identity ──────────────────────────────────────────────────────
{
  const ok = one({ id: "p", label: "P", agents: { claude: { env: { A: "1" } } } });
  assert.ok(ok, "well-formed preset kept");
  assert.strictEqual(ok.id, "p");
  assert.strictEqual(ok.label, "P");

  assert.strictEqual(one({ label: "P", agents: { c: { env: { A: "1" } } } }), undefined, "id required");
  assert.strictEqual(one({ id: "p", agents: { c: { env: { A: "1" } } } }), undefined, "label required");
  assert.strictEqual(one({ id: "-bad", label: "P", agents: { c: { env: { A: "1" } } } }), undefined, "id shape enforced");
  assert.strictEqual(one({ id: "p", label: "   ", agents: { c: { env: { A: "1" } } } }), undefined, "blank label rejected");
  assert.deepStrictEqual(sanitizeProviders("nope"), [], "non-array → empty");
  assert.deepStrictEqual(sanitizeProviders([null, 7, "x"]), [], "junk entries dropped");
}

// ── sanitize: a preset with no usable recipe is inert and dropped ───────────
{
  assert.strictEqual(one({ id: "p", label: "P" }), undefined, "missing agents");
  assert.strictEqual(one({ id: "p", label: "P", agents: {} }), undefined, "empty agents");
  assert.strictEqual(one({ id: "p", label: "P", agents: { c: { env: {} } } }), undefined, "empty env");
  assert.strictEqual(one({ id: "p", label: "P", agents: { c: {} } }), undefined, "variant without env");
}

// ── sanitize: env values must be printable single-line ──────────────────────
{
  // A newline in an env value is how one var becomes two — must be dropped.
  const p = one({
    id: "p", label: "P",
    agents: { claude: { env: { GOOD: "yes", SPLIT: "a\nB=b", TAB: "a\tb" } } },
  })!;
  assert.deepStrictEqual(Object.keys(p.agents.claude.env), ["GOOD"], "only printable single-line kept");
}

// ── sanitize: reuses tempest.yml's env deny rules ───────────────────────────
{
  const p = one({
    id: "p", label: "P",
    agents: { claude: { env: { ANTHROPIC_BASE_URL: "https://x.example", NODE_OPTIONS: "--require ./pwn.js", "not-a-name": "x" } } },
  })!;
  assert.deepStrictEqual(
    p.agents.claude.env,
    { ANTHROPIC_BASE_URL: "https://x.example" },
    "loader vars and malformed names rejected",
  );
}

// ── sanitize: urls are https-only, icon is a bare filename ──────────────────
{
  const p = one({
    id: "p", label: "P", icon: "x.svg", mono: true,
    keyUrl: "http://insecure.example", docsUrl: "https://ok.example",
    agents: { claude: { env: { A: "1" } } },
  })!;
  assert.strictEqual(p.keyUrl, undefined, "http keyUrl rejected");
  assert.strictEqual(p.docsUrl, "https://ok.example");
  assert.strictEqual(p.icon, "x.svg");
  assert.strictEqual(p.mono, true);

  const bad = one({ id: "q", label: "Q", icon: "../../etc/passwd", agents: { claude: { env: { A: "1" } } } })!;
  assert.strictEqual(bad.icon, undefined, "path-ish icon rejected");
}

// ── providersForAgent: only presets with a verified recipe ──────────────────
{
  const list = sanitizeProviders([
    { id: "a", label: "A", agents: { claude: { env: { X: "1" } } } },
    { id: "b", label: "B", agents: { codex: { env: { Y: "2" } } } },
  ]);
  assert.deepStrictEqual(providersForAgent(list, "claude").map((p) => p.id), ["a"]);
  assert.deepStrictEqual(providersForAgent(list, "codex").map((p) => p.id), ["b"]);
  assert.deepStrictEqual(providersForAgent(list, "gemini"), [], "no recipe → not offered");
}

// ── resolveProviderEnv ──────────────────────────────────────────────────────
{
  const p = one({
    id: "p", label: "P",
    agents: { claude: { env: { BASE: "https://x.example", TOKEN: API_KEY_TOKEN, MODEL: "m" } } },
  })!;

  assert.deepStrictEqual(
    resolveProviderEnv(p, "claude", "sk-123"),
    { BASE: "https://x.example", TOKEN: "sk-123", MODEL: "m" },
    "key substituted",
  );

  // No recipe for this agent → contributes nothing.
  assert.deepStrictEqual(resolveProviderEnv(p, "codex", "sk-123"), {});

  // Needs a key but none stored → contributes NOTHING, rather than pointing the
  // agent at the vendor with an empty token (which reads as "Tempest broke my
  // agent" instead of "I haven't pasted my key").
  assert.deepStrictEqual(resolveProviderEnv(p, "claude", ""), {}, "keyless preset is inert");

  // A recipe that needs no key still applies without one.
  const noKey = one({ id: "n", label: "N", agents: { claude: { env: { BASE: "https://y.example" } } } })!;
  assert.deepStrictEqual(resolveProviderEnv(noKey, "claude", ""), { BASE: "https://y.example" });

  // The key is substituted at every occurrence, and is never partially left in.
  const twice = one({
    id: "t", label: "T",
    agents: { claude: { env: { A: API_KEY_TOKEN, B: `Bearer ${API_KEY_TOKEN}` } } },
  })!;
  assert.deepStrictEqual(resolveProviderEnv(twice, "claude", "k"), { A: "k", B: "Bearer k" });
  for (const v of Object.values(resolveProviderEnv(twice, "claude", "k"))) {
    assert.ok(!v.includes(API_KEY_TOKEN), "no placeholder survives resolution");
  }
}

// ── the SHIPPED table ───────────────────────────────────────────────────────
{
  const raw = JSON.parse(readFileSync(new URL("../../config/providers.json", import.meta.url), "utf8"));
  const providers = sanitizeProviders(raw.providers);

  assert.strictEqual(
    providers.length,
    raw.providers.length,
    "every shipped preset survives sanitization — a dropped one would be silently inert",
  );

  // The two the issue asked for.
  const ids = providers.map((p) => p.id);
  for (const want of ["minimax", "zai"]) {
    assert.ok(ids.includes(want), `${want} preset ships`);
  }
  assert.strictEqual(new Set(ids).size, ids.length, "preset ids unique");

  for (const p of providers) {
    assert.ok(p.keyUrl, `${p.id}: keyUrl set so the UI can send the user for a key`);
    assert.ok(p.docsUrl, `${p.id}: docsUrl set so the recipe is traceable to vendor docs`);
    for (const [agentId, v] of Object.entries(p.agents)) {
      // Every shipped recipe is key-bearing; a preset that forgot its token var
      // would point the agent at the vendor using the user's *other* credentials.
      const vars = Object.values(v.env);
      assert.ok(
        vars.some((x) => x.includes(API_KEY_TOKEN)),
        `${p.id}/${agentId}: recipe must carry ${API_KEY_TOKEN}`,
      );
      // And every recipe must actually redirect the agent somewhere.
      assert.ok(
        Object.keys(v.env).some((k) => /BASE_URL$/.test(k)),
        `${p.id}/${agentId}: recipe must set a base URL`,
      );
      assert.ok(
        vars.every((x) => x.length > 0),
        `${p.id}/${agentId}: no empty env values`,
      );
    }
  }
}

console.log("agentProviders: all checks passed");
