/// <reference types="node" />
import { existsSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { cloudIconUrl, PRODUCTS } from './cloudIcons'
import { LIBRARY } from '../library'

const file = (url: string) => `public${url}`

// Icons are downloaded, not committed: file checks only run where `npm run icons` has been run.
const fetched = existsSync('public/icons/aws')

describe('cloud icons', () => {
  it.runIf(fetched)('every product has a fetched icon file', () => {
    for (const cloud of ['aws', 'gcp'] as const)
      for (const p of PRODUCTS[cloud]) expect(existsSync(`public/icons/${cloud}/${p.key}.svg`), `${cloud}:${p.key}`).toBe(true)
  })
  it('matches provider names to products, most specific first', () => {
    const n = (aws: string, gcp: string) => ({ id: 'x', label: 'X', kind: 'service', cloud: { aws, gcp } })
    expect(cloudIconUrl(n('ECS Fargate', 'Cloud Run'), 'aws')).toMatch(/aws\/fargate\.svg$/)
    expect(cloudIconUrl(n('Aurora PostgreSQL', 'Cloud SQL Postgres'), 'aws')).toMatch(/aws\/aurora\.svg$/)
    expect(cloudIconUrl(n('ALB', 'Cloud Load Balancing'), 'gcp')).toMatch(/gcp\/load-balancing\.svg$/)
    expect(cloudIconUrl(n('ALB', 'x'), 'aws')).toMatch(/aws\/alb\.svg$/)
    expect(cloudIconUrl(n('NLB', 'External passthrough Network Load Balancer'), 'aws')).toMatch(/aws\/nlb\.svg$/)
    expect(cloudIconUrl(n('NLB', 'External passthrough Network Load Balancer'), 'gcp')).toMatch(/gcp\/load-balancing\.svg$/)
    expect(cloudIconUrl(n('ALB', 'x'), 'neutral')).toBeNull()
  })
  it('uses no icon unless the product is named exactly', () => {
    const n = (aws?: string) => ({ id: 'x', label: 'X', kind: 'cache', cloud: aws ? { aws } : undefined })
    expect(cloudIconUrl(n(), 'aws')).toBeNull()                       // no provider name: no kind fallback
    expect(cloudIconUrl(n('Some Custom Cache'), 'aws')).toBeNull()    // unknown product
    expect(cloudIconUrl(n('Cassandra on EC2'), 'aws')).toBeNull()     // self-managed on a host: not the product
  })
  it.runIf(fetched)('every icon a library node resolves to exists on disk', () => {
    for (const d of LIBRARY) for (const node of d.nodes) for (const cloud of ['aws', 'gcp'] as const) {
      const url = cloudIconUrl(node, cloud)
      if (url) expect(existsSync(file(url)), `${d.id}/${node.id} ${cloud}: ${node.cloud?.[cloud]}`).toBe(true)
    }
  })
})
