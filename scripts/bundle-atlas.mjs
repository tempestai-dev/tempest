import { cpSync, rmSync, mkdirSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const dest = join(root, 'src-tauri', 'resources', 'atlas')

rmSync(dest, { recursive: true, force: true })
mkdirSync(dest, { recursive: true })

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
