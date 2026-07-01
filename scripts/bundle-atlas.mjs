import { cpSync, rmSync, mkdirSync, existsSync, writeFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const dest = join(root, 'src-tauri', 'resources', 'atlas')

rmSync(dest, { recursive: true, force: true })
mkdirSync(dest, { recursive: true })

// Mark the bundle as CommonJS. The compiled atlas dist/ is CJS (exports/require),
// but ships without a package.json. Node infers a .js file's module type from the
// NEAREST package.json walking up the tree — and in a dev worktree the nearest
// ancestor is the app's own package.json, which declares "type": "module". That
// makes node load server-entry.js as ESM and crash at load with
// `ReferenceError: exports is not defined in ES module scope`, BEFORE main() runs
// — so no logs, no atlas.db, and the spawn looks like an indefinite hang. A
// package.json here pins the bundle to CommonJS regardless of any ancestor.
writeFileSync(
  join(dest, 'package.json'),
  JSON.stringify({ name: '@tempest/atlas-bundle', private: true, type: 'commonjs', main: 'dist/index.js' }, null, 2) + '\n'
)
console.log('  Wrote package.json (type: commonjs)')

// Copy compiled atlas dist.
cpSync(join(root, 'packages', 'atlas', 'dist'), join(dest, 'dist'), { recursive: true })
console.log('  Copied atlas dist/')

// Copy runtime deps into the bundle.
// These are pure JS/WASM — no native addons. Nothing here is committed to git
// (src-tauri/resources/atlas/ is gitignored). npm workspaces hoists them to root
// node_modules/ after `npm install`, so this copy only happens at build time.
const runtimeDeps = ['ignore', 'jsonc-parser', 'picomatch', 'tree-sitter-wasms', 'web-tree-sitter']
const rootModules = join(root, 'node_modules')
const atlasModules = join(root, 'packages', 'atlas', 'node_modules')
const destModules = join(dest, 'node_modules')
mkdirSync(destModules, { recursive: true })

for (const dep of runtimeDeps) {
  const fromRoot = join(rootModules, dep)
  const fromAtlas = join(atlasModules, dep)
  const src = existsSync(fromRoot) ? fromRoot : existsSync(fromAtlas) ? fromAtlas : null
  if (!src) {
    console.error(`  ERROR: ${dep} not found — run npm install first`)
    process.exit(1)
  }
  cpSync(src, join(destModules, dep), { recursive: true })
  console.log(`  Copied node_modules/${dep}`)
}

console.log('\nAtlas bundled → src-tauri/resources/atlas/')
