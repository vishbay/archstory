import { describe, expect, it } from 'vitest'
import { bytes, cleanInputs, count, DEFAULT_INPUTS, estimate, estimateText, parseAmount } from './estimate'

const line = (id: string, over = {}) => estimate({ ...DEFAULT_INPUTS, ...over }).find(l => l.id === id)!

describe('estimate', () => {
  it('works the classic URL shortener numbers: 100M new links a month, 10 reads per write', () => {
    const o = { source: 'volume', volume: 100_000_000, volumeUnit: 'month', readsPerWrite: 10, writeBytes: 500, years: 5, replicas: 1 } as const
    expect(line('writes-day', o).value).toBe('3.3M')
    expect(line('write-qps', o).value).toBe('39/s avg, 120/s peak')
    expect(line('read-qps', o).value).toBe('390/s avg, 1.2K/s peak')
    expect(line('storage-year', o).value).toBe('610 GB')
    expect(line('storage-total', o).value).toBe('3 TB')
    expect(line('storage-total', o).formula).toBe('per year × 5 years × 1 copy')
  })
  it('starts from daily users when asked', () => {
    expect(line('writes-day', { source: 'users', dau: 2_000_000, writesPerUser: 5 }).value).toBe('10M')
    expect(line('writes-day', { source: 'users', dau: 2_000_000, writesPerUser: 5 }).formula).toContain('2M daily users × 5')
  })
  it('converts per-second volumes and counts instances at peak', () => {
    expect(line('writes-day', { source: 'volume', volume: 10, volumeUnit: 'second' }).value).toBe('860K')
    expect(line('instances', { source: 'volume', volume: 1000, volumeUnit: 'second', readsPerWrite: 1, peakFactor: 2, perInstance: 1000 }).value).toBe('4')
    expect(line('instances', { perInstance: 0 }).value).toBe('?')
  })
  it('sizes the cache from a share of the daily reads', () => {
    expect(line('cache', { source: 'volume', volume: 1_000_000, volumeUnit: 'day', readsPerWrite: 10, readBytes: 1000, cachePercent: 20 }).value).toBe('2 GB')
  })
})

describe('formatting', () => {
  it('rounds to what an estimate deserves, in decimal units', () => {
    expect(count(1234)).toBe('1.2K'); expect(count(38.58)).toBe('39'); expect(count(0)).toBe('0'); expect(count(5)).toBe('5')
    expect(bytes(1_500_000_000)).toBe('1.5 GB'); expect(bytes(999)).toBe('1 KB'); expect(bytes(450)).toBe('450 B'); expect(bytes(2.5e15)).toBe('2.5 PB')
  })
  it('writes the working as notes, with no em dashes', () => {
    const t = estimateText(estimate(DEFAULT_INPUTS))
    expect(t.split('\n')).toHaveLength(10); expect(t).toContain('Write rate: '); expect(t).not.toContain('—')
  })
  it('keeps only sane stored values', () => {
    const c = cleanInputs({ dau: -5, years: 7, source: 'nope', volumeUnit: 'day', readsPerWrite: 'x' })
    expect(c.dau).toBe(DEFAULT_INPUTS.dau); expect(c.years).toBe(7); expect(c.source).toBe('users'); expect(c.volumeUnit).toBe('day'); expect(c.readsPerWrite).toBe(10)
  })
})

describe('parseAmount', () => {
  it('reads interview shorthand', () => {
    expect(parseAmount('10M', 'count')).toBe(10_000_000); expect(parseAmount('1.5B', 'count')).toBe(1_500_000_000)
    expect(parseAmount('250k', 'count')).toBe(250_000); expect(parseAmount('1,000', 'count')).toBe(1000)
    expect(parseAmount('2 KB', 'bytes')).toBe(2000); expect(parseAmount('500 B', 'bytes')).toBe(500); expect(parseAmount('500', 'bytes')).toBe(500)
  })
  it('rejects what it cannot read', () => {
    expect(parseAmount('', 'count')).toBeNull(); expect(parseAmount('lots', 'count')).toBeNull(); expect(parseAmount('5 GB', 'count')).toBeNull(); expect(parseAmount('-3', 'count')).toBeNull()
  })
  it('round-trips its own formatting', () => {
    for (const n of [5, 120, 3_300_000, 10_000_000]) expect(parseAmount(count(n), 'count')).toBe(n)
    for (const n of [500, 2000, 1_500_000_000]) expect(parseAmount(bytes(n), 'bytes')).toBe(n)
  })
})
