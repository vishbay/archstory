// Under the hood (a labs feature): protocol timelines, every *.json in this folder. Each one is an archstory/v1 design with
// meta.kind "protocol", validated at load like the library so a bad file fails loudly in dev and tests. These stay out of
// LIBRARY, so the drill, Practice, hints and compare never see them.
import { isProtocol, parseDesign, type Design } from '../model/schema'

const files = import.meta.glob<{ default: unknown }>('./*.json', { eager: true })

export const PROTOCOLS: Design[] = Object.entries(files).map(([path, mod]) => {
  const r = parseDesign(mod.default)
  if (!r.ok) throw new Error(`${path} is not a valid design:\n${r.errors.join('\n')}`)
  if (!isProtocol(r.design)) throw new Error(`${path} needs "meta": { "kind": "protocol" }`)
  return r.design
}).sort((a, b) => (a.meta.order ?? Infinity) - (b.meta.order ?? Infinity) || a.meta.title.localeCompare(b.meta.title))
