import { describe, expect, it } from 'vitest'
import { parseDesign, subnetOf, type Design } from './schema'
import { tierOf } from './kinds'
import { crossing, placement } from './network'
import { haOf, impactOf, placementsOf, resilience, zoneBadge } from './availability'
import { footprintOf, regionDrill, regionImpactOf, replicationOf } from './regions'
import { layoutBands, NODE_W } from '../layout/bands'
import { layoutZones, resolveFlow } from '../layout/zones'
import { layoutRegions } from '../layout/regions'
import { LIBRARY } from '../library'

const hops = (path: string[]) => [
  ...path.slice(1).map((to, i) => ({ from: path[i], to, kind: 'req', label: 'x' })),
  ...path.slice(0, -1).reverse().map((to, i) => ({ from: path[path.length - 1 - i], to, kind: 'res', label: 'ok' })),
]
const raw = (extra: object = {}, nodes: object[] = []) => ({
  schema: 'archstory/v1', id: 'hybrid', meta: { title: 'Hybrid' },
  network: { zones: 3, subnets: [{ id: 'public', label: 'Public', public: true, tiers: ['entry'] }, { id: 'app', label: 'App', tiers: ['services'] }, { id: 'data', label: 'Data', tiers: ['data'] }] },
  nodes: [
    { id: 'c', label: 'Client', kind: 'client' }, { id: 'lb', label: 'LB', kind: 'load_balancer' },
    { id: 'api', label: 'API', kind: 'service' }, { id: 'db', label: 'Cloud DB', kind: 'sql_db' },
    { id: 'link', label: 'Hybrid Link', kind: 'hybrid_link', cloud: { aws: 'Direct Connect', gcp: 'Cloud Interconnect' } },
    { id: 'mono', label: 'Monolith', kind: 'service', site: 'onprem' }, { id: 'ora', label: 'Oracle', kind: 'sql_db', site: 'onprem' },
    ...nodes,
  ],
  edges: [{ from: 'c', to: 'lb' }, { from: 'lb', to: 'api' }, { from: 'api', to: 'db' }, { from: 'api', to: 'link' }, { from: 'link', to: 'mono' }, { from: 'mono', to: 'ora' }],
  flows: [{ id: 'legacy', title: 'Legacy call', steps: hops(['c', 'lb', 'api', 'link', 'mono', 'ora']) }],
  ...extra,
})
const design = (extra: object = {}, nodes: object[] = []): Design => {
  const r = parseDesign(raw(extra, nodes))
  if (!r.ok) throw new Error(r.errors.join('\n'))
  return r.design
}
const node = (d: Design, id: string) => d.nodes.find(n => n.id === id)!
const step = (from: string, to: string) => ({ from, to, kind: 'req' as const, label: 'x' })
const regions = { regions: { regions: [{ id: 'a', name: 'eu-west-1', role: 'primary' }, { id: 'b', name: 'eu-central-1', role: 'secondary' }],
  strategy: 'warm-standby', rto: '15 min', rpo: '1 min', failover: 'DNS failover' } }

describe('site validation', () => {
  it('accepts on-prem nodes and keeps them out of the VPC', () => {
    const d = design()
    expect(node(d, 'mono').site).toBe('onprem')
    expect(subnetOf(d, node(d, 'mono'), tierOf(node(d, 'mono')))).toBeNull()
    expect(subnetOf(d, node(d, 'ora'), 'data')).toBeNull()
    expect(parseDesign(raw({}, [{ id: 'x', label: 'X', kind: 'service', site: 'onprem', subnet: 'none' }])).ok).toBe(true)
  })
  it('rejects a cloud subnet, regions or replication on an on-prem node, and unknown sites', () => {
    const r = parseDesign(raw(regions, [{ id: 'x', label: 'X', kind: 'sql_db', site: 'onprem', subnet: 'data', regions: 'all', replication: 'async' }]))
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.errors).toContain('node "x": is on-premises, so it cannot sit in the cloud subnet "data"')
      expect(r.errors).toContain('node "x": is on-premises, so it has no cloud regions or replication')
    }
    const r2 = parseDesign(raw({}, [{ id: 'x', label: 'X', kind: 'sql_db', site: 'onprem', replication: 'async' }]))
    expect(!r2.ok && r2.errors).toEqual(['node "x": is on-premises, so it has no cloud regions or replication'])
    expect(parseDesign(raw({}, [{ id: 'x', label: 'X', kind: 'service', site: 'colo' }])).ok).toBe(false)
  })
  it('leaves designs without a site exactly as they were', () => {
    for (const d of LIBRARY.filter(x => !x.nodes.some(n => n.site))) {
      const r = parseDesign(JSON.parse(JSON.stringify(d)))
      expect(r.ok && r.design.nodes.every(n => n.site === undefined), d.id).toBe(true)
    }
  })
})

describe('on-prem network wording', () => {
  const d = design()
  it('places on-prem nodes in your data centre, named by the hybrid link in each cloud', () => {
    expect(placement(d, node(d, 'ora'), 'neutral')).toBe('In your own data centre, reached from the cloud over the hybrid link (a dedicated link or site-to-site VPN).')
    expect(placement(d, node(d, 'ora'), 'aws')).toBe('In your own data centre, reached from the cloud over the hybrid link (Direct Connect).')
    expect(placement(d, node(d, 'mono'), 'gcp')).toBe('In your own data centre, reached from the cloud over the hybrid link (Cloud Interconnect).')
    const bare = design({ network: undefined })
    expect(placement(bare, node(bare, 'mono'), 'azure')).toMatch(/over the hybrid link \(ExpressRoute or a VPN gateway\)\.$/)
  })
  it('describes the hybrid link as a private attachment, not a VPC endpoint', () => {
    expect(placement(d, node(d, 'link'), 'aws')).toBe('Private connection from the VPC to your own data centre, attached through a virtual private gateway or transit gateway; it never crosses the public internet.')
    expect(placement(d, node(d, 'link'), 'gcp')).toMatch(/Cloud Router and VLAN attachment/)
  })
  it('describes hops across the hybrid link with its latency and cost', () => {
    const across = 'Crosses the hybrid link (Direct Connect) between the cloud and your data centre: a few to tens of milliseconds, and data transfer is charged per GB.'
    expect(crossing(d, step('link', 'mono'), 'aws')).toBe(across)
    expect(crossing(d, step('mono', 'link'), 'aws')).toBe(across)
    expect(crossing(d, step('api', 'link'), 'aws')).toBe('Goes between the VPC and the hybrid link through a virtual private gateway or transit gateway, never over the public internet.')
    expect(crossing(d, step('mono', 'ora'), 'aws')).toBeNull()
    for (const s of [step('api', 'link'), step('link', 'mono')]) expect(crossing(d, s, 'aws')).not.toMatch(/VPC endpoint|internet gateway/)
  })
})

describe('on-prem availability', () => {
  const d = design()
  it('is not in any cloud zone and is untouched by a zone failure', () => {
    expect(haOf(d, node(d, 'ora'))).toBeNull()
    expect(placementsOf(d, node(d, 'ora'))).toEqual([])
    expect(zoneBadge(d, node(d, 'mono'), 'aws')).toBe('on-prem')
    expect(impactOf(d, node(d, 'mono'), 0, 'aws')).toEqual({ level: 'ok', tag: 'on-prem', text: 'In your own data centre: not covered by cloud zones. Losing a cloud zone does not touch it.' })
    expect(haOf(d, node(d, 'link'))).toBe('regional')
  })
  it('is not a cloud single point of failure, but is listed as one site on the request path', () => {
    const r = resilience(d, 0, 'aws')!
    expect(r.spofs).toEqual([])
    expect(r.onPrem.map(n => n.id)).toEqual(['mono', 'ora'])
    expect(r.impacts.find(i => i.node.id === 'ora')!.impact.tag).toBe('on-prem')
  })
  it('is outside every region and untouched by a region failure', () => {
    const m = design(regions)
    expect(footprintOf(m, node(m, 'ora'))).toBeNull()
    expect(replicationOf(m, node(m, 'ora'))).toBeNull()
    expect(regionImpactOf(m, node(m, 'ora'), 0)).toMatchObject({ level: 'ok', tag: 'on-prem' })
    const drill = regionDrill(m, 0)!
    expect(drill.rpo).not.toMatch(/Oracle/)
    expect(drill.warnings.some(w => w.startsWith('Monolith runs in your own data centre, a single site'))).toBe(true)
  })
})

describe('on-prem layout', () => {
  const d = design()
  const overlap = (ps: { x: number; y: number }[], w = NODE_W) => ps.some(p => ps.some(q => p !== q && p.y === q.y && Math.abs(p.x - q.x) < w))
  it('draws on-prem nodes in a labelled box outside the VPC, in both tier views', () => {
    for (const network of [false, true]) {
      const L = layoutBands(d, { network })
      const box = L.groups.find(g => g.kind === 'onprem')!
      expect(box.label).toBe('On-premises data centre')
      for (const id of ['mono', 'ora']) {
        expect(L.pos[id].x).toBeGreaterThanOrEqual(box.x); expect(L.pos[id].x + NODE_W).toBeLessThanOrEqual(box.x + box.w)
      }
      expect(overlap(Object.values(L.pos))).toBe(false)
      if (network) {
        expect(box.x).toBeGreaterThanOrEqual(L.vpc!.x + L.vpc!.w)
        expect(L.pos.link.x).toBeGreaterThanOrEqual(L.vpc!.x + L.vpc!.w)
      }
    }
  })
  it('keeps on-prem nodes out of the zone columns, unaffected by a zone failure, and flows still run through them', () => {
    for (const failed of [null, 0, 1, 2]) {
      const Z = layoutZones(d, failed)
      const right = Math.max(...Z.zoneBoxes.map(z => z.x + z.w))
      for (const id of ['mono', 'ora']) {
        expect(Z.insts.filter(i => i.node === id)).toEqual([{ id, node: id, zone: null, role: 'outside', failed: false, tag: { text: 'on-prem', level: 'role' } }])
        expect(Z.pos[id].x).toBeGreaterThanOrEqual(Z.onprem!.x); expect(Z.pos[id].x).toBeGreaterThan(right)
      }
      const outside = Z.insts.filter(i => i.zone === null).map(i => Z.pos[i.id])
      expect(overlap(outside)).toBe(false)
      expect(Z.width).toBeGreaterThanOrEqual(Z.onprem!.x + Z.onprem!.w)
      for (const h of resolveFlow(Z, d.flows[0], 0, failed)) expect(h.from && h.to && h.edge).toBeTruthy()
    }
  })
  it('keeps on-prem nodes out of the region columns', () => {
    const m = design(regions)
    const R = layoutRegions(m, 0)
    expect(R.insts.filter(i => i.node === 'ora').map(i => [i.zone, i.failed, i.tag?.text])).toEqual([[null, false, 'on-prem']])
    expect(R.onprem).not.toBeNull()
  })
  it('has no on-prem box when nothing is on-prem', () => {
    const url = LIBRARY.find(x => x.id === 'url-shortener')!
    expect(layoutBands(url, { network: true }).groups.some(g => g.kind === 'onprem')).toBe(false)
    expect(layoutZones(url, null).onprem).toBeNull()
  })
})

describe('cloud migration reference', () => {
  const d = LIBRARY.find(x => x.id === 'cloud-migration')!
  it('runs the monolith and Oracle on-prem behind a hybrid link', () => {
    expect(d.nodes.filter(n => n.site === 'onprem').map(n => n.id).sort()).toEqual(['monolith', 'onprem_db'])
    expect(node(d, 'hybrid').kind).toBe('hybrid_link')
    expect(placement(d, node(d, 'onprem_db'), 'aws')).toMatch(/^In your own data centre/)
    expect(placement(d, node(d, 'monolith'), 'aws')).not.toMatch(/VPC endpoint/)
  })
})
