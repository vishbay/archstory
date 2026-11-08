import { describe, expect, it } from 'vitest'
import { LIBRARY } from '.'
import { layoutZones, resolveFlow } from '../layout/zones'
import { resilience } from '../model/availability'
import { layoutBands, NODE_W } from '../layout/bands'

describe.each(LIBRARY.map(d => [d.id, d] as const))('%s', (_, d) => {
  const zones = d.network?.zones ?? 1

  it('has requirements, flows with explanations, and notes', () => {
    expect(d.requirements.functional.length).toBeGreaterThan(0)
    expect(d.flows.length).toBeGreaterThan(0)
    for (const f of d.flows) expect(f.steps.some(s => s.detail), f.id).toBe(true)
    expect(d.notes.length).toBeGreaterThan(2)
  })

  it('lays out without overlapping nodes, with and without the network layer', () => {
    for (const network of [false, true]) {
      const ps = Object.values(layoutBands(d, { network }).pos)
      for (const p of ps) for (const q of ps)
        if (p !== q && p.y === q.y) expect(Math.abs(p.x - q.x)).toBeGreaterThanOrEqual(NODE_W)
    }
  })

  it.runIf(zones > 1)('every flow routes through concrete instances in every entry zone and zone failure', () => {
    for (const failed of [null, ...Array(zones).keys()]) {
      const L = layoutZones(d, failed)
      for (const f of d.flows) for (let home = 0; home < zones; home++) {
        resolveFlow(L, f, home, failed).forEach((h, i) => {
          const s = f.steps[i]
          if (s.from === s.to) return
          expect(h.from && h.to && h.edge, `${f.id} step ${i + 1} (${s.from}→${s.to}) home=${home} failed=${failed}`).toBeTruthy()
        })
      }
    }
  })

  it.runIf(zones > 1)('has no single point of failure on the request path', () => {
    expect(resilience(d, 0, 'aws')!.spofs.map(n => n.id)).toEqual([])
  })
})
