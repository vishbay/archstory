import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_RTT_MS, RTT_PRESETS, rttOptions } from '../model/protocol'

// Node test environment: an in-memory localStorage. useRtt reads storage when its module loads, so each test imports it afresh.
const mem = new Map<string, string>()
globalThis.localStorage = {
  getItem: k => mem.get(k) ?? null, setItem: (k, v) => void mem.set(k, String(v)), removeItem: k => void mem.delete(k),
  clear: () => mem.clear(), key: i => [...mem.keys()][i] ?? null, get length() { return mem.size },
} as Storage
const load = async () => { vi.resetModules(); return import('./useRtt') }

describe('distance control state', () => {
  beforeEach(() => mem.clear())

  it('is saved under archstory.hood.rtt', async () => {
    const m = await load()
    expect(m.RTT_KEY).toBe('archstory.hood.rtt')
    expect(m.savedRtt()).toBeNull()
    m.chooseRtt(150)
    expect(mem.get('archstory.hood.rtt')).toBe('150')
    expect(m.savedRtt()).toBe(150)
  })

  it('is read back when the app loads again', async () => {
    mem.set('archstory.hood.rtt', '30')
    expect((await load()).savedRtt()).toBe(30)
  })

  it('ignores junk, zero, negative and non-numeric saved values', async () => {
    for (const bad of ['"fast"', '0', '-5', 'null', 'not json', '"70"', '[70]']) {
      mem.set('archstory.hood.rtt', bad)
      expect((await load()).savedRtt()).toBeNull()
    }
  })

  it('uses the module reference until a distance is chosen, and is custom only when it differs', async () => {
    const { resolveRtt } = await load()
    expect(resolveRtt(50, null)).toEqual({ ms: 50, own: 50, custom: false })
    expect(resolveRtt(50, 50)).toEqual({ ms: 50, own: 50, custom: false })
    expect(resolveRtt(50, 150)).toEqual({ ms: 150, own: 50, custom: true })
    expect(resolveRtt(150, 10)).toEqual({ ms: 10, own: 150, custom: true })
  })
})

describe('distance options', () => {
  it('are the four presets, ascending', () => {
    expect([...RTT_PRESETS]).toEqual([10, 30, 70, 150])
    expect(rttOptions(DEFAULT_RTT_MS, DEFAULT_RTT_MS)).toEqual([10, 30, 50, 70, 150])
  })
  it('add the module reference and a custom choice once, in order', () => {
    expect(rttOptions(30, 30)).toEqual([10, 30, 70, 150])
    expect(rttOptions(50, 12)).toEqual([10, 12, 30, 50, 70, 150])
    expect(rttOptions(50, 70)).toEqual([10, 30, 50, 70, 150])
  })
})
