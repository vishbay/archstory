import { describe, expect, it } from 'vitest'
import { LIBRARY } from '.'
import { layoutZones, resolveFlow } from '../layout/zones'
import { resilience } from '../model/availability'
import { layoutBands, NODE_H, NODE_W } from '../layout/bands'
import { crossesNode, routeEdges, routePoints, type Rect } from '../layout/route'
import { ZNODE_W } from '../layout/zones'
import { tierOf } from '../model/kinds'
import { phaseGroups } from '../model/phases'

describe.each(LIBRARY.map(d => [d.id, d] as const))('%s', (_, d) => {
  const zones = d.network?.zones ?? 1

  it('has requirements, flows with explanations, and notes', () => {
    expect(d.requirements.functional.length).toBeGreaterThan(0)
    expect(d.flows.length).toBeGreaterThan(0)
    for (const f of d.flows) expect(f.steps.some(s => s.detail), f.id).toBe(true)
    expect(d.notes.length).toBeGreaterThan(2)
  })

  it('names a phase on every step, in consecutive groups of a sensible number', () => {
    for (const f of d.flows) {
      expect(f.steps.every(s => s.phase?.trim()), `${f.id}: a step has no phase`).toBe(true)
      const groups = phaseGroups(f.steps)!
      const names = groups.map(g => g.name)
      expect(new Set(names).size, `${f.id}: a phase name comes back after another phase`).toBe(names.length)
      expect(groups.length, `${f.id}: phases`).toBeGreaterThanOrEqual(f.steps.length <= 3 ? 1 : 2)
      expect(groups.length, `${f.id}: too many phases`).toBeLessThanOrEqual(10)
      for (const n of names) expect(n.length, n).toBeLessThanOrEqual(32)
    }
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

/** Every edge is a right-angled path that never passes through a component and enters its target side head-on. */
function checkRoutes(rects: Record<string, Rect>, edges: { key: string; from: string; to: string }[], label: string) {
  const routes = routeEdges(rects, edges)
  const into = { top: [0, 1], bottom: [0, -1], left: [1, 0], right: [-1, 0] } as const   // direction of travel when entering a node through that side
  for (const e of edges) {
    const A = rects[e.from], B = rects[e.to], r = routes[e.key]
    expect(r, `${label}: ${e.key} has no route`).toBeTruthy()
    const others = Object.entries(rects).filter(([id]) => id !== e.from && id !== e.to).map(([, x]) => x)
    const pts = routePoints(A, B, r!)
    expect(crossesNode(pts, others), `${label}: ${e.key} crosses a component`).toBe(false)
    expect(pts.every((p, i) => i === 0 || p[0] === pts[i - 1][0] || p[1] === pts[i - 1][1]), `${label}: ${e.key} is not right-angled`).toBe(true)
    const [p, q] = [pts.at(-2)!, pts.at(-1)!], [dx, dy] = into[r!.to]
    expect(Math.sign(q[0] - p[0]) === dx && Math.sign(q[1] - p[1]) === dy, `${label}: ${e.key} does not enter ${r!.to} head-on`).toBe(true)
    expect(Math.hypot(q[0] - p[0], q[1] - p[1]), `${label}: ${e.key} has no straight run into the arrowhead`).toBeGreaterThanOrEqual(14)
  }
  // edges that do not share a component never run along the same line, so no line can be mistaken for another
  const segs = edges.map(e => ({ e, pts: routePoints(rects[e.from], rects[e.to], routes[e.key]!) }))
  const overlap = (a: [number, number], b: [number, number]) => Math.min(Math.max(...a), Math.max(...b)) - Math.max(Math.min(...a), Math.min(...b))
  for (let i = 0; i < segs.length; i++) for (let j = i + 1; j < segs.length; j++) {
    const [u, v] = [segs[i], segs[j]]
    if ([u.e.from, u.e.to].some(id => id === v.e.from || id === v.e.to)) continue
    for (let a = 1; a < u.pts.length; a++) for (let b = 1; b < v.pts.length; b++) {
      const [p, q, r, s] = [u.pts[a - 1], u.pts[a], v.pts[b - 1], v.pts[b]]
      const sameX = p[0] === q[0] && r[0] === s[0] && p[0] === r[0], sameY = p[1] === q[1] && r[1] === s[1] && p[1] === r[1]
      if (sameX) expect(overlap([p[1], q[1]], [r[1], s[1]]), `${label}: ${u.e.key} and ${v.e.key} run along the same vertical line`).toBeLessThanOrEqual(2)
      if (sameY) expect(overlap([p[0], q[0]], [r[0], s[0]]), `${label}: ${u.e.key} and ${v.e.key} run along the same horizontal line`).toBeLessThanOrEqual(2)
    }
  }
}

describe.each(LIBRARY.map(d => [d.id, d] as const))('%s edge routing', (_, d) => {
  it('never crosses a component in the tier view, with or without the network layer', () => {
    for (const network of [false, true]) {
      const L = layoutBands(d, { network })
      const rects = Object.fromEntries(d.nodes.map(n => [n.id, { ...L.pos[n.id], w: NODE_W, h: NODE_H }]))
      checkRoutes(rects, d.edges.map(e => ({ key: `${e.from}->${e.to}`, from: e.from, to: e.to })), `${d.id} tiers network=${network}`)
    }
  })
  it.runIf((d.network?.zones ?? 1) > 1)('never crosses a component in the zones view, for every failed zone', () => {
    for (const failed of [null, ...Array(d.network!.zones).keys()]) {
      const zl = layoutZones(d, failed)
      const rects = Object.fromEntries(zl.insts.map(i => [i.id, { ...zl.pos[i.id], w: i.zone !== null ? ZNODE_W : NODE_W, h: NODE_H }]))
      checkRoutes(rects, zl.edges.map(e => ({ key: e.id, from: e.from, to: e.to })), `${d.id} zones failed=${failed}`)
    }
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
