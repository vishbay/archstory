import { describe, expect, it } from 'vitest'
import { DR_STRATEGIES, parseDesign, type Design, type Replication } from './schema'
import { footprintOf, parseDuration, regionDrill, regionImpactOf, regionPlacements, regionWarnings, replicationOf } from './regions'
import { layoutRegions } from '../layout/regions'
import { resolveFlow, ZNODE_W } from '../layout/zones'
import { NODE_H, NODE_W } from '../layout/bands'
import { routeEdges, type Rect } from '../layout/route'
import { LIBRARY } from '../library'
import raw from './fixtures/multi-region.json'

const parse = (x: unknown): Design => { const r = parseDesign(x); if (!r.ok) throw new Error(r.errors.join('\n')); return r.design }
const fixture = parse(raw)
const node = (d: Design, id: string) => d.nodes.find(n => n.id === id)!
const impact = (d: Design, id: string, failed: number) => regionImpactOf(d, node(d, id), failed)!
const aa = (over: object = {}) => parse({ ...raw, regions: { ...raw.regions, strategy: 'active-active', regions: raw.regions.regions.map(r => ({ ...r, role: 'active' })), ...over } })
const withStrategy = (strategy: string) => parse({ ...raw, regions: { ...raw.regions, strategy } })
const withReplication = (mode: Replication, d = raw) => parse({ ...d, nodes: d.nodes.map(n => (n.id === 'db' ? { ...n, replication: mode } : n)) })

describe('regions section', () => {
  it('parses and leaves old designs without it untouched', () => {
    expect(fixture.regions?.strategy).toBe('warm-standby')
    for (const d of LIBRARY) {
      expect(d.regions).toBeUndefined()
      for (const n of d.nodes) expect(footprintOf(d, n)).toBeNull()
    }
  })
  it('rejects bad roles, duplicate ids, node fields without a section, and a single region', () => {
    const bad = (regions: object, nodes = raw.nodes) => { const r = parseDesign({ ...raw, regions: { ...raw.regions, ...regions }, nodes }); return r.ok ? [] : r.errors }
    expect(bad({ strategy: 'active-active' })).toContain('regions: active-active needs every region to have role "active"')
    expect(bad({ regions: raw.regions.regions.map(r => ({ ...r, role: 'secondary' })) })).toContain('regions: warm-standby needs exactly one "primary" region, the others "secondary"')
    expect(bad({ regions: [raw.regions.regions[0], { ...raw.regions.regions[0], role: 'secondary' }] })).toContain('regions.regions: duplicate id "use1"')
    expect(bad({ regions: [raw.regions.regions[0]] })[0]).toMatch(/^regions\.regions/)
    expect(bad({ strategy: 'hot-spare' })[0]).toMatch(/^regions\.strategy/)
    const { regions: _, ...plain } = raw
    const r = parseDesign(plain)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errors).toContain('node "fraud": has regions or replication but the design has no regions section')
  })
  it('defaults: edge tier global, clients not placed, replication by strategy and kind', () => {
    expect(footprintOf(fixture, node(fixture, 'dns'))).toBe('global')
    expect(footprintOf(fixture, node(fixture, 'client'))).toBeNull()
    expect(footprintOf(fixture, node(fixture, 'api'))).toBe('all')
    expect(replicationOf(fixture, node(fixture, 'cache'))).toBe('none')
    expect(replicationOf(fixture, node(fixture, 'api'))).toBeNull()
    const unset = { ...raw, nodes: raw.nodes.map(n => ({ ...n, replication: undefined })) }
    const db = (d: Design) => replicationOf(d, node(d, 'db'))
    expect(db(parse(unset))).toBe('async')
    expect(db(parse({ ...unset, regions: { ...raw.regions, strategy: 'backup-restore' } }))).toBe('backup')
  })
  it('reads durations', () => {
    expect([parseDuration('15 min'), parseDuration('30 s'), parseDuration('4 hours'), parseDuration('0'), parseDuration('near zero'), parseDuration('soon')])
      .toEqual([900, 30, 14400, 0, 0, null])
  })
})

describe('region failure drill', () => {
  it('primary lost under warm standby: standby scales up, async replica promoted, gaps named', () => {
    const x = regionDrill(fixture, 0)!
    expect(x.promoted?.name).toBe('us-west-2')
    expect(x.rto).toMatch(/^minutes: .*plus up to 300 s for cached DNS answers to expire \(target 2 min\)$/)
    expect(x.rpo).toBe('everything in Payments DB, which has no copy in another region (target 1 min)')
    expect(impact(fixture, 'dns', 0)).toMatchObject({ level: 'ok', tag: 'global' })
    expect(impact(fixture, 'api', 0)).toMatchObject({ level: 'warn', tag: 'scale up' })
    expect(impact(fixture, 'fraud', 0)).toMatchObject({ level: 'down', tag: 'DOWN' })
    expect(impact(fixture, 'cache', 0)).toMatchObject({ level: 'warn', tag: 'starts cold' })
    expect(impact(fixture, 'db', 0)).toMatchObject({ level: 'warn', tag: 'promoted' })
    expect(impact(fixture, 'db', 0).text).toMatch(/replication lag/)
    expect(impact(fixture, 'payments', 0)).toMatchObject({ level: 'down', tag: 'data lost' })
    expect(impact(fixture, 'archive', 0)).toMatchObject({ level: 'down', tag: 'restore' })
    expect(x.warnings).toEqual([
      'Fraud Check runs only in us-east-1, so no other region can serve requests until it is deployed there.',
      'Payments DB has no cross-region replication, so losing us-east-1 loses its data.',
      'Receipt Archive only reaches other regions as backups, so a region loss loses everything since the last one, usually more than the 1 min RPO. Replicate it continuously, or back it up at least that often.',
      'Failover relies on DNS with a 300 s TTL, longer than the 2 min RTO: resolvers keep sending users to the failed region until their cached answer expires. Lower the TTL, or use a global load balancer with anycast IPs that fails over without a DNS change.',
    ])
  })
  it('secondary lost: nothing fails over, the DR copy is gone', () => {
    const x = regionDrill(fixture, 1)!
    expect(x.promoted).toBeNull()
    expect(x.rto).toMatch(/^none: the primary keeps serving/)
    expect(impact(fixture, 'db', 1)).toMatchObject({ level: 'warn', tag: 'no DR copy' })
    expect(impact(fixture, 'api', 1).level).toBe('ok')
  })
  it('recovery time follows the strategy', () => {
    const rto = (s: string) => regionDrill(withStrategy(s), 0)!.rto.split(':')[0]
    expect(DR_STRATEGIES.filter(s => s !== 'active-active').map(rto)).toEqual(['hours', 'tens of minutes', 'minutes'])
    expect(regionDrill(aa(), 0)!.rto.split(':')[0]).toBe('near zero')
    expect(impact(withStrategy('pilot-light'), 'api', 0)).toMatchObject({ level: 'warn', tag: 'start up' })
    expect(impact(withStrategy('backup-restore'), 'api', 0)).toMatchObject({ level: 'down', tag: 'redeploy' })
    expect(regionWarnings(withStrategy('backup-restore'))).toContain('Backup and restore usually recovers in hours, longer than the 2 min RTO. A tighter RTO needs warm standby or active-active.')
  })
  it('data loss follows the replication mode', () => {
    expect(impact(withReplication('sync'), 'db', 0).text).toMatch(/no committed write is lost/)
    expect(impact(withReplication('backup'), 'db', 0).tag).toBe('restore')
    expect(impact(withReplication('none'), 'db', 0).tag).toBe('data lost')
    const clean = parse({ ...raw, regions: { ...raw.regions, rpo: '0' }, nodes: raw.nodes.filter(n => !['payments', 'archive', 'fraud'].includes(n.id)),
      edges: raw.edges.filter(e => !['payments', 'archive', 'fraud'].includes(e.to)), flows: [] })
    expect(regionDrill(clean, 0)!.rpo).toBe('the replication lag: usually the last seconds of writes (target 0)')
    expect(regionWarnings(clean)[0]).toMatch(/^Orders DB replicates asynchronously, .* but the RPO is 0\. Zero data loss needs synchronous replication/)
    const sync = parse({ ...clean, nodes: clean.nodes.map(n => (n.id === 'db' ? { ...n, replication: 'sync' } : n)) })
    expect(regionDrill(sync, 0)!.rpo).toBe('none: every committed write is already in another region (target 0)')
  })
  it('active-active: survivors absorb traffic, async writes can conflict, sync loses nothing', () => {
    const d = aa()
    expect(impact(d, 'api', 0)).toMatchObject({ level: 'warn', tag: 'takes over' })
    expect(impact(d, 'db', 0)).toMatchObject({ level: 'warn', tag: 'loses the lag' })
    expect(impact(withReplication('sync', { ...raw, regions: d.regions! } as typeof raw), 'db', 1)).toMatchObject({ level: 'ok', tag: 'no data lost' })
    expect(regionDrill(d, 0)!.capacity).toBe('100% of peak per region (200% total): the surviving regions must carry peak on their own.')
    expect(regionWarnings(d).some(w => w.startsWith('Orders DB takes writes in every region with asynchronous replication'))).toBe(true)
  })
})

describe('regions view', () => {
  const pay = fixture.flows[0]
  it('places a copy per region, global services outside, and links store copies by replication', () => {
    const L = layoutRegions(fixture, null)
    expect(L.unit).toBe('region')
    expect(L.zoneBoxes.map(b => b.label)).toEqual(['us-east-1', 'us-west-2'])
    expect(L.insts.find(i => i.id === 'dns')?.role).toBe('outside')
    expect(L.insts.filter(i => i.node === 'fraud').map(i => i.id)).toEqual(['fraud@0'])
    expect(L.insts.find(i => i.id === 'api@1')).toMatchObject({ role: 'standby', tag: { text: 'scaled down' } })
    expect(L.edges.find(e => e.id === 'db@0->db@1')).toMatchObject({ replication: true, async: true, note: 'async replication', cross: true })
    expect(L.edges.some(e => e.id === 'payments@0->payments@1')).toBe(false)
    expect(L.vpc).toBeNull()
    expect(regionPlacements(fixture, node(fixture, 'dns'), null)).toEqual([])
  })
  it('routes every hop through the primary region while it is up', () => {
    const hops = resolveFlow(layoutRegions(fixture, null), pay, 0, null)
    expect(hops.every((h, i) => pay.steps[i].from === pay.steps[i].to || h.edge)).toBe(true)
    expect(hops.some(h => h.from?.endsWith('@1') || h.to?.endsWith('@1'))).toBe(false)
  })
  it('fails over: the standby region is promoted and the primary-only component breaks its hop', () => {
    const L = layoutRegions(fixture, 0)
    expect(L.insts.find(i => i.id === 'db@1')).toMatchObject({ role: 'promoted', tag: { text: 'promoted' } })
    expect(L.insts.find(i => i.id === 'api@0')?.failed).toBe(true)
    const hops = resolveFlow(L, pay, 0, 0)
    expect(hops.map(h => `${h.from}→${h.to}`)).toContain('lb@1→api@1')
    const fraud = pay.steps.findIndex(s => s.to === 'fraud')
    expect(hops[fraud].to).toBeNull()
  })
  it('lays out without overlapping instances, and routes edges for every failed region', () => {
    for (const failed of [null, 0, 1]) {
      const L = layoutRegions(fixture, failed)
      const ps = Object.values(L.pos)
      for (const p of ps) for (const q of ps) if (p !== q && p.y === q.y) expect(Math.abs(p.x - q.x)).toBeGreaterThanOrEqual(ZNODE_W)
      const rects: Record<string, Rect> = Object.fromEntries(L.insts.map(i => [i.id, { ...L.pos[i.id], w: i.zone !== null ? ZNODE_W : NODE_W, h: NODE_H }]))
      const routes = routeEdges(rects, L.edges.map(e => ({ key: e.id, from: e.from, to: e.to })))
      for (const e of L.edges) expect(routes[e.id], e.id).toBeTruthy()
    }
  })
})
