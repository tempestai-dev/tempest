// Self-check for src/lib/gitClone.ts. Run with `node src/lib/gitClone.check.ts`
// (or `npm test gitClone`) — no framework, no Tauri invoke, no React.
import assert from "node:assert";
import { parseCloneUrl, defaultFolderName, classifyCloneError } from "./gitClone.ts";

// ── parseCloneUrl / defaultFolderName: URL shapes ────────────────────────────
{
  assert.strictEqual(defaultFolderName("https://github.com/anthropics/claude-code"), "claude-code");
  assert.strictEqual(defaultFolderName("https://github.com/anthropics/claude-code.git"), "claude-code");
  assert.strictEqual(defaultFolderName("https://github.com/anthropics/claude-code/"), "claude-code");
  assert.strictEqual(defaultFolderName("ssh://git@github.com/anthropics/claude-code.git"), "claude-code");
  assert.strictEqual(defaultFolderName("git@github.com:anthropics/claude-code.git"), "claude-code");
  assert.strictEqual(defaultFolderName("git@github.com:anthropics/claude-code"), "claude-code");
  // self-hosted, non-standard port
  assert.strictEqual(defaultFolderName("https://git.example.com:8443/team/widgets.git"), "widgets");

  assert.strictEqual(parseCloneUrl("not a url").valid, false);
  assert.strictEqual(parseCloneUrl("").valid, false);
  assert.strictEqual(parseCloneUrl("https://github.com/").valid, false);
  assert.strictEqual(parseCloneUrl("https://github.com/anthropics/claude-code").valid, true);
}

// ── classifyCloneError: each bucket, plus an unmatched fallback ──────────────
{
  assert.strictEqual(
    classifyCloneError("fatal: destination path 'repo' already exists and is not an empty directory.").category,
    "exists",
  );
  assert.strictEqual(
    classifyCloneError("git@github.com: Permission denied (publickey).").category,
    "auth",
  );
  assert.strictEqual(
    classifyCloneError("remote: Repository not found.\nfatal: repository 'https://github.com/x/y.git/' not found").category,
    "auth",
  );
  assert.strictEqual(
    classifyCloneError("fatal: could not read Username for 'https://github.com': terminal prompts disabled").category,
    "auth",
  );
  assert.strictEqual(
    classifyCloneError("fatal: unable to access 'https://github.com/x/y.git/': Could not resolve host: github.com").category,
    "network",
  );
  assert.strictEqual(
    classifyCloneError("ssh: connect to host github.com port 22: Connection timed out").category,
    "network",
  );
  assert.strictEqual(classifyCloneError("fatal: something completely unexpected happened").category, "unknown");
}

console.log("gitClone: all checks passed");
