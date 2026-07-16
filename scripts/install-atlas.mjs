import { cpSync, rmSync, mkdirSync, writeFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const src = join(root, 'node_modules', '@usetempest', 'atlas')
const dest = join(root, 'src-tauri', 'resources', 'atlas')

rmSync(dest, { recursive: true, force: true })
mkdirSync(dest, { recursive: true })

// Pin to CommonJS so Node doesn't inherit the root package.json "type": "module"
writeFileSync(
  join(dest, 'package.json'),
  JSON.stringify({ name: '@tempest/atlas-runtime', private: true, type: 'commonjs' }, null, 2) + '\n'
)

cpSync(src, join(dest, 'node_modules', '@usetempest', 'atlas'), { recursive: true })
console.log('Atlas staged → src-tauri/resources/atlas/')
