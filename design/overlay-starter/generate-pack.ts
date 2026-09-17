import { readFileSync, writeFileSync } from 'node:fs'
import {
  createBlankPack,
  createStarterPack,
  exportOverlayPack,
} from '../../src/lib/overlays/index.ts'

const args = process.argv.slice(2)
if (args.length > 1 || (args.length === 1 && args[0] !== '--check')) {
  throw new Error('Usage: node --import tsx design/overlay-starter/generate-pack.ts [--check]')
}
const checkOnly = args[0] === '--check'
const outputs = [
  { name: 'empty-master.pack.json', pack: createBlankPack() },
  { name: 'broadcast-scenes.pack.json', pack: createStarterPack() },
].map(({ name, pack }) => {
  if (pack.screens.some((screen) => screen.layers.length !== 0)) {
    throw new Error(`Refusing to generate ${name}: the starter factory is no longer empty.`)
  }
  return { name, url: new URL(name, import.meta.url), content: exportOverlayPack(pack) }
})

// Preflight every file before creating anything. Authored packs must never be replaced.
const missing = outputs.filter(({ name, url, content }) => {
  let existing: string
  try {
    existing = readFileSync(url, 'utf8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    return true
  }
  if (existing !== content) {
    throw new Error(`${name} differs from the canonical empty starter; preserving the existing file.`)
  }
  return false
})

if (checkOnly && missing.length > 0) {
  throw new Error(`Missing generated files: ${missing.map(({ name }) => name).join(', ')}`)
}
if (!checkOnly) {
  for (const { name, url, content } of missing) {
    writeFileSync(url, content, { encoding: 'utf8', flag: 'wx', mode: 0o644 })
    console.log(`Created ${name}`)
  }
}
console.log('Empty overlay starter files match the canonical pack API.')
