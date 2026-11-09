import { describe, expect, it } from 'vitest'
import { parseDesign, type Design } from '../model/schema'
import { layoutBands, NODE_W, OBS_NODE_W } from './bands'

const design = (): Design => {
  const r = parseDesign({
    schema: 'archstory/v1', id: 'mt', meta: { title: 'Multi-tenant' },
    groups: [{ id: 'a', label: 'Tenant A', kind: 'tenant' }, { id: 'b', label: 'Tenant B', kind: 'tenant' }],
    nodes: [
      { id: 'c', label: 'Client', kind: 'client' },
      { id: 'lb', label: 'LB', kind: 'load_balancer' },
      { id: 'api', label: 'API', kind: 'service' },
      { id: 'db_a', label: 'DB A', kind: 'sql_db', group: 'a' },
      { id: 'cache_a', label: 'Cache A', kind: 'cache', group: 'a' },
      { id: 'db_b', label: 'DB B', kind: 'sql_db', group: 'b' },
      { id: 'w_b', label: 'Worker B', kind: 'worker', group: 'b' },
    ],
    edges: [{ from: 'c', to: 'lb' }, { from: 'lb', to: 'api' }, { from: 'api', to: 'db_a' }, { from: 'api', to: 'cache_a' }, { from: 'api', to: 'db_b' }, { from: 'db_b', to: 'w_b' }],
  })
  if (!r.ok) throw new Error(r.errors.join('\n'))
  return r.design
}

describe('layoutBands', () => {
  it('puts one band per used tier, top to bottom in tier order', () => {
    const L = layoutBands(design())
    expect(L.bands.map(b => b.tier)).toEqual(['client', 'entry', 'services', 'data', 'async'])
  })
  it('never overlaps nodes in the same band', () => {
    const L = layoutBands(design())
    const ps = Object.values(L.pos)
    for (const p of ps) for (const q of ps)
      if (p !== q && p.y === q.y) expect(Math.abs(p.x - q.x)).toBeGreaterThanOrEqual(NODE_W)
  })
  it('keeps each group\'s nodes inside its box and boxes disjoint', () => {
    const d = design(), L = layoutBands(d)
    for (const g of L.groups) for (const n of d.nodes.filter(n => n.group === g.id)) {
      const p = L.pos[n.id]
      expect(p.x).toBeGreaterThanOrEqual(g.x); expect(p.x + NODE_W).toBeLessThanOrEqual(g.x + g.w)
      expect(p.y).toBeGreaterThanOrEqual(g.y)
    }
    const [a, b] = L.groups
    expect(a.x + a.w).toBeLessThanOrEqual(b.x)
  })
  it('routes cross-band edges vertically and same-band edges sideways', () => {
    const L = layoutBands(design())
    expect(L.handles('lb', 'api')).toEqual(['bottom', 'top'])
    expect(L.handles('api', 'lb')).toEqual(['top', 'bottom'])
    expect(L.handles('db_a', 'cache_a')[0]).toMatch(/left|right/)
  })
})

describe('layoutBands network view', () => {
  const withNet = (): Design => {
    const r = parseDesign({
      schema: 'archstory/v1', id: 'net', meta: { title: 'Net' },
      network: { zones: 3, subnets: [
        { id: 'pub', label: 'Public', public: true, tiers: ['entry'] },
        { id: 'app', label: 'App', tiers: ['services', 'async'] },
        { id: 'data', label: 'Data', tiers: ['data'] },
      ] },
      nodes: [
        { id: 'c', label: 'Client', kind: 'client' }, { id: 'cdn', label: 'CDN', kind: 'cdn' },
        { id: 'lb', label: 'LB', kind: 'load_balancer' }, { id: 'api', label: 'API', kind: 'service' },
        { id: 'db', label: 'DB', kind: 'sql_db' }, { id: 'blob', label: 'Blobs', kind: 'object_store' },
        { id: 'q', label: 'Queue', kind: 'queue' }, { id: 'w', label: 'Worker', kind: 'worker' },
      ],
      edges: [{ from: 'c', to: 'cdn' }, { from: 'cdn', to: 'lb' }, { from: 'lb', to: 'api' }, { from: 'api', to: 'db' },
        { from: 'api', to: 'blob' }, { from: 'api', to: 'q' }, { from: 'q', to: 'w' }],
    })
    if (!r.ok) throw new Error(r.errors.join('\n'))
    return r.design
  }
  const inside = (p: { x: number; y: number }, b: { x: number; y: number; w: number; h: number }) =>
    p.x >= b.x && p.x + NODE_W <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h

  it('draws nothing extra unless asked', () => {
    const L = layoutBands(withNet())
    expect(L.vpc).toBeNull(); expect(L.subnets).toEqual([])
  })
  it('puts VPC nodes inside the VPC box and managed services outside it', () => {
    const L = layoutBands(withNet(), { network: true })
    for (const id of ['lb', 'api', 'db', 'w']) expect(inside(L.pos[id], L.vpc!), id).toBe(true)
    for (const id of ['blob', 'q', 'c', 'cdn']) expect(inside(L.pos[id], L.vpc!), id).toBe(false)
  })
  it('splits a subnet into one strip per run of consecutive bands', () => {
    const L = layoutBands(withNet(), { network: true })
    expect(L.subnets.filter(s => s.id === 'app')).toHaveLength(2)   // services and async, data in between
    expect(L.subnets.find(s => s.id === 'pub')?.public).toBe(true)
  })
})

describe('layoutBands monitoring layer', () => {
  const d = design()
  it('adds nothing unless asked', () => { expect(layoutBands(d).obs).toBeNull() })
  it('puts the six telemetry parts in a band below the tiers, inside the width, without overlap', () => {
    const base = layoutBands(d), L = layoutBands(d, { observability: true })
    expect(Object.keys(L.obs!.pos).sort()).toEqual(['obs:alerts', 'obs:collector', 'obs:logs', 'obs:metrics', 'obs:oncall', 'obs:traces'])
    expect(L.obs!.band.y).toBe(base.height)
    expect(L.height).toBeGreaterThan(base.height)
    const ps = Object.values(L.obs!.pos)
    for (const p of ps) { expect(p.y).toBeGreaterThanOrEqual(L.obs!.band.y); expect(p.x + OBS_NODE_W).toBeLessThanOrEqual(L.width) }
    for (const p of ps) for (const q of ps) if (p !== q) expect(Math.abs(p.x - q.x) >= OBS_NODE_W || Math.abs(p.y - q.y) >= 58).toBe(true)
  })
  it('keeps the design centred and its nodes apart when the canvas widens', () => {
    const L = layoutBands(d, { observability: true })
    const ps = Object.values(L.pos)
    for (const p of ps) for (const q of ps) if (p !== q && p.y === q.y) expect(Math.abs(p.x - q.x)).toBeGreaterThanOrEqual(NODE_W)
    const xs = ps.map(p => p.x), left = Math.min(...xs), right = L.width - (Math.max(...xs) + NODE_W)
    expect(Math.abs(left - right - 170 + 12)).toBeLessThan(2)   // label column on the left, a thin margin on the right
  })
})
