// Built-in designs: every *.json in this folder, validated at load so a bad file fails loudly in dev and tests.
import { parseDesign, type Design } from '../model/schema'

const files = import.meta.glob<{ default: unknown }>('./*.json', { eager: true })

export const LIBRARY: Design[] = Object.entries(files).map(([path, mod]) => {
  const r = parseDesign(mod.default)
  if (!r.ok) throw new Error(`${path} is not a valid design:\n${r.errors.join('\n')}`)
  return r.design
}).sort((a, b) => a.meta.title.localeCompare(b.meta.title))
