import { beforeEach, describe, expect, it } from 'vitest'
import { migrateStorage } from './hooks'

// Minimal in-memory localStorage for the node test environment.
const mem = new Map<string, string>()
globalThis.localStorage = {
  getItem: k => mem.get(k) ?? null, setItem: (k, v) => void mem.set(k, String(v)), removeItem: k => void mem.delete(k),
  clear: () => mem.clear(), key: i => [...mem.keys()][i] ?? null, get length() { return mem.size },
} as Storage

describe('storage migration after the rename', () => {
  beforeEach(() => mem.clear())
  it('moves old keys to the new prefix without overwriting newer data', () => {
    mem.set('sdl.attempt.chat', '{"a":1}'); mem.set('sdl.theme', '"dark"'); mem.set('archstory.theme', '"light"'); mem.set('other', 'x')
    // Object.keys(localStorage) reads own properties; mirror the map onto the object for the test
    for (const k of mem.keys()) Object.defineProperty(localStorage, k, { value: mem.get(k), enumerable: true, configurable: true })
    migrateStorage()
    expect(mem.get('archstory.attempt.chat')).toBe('{"a":1}')
    expect(mem.get('archstory.theme')).toBe('"light"')
    expect(mem.has('sdl.attempt.chat')).toBe(false)
    expect(mem.get('other')).toBe('x')
  })
})
