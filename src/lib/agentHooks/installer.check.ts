// Self-check for the agent-hooks merge engine + the Claude adapter.
//
// The merge is a trust-sensitive edit of the user's OWN agent config files, so
// the properties that matter are: never drop a user's hooks, be idempotent
// (startup re-install must be a no-op), sweep only our own entries on removal,
// and map events to the right state. Run with `node src/lib/agentHooks/installer.check.ts`
// (Node strips types natively — no framework, no build step).
//
// Only pure functions are exercised; the install engine itself needs Tauri.
import assert from "node:assert";
import { applyNestedHooks, removeNestedHooks, makeManagedMatcher, applyJsonConfig, removeJsonConfig, type NestedEvent } from "./schema.ts";
import { claudeAdapter } from "./adapters/claude.ts";
import { geminiAdapter } from "./adapters/gemini.ts";
import { cursorAdapter } from "./adapters/cursor.ts";
import { copilotAdapter } from "./adapters/copilot.ts";
import { antigravityAdapter } from "./adapters/antigravity.ts";
import { codexAdapter } from "./adapters/codex.ts";
import { hermesAdapter } from "./adapters/hermes.ts";
import { opencodeAdapter } from "./adapters/opencode.ts";
import { sha256Hex, computeTrustedHash, upsertTrustBlocks } from "./codexTrust.ts";
import type { HookAdapter, HookPaths, JsonObject } from "./types.ts";

const SCRIPT = "tempest-claude-hook.cmd";
const CMD = "if [ -f '/home/u/.tempest/hooks/tempest-claude-hook.cmd' ]; then '/home/u/.tempest/hooks/tempest-claude-hook.cmd'; fi";
const EVENTS: NestedEvent[] = [
  { name: "UserPromptSubmit" },
  { name: "PreToolUse", matcher: true },
  { name: "Stop" },
];

function managedCount(config: JsonObject): number {
  const isManaged = makeManagedMatcher(SCRIPT);
  const hooks = (config.hooks ?? {}) as Record<string, any[]>;
  let n = 0;
  for (const defs of Object.values(hooks)) {
    for (const def of defs) {
      if (isManaged(def.command)) n++;
      for (const h of def.hooks ?? []) if (isManaged(h.command)) n++;
    }
  }
  return n;
}

// ── user hooks and unrelated keys survive a merge ────────────────────────────
{
  const userHook = { hooks: [{ type: "command", command: "my-own-linter" }] };
  const before: JsonObject = {
    model: "opus",
    permissions: { allow: ["Bash"] },
    hooks: { PreToolUse: [userHook], Stop: [{ hooks: [{ type: "command", command: "user-stop" }] }] },
  };
  const after = applyNestedHooks(before, CMD, SCRIPT, EVENTS);

  assert.strictEqual((after as any).model, "opus", "unrelated top-level keys must survive");
  assert.deepStrictEqual((after as any).permissions, { allow: ["Bash"] }, "unrelated keys untouched");
  const pre = (after as any).hooks.PreToolUse as any[];
  assert.ok(pre.some((d) => d === userHook || d.hooks?.[0]?.command === "my-own-linter"), "user PreToolUse hook preserved");
  assert.strictEqual(managedCount(after), 3, "one managed entry per subscribed event");
  // The user's Stop hook still there alongside ours.
  const stop = (after as any).hooks.Stop as any[];
  assert.ok(stop.some((d) => d.hooks?.[0]?.command === "user-stop"), "user Stop hook preserved");
}

// ── idempotent: re-install writes the same object ────────────────────────────
{
  const before: JsonObject = { hooks: { Stop: [{ hooks: [{ type: "command", command: "keep-me" }] }] } };
  const once = applyNestedHooks(before, CMD, SCRIPT, EVENTS);
  const twice = applyNestedHooks(once, CMD, SCRIPT, EVENTS);
  assert.strictEqual(JSON.stringify(once), JSON.stringify(twice), "re-install must be a no-op");
  assert.strictEqual(managedCount(twice), 3, "no duplicate managed entries after re-install");
}

// ── stale platform entry (.sh) is swept when installing (.cmd) ───────────────
{
  const stale: JsonObject = {
    hooks: { Stop: [{ hooks: [{ type: "command", command: "sh /x/tempest-claude-hook.sh" }] }] },
  };
  const after = applyNestedHooks(stale, CMD, SCRIPT, EVENTS);
  const stop = (after as any).hooks.Stop as any[];
  const shGone = !stop.some((d) => (d.hooks ?? []).some((h: any) => String(h.command).includes(".sh")));
  assert.ok(shGone, "a stale .sh managed entry must be swept by the .cmd install");
  assert.strictEqual(managedCount(after), 3, "exactly our entries remain");
}

// ── removal strips only our entries and restores the config ──────────────────
{
  const before: JsonObject = {
    model: "opus",
    hooks: { PreToolUse: [{ hooks: [{ type: "command", command: "my-own-linter" }] }] },
  };
  const installed = applyNestedHooks(before, CMD, SCRIPT, EVENTS);
  const { config: removed, changed } = removeNestedHooks(installed, SCRIPT);
  assert.strictEqual(changed, true, "removal reports a change when our entries existed");
  assert.strictEqual(managedCount(removed), 0, "no managed entries after removal");
  const pre = (removed as any).hooks.PreToolUse as any[];
  assert.ok(pre.some((d) => d.hooks?.[0]?.command === "my-own-linter"), "user hook survives our removal");
  assert.strictEqual((removed as any).model, "opus", "unrelated keys survive removal");

  const { changed: changedAgain } = removeNestedHooks(removed, SCRIPT);
  assert.strictEqual(changedAgain, false, "removing again is a no-op");
}

// ── matcher only matches our script token ────────────────────────────────────
{
  const isManaged = makeManagedMatcher(SCRIPT);
  assert.ok(isManaged("C:\\Users\\u\\.tempest\\hooks\\tempest-claude-hook.cmd"), "matches windows path");
  assert.ok(isManaged("/home/u/.tempest/hooks/tempest-claude-hook.sh"), "matches posix path, any ext");
  assert.ok(!isManaged("claude-hook-of-mine"), "must not match an unrelated command");
  assert.ok(!isManaged(undefined), "undefined command is not managed");
}

// ── Claude event → state map ─────────────────────────────────────────────────
{
  const s = (body: unknown) => claudeAdapter.parse(body);
  assert.strictEqual(s({ hook_event_name: "UserPromptSubmit" }), "working");
  assert.strictEqual(s({ hook_event_name: "PreToolUse", tool_name: "Bash" }), "working");
  assert.strictEqual(s({ hook_event_name: "PostToolUse", tool_name: "Bash" }), "working");
  assert.strictEqual(s({ hook_event_name: "PreToolUse", tool_name: "AskUserQuestion" }), "waiting", "AskUserQuestion blocks for a human");
  assert.strictEqual(s({ hook_event_name: "PermissionRequest", tool_name: "Bash" }), "waiting");
  assert.strictEqual(s({ hook_event_name: "Notification", notification_type: "permission_prompt" }), "waiting");
  // A message-only notification is NOT a transition: matching permission prompts on
  // the message string raised a bogus bell on completed turns, so waiting is now
  // driven by PermissionRequest / notification_type / AskUserQuestion only. See
  // adapters/claude.ts parse().
  assert.strictEqual(s({ hook_event_name: "Notification", message: "Claude needs your permission to use Bash" }), null, "message-string notifications aren't a transition");
  assert.strictEqual(s({ hook_event_name: "Notification", message: "Compacting conversation" }), null, "generic notifications aren't a transition");
  assert.strictEqual(s({ hook_event_name: "Stop" }), "done");
  assert.strictEqual(s({ hook_event_name: "SomethingNew" }), null, "unknown events ignored");
  assert.strictEqual(s("not an object"), null, "non-object payload ignored");
}

// ── raw-text JSON config helpers ─────────────────────────────────────────────
{
  const add = (c: JsonObject) => ({ ...c, tempest: true });
  // Missing/empty file → starts from {}.
  assert.strictEqual(applyJsonConfig(null, add), '{\n  "tempest": true\n}\n');
  assert.strictEqual(applyJsonConfig("", add), '{\n  "tempest": true\n}\n');
  // Malformed JSON → null (leave the user's file untouched).
  assert.strictEqual(applyJsonConfig("{ not json", add), null, "malformed config is never clobbered");
  assert.strictEqual(applyJsonConfig("[1,2,3]", add), null, "a non-object top level is treated as malformed");
  // Remove never creates a file and no-ops on absent.
  assert.strictEqual(removeJsonConfig(null, (c) => ({ config: c, changed: true })), null, "remove never creates the file");
  assert.strictEqual(removeJsonConfig('{"a":1}', (c) => ({ config: c, changed: false })), null, "no change → no write");
}

// ── posix plan shape, per adapter ────────────────────────────────────────────
const POSIX: HookPaths = {
  home: "/home/u",
  hooksDir: "/home/u/.tempest/hooks",
  endpointEnv: "/home/u/.tempest/hooks/endpoint.env",
  endpointCmd: "/home/u/.tempest/hooks/endpoint.cmd",
  windows: false,
};
function checkPlan(adapter: HookAdapter, route: string, configPath: string, script: string) {
  const plan = adapter.plan(POSIX);
  assert.strictEqual(plan.scripts.length, 1, `${adapter.id}: one script`);
  assert.strictEqual(plan.scripts[0].path, `/home/u/.tempest/hooks/${script}`);
  assert.ok(plan.scripts[0].executable, `${adapter.id}: posix script needs exec bit`);
  assert.ok(plan.scripts[0].content.includes(`/hook/${route}`), `${adapter.id}: posts to its route`);
  assert.ok(plan.scripts[0].content.includes("--data-binary @-"), `${adapter.id}: forwards stdin`);
  assert.strictEqual(plan.configs.length, 1, `${adapter.id}: one config`);
  assert.strictEqual(plan.configs[0].path, configPath);
  // apply on a blank config produces JSON that references our script.
  const applied = plan.configs[0].apply(null);
  assert.ok(applied && applied.includes(script), `${adapter.id}: managed command references the script`);
  // remove on that applied config strips it back out.
  const removed = plan.configs[0].remove(applied);
  assert.ok(removed !== null && !removed.includes(script), `${adapter.id}: remove strips our command`);
}
checkPlan(claudeAdapter, "claude", "/home/u/.claude/settings.json", "tempest-claude-hook.sh");
checkPlan(geminiAdapter, "gemini", "/home/u/.gemini/settings.json", "tempest-gemini-hook.sh");
checkPlan(cursorAdapter, "cursor", "/home/u/.cursor/hooks.json", "tempest-cursor-hook.sh");

// ── Gemini: ms timeout, {} on stdout, no waiting, Before/After map ───────────
{
  const plan = geminiAdapter.plan(POSIX);
  assert.ok(plan.scripts[0].content.includes("printf '{}\\n'"), "gemini prints {} for its stdout parser");
  assert.ok(plan.configs[0].apply(null)!.includes("10000"), "gemini timeout is in milliseconds");
  assert.strictEqual(geminiAdapter.coversWaiting, false, "gemini keeps the attention fallback");
  assert.strictEqual(geminiAdapter.parse({ hook_event_name: "BeforeAgent" }), "working");
  assert.strictEqual(geminiAdapter.parse({ hook_event_name: "BeforeTool" }), "working");
  assert.strictEqual(geminiAdapter.parse({ hook_event_name: "AfterAgent" }), "done");
  assert.strictEqual(geminiAdapter.parse({ hook_event_name: "Stop" }), null, "gemini has no Stop event");
}

// ── Cursor: direct-command schema + version:1, stop→done ─────────────────────
{
  const applied = cursorAdapter.plan(POSIX).configs[0].apply('{"hooks":{"stop":[{"command":"mine"}]}}');
  const cfg = JSON.parse(applied!);
  assert.strictEqual(cfg.version, 1, "cursor requires top-level version");
  assert.ok(cfg.hooks.stop.some((d: { command?: string }) => d.command === "mine"), "user cursor hook preserved");
  assert.ok(cfg.hooks.stop.some((d: { command?: string }) => (d.command ?? "").includes("tempest-cursor-hook")), "our command added directly on the definition");
  assert.strictEqual(cursorAdapter.parse({ hook_event_name: "stop" }), "done");
  assert.strictEqual(cursorAdapter.parse({ hook_event_name: "preToolUse" }), "working");
  assert.strictEqual(cursorAdapter.parse({ hook_event_name: "beforeShellExecution" }), "working", "cursor pre-exec gates are working, not waiting");
  assert.strictEqual(cursorAdapter.coversWaiting, false);
}

// ── Copilot: per-event env-injected command, waiting signals ─────────────────
{
  const plan = copilotAdapter.plan(POSIX);
  assert.strictEqual(plan.configs[0].path, "/home/u/.copilot/hooks/tempest.json");
  const applied = plan.configs[0].apply(null)!;
  const cfg = JSON.parse(applied);
  // Each event carries a distinct env-injected command referencing our script.
  assert.ok(cfg.hooks.SessionStart[0].bash.includes("TEMPEST_HOOK_EVENT='SessionStart'"), "per-event name injected");
  assert.ok(cfg.hooks.Stop[0].bash.includes("TEMPEST_HOOK_EVENT='Stop'"));
  assert.ok(cfg.hooks.SessionStart[0].bash.includes("tempest-copilot-hook"), "invokes our script");
  assert.ok(plan.scripts[0].content.includes('X-Tempest-Event'), "script forwards the event header");
  const removed = plan.configs[0].remove(applied);
  assert.ok(removed !== null && !removed.includes("tempest-copilot-hook"), "copilot remove strips ours");
  assert.strictEqual(copilotAdapter.parse({ hook_event_name: "Stop" }), "done");
  assert.strictEqual(copilotAdapter.parse({ hook_event_name: "PostToolUse" }), "working");
  assert.strictEqual(copilotAdapter.parse({ hook_event_name: "Notification", notification_type: "permission_prompt" }), "waiting");
  assert.strictEqual(copilotAdapter.parse({ hook_event_name: "PreToolUse", tool_name: "AskUser" }), "waiting");
  assert.strictEqual(copilotAdapter.parse({ hook_event_name: "PreToolUse", tool_name: "Bash" }), "working");
  assert.strictEqual(copilotAdapter.parse({ hook_event_name: "ErrorOccurred", recoverable: false }), "done");
  assert.strictEqual(copilotAdapter.coversWaiting, true);
}

// ── Antigravity: bundle key, per-event wrappers (win), Stop fullyIdle ─────────
{
  const posix = antigravityAdapter.plan(POSIX);
  assert.strictEqual(posix.configs[0].path, "/home/u/.gemini/config/hooks.json");
  assert.strictEqual(posix.scripts.length, 1, "posix: only the core script");
  const applied = posix.configs[0].apply('{"other-bundle":{"X":[{"command":"user"}]}}')!;
  const cfg = JSON.parse(applied);
  assert.ok(cfg["other-bundle"], "unrelated hook bundles are preserved");
  assert.ok(cfg["tempest-status"].PreInvocation[0].command.includes("tempest-antigravity"), "our bundle installed");
  assert.ok(Array.isArray(cfg["tempest-status"].PostToolUse[0].hooks), "PostToolUse uses the tool schema");
  const removed = posix.configs[0].remove(applied);
  const rcfg = JSON.parse(removed!);
  assert.ok(!rcfg["tempest-status"], "remove drops our bundle");
  assert.ok(rcfg["other-bundle"], "remove keeps unrelated bundles");
  // Windows plan writes the core + one wrapper per event.
  const win = antigravityAdapter.plan({ ...POSIX, windows: true });
  assert.strictEqual(win.scripts.length, 1 + 4, "windows: core + 4 per-event wrappers");
  assert.strictEqual(antigravityAdapter.parse({ hook_event_name: "Stop" }), "done");
  assert.strictEqual(antigravityAdapter.parse({ hook_event_name: "Stop", fullyIdle: false }), "working", "Stop with fullyIdle:false is still working");
  assert.strictEqual(antigravityAdapter.parse({ hook_event_name: "PreInvocation" }), "working");
  assert.strictEqual(antigravityAdapter.coversWaiting, false);
}

// ── SHA-256 correctness (known vectors) ──────────────────────────────────────
{
  assert.strictEqual(sha256Hex(""), "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
  assert.strictEqual(sha256Hex("abc"), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  const trusted = computeTrustedHash({ sourcePath: "/h/.codex/hooks.json", eventLabel: "stop", groupIndex: 0, handlerIndex: 0, command: "x", timeoutSec: 10 });
  assert.ok(/^sha256:[0-9a-f]{64}$/.test(trusted), "trusted hash is sha256:<64 hex>");
  assert.strictEqual(trusted, computeTrustedHash({ sourcePath: "/other", eventLabel: "stop", groupIndex: 5, handlerIndex: 9, command: "x", timeoutSec: 10 }), "hash ignores path/position (Codex hashes only the handler identity)");
}

// Replacing one trust block must preserve a newline before the next table.
{
  const entry = { sourcePath: "/h/.codex/hooks.json", eventLabel: "stop", groupIndex: 0, handlerIndex: 0, command: "new", timeoutSec: 10 };
  const before = '[hooks.state."/h/.codex/hooks.json:stop:0:0"]\nenabled = true\ntrusted_hash = "old"\n[other]\nvalue = true\n';
  const after = upsertTrustBlocks(before, [entry]);
  assert.ok(after.includes(`trusted_hash = "${computeTrustedHash(entry)}"\n[other]`), "replacement keeps next TOML table on a new line");
}

// ── Codex: hooks.json + config.toml trust, positions shared across both ───────
{
  const plan = codexAdapter.plan(POSIX);
  const [hooksEdit, tomlEdit] = plan.configs;
  assert.strictEqual(hooksEdit.path, "/home/u/.codex/hooks.json");
  assert.strictEqual(tomlEdit.path, "/home/u/.codex/config.toml");
  // hooks.json apply must run first (it fills the group positions the toml uses).
  const hooksOut = hooksEdit.apply('{"hooks":{"Stop":[{"hooks":[{"type":"command","command":"user-stop"}]}]}}')!;
  const hj = JSON.parse(hooksOut);
  assert.ok(hj.hooks.Stop.some((d: { hooks?: { command?: string }[] }) => d.hooks?.[0]?.command === "user-stop"), "user codex hook preserved");
  assert.ok(hj.hooks.Stop[1].hooks[0].command.includes("tempest-codex-hook"), "our hook appended last");
  const toml = tomlEdit.apply(null)!;
  assert.ok(toml.includes('[hooks.state."/home/u/.codex/hooks.json:stop:1:0"]'), "trust key uses the shared group index (1)");
  assert.ok(toml.includes("trusted_hash"), "trust block carries a hash");
  assert.ok(toml.includes("enabled = true"));
  // remove strips both.
  assert.ok(!codexAdapter.plan(POSIX).configs[0].remove(hooksOut)!.includes("tempest-codex-hook"), "codex hooks.json remove strips ours");
  const rem = codexAdapter.plan(POSIX).configs[1].remove(toml);
  assert.ok(rem !== null && !rem.includes("tempest-codex-hook.sh".slice(0, 0) + "hooks.json:stop"), "codex toml remove strips our trust");
  assert.strictEqual(codexAdapter.parse({ hook_event_name: "PermissionRequest" }), "waiting");
  assert.strictEqual(codexAdapter.parse({ hook_event_name: "session_start" }), "working", "snake_case events accepted");
  assert.strictEqual(codexAdapter.parse({ hook_event_name: "PreToolUse", tool_name: "request_user_input" }), "waiting");
  assert.strictEqual(codexAdapter.parse({ hook_event_name: "Stop" }), "done");
}

// ── Hermes: enable in YAML, plugin files, approval → waiting ──────────────────
{
  const plan = hermesAdapter.plan(POSIX);
  assert.strictEqual(plan.scripts.length, 2, "hermes writes plugin.yaml + __init__.py");
  assert.ok(plan.scripts.some((s) => s.path.endsWith("__init__.py") && s.content.includes("/hook/hermes")), "python plugin posts to hermes route");
  const enabled = plan.configs[0].apply("plugins:\n  enabled: [other]\n")!;
  assert.ok(enabled.includes("tempest-status"), "plugin enabled in config.yaml");
  assert.ok(enabled.includes("other"), "existing enabled plugins preserved");
  const disabled = plan.configs[0].remove(enabled);
  assert.ok(disabled !== null && !disabled.includes("tempest-status"), "hermes remove disables the plugin");
  assert.strictEqual(hermesAdapter.parse({ hook_event_name: "pre_approval_request" }), "waiting");
  assert.strictEqual(hermesAdapter.parse({ hook_event_name: "post_llm_call" }), "done");
  assert.strictEqual(hermesAdapter.parse({ hook_event_name: "pre_tool_call" }), "working");
}

// ── Opencode: JS plugin file, event map ──────────────────────────────────────
{
  const plan = opencodeAdapter.plan(POSIX);
  assert.strictEqual(plan.configs[0].path, "/home/u/.config/opencode/plugin/tempest-status.js");
  const js = plan.configs[0].apply(null)!;
  assert.ok(js.includes("/hook/opencode") && js.includes("permission.asked"), "plugin maps opencode events");
  assert.ok(js.includes("X-Tempest-Session"), "plugin sends the session header");
  const removed = plan.configs[0].remove(js);
  assert.ok(removed !== null && !removed.includes("permission.asked"), "remove replaces with a no-op plugin");
  assert.strictEqual(plan.configs[0].remove(removed), null, "remove is idempotent");
  assert.strictEqual(opencodeAdapter.parse({ hook_event_name: "SessionBusy" }), "working");
  assert.strictEqual(opencodeAdapter.parse({ hook_event_name: "SessionIdle" }), "done");
  assert.strictEqual(opencodeAdapter.parse({ hook_event_name: "PermissionRequest" }), "waiting");
}

console.log("agentHooks installer.check: all assertions passed");
