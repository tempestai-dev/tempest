// Self-check for the SHIPPED `config/agents.json` — distinct from
// agentManifest.check.ts, which exercises the sanitizer against synthetic input.
// This one asserts the real file we ship survives that sanitizer intact.
//
// Why it is worth a check: an entry that fails `sanitizeEntry` is dropped
// SILENTLY (that is the correct behaviour for an untrusted downloaded manifest),
// so a typo in the bundled floor doesn't error — the agent just never appears.
// Same for an `icon` naming a file that isn't in the repo: it degrades to the
// generic terminal glyph with no warning. Both are review-invisible; here they
// fail the build.
import assert from "node:assert";
import { readFileSync, existsSync } from "node:fs";
import { sanitizeManifestAgents, mergeAgents, CMD_RE } from "./agentManifest.ts";

const url = (p: string) => new URL(p, import.meta.url);
const raw = JSON.parse(readFileSync(url("../../config/agents.json"), "utf8"));

// Icon keys resolved from bundled assets by agentRegistry.ts's ICON_ASSETS. Kept
// as a literal list because that module imports .svg binaries and so cannot be
// loaded by plain node.
const BUNDLED_ICON_KEYS = new Set([
  "agy", "claude", "cline", "codex", "copilot", "cursor", "gemini", "goose", "opencode",
]);

{
  assert.strictEqual(raw.schema, 1, "schema version");
  assert.ok(Array.isArray(raw.agents) && raw.agents.length > 0, "agents array present");
  assert.ok(/^\d{4}-\d{2}-\d{2}$/.test(raw.updatedAt), "updatedAt is an ISO date");
}

// ── every shipped entry survives sanitization ───────────────────────────────
{
  const patches = sanitizeManifestAgents(raw.agents);
  assert.strictEqual(
    patches.length,
    raw.agents.length,
    "every shipped agent survives sanitizeEntry — a dropped entry is an agent that silently never appears",
  );

  const ids = patches.map((p) => p.id);
  assert.strictEqual(new Set(ids).size, ids.length, "agent ids are unique");

  // The merge compiles capture regexes; a bad one degrades to no-capture, which
  // would silently break that agent's resume.
  const merged = mergeAgents([], patches);
  assert.strictEqual(merged.length, patches.length, "merge keeps every entry");

  for (const a of merged) {
    assert.ok(CMD_RE.test(a.hint), `${a.id}: command is a bare token ("${a.hint}")`);
    assert.ok(a.name.trim(), `${a.id}: name is non-empty`);

    // An icon is either a bundled key or a file committed to config/agent-icons/.
    // Anything else renders as the fallback glyph with no error.
    if (a.icon) {
      if (!BUNDLED_ICON_KEYS.has(a.icon)) {
        assert.ok(
          existsSync(url(`../../config/agent-icons/${a.icon}`)),
          `${a.id}: icon "${a.icon}" is neither a bundled key nor a file in config/agent-icons/`,
        );
      }
    }

    // A capture spec is only useful with resume args, and vice versa — the spawn
    // path requires BOTH (`config.capturePattern && config.captureResumeArgs`).
    const src = raw.agents.find((e: { id: string }) => e.id === a.id);
    if (src.capture) {
      assert.ok(a.capturePattern, `${a.id}: capture pattern compiles`);
      assert.ok(a.captureResumeArgs?.length, `${a.id}: capture spec needs resume args to be usable`);
    }

    // Placeholders must be ones agentArgs.ts actually substitutes. A typo like
    // {UID} passes through verbatim and reaches the CLI as a literal.
    const KNOWN = new Set([
      "UUID", "MODEL", "PROMPT",
      "WORKSPACE_ID", "WORKSPACE_NAME", "WORKSPACE_SLUG", "WORKSPACE_PATH",
      "BRANCH", "PORT",
    ]);
    const groups = [a.sessionIdArgs, a.resumeArgs, a.modelArgs, a.autoApproveArgs, a.printArgs, a.captureResumeArgs];
    for (const g of groups) {
      for (const arg of g ?? []) {
        for (const m of arg.matchAll(/\{([A-Za-z_][A-Za-z0-9_]*)\}/g)) {
          assert.ok(KNOWN.has(m[1]), `${a.id}: unknown placeholder {${m[1]}} in "${arg}"`);
        }
      }
    }

    // The slots that carry a value must actually carry its placeholder,
    // otherwise the value is silently dropped.
    if (a.modelArgs) {
      assert.ok(a.modelArgs.some((x) => x.includes("{MODEL}")), `${a.id}: modelArgs must use {MODEL}`);
    }
    if (a.printArgs) {
      assert.ok(a.printArgs.some((x) => x.includes("{PROMPT}")), `${a.id}: printArgs must use {PROMPT}`);
    }

    if (a.downloadUrl) {
      assert.ok(/^https:\/\//.test(a.downloadUrl), `${a.id}: downloadUrl is https`);
    }
  }
}

// ── the agents this change added ────────────────────────────────────────────
{
  const byId = new Map<string, Record<string, unknown>>(
    (raw.agents as Record<string, unknown>[]).map((a) => [a.id as string, a]),
  );

  for (const id of ["qwen", "droid"]) {
    assert.ok(byId.has(id), `${id} ships`);
  }

  // droid's `--auto` is documented as exec-only (interactive mode uses slash
  // commands instead), so it must NOT be in autoApprove: agentArgs.ts applies
  // that group to the INTERACTIVE spawn too, which would break every launch
  // whenever the user has Auto on. Guarded so a well-meaning "add the yolo flag"
  // edit can't reintroduce it. See docs/agents/supported.mdx.
  const droid = byId.get("droid")!;
  const droidFlags = (droid.flags ?? {}) as Record<string, unknown>;
  assert.ok(
    !droidFlags.autoApprove,
    "droid must not declare autoApprove: --auto is exec-only and would break interactive launches",
  );
}

console.log("agentsManifestFile: all checks passed");
