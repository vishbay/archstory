// Engine phase: lost packets, per-actor data views, free layout, sections and the Distance (round trip time) control.
import { describe, expect, it } from 'vitest'
import { LIBRARY } from '../library'
import { parseDesign, type Flow } from './schema'
import {
  dataAt, dataChanges, dataLines, DATA_LINES, fmtMs, fmtRttMs, moduleRtt, phaseBudget, rttOptions, rttTimes, rttToMs, stepDelay, usesData,
} from './protocol'

const base = {
  schema: 'archstory/v1', id: 'p', meta: { title: 'P', kind: 'protocol' },
  nodes: [{ id: 'a', label: 'A', kind: 'client' }, { id: 'b', label: 'B', kind: 'service' }],
  edges: [{ from: 'a', to: 'b' }],
}
const withSteps = (steps: unknown[], meta: object = {}, nodes: unknown[] = base.nodes) =>
  ({ ...base, nodes, meta: { ...base.meta, ...meta }, flows: [{ id: 'f', title: 'F', steps }] })
const errors = (input: unknown) => { const r = parseDesign(input); return r.ok ? [] : r.errors.join('\n') }

describe('lost steps', () => {
  it('take no time by default, because nothing arrives', () => {
    expect(stepDelay({ from: 'a', to: 'b', lost: true })).toBe(0)
    expect(stepDelay({ from: 'a', to: 'b', lost: false })).toBe(1)
    expect(stepDelay({ from: 'a', to: 'b' })).toBe(1)
  })

  it('an explicit delay still wins', () => {
    expect(stepDelay({ from: 'a', to: 'b', lost: true, delay: 2 })).toBe(2)
    expect(stepDelay({ from: 'a', to: 'b', lost: true, delay: 0 })).toBe(0)
  })

  it('leave the clock where it was, and the steps after them carry on from there', () => {
    // sent (arrives 0.5), sent right behind it and lost (still 0.5), the ACK back (1), then a 1 s wait of 40 one-way trips on the sender
    const t = rttTimes([
      { from: 'a', to: 'b' }, { from: 'a', to: 'b', lost: true }, { from: 'b', to: 'a' }, { from: 'a', to: 'a', delay: 40 }, { from: 'a', to: 'b' },
    ])
    expect(t).toEqual([0.5, 0.5, 1, 21, 21.5])
  })

  it('count in the time budget like any other step: zero for the lost step, the wait for the local step', () => {
    const b = phaseBudget([
      { from: 'a', to: 'b', phase: 'Send' }, { from: 'a', to: 'b', lost: true }, { from: 'a', to: 'a', phase: 'Wait', delay: 4 },
    ])
    expect(b).toEqual([{ name: 'Send', rtt: 0.5 }, { name: 'Wait', rtt: 2 }])
  })

  it('are accepted on req, res and async steps and rejected on a local step', () => {
    for (const kind of ['req', 'res', 'async']) expect(parseDesign(withSteps([{ from: 'a', to: 'b', kind, label: 'x', lost: true }])).ok, kind).toBe(true)
    expect(errors(withSteps([{ from: 'a', to: 'a', kind: 'local', label: 'x', lost: true }]))).toContain('cannot be lost')
  })
})

describe('per-actor data views', () => {
  const flow: Pick<Flow, 'steps'> = { steps: [
    { from: 'a', to: 'b', kind: 'req' as const, label: '1', data: { a: { items: ['x=1'] }, b: { title: 'log', items: ['1: x=1'], mark: [0] } } },
    { from: 'b', to: 'a', kind: 'res' as const, label: '2' },
    { from: 'a', to: 'b', kind: 'req' as const, label: '3', data: { b: { title: 'log', items: ['1: x=1', '2: y=2'], mark: [1] } } },
  ] }

  it('dataAt keeps each actor\'s latest view up to a step, and is empty before the first step', () => {
    expect(dataAt(flow, -1)).toEqual({})
    expect(Object.keys(dataAt(flow, 1)).sort()).toEqual(['a', 'b'])
    expect(dataAt(flow, 1).b.items).toEqual(['1: x=1'])
    expect(dataAt(flow, 2).b.items).toEqual(['1: x=1', '2: y=2'])
    expect(dataAt(flow, 2).a.items).toEqual(['x=1'])       // not listed again: keeps what it had
    expect(dataAt(flow, 99).b.mark).toEqual([1])
  })

  it('dataChanges lists the actors a step shows, and usesData finds flows with any', () => {
    expect(dataChanges(flow)).toEqual([['a', 'b'], [], ['b']])
    expect(usesData(flow)).toBe(true)
    expect(usesData({ steps: [{ from: 'a', to: 'b', kind: 'req', label: 'x' }] })).toBe(false)
    expect(usesData({ steps: [{ from: 'a', to: 'b', kind: 'req', label: 'x', data: {} }] })).toBe(false)
  })

  it('shows at most 6 lines and "+N more", keeping track of marks', () => {
    const items = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']
    const lines = dataLines({ items, mark: [1, 7] })
    expect(DATA_LINES).toBe(6)
    expect(lines.map(l => l.text)).toEqual(['a', 'b', 'c', 'd', 'e', 'f', '+2 more'])
    expect(lines.map(l => l.marked)).toEqual([false, true, false, false, false, false, true])   // the hidden marked item lights the "more" line
    expect(dataLines({ items: ['a', 'b'], mark: [0] })).toEqual([{ text: 'a', marked: true }, { text: 'b', marked: false }])
    expect(dataLines({ items: [] })).toEqual([])
    expect(dataLines({ items: items.slice(0, 6) }).length).toBe(6)
    expect(dataLines({ items: items.slice(0, 7) }).at(-1)!.text).toBe('+1 more')
  })

  it('validates actor ids and that every mark is an index of an item', () => {
    const ok = withSteps([{ from: 'a', to: 'b', kind: 'req', label: 'x', data: { b: { items: ['p', 'q'], mark: [0, 1] } } }])
    expect(parseDesign(ok).ok).toBe(true)
    expect(errors(withSteps([{ from: 'a', to: 'b', kind: 'req', label: 'x', data: { z: { items: [] } } }]))).toContain('data for unknown node "z"')
    expect(errors(withSteps([{ from: 'a', to: 'b', kind: 'req', label: 'x', data: { b: { items: ['p'], mark: [1] } } }]))).toContain('marks item 1 but has only 1 items')
    expect(parseDesign(withSteps([{ from: 'a', to: 'b', kind: 'req', label: 'x', data: { b: { items: ['p'], mark: [-1] } } }])).ok).toBe(false)
    expect(parseDesign(withSteps([{ from: 'a', to: 'b', kind: 'req', label: 'x', data: { b: { items: 'p' } } }])).ok).toBe(false)
  })
})

describe('free layout and sections in the schema', () => {
  const placed = [{ id: 'a', label: 'A', kind: 'client', at: { x: 50, y: 10 } }, { id: 'b', label: 'B', kind: 'service', at: { x: 90, y: 100 } }]
  const step = [{ from: 'a', to: 'b', kind: 'req', label: 'x' }]

  it('accepts a free layout when every node has a position in 0 to 100', () => {
    expect(parseDesign(withSteps(step, { layout: 'free' }, placed)).ok).toBe(true)
    expect(parseDesign(withSteps(step, { layout: 'free', nodeSize: 'compact' }, placed)).ok).toBe(true)
  })

  it('requires "at" on every node for a free layout, and allows it without one', () => {
    expect(errors(withSteps(step, { layout: 'free' }, [placed[0], base.nodes[1]]))).toContain('node "b": a free layout needs "at" on every node')
    expect(parseDesign(withSteps(step, { layout: 'lifelines' })).ok).toBe(true)
    expect(parseDesign(withSteps(step, {}, placed)).ok).toBe(true)   // positions without the layout are harmless
  })

  it('rejects positions outside the canvas and unknown layouts', () => {
    expect(parseDesign(withSteps(step, {}, [{ ...placed[0], at: { x: 101, y: 0 } }, placed[1]])).ok).toBe(false)
    expect(parseDesign(withSteps(step, {}, [{ ...placed[0], at: { x: 0, y: -1 } }, placed[1]])).ok).toBe(false)
    expect(parseDesign(withSteps(step, { layout: 'ring' })).ok).toBe(false)
  })

  it('takes a section and a reference round trip time', () => {
    const r = parseDesign(withSteps(step, { section: 'Distributed systems', rtt: 80 }))
    expect(r.ok && r.design.meta.section).toBe('Distributed systems')
    expect(r.ok && r.design.meta.rtt).toBe(80)
    expect(parseDesign(withSteps(step, { rtt: 0 })).ok).toBe(false)
    expect(parseDesign(withSteps(step, { section: '' })).ok).toBe(false)
  })

  it('leaves every library design exactly as before: none of the engine fields', () => {
    for (const d of LIBRARY) {
      for (const k of ['section', 'layout', 'nodeSize', 'rtt']) expect(k in d.meta, `${d.id} meta.${k}`).toBe(false)
      for (const n of d.nodes) expect('at' in n, `${d.id}/${n.id}`).toBe(false)
      for (const f of d.flows) for (const s of f.steps) expect('lost' in s || 'data' in s, `${d.id}/${f.id}`).toBe(false)
    }
  })
})

describe('distance: round trip time in milliseconds', () => {
  it('turns round trips into milliseconds', () => {
    expect(rttToMs(0.5, 50)).toBe(25)
    expect(rttToMs(1, 150)).toBe(150)
    expect(rttToMs(0.2, 50)).toBe(10)       // the URL module's resolver legs
    expect(rttToMs(4.2, 50)).toBe(210)
    expect(rttToMs(0, 70)).toBe(0)
    expect(rttToMs(20, 50)).toBe(1000)
  })

  it('scales every time the same way when the distance changes', () => {
    const t = rttTimes([{ from: 'a', to: 'b' }, { from: 'b', to: 'a' }, { from: 'a', to: 'b', delay: 0.4 }])
    for (const ms of [10, 30, 70, 150]) t.forEach(x => expect(rttToMs(x, ms)).toBeCloseTo(x * ms, 6))
  })

  it('formats milliseconds below a second and seconds above', () => {
    expect(fmtMs(25)).toBe('25 ms')
    expect(fmtMs(12.5)).toBe('12.5 ms')
    expect(fmtMs(0)).toBe('0 ms')
    expect(fmtMs(999)).toBe('999 ms')
    expect(fmtMs(1000)).toBe('1 s')
    expect(fmtMs(1500)).toBe('1.5 s')
    expect(fmtMs(3200)).toBe('3.2 s')
  })

  it('shows round trips and milliseconds together', () => {
    expect(fmtRttMs(0.5, 50)).toBe('0.5 RTT, 25 ms')
    expect(fmtRttMs(1.5, 150)).toBe('1.5 RTT, 225 ms')
    expect(fmtRttMs(0, 50)).toBe('0 RTT, 0 ms')
  })

  it('takes the module\'s own round trip time, else 50 ms', () => {
    expect(moduleRtt({ meta: { title: 'x', tags: [] } })).toBe(50)
    expect(moduleRtt({ meta: { title: 'x', tags: [], rtt: 80 } })).toBe(80)
  })

  it('offers the four presets plus the module\'s own and the chosen value, ascending and without repeats', () => {
    expect(rttOptions(50, 50)).toEqual([10, 30, 50, 70, 150])
    expect(rttOptions(30, 150)).toEqual([10, 30, 70, 150])
    expect(rttOptions(80, 12)).toEqual([10, 12, 30, 70, 80, 150])
  })
})
