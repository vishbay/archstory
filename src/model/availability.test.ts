import { describe, expect, it } from 'vitest'
import { parseDesign, type Design } from './schema'
import { haOf, impactOf, placementsOf, resilience } from './availability'
import { layoutZones, resolveFlow } from '../layout/zones'
import { LIBRARY } from '../library'

const url = LIBRARY.find(d => d.id === 'url-shortener')!
const node = (d: Design, id: string) => d.nodes.find(n => n.id === id)!

describe('availability defaults', () => {
  it('derives HA mode from kind and network placement', () => {
    expect(haOf(url, node(url, 'api'))).toBe('active-active')
    expect(haOf(url, node(url, 'db'))).toBe('primary-standby')
    expect(haOf(url, node(url, 'cache'))).toBe('primary-standby')
    expect(haOf(url, node(url, 'queue'))).toBe('regional')
    expect(haOf(url, node(url, 'client'))).toBeNull()
  })
  it('places primary and standby in different zones', () => {
    expect(placementsOf(url, node(url, 'db'))).toEqual([{ zone: 0, role: 'primary' }, { zone: 1, role: 'standby' }])
    expect(placementsOf(url, node(url, 'api'))).toHaveLength(3)
  })
})

describe('zone failure impact', () => {
  it('describes capacity loss, failover and regional services', () => {
    expect(impactOf(url, node(url, 'api'), 0, 'aws')).toMatchObject({ level: 'warn', tag: '−1/3 capacity' })
    expect(impactOf(url, node(url, 'db'), 0, 'aws')?.tag).toMatch(/^failover/)
    expect(impactOf(url, node(url, 'db'), 1, 'aws')?.tag).toBe('no standby')
    expect(impactOf(url, node(url, 'db'), 2, 'aws')?.tag).toBe('unaffected')
    expect(impactOf(url, node(url, 'queue'), 0, 'aws')?.tag).toBe('unaffected')
  })
  it('flags single-zone components on the request path, softens background ones', () => {
    const r = parseDesign({
      schema: 'archstory/v1', id: 'spof', meta: { title: 'S' },
      network: { zones: 3, subnets: [{ id: 'app', label: 'App', tiers: ['services', 'data', 'async'] }] },
      nodes: [{ id: 'c', label: 'C', kind: 'client' }, { id: 'api', label: 'API', kind: 'service' },
        { id: 'db', label: 'DB', kind: 'sql_db', ha: 'single' }, { id: 'w', label: 'W', kind: 'worker', ha: 'single' }],
      edges: [{ from: 'c', to: 'api' }, { from: 'api', to: 'db' }, { from: 'api', to: 'w' }],
      flows: [{ id: 'f', title: 'F', steps: [{ from: 'c', to: 'api', kind: 'req', label: 'x' }, { from: 'api', to: 'db', kind: 'req', label: 'q' },
        { from: 'api', to: 'w', kind: 'async', label: 'job' }] }],
    })
    if (!r.ok) throw new Error(r.errors.join('\n'))
    const d = r.design
    expect(impactOf(d, node(d, 'db'), 0, 'aws')?.level).toBe('down')
    expect(impactOf(d, node(d, 'w'), 0, 'aws')).toMatchObject({ level: 'warn', tag: 'down (background)' })
    expect(resilience(d, 0, 'aws')!.spofs.map(n => n.id)).toEqual(['db'])
  })
  it('states the capacity rule', () => {
    expect(resilience(url, 0, 'aws')!.perZoneShare).toBe('50% of peak per zone (150% total)')
  })
})

describe('zones view routing', () => {
  const hit = url.flows.find(f => f.id === 'hit')!
  const create = url.flows.find(f => f.id === 'create')!
  const pair = (h: { from: string | null; to: string | null }) => `${h.from}→${h.to}`

  it('keeps a request in its entry zone and crosses zones only to reach a primary', () => {
    const hops = resolveFlow(layoutZones(url, null), create, 1, null)
    expect(hops.map(pair)).toContain('lb@1→api@1')
    const write = hops.find(h => h.to === 'db@0')!
    expect(write.from).toBe('api@1'); expect(write.cross).toBe(true)
    expect(hops.every(h => h.from === h.to || h.edge)).toBe(true)
  })
  it('responses retrace the request path', () => {
    const hops = resolveFlow(layoutZones(url, null), hit, 2, null)
    expect(hops.map(pair)).toContain('cache@0→api@2')
    expect(hops.map(pair)).toContain('api@2→lb@2')
  })
  it('fails over: promoted standby serves, the failed zone gets no traffic', () => {
    const L = layoutZones(url, 0)
    expect(L.insts.find(i => i.id === 'db@1')?.role).toBe('promoted')
    const hops = resolveFlow(L, create, 0, 0)
    expect(hops.some(h => h.from?.endsWith('@0') || h.to?.endsWith('@0'))).toBe(false)
    expect(hops.map(pair)).toContain('api@1→db@1')
  })
})
