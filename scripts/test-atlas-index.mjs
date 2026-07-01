// Standalone Atlas indexing smoke test.
//
// Purpose: run Atlas.init(path, { index: true }) directly against the BUILT
// bundle that Tauri ships (src-tauri/resources/atlas/dist), using the same
// node_modules the app ships. If this completes, Atlas itself works and the
// hang is in how Tauri spawns the process (env, cwd, stdio, detachment).
//
// Run:  node scripts/test-atlas-index.mjs [targetPath]

import { createRequire } from 'node:module';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Repo layout: <repo>/scripts/test-atlas-index.mjs
const repoRoot = path.resolve(__dirname, '..');
const atlasRoot = path.join(repoRoot, 'src-tauri', 'resources', 'atlas');
const distIndex = path.join(atlasRoot, 'dist', 'index.js');

// Hardcoded test target (override via argv[2]).
const targetPath = process.argv[2] || 'D:\\GSVP\\SaaS\\hydra\\tempest-git';

const t0 = Date.now();
function log(msg) {
  const ms = String(Date.now() - t0).padStart(6, ' ');
  process.stderr.write(`[test +${ms}ms] ${msg}\n`);
}

// Overall watchdog. If Atlas hangs, we still exit and print where we were.
let lastStep = 'startup';
const timeout = setTimeout(() => {
  process.stderr.write(`\nTIMEOUT after 60s — last step: ${lastStep}\n`);
  process.exit(1);
}, 60_000);
timeout.unref?.();

async function main() {
  log(`repoRoot          = ${repoRoot}`);
  log(`atlasRoot         = ${atlasRoot}`);
  log(`distIndex         = ${distIndex}`);
  log(`targetPath        = ${targetPath}`);
  log(`node              = ${process.version} (${process.platform}/${process.arch})`);
  log(`cwd               = ${process.cwd()}`);

  if (!fs.existsSync(distIndex)) throw new Error(`dist/index.js not found at ${distIndex}`);
  if (!fs.existsSync(targetPath)) throw new Error(`target not found at ${targetPath}`);

  // Resolve the bundle's deps from ITS node_modules, exactly like node would
  // when running dist/mcp/server-entry.js.
  lastStep = 'createRequire';
  const require = createRequire(distIndex);

  // Sanity-check the WASM runtime resolves from the shipped node_modules.
  lastStep = 'resolve web-tree-sitter';
  try {
    const wts = require.resolve('web-tree-sitter');
    log(`web-tree-sitter   = ${wts}`);
  } catch (e) {
    log(`web-tree-sitter RESOLVE FAILED: ${e}`);
    throw e;
  }
  try {
    const tsw = require.resolve('tree-sitter-wasms/out/tree-sitter-typescript.wasm');
    log(`tree-sitter-wasms = ${tsw}`);
  } catch (e) {
    log(`tree-sitter-wasms RESOLVE FAILED (non-fatal): ${e}`);
  }

  lastStep = 'require dist/index.js';
  log('requiring Atlas bundle...');
  const mod = require(distIndex);
  const Atlas = mod.default ?? mod.Atlas ?? mod;
  log(`Atlas loaded. isInitialized fn: ${typeof mod.isInitialized}`);

  lastStep = 'isInitialized check';
  if (typeof mod.isInitialized === 'function' && mod.isInitialized(targetPath)) {
    log('target ALREADY initialized — Atlas.init() would throw. Using a temp copy check instead.');
    log('To force a fresh index, remove the .tempest/atlas (or .atlas) dir under the target.');
    // Still exercise the heavy path (grammar init) so we learn if that hangs:
    if (typeof mod.initGrammars === 'function') {
      lastStep = 'initGrammars (already-initialized path)';
      log('calling initGrammars() to test WASM runtime...');
      await mod.initGrammars();
      log('initGrammars() OK');
    }
    clearTimeout(timeout);
    log('DONE (target already initialized; grammar runtime verified).');
    process.exit(0);
  }

  lastStep = 'Atlas.init({ index: true })';
  log('calling Atlas.init(targetPath, { index: true }) ...');
  const instance = await Atlas.init(targetPath, {
    index: true,
    onProgress: (p) => log(`progress: ${p.phase} ${p.current ?? ''}/${p.total ?? ''}`),
  });
  log('Atlas.init() RESOLVED');

  lastStep = 'getStats';
  try {
    const stats = instance.getStats?.();
    if (stats) log(`stats: nodes=${stats.nodeCount ?? '?'} edges=${stats.edgeCount ?? '?'}`);
  } catch (e) {
    log(`getStats failed (non-fatal): ${e}`);
  }

  lastStep = 'close';
  instance.close?.();
  log('closed instance');

  clearTimeout(timeout);
  log('SUCCESS — Atlas indexed the target directly.');
  process.exit(0);
}

main().catch((err) => {
  clearTimeout(timeout);
  process.stderr.write(`\nFAILURE at step "${lastStep}":\n${err && err.stack ? err.stack : err}\n`);
  process.exit(1);
});
