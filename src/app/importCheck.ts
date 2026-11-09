// Live check of whatever is in the Import box: valid JSON, matches the format, and a few friendly warnings.
import { parseDesign, type Design } from '../model/schema'
import { extractJson } from './share'

export type ImportCheck =
  | { status: 'empty' }
  | { status: 'invalid'; errors: string[] }
  | { status: 'valid'; design: Design; summary: string; warnings: string[] }

const count = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

export function checkImport(raw: string): ImportCheck {
  if (!raw.trim()) return { status: 'empty' }
  let json: unknown
  try { json = JSON.parse(extractJson(raw)) } catch (e) { return { status: 'invalid', errors: [`Not valid JSON: ${(e as Error).message}`] } }
  const r = parseDesign(json)
  if (!r.ok) return { status: 'invalid', errors: r.errors }

  const d = r.design
  const steps = d.flows.reduce((n, f) => n + f.steps.length, 0)
  const parts = [count(d.nodes.length, 'component'), count(d.edges.length, 'connection'), `${count(d.flows.length, 'flow')} (${count(steps, 'step')})`]
  if (d.network) parts.push(`${d.network.zones}-zone network`)

  const warnings: string[] = []
  if (!d.flows.length) warnings.push('No flows yet, so there is nothing to play. Add a flow to watch a request travel.')
  const linked = new Set(d.edges.flatMap(e => [e.from, e.to]))
  const loose = d.nodes.filter(n => !linked.has(n.id))
  if (d.nodes.length > 1 && loose.length)
    warnings.push(`Not connected to anything: ${loose.slice(0, 3).map(n => n.label).join(', ')}${loose.length > 3 ? ` and ${loose.length - 3} more` : ''}.`)
  return { status: 'valid', design: d, summary: parts.join(' · '), warnings }
}
