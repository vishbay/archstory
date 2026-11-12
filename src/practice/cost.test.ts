import { describe, expect, it } from 'vitest'
import { cleanCost, cost, costText, DEFAULT_COST, designShape, money, NO_SHAPE, type DesignShape } from './cost'
import type { Cloud } from '../model/kinds'
import { DEFAULT_INPUTS } from './estimate'

const run = (e = {}, c = {}) => cost({ ...DEFAULT_INPUTS, ...e }, { ...DEFAULT_COST, ...c })
const line = (id: string, e = {}, c = {}) => run(e, c).lines.find(l => l.id === id)!
const lever = (id: string, e = {}, c = {}) => run(e, c).levers.find(l => l.id === id)!

// Defaults: 4 instances at peak, 3 database nodes, 9,125 GB kept (one copy), 10 GB cache, 1,500 GB egress a month.
describe('cost lines for the default inputs', () => {
  it('shows each line with its arithmetic', () => {
    expect(line('compute').value).toBe('$260')            // 4 × 730 × 0.09 = 262.8
    expect(line('compute').formula).toBe('4 instances × 730 h × $0.09/h')
    expect(line('db').value).toBe('$770')                 // 3 × 730 × 0.35 = 766.5
    expect(line('db').formula).toBe('1 primary + 2 replicas = 3 × 730 h × $0.35/h')
    expect(line('db-storage').value).toBe('$1.6K')        // 4,562.5 GB × 3 copies × 0.12 = 1,642.5
    expect(line('object').value).toBe('$100')             // 4,562.5 GB × 0.023 = 104.9
    expect(line('cache').value).toBe('$150')              // 10 GB × 730 × 0.02 = 146
    expect(line('egress').value).toBe('$140')            // 1,500 GB × 0.09 = 135
  })
  it('totals the lines', () => {
    const r = run()
    expect(r.total).toBeCloseTo(262.8 + 766.5 + 1642.5 + 4562.5 * 0.023 + 146 + 135, 6)
    expect(r.lines.at(-1)).toMatchObject({ id: 'total', value: '$3.1K' })
  })
  it('moves egress to the CDN rate when part of it is offloaded', () => {
    const l = line('egress', {}, { cdnPercent: 50 })
    expect(l.formula).toBe('750 GB × $0.09/GB + 750 GB via CDN × $0.03/GB')
    expect(run({}, { cdnPercent: 50 }).total - run().total).toBeCloseTo(-750 * 0.06, 6)
  })
  it('splits stored data between the database and object storage', () => {
    const all = run({}, { objectPercent: 100 }), none = run({}, { objectPercent: 0 })
    expect(line('db-storage', {}, { objectPercent: 100 }).value).toBe('$0')
    expect(all.total).toBeLessThan(none.total)
    expect(line('object', {}, { objectPercent: 0 }).value).toBe('$0')
    expect(line('object', {}, { objectPercent: 100 }).value).toBe('$210')   // 9,125 × 0.023 = 209.9
  })
})

describe('ways to cut it', () => {
  it('commits the baseline, which is peak divided by the peak factor', () => {
    expect(lever('commit').saving).toBeCloseTo(2 * 730 * 0.09 * 0.35, 6)    // ceil(4 / 3) = 2 instances
  })
  it('puts a share of compute on spot', () => {
    expect(lever('spot').saving).toBeCloseTo(4 * 730 * 0.09 * 0.3 * 0.65, 6)
  })
  it('right-sizes from peak to average plus headroom', () => {
    expect(lever('rightsize').saving).toBeCloseTo(1 * 730 * 0.09, 6)        // 4 to ceil(2 × 1.3) = 3
  })
  it('tiers object data older than N days', () => {
    const old = 1 - 90 / 1825
    expect(lever('tier').saving).toBeCloseTo(4562.5 * old * (0.023 - 0.0125), 6)
    expect(lever('tier', {}, { tierDays: 5000 }).saving).toBe(0)
  })
  it('offloads the cacheable share of egress, less what the CDN already serves', () => {
    expect(lever('cdn').saving).toBeCloseTo(1500 * 0.6 * 0.06, 6)
    expect(lever('cdn', {}, { cdnPercent: 60 }).saving).toBe(0)
  })
  it('drops a read replica only when there is one', () => {
    expect(lever('replica').saving).toBeCloseTo(730 * 0.35, 6)
    expect(run({ replicas: 1 }).levers.find(l => l.id === 'replica')).toBeUndefined()
  })
  it('skips compute levers when there is no fleet', () => {
    expect(run({ perInstance: 0 }).levers.map(l => l.id)).toEqual(['tier', 'cdn', 'replica'])
  })
})

describe('formatting', () => {
  it('writes dollars to two significant figures', () => {
    expect(money(262.8)).toBe('$260'); expect(money(1642.5)).toBe('$1.6K'); expect(money(0.5)).toBe('$0.5'); expect(money(3_400_000)).toBe('$3.4M')
    expect(money(NaN)).toBe('?')
  })
  it('writes notes with no em dashes', () => {
    const t = costText(run())
    expect(t).toContain('Ways to cut it:'); expect(t).not.toMatch(/[—–]/)
  })
  it('keeps only sane stored values', () => {
    const c = cleanCost({ computePrice: 0.1, dbPrice: -1, cachePrice: 'x' })
    expect(c.computePrice).toBe(0.1); expect(c.dbPrice).toBe(DEFAULT_COST.dbPrice); expect(c.cachePrice).toBe(DEFAULT_COST.cachePrice)
  })
})

const wording = (cloud: Cloud) => run0(cloud).levers
const run0 = (cloud: Cloud, shape: Partial<DesignShape> = {}, c = {}, e = {}) =>
  cost({ ...DEFAULT_INPUTS, ...e }, { ...DEFAULT_COST, ...c }, cloud, { ...NO_SHAPE, ...shape })
const label = (cloud: Cloud, id: string) => wording(cloud).find(l => l.id === id)!.label

describe('lever names per cloud', () => {
  it('uses neutral wording by default and for other clouds', () => {
    expect(label('neutral', 'commit')).toBe('Commit to the steady baseline')
    expect(label('neutral', 'spot')).toBe('Spot or preemptible capacity for workers')
    expect(label('azure', 'spot')).toBe(label('neutral', 'spot'))
    expect(run().levers.map(l => l.label)).toEqual(wording('neutral').map(l => l.label))
  })
  it('names AWS products', () => {
    expect(label('aws', 'commit')).toBe('Savings Plans or Reserved Instances for the baseline')
    expect(label('aws', 'spot')).toBe('Spot Instances for workers')
    expect(label('aws', 'tier')).toBe('S3 Intelligent-Tiering or Standard-IA after 90 days')
    expect(label('aws', 'cdn')).toContain('CloudFront')
    expect(label('aws', 'replica')).toBe('One fewer Aurora or RDS read replica')
    expect(wording('aws').find(l => l.id === 'rightsize')!.why).toContain('EC2 Auto Scaling')
  })
  it('names GCP products', () => {
    expect(label('gcp', 'commit')).toBe('Committed use discounts for the baseline')
    expect(label('gcp', 'spot')).toBe('Spot VMs for workers')
    expect(label('gcp', 'tier')).toBe('Autoclass or Nearline after 90 days')
    expect(label('gcp', 'cdn')).toContain('Cloud CDN')
    expect(label('gcp', 'replica')).toBe('One fewer Cloud SQL read replica')
    expect(wording('gcp').find(l => l.id === 'rightsize')!.why).toContain('Cloud Run')
  })
  it('keeps the numbers the same across clouds', () => {
    expect(wording('aws').map(l => l.saving)).toEqual(wording('neutral').map(l => l.saving))
  })
})

// Defaults: 10M writes a day x 500 B = 5 GB a day, 150 GB a month, 1,500 GB egress, 110M requests a day.
describe('often missed', () => {
  const missed = (id: string, shape: Partial<DesignShape> = {}, c = {}, e = {}) => run0('neutral', shape, c, e).missed.find(l => l.id === id)
  it('prices cross-zone copies of every write, only when there are replicas', () => {
    expect(missed('cross-zone')!.value).toBe('$6')              // 5 GB x 2 x 30 x 0.02
    expect(run0('neutral').missed.find(l => l.id === 'cross-zone')!.formula).toBe('5 GB a day of new data × 2 extra copies × 30 days × $0.02/GB')
    expect(missed('cross-zone', {}, {}, { replicas: 1 })).toBeUndefined()
  })
  it('prices cross-region replication only with a regions section', () => {
    expect(missed('cross-region')).toBeUndefined()
    const l = missed('cross-region', { regions: 3 })!
    expect(l.value).toBe('$6')                                  // 150 GB x 2 x 0.02
  })
  it('counts load balancers, at least one when there is traffic', () => {
    const a = run0('neutral', { balancers: 2 }), b = run0('neutral')
    expect(b.missed.find(l => l.id === 'lb')!.formula).toBe('1 × 730 h × $0.025/h + 1.7K GB in and out × $0.008/GB')
    expect(a.missed.find(l => l.id === 'lb')!.formula).toMatch(/^2 × 730 h/)
    expect(run0('neutral', { balancers: 0 }, {}, { dau: 0 }).missed.find(l => l.id === 'lb')!.formula).toMatch(/^0 × 730 h/)
  })
  it('defaults NAT traffic to zero, or 5% of egress with third parties', () => {
    expect(run0('neutral').natGb).toBe(0)
    expect(run0('neutral', { thirdParty: true }).natGb).toBeCloseTo(1500 * 0.05, 6)
    expect(run0('neutral', { thirdParty: true }, { natGb: 10 }).natGb).toBe(10)
  })
  it('prices a NAT gateway per zone plus the GB through it', () => {
    const r = run0('neutral', { zones: 3, thirdParty: true })
    expect(r.missed.find(l => l.id === 'nat')!.formula).toBe('3 × 730 h × $0.045/h + 75 GB × $0.045/GB')
    expect(run0('neutral').missed.find(l => l.id === 'nat')!.value).toBe('$33')   // 730 x 0.045 = 32.85
  })
  it('prices logs from requests, bytes per request and the ingest price', () => {
    const l = missed('logs')!                                  // 110M requests a day x 500 B x 30 = 1,650 GB x 0.5 = 825
    expect(l.value).toBe('$830')
    expect(l.formula).toBe('110M requests a day × 500 B × 30 days = 1.7K GB × $0.5/GB ingested')
  })
  it('sums them into a grand total next to the existing total', () => {
    const r = run0('neutral', { regions: 2, balancers: 1 })
    expect(r.grand).toBeCloseTo(r.total + r.missedTotal, 6)
    expect(r.total).toBeCloseTo(run().total, 6)
    const t = costText(r); expect(t).toContain('Often missed'); expect(t).toContain('Logs:'); expect(t).not.toMatch(/[—–]/)
  })
  it('reads the shape from a design', () => {
    const s = designShape({ nodes: [{ kind: 'api_gateway' }, { kind: 'load_balancer' }, { kind: 'llm' }, { kind: 'service' }], network: { zones: 2 }, regions: { regions: [1, 2, 3] } })
    expect(s).toEqual({ regions: 3, zones: 2, balancers: 2, thirdParty: true })
    expect(designShape({ nodes: [{ kind: 'service' }] })).toEqual(NO_SHAPE)
  })
})

describe('older stored prices', () => {
  it('fills the new keys with defaults', () => {
    const old = { computePrice: 0.1, dbPrice: 0.4, tierDays: 30 }
    const c = cleanCost(old)
    expect(c.computePrice).toBe(0.1); expect(c.logPrice).toBe(0.5); expect(c.natGbPrice).toBe(0.045); expect(c.natGb).toBeUndefined()
    expect(cleanCost({ ...DEFAULT_COST, crossZonePrice: undefined }).crossZonePrice).toBe(0.02)
    expect(cleanCost({ natGb: 12 }).natGb).toBe(12); expect(cleanCost({ natGb: -1 }).natGb).toBeUndefined()
  })
})

describe('load balancer traffic', () => {
  it('leaves out what the CDN serves, since it never reaches the load balancer', () => {
    const lb = (cdnPercent: number) => cost(DEFAULT_INPUTS, { ...DEFAULT_COST, cdnPercent }).missed.find(l => l.id === 'lb')!
    const none = lb(0), most = lb(90)
    expect(most.formula).toContain('not the 90% the CDN serves')
    expect(none.formula).not.toContain('CDN')
    expect(parseFloat(most.value.replace(/[^0-9.]/g, ''))).toBeLessThan(parseFloat(none.value.replace(/[^0-9.]/g, '')))
  })
})
