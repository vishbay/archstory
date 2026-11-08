import { describe, expect, it } from 'vitest'
import { parseDesign, type Design } from './schema'
import { crossing, placement } from './network'
import { LIBRARY } from '../library'

const url = LIBRARY.find(d => d.id === 'url-shortener')!
const step = (from: string, to: string) => ({ from, to, kind: 'req' as const, label: 'x' })

describe('network wording', () => {
  it('describes each boundary a hop crosses', () => {
    expect(crossing(url, step('cdn', 'lb'), 'aws')).toMatch(/internet gateway into the public subnet/)
    expect(crossing(url, step('lb', 'api'), 'aws')).toMatch(/public subnet to the app subnet; a security group/)
    expect(crossing(url, step('api', 'queue'), 'gcp')).toMatch(/managed service through Private Google Access/)
    expect(crossing(url, step('api', 'kgs'), 'aws')).toBeNull()
    expect(crossing(url, step('client', 'cdn'), 'aws')).toBeNull()
  })
  it('explains AWS per-AZ subnets vs GCP regional subnets', () => {
    const api = url.nodes.find(n => n.id === 'api')!
    expect(placement(url, api, 'aws')).toMatch(/3 AZs \(one app subnet per AZ\)/)
    expect(placement(url, api, 'gcp')).toMatch(/one regional subnet covers them all/)
  })
})

describe('network validation', () => {
  const base = (extra: object): unknown => ({
    schema: 'archstory/v1', id: 'n', meta: { title: 'N' },
    nodes: [{ id: 'api', label: 'API', kind: 'service', subnet: 'nope' }], ...extra,
  })
  it('rejects unknown subnets, double-claimed tiers, and subnets without a network', () => {
    const r = parseDesign(base({ network: { subnets: [{ id: 'a', label: 'A', tiers: ['services'] }, { id: 'b', label: 'B', tiers: ['services'] }] } }))
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.errors).toContain('node "api": unknown subnet "nope"')
      expect(r.errors).toContain('network.subnets: tier "services" is claimed by both "a" and "b"')
    }
    const r2 = parseDesign(base({}))
    expect(!r2.ok && r2.errors).toContain('node "api": has a subnet but the design has no network section')
  })
  it('"none" keeps a node outside the VPC', () => {
    const r = parseDesign(base({ nodes: [{ id: 'api', label: 'API', kind: 'service', subnet: 'none' }],
      network: { subnets: [{ id: 'a', label: 'A', tiers: ['services'] }] } }))
    expect(r.ok).toBe(true)
    if (r.ok) expect(placement(r.design as Design, r.design.nodes[0], 'aws')).toMatch(/outside the VPC/)
  })
})
