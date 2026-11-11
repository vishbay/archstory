import { describe, expect, it } from 'vitest'
import { LIBRARY } from '../library'
import { addFlow, addNode, appendStep, blankAttempt } from './attempt'
import { hintsFor } from './hints'
import type { Design } from '../model/schema'

const url = LIBRARY.find(d => d.id === 'url-shortener')!
const build = (kinds: string[]) => kinds.reduce((d, k) => addNode(d, k).design, blankAttempt(url))
/** A flow through every node, in order. */
const walk = (d: Design) => {
  const f = addFlow(d)
  return d.nodes.slice(1).reduce((x, n, i) => appendStep(x, f.id, d.nodes[i].id, n.id), f.design)
}
const text = (d: Design, ref = url) => hintsFor(d, ref).map(h => h.lines)

describe('hint ladder', () => {
  it('points at every tier, every missing part and one flow for an empty attempt', () => {
    const [tiers, parts, flow] = hintsFor(blankAttempt(url), url)
    expect(tiers.lines).toEqual(['Nothing in the Clients tier yet', 'Nothing in the Edge tier yet', 'Nothing in the Entry tier yet',
      'Nothing in the Services tier yet', 'Nothing in the Data tier yet', 'Nothing in the Async tier yet'])
    expect(parts.lines).toContain('Where would repeated reads be served from? (a cache)')
    expect(parts.lines.join(' ')).not.toMatch(/DNS|service|client/i)
    expect(flow.lines).toEqual(['Create link: Client (Web client) → DNS → CDN → Load Balancer (L7) → API Service → Key Gen Service (Key generator) → Primary DB (SQL database) → Read Replica → Cache'])
    expect([tiers, parts, flow].every(h => !h.done)).toBe(true)
  })

  it('names only what a partial attempt is missing', () => {
    const [tiers, parts, flow] = hintsFor(build(['web_client', 'cdn', 'load_balancer', 'service', 'sql_db', 'cache']), url)
    expect(tiers.lines).toEqual(['Nothing in the Async tier yet'])
    expect(parts.lines).toEqual([
      'How are unique keys made without collisions? (a key generator)',
      'How would the database keep up with heavy reads? (read replicas)',
      'How is slow work handed off so the caller does not wait? (a queue or event stream)',
      'What does the work that happens off the request path? (background workers)',
      'Where would events go for reporting? (an analytics store)',
    ])
    expect(flow.done).toBe(false)
  })

  it('says so when a complete attempt has nothing left to add', () => {
    const done = walk(build(['web_client', 'cdn', 'load_balancer', 'service', 'key_gen', 'sql_db', 'db_replica', 'cache', 'stream', 'scheduler', 'analytics']))
    const hints = hintsFor(done, url)
    expect(hints.every(h => h.done && h.lines.length === 1)).toBe(true)
    expect(hints[0].lines[0]).toMatch(/^Every tier/)
    expect(hints[1].lines[0]).toMatch(/^You have every kind/)
    expect(hints[2].lines[0]).toBe('Your flow "Flow 1" already covers the path of "Create link".')
  })

  it('handles a small reference with no flows', () => {
    const ref: Design = { ...build(['web_client', 'service', 'custom_thing']), id: 'mine', flows: [] }
    expect(text(build(['web_client']), ref)).toEqual([
      ['Nothing in the Services tier yet'],
      ['Think about a custom thing'],
      ['The reference has no flows to show.'],
    ])
  })

  it('never uses dashes as punctuation', () => {
    for (const d of [blankAttempt(url), ...LIBRARY.map(r => blankAttempt(r))])
      for (const r of LIBRARY) expect(text(d, r).flat().join(' ')).not.toMatch(/ [-–—] /)
  })
})
