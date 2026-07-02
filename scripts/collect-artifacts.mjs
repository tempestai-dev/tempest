import { copyFileSync, mkdirSync, readdirSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const releaseDir = join(root, 'src-tauri', 'target', 'release')
const bundleDir = join(releaseDir, 'bundle')
const outDir = join(root, 'dist-installers')

mkdirSync(outDir, { recursive: true })

// 1. NSIS setup.exe
const nsisDir = join(bundleDir, 'nsis')
const nsisFile = readdirSync(nsisDir).find(f => f.endsWith('-setup.exe'))
if (!nsisFile) throw new Error('NSIS artifact not found in ' + nsisDir)
copyFileSync(join(nsisDir, nsisFile), join(outDir, nsisFile))
console.log('  NSIS installer:', nsisFile)

// 2. Portable exe -- the raw compiled binary, runs without installation
const portableSrc = join(releaseDir, 'tempest.exe')
if (!existsSync(portableSrc)) throw new Error('tempest.exe not found at ' + portableSrc)
const portableDest = 'tempest.exe'
copyFileSync(portableSrc, join(outDir, portableDest))
console.log('  Portable exe:  ', portableDest)

console.log('\nAll artifacts written to dist-installers/')
