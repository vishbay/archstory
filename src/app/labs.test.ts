import { beforeEach, describe, expect, it } from 'vitest'
import { getLab, labKey, onLabs, setLab } from './labs'

// Node test environment: an in-memory localStorage and a window that is just an event target.
const mem = new Map<string, string>()
globalThis.localStorage = {
  getItem: k => mem.get(k) ?? null, setItem: (k, v) => void mem.set(k, String(v)), removeItem: k => void mem.delete(k),
  clear: () => mem.clear(), key: i => [...mem.keys()][i] ?? null, get length() { return mem.size },
} as Storage
if (typeof window === 'undefined') (globalThis as { window?: unknown }).window = new EventTarget()

describe('labs flags', () => {
  beforeEach(() => mem.clear())

  it('are off until switched on, and stored under archstory.labs.<name>', () => {
    expect(labKey('underhood')).toBe('archstory.labs.underhood')
    expect(getLab('underhood')).toBe(false)
    setLab('underhood', true)
    expect(mem.get('archstory.labs.underhood')).toBe('true')
    expect(getLab('underhood')).toBe(true)
    setLab('underhood', false)
    expect(getLab('underhood')).toBe(false)
  })

  it('treat anything but true as off', () => {
    mem.set('archstory.labs.underhood', '"yes"')
    expect(getLab('underhood')).toBe(false)
    mem.set('archstory.labs.underhood', 'not json')
    expect(getLab('underhood')).toBe(false)
  })

  it('tell every subscriber at once, and stop after unsubscribing', () => {
    let a = 0, b = 0
    const offA = onLabs(() => a++), offB = onLabs(() => b++)
    setLab('underhood', true)
    expect([a, b]).toEqual([1, 1])
    offA(); offB()
    setLab('underhood', false)
    expect([a, b]).toEqual([1, 1])
  })
})
