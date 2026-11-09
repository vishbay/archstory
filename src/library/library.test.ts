import { describe, expect, it } from 'vitest'
import { LIBRARY } from '.'
import { layoutZones, resolveFlow } from '../layout/zones'
import { resilience } from '../model/availability'
import { layoutBands, NODE_W } from '../layout/bands'
import { tierOf } from '../model/kinds'

describe.each(LIBRARY.map(d => [d.id, d] as const))('%s', (_, d) => {
  const zones = d.network?.zones ?? 1

  it('has requirements, flows with explanations, and notes', () => {
    expect(d.requirements.functional.length).toBeGreaterThan(0)
    expect(d.flows.length).toBeGreaterThan(0)
    for (const f of d.flows) expect(f.steps.some(s => s.detail), f.id).toBe(true)
    expect(d.notes.length).toBeGreaterThan(2)
  })

  // Any client that calls the system has to find it by name. Designs where clients are only called (push
  // notifications) are exempt.
  it('resolves the system through DNS for every client that calls it', () => {
    const dns = new Set(d.nodes.filter(n => n.kind === 'dns').map(n => n.id))
    const callers = d.nodes.filter(n => tierOf(n) === 'client' && d.edges.some(e => e.from === n.id))
    for (const c of callers)
      expect(d.edges.some(e => e.from === c.id && dns.has(e.to)), `${c.label} has no connection to a DNS node`).toBe(true)
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

describe.each(LIBRARY.map(d => [d.id, d] as const))('%s monitoring', (_, d) => {
  const o = d.observability
  it('has SLOs taken from its requirements, and both kinds of alert', () => {
    expect(o, 'no observability section').toBeDefined()
    expect(o!.slos.length).toBeGreaterThanOrEqual(2)
    expect(o!.alerts.some(a => a.severity === 'page')).toBe(true)
    expect(o!.alerts.some(a => a.severity === 'ticket')).toBe(true)
    for (const s of o!.slos) expect(s.target, s.id).toBeGreaterThanOrEqual(99 - (['latency', 'freshness'].includes(s.kind) ? 4 : 0))
  })
  it('ties every alert to a component or an SLO, and every SLO to an alert', () => {
    for (const a of o!.alerts) expect(a.target || a.slo, a.id).toBeTruthy()
    for (const s of o!.slos.filter(x => x.kind !== 'correctness' || x.target < 100)) expect(o!.alerts.some(a => a.slo === s.id), `no alert protects SLO ${s.id}`).toBe(true)
  })
  it('explains how to debug at least one symptom, with several steps', () => {
    expect(o!.debug.length).toBeGreaterThanOrEqual(1)
    for (const x of o!.debug) expect(x.steps.length).toBeGreaterThanOrEqual(3)
  })
  it('lays out with the monitoring band without overlapping nodes', () => {
    const L = layoutBands(d, { network: true, observability: true })
    const ps = Object.values(L.pos)
    for (const p of ps) for (const q of ps) if (p !== q && p.y === q.y) expect(Math.abs(p.x - q.x)).toBeGreaterThanOrEqual(NODE_W)
    expect(L.obs).not.toBeNull()
  })
  it('uses no em dashes', () => { expect(JSON.stringify(o)).not.toContain('—') })
})
