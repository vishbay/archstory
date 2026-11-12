import { describe, expect, it } from 'vitest'
import { LIBRARY } from '../library'
import { parseDesign } from './schema'
import { fmtRtt, rttTimes, stateAt, stateChanges, stepDelay } from './protocol'

const base = {
  schema: 'archstory/v1', id: 'p', meta: { title: 'P', kind: 'protocol' },
  nodes: [{ id: 'a', label: 'A', kind: 'client' }, { id: 'b', label: 'B', kind: 'service' }],
  edges: [{ from: 'a', to: 'b' }],
}
const withSteps = (steps: unknown[]) => ({ ...base, flows: [{ id: 'f', title: 'F', steps }] })

describe('protocol schema additions', () => {
  it('accepts kind, order, state, fields and delay', () => {
    const r = parseDesign({ ...withSteps([
      { from: 'a', to: 'b', kind: 'req', label: 'SYN', state: { a: 'SYN_SENT' }, fields: [{ name: 'flags', value: 'SYN', note: 'start' }], delay: 2 },
    ]), meta: { title: 'P', kind: 'protocol', order: 3 } })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.design.meta.kind).toBe('protocol')
    expect(r.design.meta.order).toBe(3)
    expect(r.design.flows[0].steps[0].fields?.[0].value).toBe('SYN')
  })

  it('rejects state for an actor that is not a node', () => {
    const r = parseDesign(withSteps([{ from: 'a', to: 'b', kind: 'req', label: 'x', state: { c: 'LISTEN' } }]))
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errors.join('\n')).toContain('state for unknown node "c"')
  })

  it('rejects a negative delay and an unknown design kind', () => {
    expect(parseDesign(withSteps([{ from: 'a', to: 'b', kind: 'req', label: 'x', delay: -1 }])).ok).toBe(false)
    expect(parseDesign({ ...withSteps([{ from: 'a', to: 'b', kind: 'req', label: 'x' }]), meta: { title: 'P', kind: 'game' } }).ok).toBe(false)
  })

  it('leaves every library design exactly as before: no kind and none of the new step fields', () => {
    for (const d of LIBRARY) {
      expect(d.meta.kind, d.id).toBeUndefined()
      for (const f of d.flows) for (const s of f.steps) {
        expect('state' in s || 'fields' in s || 'delay' in s, `${d.id}/${f.id}`).toBe(false)
      }
    }
  })
})

describe('round-trip timing', () => {
  it('counts one one-way trip per hop, none for a local step, and a step\'s own delay when given', () => {
    expect(stepDelay({ from: 'a', to: 'b' })).toBe(1)
    expect(stepDelay({ from: 'a', to: 'a' })).toBe(0)
    expect(stepDelay({ from: 'a', to: 'b', delay: 0 })).toBe(0)
    expect(stepDelay({ from: 'a', to: 'a', delay: 4 })).toBe(4)
  })

  it('accumulates arrival times in RTT (half an RTT per one-way trip)', () => {
    expect(rttTimes([
      { from: 'a', to: 'a' }, { from: 'a', to: 'b' }, { from: 'b', to: 'a' }, { from: 'a', to: 'b' }, { from: 'a', to: 'b', delay: 0 }, { from: 'b', to: 'a', delay: 3 },
    ])).toEqual([0, 0.5, 1, 1.5, 1.5, 3])
    expect(rttTimes([])).toEqual([])
  })

  it('formats round trips without trailing zeros', () => {
    expect(fmtRtt(0)).toBe('0 RTT')
    expect(fmtRtt(0.5)).toBe('0.5 RTT')
    expect(fmtRtt(2)).toBe('2 RTT')
    expect(fmtRtt(1 / 3)).toBe('0.33 RTT')
  })
})

describe('actor state', () => {
  const flow = { steps: [
    { from: 'a', to: 'b', kind: 'req' as const, label: '1', state: { a: 'X', b: 'L' } },
    { from: 'b', to: 'a', kind: 'res' as const, label: '2' },
    { from: 'a', to: 'b', kind: 'req' as const, label: '3', state: { a: 'X', b: 'M' } },
  ] }
  it('shows the latest state up to a step, and nothing before the first', () => {
    expect(stateAt(flow, -1)).toEqual({})
    expect(stateAt(flow, 1)).toEqual({ a: 'X', b: 'L' })
    expect(stateAt(flow, 2)).toEqual({ a: 'X', b: 'M' })
  })
  it('marks only real changes', () => {
    expect(stateChanges(flow)).toEqual([{ a: 'X', b: 'L' }, {}, { b: 'M' }])
  })
})
