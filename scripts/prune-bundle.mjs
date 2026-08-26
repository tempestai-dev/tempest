import { readdirSync, statSync, rmSync } from 'fs'
import { join } from 'path'

// Cruft that is never loaded at runtime: sourcemaps (huge, .map next to every
// .js), TypeScript sources / declarations (bridges are consumed as JS), tests,
// docs, examples, CI config, changelogs. Runtime is byte-identical; installer
// shrinks.
const DROP_DIRS = new Set([
  'test', 'tests', '__tests__', '__test__', 'spec', '__mocks__',
  'docs', 'doc', 'example', 'examples', 'sample', 'samples',
  '.github', '.vscode', '.idea',
])
const DROP_FILE_EXT = ['.map', '.md', '.markdown', '.ts']
const DROP_FILE_NAMES = new Set([
  'CHANGELOG', 'CHANGELOG.md', 'CHANGELOG.txt',
  'HISTORY.md', 'AUTHORS', 'CONTRIBUTORS',
  '.npmignore', '.eslintrc', '.eslintrc.js', '.eslintrc.json',
  '.prettierrc', '.travis.yml', '.editorconfig',
])

// ponytail: LICENSE stays — legal, not size. `.d.ts` goes only from bundled
// sidecars (they run as JS at runtime, no TS consumer downstream).
function shouldDropFile(name) {
  if (DROP_FILE_NAMES.has(name)) return true
  for (const ext of DROP_FILE_EXT) {
    if (name.endsWith(ext)) {
      // Keep tsconfig.json / package.json etc; .ts rule is for source files
      if (ext === '.ts' && (name.endsWith('.config.ts'))) return false
      return true
    }
  }
  return false
}

export function pruneCruft(dir) {
  let entries
  try { entries = readdirSync(dir) } catch { return 0 }
  let bytes = 0
  for (const name of entries) {
    const full = join(dir, name)
    let st
    try { st = statSync(full) } catch { continue }
    if (st.isDirectory()) {
      if (DROP_DIRS.has(name)) {
        bytes += dirSize(full)
        rmSync(full, { recursive: true, force: true })
      } else {
        bytes += pruneCruft(full)
      }
    } else if (shouldDropFile(name)) {
      bytes += st.size
      rmSync(full, { force: true })
    }
  }
  return bytes
}

function dirSize(dir) {
  let bytes = 0
  let entries
  try { entries = readdirSync(dir) } catch { return 0 }
  for (const name of entries) {
    const full = join(dir, name)
    let st
    try { st = statSync(full) } catch { continue }
    if (st.isDirectory()) bytes += dirSize(full)
    else bytes += st.size
  }
  return bytes
}
