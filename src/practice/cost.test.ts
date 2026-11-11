import { describe, expect, it } from 'vitest'
import { cleanCost, cost, costText, DEFAULT_COST, money } from './cost'
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
