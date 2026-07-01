import { cpSync, rmSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const src = join(root, 'packages', 'atlas', 'dist')
const dest = join(root, 'src-tauri', 'resources', 'atlas')

rmSync(dest, { recursive: true, force: true })
mkdirSync(dest, { recursive: true })

cpSync(src, dest, { recursive: true })
console.log('Atlas dist bundled → src-tauri/resources/atlas/')
