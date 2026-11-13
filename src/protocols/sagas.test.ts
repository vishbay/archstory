// Sagas module: forward and compensating steps are checked against the saga definition card, the idempotent retry against
// the keys on the wire and the counts in Payments card, so the text and the cards cannot drift apart.
import { describe, expect, it } from 'vitest'
import { PROTOCOLS } from '.'
import { dataAt, stateAt, stateChanges } from '../model/protocol'
import type { Flow, Step } from '../model/schema'

const saga = PROTOCOLS.find(p => p.id === 'sagas')!
const flowOf = (id: string): Flow => saga.flows.find(f => f.id === id)!
const SERVICES = ['inventory', 'payments', 'shipping']
const idxOf = (f: Flow, p: (s: Step) => boolean, from = 0) => f.steps.findIndex((s, i) => i >= from && p(s))
const key = (s: Step) => s.fields?.find(x => x.name === 'Idempotency-Key')?.value

// The definition card: "N forward/undo", with the first word of each used to recognise the steps on the wire.
const definition = (f: Flow) => dataAt(f, 0).orchestrator.items.map(l => { const [, fw, undo] = l.match(/^\d+ (.+)\/(.+)$/)!; return { forward: fw.split(' ')[0], undo: undo.split(' ')[0] } })
const word = (s: Step) => s.label.split(' ')[0]

describe('sagas module', () => {
  it('is the thirteenth module, in Distributed systems, medium, with the paper and the book as sources', () => {
    expect(saga.meta.order).toBe(13)
    expect(saga.meta.section).toBe('Distributed systems')
    expect(saga.meta.difficulty).toBe('medium')
    expect(saga.meta.layout).toBeUndefined()
    expect(saga.meta.source).toMatch(/Garcia-Molina and Salem/)
    expect(saga.meta.source).toMatch(/1987/)
    expect(saga.flows.map(f => f.id)).toEqual(['happy', 'compensation', 'retry'])
    expect(saga.flows.map(f => f.steps.length)).toEqual([10, 14, 9])
    expect(saga.nodes.map(n => n.id)).toEqual(['client', 'orchestrator', 'inventory', 'payments', 'shipping'])
    expect(saga.questions).toHaveLength(6)
    for (const q of saga.questions) expect(q.a.split(/(?<=[.!?])\s+(?=[A-Z])/).length, q.id).toBeLessThanOrEqual(4)
    expect(saga.meta.summary).toMatch(/illustrative/)
    expect(JSON.stringify(flowOf('happy').steps[0])).toMatch(/illustrative/)
  })

  it('keeps every data line within a timeline card (21 characters, 6 lines)', () => {
    for (const f of saga.flows) for (const [i, s] of f.steps.entries()) for (const [id, v] of Object.entries(s.data ?? {})) {
      expect(v.items.length, `${f.id} step ${i + 1} ${id}`).toBeLessThanOrEqual(6)
      for (const it of [v.title ?? '', ...v.items]) expect(it.length, `${f.id} step ${i + 1} ${id}: ${it}`).toBeLessThanOrEqual(21)
    }
  })

  it('every forward step has a compensation in the definition, and the happy and compensation flows start from the same one', () => {
    expect(definition(flowOf('happy'))).toEqual([
      { forward: 'reserve', undo: 'release' }, { forward: 'charge', undo: 'refund' }, { forward: 'create', undo: 'cancel' }])
    expect(definition(flowOf('compensation'))).toEqual(definition(flowOf('happy')))
  })

  describe('happy path', () => {
    const f = flowOf('happy')

    it('runs the forward steps in the order of the definition, each one answered before the next', () => {
      const calls = f.steps.filter(s => s.kind === 'req' && SERVICES.includes(s.to))
      expect(calls.map(word)).toEqual(definition(f).map(d => d.forward))
      expect(calls.map(s => s.to)).toEqual(['inventory', 'payments', 'shipping'])
      for (const c of calls) {
        const reply = idxOf(f, s => s.kind === 'res' && s.from === c.to, f.steps.indexOf(c))
        expect(reply).toBeGreaterThan(f.steps.indexOf(c))
      }
    })

    it('logs STARTED before the first call and the order stays PENDING until the saga completes', () => {
      const started = idxOf(f, s => s.label.startsWith('write saga log'))
      expect(started).toBeLessThan(idxOf(f, s => s.kind === 'req' && s.to === 'inventory'))
      const done = idxOf(f, s => s.state?.orchestrator === 'Completed')
      for (let i = started; i < done; i++) expect(dataAt(f, i).orchestrator.items[0], `step ${i + 1}`).toBe('order 7: PENDING')
      expect(dataAt(f, done).orchestrator.items[0]).toBe('order 7: CONFIRMED')
      expect(dataAt(f, done).orchestrator.items.at(-1)).toBe('5 COMPLETED')
    })

    it('ends with the orchestrator Completed and each service in its forward state', () => {
      expect(stateAt(f, f.steps.length - 1)).toMatchObject({ orchestrator: 'Completed', inventory: 'Reserved', payments: 'Charged', shipping: 'Created' })
      expect(stateChanges(f).flatMap(c => (c.orchestrator ? [c.orchestrator] : []))).toEqual(['Started', 'Stock reserved', 'Paid', 'Completed'])
    })

    it('uses a different idempotency key for each command, with the order in it', () => {
      const keys = f.steps.map(key).filter(Boolean)
      expect(keys).toEqual(['order-7-reserve', 'order-7-charge', 'order-7-ship'])
      expect(new Set(keys).size).toBe(keys.length)
    })
  })

  describe('shipping fails: compensation', () => {
    const f = flowOf('compensation')
    const failed = idxOf(f, s => s.kind === 'res' && s.from === 'shipping')
    const forward = f.steps.slice(0, failed).filter(s => s.kind === 'req' && SERVICES.includes(s.to))
    const compensations = f.steps.slice(failed).filter(s => s.kind === 'req' && SERVICES.includes(s.to))

    it('the failed step is the last forward step, and it made no change so it is not compensated', () => {
      expect(forward.map(word)).toEqual(['reserve', 'charge', 'create'])
      expect(f.steps[failed].label).toMatch(/^failed/)
      expect(dataAt(f, failed).shipping.items[0]).toBe('none for order 8')
      expect(stateAt(f, failed).shipping).toBe('Idle')
      expect(compensations.map(s => s.to)).not.toContain('shipping')
    })

    it('compensations run in the reverse of the forward order, one for each step that completed', () => {
      const def = definition(f)
      const completed = forward.filter(s => s.to !== 'shipping')
      const expected = [...completed].reverse().map(s => def.find(d => d.forward === word(s))!.undo)
      expect(compensations.map(word)).toEqual(expected)
      expect(compensations.map(word)).toEqual(['refund', 'release'])
      expect(compensations.map(s => s.to)).toEqual([...completed].reverse().map(s => s.to))
    })

    it('every compensation is idempotent: it carries a key of its own', () => {
      const keys = [...forward, ...compensations].map(key)
      expect(keys.every(Boolean)).toBe(true)
      expect(new Set(keys).size).toBe(keys.length)
      expect(compensations.map(key)).toEqual(['order-8-refund', 'order-8-release'])
    })

    it('the orchestrator goes Started, Stock reserved, Paid, Compensating, Compensated, and the services end undone', () => {
      expect(stateChanges(f).flatMap(c => (c.orchestrator ? [c.orchestrator] : []))).toEqual(['Started', 'Stock reserved', 'Paid', 'Compensating', 'Compensated'])
      expect(stateAt(f, f.steps.length - 1)).toMatchObject({ inventory: 'Released', payments: 'Refunded', shipping: 'Idle', orchestrator: 'Compensated' })
      const end = dataAt(f, f.steps.length - 1)
      expect(end.orchestrator.items[0]).toBe('order 8: CANCELLED')
      expect(end.orchestrator.items.at(-1)).toBe('8 COMPENSATED')
    })

    it('shows the lack of isolation: stock held and the charge visible while the order is still PENDING', () => {
      const reserve = idxOf(f, s => s.kind === 'req' && s.to === 'inventory')
      const charge = idxOf(f, s => s.kind === 'req' && s.to === 'payments')
      expect(dataAt(f, reserve).inventory.items).toContain('others see 4 left')
      expect(dataAt(f, charge).payments.items).toContain('visible to customer')
      expect(dataAt(f, failed).orchestrator.items[0]).toBe('order 8: PENDING')
    })

    it('ends with the money back and the stock released: net 0.00, reserved 0', () => {
      const end = dataAt(f, f.steps.length - 1)
      expect(end.payments.items).toContain('net charged: 0.00')
      expect(end.payments.items).toContain('refund rf-2: 30.00')
      expect(end.inventory.items).toContain('reserved 0')
    })
  })

  describe('lost reply: retry with an idempotency key', () => {
    const f = flowOf('retry')
    const charges = f.steps.map((s, i) => [s, i] as const).filter(([s]) => s.kind === 'req' && s.to === 'payments')

    it('the first reply is lost, a timeout of 2000 ms passes, then the charge is retried', () => {
      const lost = idxOf(f, s => s.lost === true)
      expect(f.steps[lost]).toMatchObject({ kind: 'res', from: 'payments', to: 'orchestrator' })
      const wait = idxOf(f, s => s.wait !== undefined)
      expect(f.steps[wait]).toMatchObject({ kind: 'local', from: 'orchestrator', wait: 2000 })
      expect(charges).toHaveLength(2)
      expect(lost).toBeGreaterThan(charges[0][1])
      expect(wait).toBeGreaterThan(lost)
      expect(charges[1][1]).toBeGreaterThan(wait)
      expect(f.steps.filter(s => s.lost)).toHaveLength(1)
    })

    it('the retry carries the same idempotency key, and the charge happens once', () => {
      expect(charges.map(([s]) => key(s))).toEqual(['order-9-charge', 'order-9-charge'])
      for (const [, i] of charges) expect(dataAt(f, i).payments.items).toContain('charges made: 1')
      const end = dataAt(f, f.steps.length - 1).payments.items
      expect(end).toContain('charges made: 1')
      expect(end).toContain(`requests seen: ${charges.length}`)
      // Payments answers the retry with the stored result of the first charge, not a new one.
      const ids = f.steps.filter(s => s.kind === 'res' && s.from === 'payments').map(s => s.label.match(/ch-\d+/)![0])
      expect(new Set(ids).size).toBe(1)
      expect(end[0]).toMatch(new RegExp(`^${ids[0]}: `))
    })

    it('then the saga continues to Completed and the client is answered', () => {
      expect(stateChanges(f).flatMap(c => (c.orchestrator ? [c.orchestrator] : []))).toEqual(['Stock reserved', 'Paid', 'Completed'])
      expect(dataAt(f, f.steps.length - 1).orchestrator.items[0]).toBe('order 9: CONFIRMED')
      expect(f.steps.at(-1)).toMatchObject({ from: 'orchestrator', to: 'client', kind: 'res' })
    })
  })
})
