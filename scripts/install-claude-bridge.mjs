import { execSync } from 'child_process'
import { existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { pruneCruft } from './prune-bundle.mjs'

// Vendor the claude-bridge sidecar's node_modules in place, so the Agent SDK is
// self-contained under src-tauri/resources/claude-bridge/ (dev) and gets bundled
// as a Tauri resource for release — same self-contained-resource shape as atlas.
const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const dir = join(root, 'src-tauri', 'resources', 'claude-bridge')

if (!existsSync(join(dir, 'package.json'))) process.exit(0)

try {
  execSync('npm install --omit=dev --no-audit --no-fund --silent', { cwd: dir, stdio: 'inherit' })
  const nm = join(dir, 'node_modules')
  if (existsSync(nm)) {
    const bytesPruned = pruneCruft(nm)
    if (bytesPruned > 0) {
      const mb = (bytesPruned / 1024 / 1024).toFixed(1)
      console.log(`[install-claude-bridge] pruned ${mb} MB of cruft`)
    }
  }
  console.log('Claude bridge staged → src-tauri/resources/claude-bridge/node_modules')
} catch (e) {
  // Non-fatal: the CLI chat backend just stays unavailable until deps install.
  console.warn('Claude bridge install skipped:', e?.message ?? e)
}
