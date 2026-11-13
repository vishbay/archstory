// Quorums module: the R + W > N arithmetic, which version a read returns, hinted handoff delivery and the version vector
// comparison are recomputed here from the data cards and message fields the timeline shows, so text and numbers cannot drift.
import { describe, expect, it } from 'vitest'
import { PROTOCOLS } from '.'
import { dataAt, type DataView } from '../model/protocol'
import type { Flow, Step } from '../model/schema'

const quorums = PROTOCOLS.find(p => p.id === 'quorums')!
const flowOf = (id: string): Flow => quorums.flows.find(f => f.id === id)!
const REPLICAS = ['r1', 'r2', 'r3']
const field = (s: Step, name: string) => s.fields!.find(x => x.name === name)!.value
const idxOf = (f: Flow, p: (s: Step) => boolean, from = 0) => f.steps.findIndex((s, i) => i >= from && p(s))
const sentences = (a: string) => a.split(/(?<=[.!?])\s+(?=[A-Z])/).length

interface Q { N: number; R: number; W: number; sum: number; op: string; lines: string[] }
const parseQ = (v: DataView): Q => {
  const a = v.items[0].match(/^N (\d+), R (\d+), W (\d+)$/)!
  const b = v.items[1].match(/^R \+ W = (\d+) (>|<=) N (\d+)$/)!
  expect(Number(b[3])).toBe(Number(a[1]))
  return { N: Number(a[1]), R: Number(a[2]), W: Number(a[3]), sum: Number(b[1]), op: b[2], lines: v.items }
}
interface Rep { value: string; version: number; hint?: string; empty: boolean }
const parseRep = (v: DataView): Rep => {
  if (v.items[0].startsWith('no copy')) return { value: '', version: 0, empty: true }
  const hint = v.items.find(i => i.startsWith('hint for '))?.slice('hint for '.length)
  return { value: v.items[1].replace('value ', ''), version: Number(v.items[2].replace('version ', '')), hint, empty: false }
}
const repAt = (f: Flow, i: number, id: string): Rep => parseRep(dataAt(f, i)[id])
const quorumAt = (f: Flow, i: number): Q => parseQ(dataAt(f, i).coord)

/** All subsets of `items` of the given size. */
const subsets = <T,>(items: T[], size: number): T[][] =>
  size === 0 ? [[]] : items.flatMap((x, i) => subsets(items.slice(i + 1), size - 1).map(rest => [x, ...rest]))

// ---- version vectors ("R1:2,R3:1"), the vector clock of Dynamo section 4.4
type Clock = Record<string, number>
const parseClock = (s: string): Clock => Object.fromEntries(s.split(',').map(p => { const [n, c] = p.split(':'); return [n, Number(c)] }))
const get = (c: Clock, n: string) => c[n] ?? 0
const nodesOf = (a: Clock, b: Clock) => [...new Set([...Object.keys(a), ...Object.keys(b)])]
/** a is an ancestor of (or equal to) b: every counter of a is at most the counter in b. */
const leq = (a: Clock, b: Clock) => nodesOf(a, b).every(n => get(a, n) <= get(b, n))
const dominates = (a: Clock, b: Clock) => leq(b, a) && !leq(a, b)
const concurrent = (a: Clock, b: Clock) => !leq(a, b) && !leq(b, a)
const merge = (a: Clock, b: Clock): Clock => Object.fromEntries(nodesOf(a, b).map(n => [n, Math.max(get(a, n), get(b, n))]))
interface Ver { id: string; value: string; clock: Clock; clockText: string }
const parseVers = (v: DataView): Ver[] => {
  const out: Ver[] = []
  for (let i = 0; i < v.items.length; i++) {
    const m = v.items[i].match(/^D(\d): (.+)$/)
    if (m) { const c = v.items[i + 1].match(/^clock (.+)$/)![1]; out.push({ id: `D${m[1]}`, value: m[2], clock: parseClock(c), clockText: c }) }
  }
  return out
}

describe('quorums module', () => {
  it('is the fourteenth module, in Distributed systems, medium, citing the Dynamo paper', () => {
    expect(quorums.meta.order).toBe(14)
    expect(quorums.meta.section).toBe('Distributed systems')
    expect(quorums.meta.difficulty).toBe('medium')
    expect(quorums.meta.layout).toBeUndefined()
    expect(quorums.meta.source).toMatch(/DeCandia/)
    expect(quorums.meta.source).toMatch(/2007/)
    expect(quorums.flows.map(f => f.id)).toEqual(['quorum-read-write', 'sloppy-quorum', 'stale-read', 'version-vectors'])
    expect(quorums.flows.map(f => f.steps.length)).toEqual([14, 13, 11, 14])
    for (const f of quorums.flows) { expect(f.steps.length).toBeGreaterThanOrEqual(8); expect(f.steps.length).toBeLessThanOrEqual(14) }
    expect(quorums.nodes.map(n => n.id)).toEqual(['client', 'coord', 'r1', 'r2', 'r3', 'r4'])
    expect(quorums.questions).toHaveLength(6)
    for (const q of quorums.questions) expect(sentences(q.a), q.id).toBeLessThanOrEqual(4)
    expect(quorums.notes.length).toBeGreaterThanOrEqual(5)
    for (const f of quorums.flows) for (const s of f.steps) { expect(s.label.length).toBeLessThanOrEqual(30); if (s.kind !== 'res') expect(s.detail).toBeTruthy() }
  })

  it('says its values are illustrative and keeps every data card within a timeline card (21 characters, 6 lines)', () => {
    expect(quorums.meta.summary).toMatch(/illustrative/)
    for (const f of quorums.flows) expect(f.summary, f.id).toMatch(/illustrative/)
    expect(JSON.stringify(flowOf('quorum-read-write').steps[0])).toMatch(/illustrative/)
    for (const f of quorums.flows) for (const [i, s] of f.steps.entries()) for (const [id, v] of Object.entries(s.data ?? {})) {
      expect(v.items.length, `${f.id} step ${i + 1} ${id}`).toBeLessThanOrEqual(6)
      for (const it of [v.title ?? '', ...v.items]) expect(it.length, `${f.id} step ${i + 1} ${id}: ${it}`).toBeLessThanOrEqual(21)
    }
  })

  it('every quorum card recomputes R + W against N, and matches the W and R the request names', () => {
    for (const f of quorums.flows) f.steps.forEach((s, i) => {
      if (!s.data?.coord || !s.data.coord.items[0].startsWith('N ')) return
      const q = parseQ(s.data.coord)
      expect(q.sum, `${f.id} step ${i + 1}`).toBe(q.R + q.W)
      expect(q.op, `${f.id} step ${i + 1}`).toBe(q.R + q.W > q.N ? '>' : '<=')
      expect(q.N).toBe(3)
      expect(q.R).toBeGreaterThanOrEqual(1); expect(q.W).toBeGreaterThanOrEqual(1)
      expect(q.R).toBeLessThanOrEqual(q.N); expect(q.W).toBeLessThanOrEqual(q.N)
      if (s.kind === 'req' && s.from === 'client') {
        const w = s.fields!.find(x => x.name.startsWith('write quorum'))
        const r = s.fields!.find(x => x.name.startsWith('read quorum'))
        if (w) expect(Number(w.value), `${f.id} step ${i + 1}`).toBe(q.W)
        if (r) expect(Number(r.value), `${f.id} step ${i + 1}`).toBe(q.R)
      }
    })
  })

  it('the settings are the intended ones: (3, 2, 2) in flows 1 and 2, (3, 1, 1) in flow 3, and R + W > N only in the first two', () => {
    const q = (id: string) => quorumAt(flowOf(id), 0)
    expect(q('quorum-read-write')).toMatchObject({ N: 3, R: 2, W: 2, sum: 4, op: '>' })
    expect(q('sloppy-quorum')).toMatchObject({ N: 3, R: 2, W: 2, op: '>' })
    expect(q('stale-read')).toMatchObject({ N: 3, R: 1, W: 1, sum: 2, op: '<=' })
  })

  it('any write set and read set overlap when R + W > N, and a disjoint pair exists when R + W <= N (checked by brute force)', () => {
    for (const id of ['quorum-read-write', 'sloppy-quorum', 'stale-read']) {
      const { N, R, W, op } = quorumAt(flowOf(id), 0)
      const reps = REPLICAS.slice(0, N)
      const pairs = subsets(reps, W).flatMap(w => subsets(reps, R).map(r => [w, r] as const))
      const everyOverlaps = pairs.every(([w, r]) => w.some(x => r.includes(x)))
      expect(everyOverlaps, id).toBe(op === '>')
      if (op === '>') for (const [w, r] of pairs) expect(w.filter(x => r.includes(x)).length).toBeGreaterThanOrEqual(R + W - N)
    }
  })

  describe('write W=2, read R=2, read repair', () => {
    const f = flowOf('quorum-read-write')
    const { N, R, W } = quorumAt(f, 0)
    const okAt = idxOf(f, s => s.kind === 'res' && s.to === 'client')
    const getAt = idxOf(f, s => s.from === 'client' && s.label.startsWith('get'))

    it('starts with the same version on every replica, and the new version is 2', () => {
      expect(REPLICAS.map(r => repAt(f, 0, r))).toEqual(REPLICAS.map(() => ({ value: 'A', version: 1, hint: undefined, empty: false })))
      expect(Number(field(f.steps[1], 'version'))).toBe(2)
    })

    it('the client hears success exactly when W replicas acknowledged, and the lost write leaves one replica behind', () => {
      const acks = f.steps.slice(0, okAt).filter(s => s.kind === 'res' && s.from.startsWith('r') && s.to === 'coord').map(s => s.from)
      expect(acks).toHaveLength(W)
      expect(new Set(acks).size).toBe(W)
      const sent = f.steps.slice(0, okAt).filter(s => s.kind === 'req' && s.from === 'coord' && s.label.startsWith('write'))
      expect(sent).toHaveLength(N)
      expect(sent.filter(s => s.lost)).toHaveLength(N - W)
      const lost = sent.find(s => s.lost)!.to
      expect(acks).not.toContain(lost)
      for (const a of acks) expect(repAt(f, okAt, a).version).toBe(2)
      expect(repAt(f, okAt, lost).version).toBe(1)
      expect(quorumAt(f, okAt - 1).lines).toContain(`acks ${W} of W ${W}`)
    })

    it('the read quorum overlaps the write quorum, the newest version wins and the coordinator returns it', () => {
      const writeSet = f.steps.slice(0, okAt).filter(s => s.kind === 'res' && s.to === 'coord').map(s => s.from)
      const replies = f.steps.slice(getAt, f.steps.length).filter(s => s.kind === 'res' && s.to === 'coord')
      expect(replies).toHaveLength(R)
      const readSet = replies.map(s => s.from)
      const overlap = readSet.filter(x => writeSet.includes(x))
      expect(overlap.length).toBeGreaterThanOrEqual(R + W - N)
      const versions = replies.map(s => Number(field(s, 'version')))
      // each reply matches what that replica holds
      replies.forEach(s => expect(repAt(f, getAt, s.from).version).toBe(Number(field(s, 'version'))))
      const newest = Math.max(...versions)
      const final = f.steps[idxOf(f, s => s.kind === 'res' && s.to === 'client', getAt)]
      expect(Number(field(final, 'version'))).toBe(newest)
      expect(newest).toBe(2)
      expect(field(final, 'value')).toBe('B')
      for (const o of overlap) expect(repAt(f, getAt, o).version).toBe(newest)
      expect(quorumAt(f, f.steps.length - 3).lines.join()).toContain(`overlap ${overlap[0].toUpperCase()}`)
    })

    it('read repair sends the newest version to every replica that answered with an older one, and it ends equal', () => {
      const replies = f.steps.slice(getAt).filter(s => s.kind === 'res' && s.to === 'coord')
      const newest = Math.max(...replies.map(s => Number(field(s, 'version'))))
      const stale = replies.filter(s => Number(field(s, 'version')) < newest).map(s => s.from)
      const repairs = f.steps.filter(s => s.kind === 'async')
      expect(repairs.map(s => s.to)).toEqual(stale)
      const last = f.steps.length - 1
      for (const r of stale) expect(repAt(f, last, r)).toMatchObject({ version: newest, value: 'B' })
      expect(REPLICAS.map(r => repAt(f, last, r).version)).toEqual([2, 2, 2])
    })
  })

  describe('a replica is down: sloppy quorum and hinted handoff', () => {
    const f = flowOf('sloppy-quorum')
    const { N, W } = quorumAt(f, 0)

    it('the write succeeds with W acks although R3 is down, and N copies exist because the next healthy node takes the write', () => {
      expect(f.steps[0].state).toMatchObject({ r3: 'Down', r4: 'Up' })
      const okAt = idxOf(f, s => s.kind === 'res' && s.to === 'client')
      const acks = f.steps.slice(0, okAt).filter(s => s.kind === 'res' && s.to === 'coord').map(s => s.from)
      expect(acks).toHaveLength(W)
      expect(acks).not.toContain('r3')
      const sent = f.steps.slice(0, idxOf(f, s => s.from === 'r4' && s.to === 'coord')).filter(s => s.kind === 'req' && s.from === 'coord')
      expect(sent.map(s => s.to)).toEqual(['r1', 'r2', 'r3', 'r4'])
      expect(sent.filter(s => s.lost).map(s => s.to)).toEqual(['r3'])
      const afterAck = idxOf(f, s => s.from === 'r4' && s.to === 'coord')
      const copies = ['r1', 'r2', 'r4'].filter(r => repAt(f, afterAck, r).version === 3).length
      expect(copies).toBe(N)
      expect(quorumAt(f, afterAck).lines).toContain(`copies ${copies} of N ${N}`)
    })

    it('the stand-in stores the value with a hint naming R3, and the timeout comes before the write to the stand-in', () => {
      const w = idxOf(f, s => s.kind === 'req' && s.to === 'r4')
      expect(field(f.steps[w], 'hint')).toBe('R3')
      expect(repAt(f, w, 'r4')).toMatchObject({ version: 3, value: 'C', hint: 'R3' })
      const t = idxOf(f, s => s.kind === 'local' && s.from === 'coord')
      expect(t).toBeLessThan(w)
      expect(f.steps[t].wait).toBe(150)
    })

    it('handoff delivers the hinted version to R3, R4 then drops it, and the three intended replicas agree', () => {
      const up = idxOf(f, s => s.state?.r3 === 'Up')
      expect(repAt(f, up, 'r3')).toMatchObject({ version: 2, value: 'B' })
      const h = idxOf(f, s => s.kind === 'async' && s.from === 'r4' && s.to === 'r3')
      expect(h).toBeGreaterThan(up)
      const hinted = repAt(f, h - 1, 'r4')
      expect(hinted.hint).toBe('R3')
      expect(repAt(f, h, 'r3')).toMatchObject({ version: hinted.version, value: hinted.value })
      expect(Number(field(f.steps[h], 'version'))).toBe(hinted.version)
      const end = f.steps.length - 1
      expect(repAt(f, end, 'r4').empty).toBe(true)
      expect(REPLICAS.map(r => repAt(f, end, r).version)).toEqual([3, 3, 3])
      expect(REPLICAS.map(r => repAt(f, end, r).value)).toEqual(['C', 'C', 'C'])
    })
  })

  describe('R + W <= N: a stale read', () => {
    const f = flowOf('stale-read')
    const { N, R, W } = quorumAt(f, 0)

    it('one ack satisfies W = 1, the write set is {R1} and the read set is {R3}, so they are disjoint', () => {
      const okAt = idxOf(f, s => s.kind === 'res' && s.to === 'client')
      const writeSet = f.steps.slice(0, okAt).filter(s => s.kind === 'res' && s.to === 'coord').map(s => s.from)
      expect(writeSet).toEqual(['r1'])
      expect(writeSet).toHaveLength(W)
      const getAt = idxOf(f, s => s.from === 'client' && s.label.startsWith('get'))
      const readSet = f.steps.slice(getAt).filter(s => s.kind === 'res' && s.to === 'coord').map(s => s.from)
      expect(readSet).toEqual(['r3'])
      expect(readSet).toHaveLength(R)
      expect(readSet.filter(x => writeSet.includes(x))).toEqual([])
      expect(R + W).toBeLessThanOrEqual(N)
    })

    it('the read returns version 3 although version 4 was acknowledged, because the other copies were lost', () => {
      const end = f.steps.length - 1
      expect(REPLICAS.map(r => repAt(f, end, r).version)).toEqual([4, 3, 3])
      const lost = f.steps.filter(s => s.lost)
      expect(lost.map(s => s.to)).toEqual(['r2', 'r3'])
      const final = f.steps[idxOf(f, s => s.kind === 'res' && s.to === 'client', idxOf(f, s => s.label.startsWith('get')))]
      expect(Number(field(final, 'version'))).toBe(3)
      expect(field(final, 'value')).toBe('C')
      expect(Number(field(final, 'version'))).toBeLessThan(Math.max(...REPLICAS.map(r => repAt(f, end, r).version)))
      expect(dataAt(f, end).coord.items).toContain('overlap none')
    })
  })

  describe('version vectors', () => {
    const f = flowOf('version-vectors')
    const copy = (i: number, id: string) => parseVers(dataAt(f, i)[id])
    const readAt = idxOf(f, s => s.from === 'client' && s.label.startsWith('get'))

    it('starts with D1 [R1:1] on every replica, and D2 overwrites D1 because D1 is an ancestor of it', () => {
      for (const r of REPLICAS) expect(copy(0, r)).toMatchObject([{ id: 'D1', clockText: 'R1:1' }])
      const end = readAt - 1
      const d2 = copy(end, 'r1')[0], d3 = copy(end, 'r3')[0]
      const d1 = copy(0, 'r1')[0]
      expect(copy(end, 'r2')).toEqual(copy(end, 'r1'))
      expect(dominates(d2.clock, d1.clock)).toBe(true)
      expect(dominates(d3.clock, d1.clock)).toBe(true)
      // the writer's own counter went up by one
      expect(d2.clock).toEqual({ R1: 2 })
      expect(d3.clock).toEqual({ R1: 1, R3: 1 })
    })

    it('the clock a client write gets is the context with the coordinator\'s own counter incremented', () => {
      const writes = f.steps.filter(s => s.kind === 'req' && s.from === 'client' && s.fields?.some(x => x.name === 'context'))
      expect(writes).toHaveLength(3)
      const coordinators = ['R1', 'R3', 'R1']
      writes.forEach((s, k) => {
        const ctx = parseClock(field(s, 'context'))
        const i = f.steps.indexOf(s)
        const next = { ...ctx, [coordinators[k]]: get(ctx, coordinators[k]) + 1 }
        const shown = dataAt(f, i).coord.items.find(x => /^(D\d clock|clock) /.test(x))
        if (shown) expect(parseClock(shown.replace(/^D\d clock |^clock /, ''))).toEqual(next)
        expect(dataAt(f, i).coord.items[0]).toBe(`acting as ${coordinators[k]}`)
      })
    })

    it('D2 and D3 are concurrent: each is ahead in one entry, so neither dominates, and the read returns both as siblings', () => {
      const replies = f.steps.slice(readAt).filter(s => s.kind === 'res' && s.to === 'coord')
      const [c2, c3] = replies.map(s => parseClock(field(s, 'clock')))
      expect(c2).toEqual({ R1: 2 })
      expect(c3).toEqual({ R1: 1, R3: 1 })
      expect(dominates(c2, c3)).toBe(false)
      expect(dominates(c3, c2)).toBe(false)
      expect(concurrent(c2, c3)).toBe(true)
      expect(get(c2, 'R1')).toBeGreaterThan(get(c3, 'R1'))
      expect(get(c3, 'R3')).toBeGreaterThan(get(c2, 'R3'))
      const cmp = idxOf(f, s => s.kind === 'local' && s.label.startsWith('compare'))
      expect(dataAt(f, cmp).coord.items).toContain('D2 vs D3: concurrent')
      const out = f.steps[idxOf(f, s => s.kind === 'res' && s.to === 'client', readAt)]
      expect(field(out, 'siblings')).toBe('2')
      expect(parseClock(field(out, 'context'))).toEqual(merge(c2, c3))
    })

    it('the reconciling write carries the merged context and its clock dominates both siblings, as the paper\'s D5 does', () => {
      const last = f.steps.length - 1
      const w = f.steps[last]
      const ctx = parseClock(field(w, 'context'))
      const d4 = parseVers(dataAt(f, last).coord)[0]
      expect(d4.id).toBe('D4')
      const [d2] = copy(readAt - 1, 'r1'), [d3] = copy(readAt - 1, 'r3')
      expect(ctx).toEqual(merge(d2.clock, d3.clock))
      expect(d4.clock).toEqual({ ...ctx, R1: get(ctx, 'R1') + 1 })
      expect(dominates(d4.clock, d2.clock)).toBe(true)
      expect(dominates(d4.clock, d3.clock)).toBe(true)
      // application merge keeps every item of both siblings
      const items = (v: string) => v.split(', ')
      expect(items(d4.value).sort()).toEqual([...new Set([...items(d2.value), ...items(d3.value)])].sort())
    })

    it('the comparison functions follow the paper: ancestors are dropped, sibling clocks stay', () => {
      // paper section 4.4 (Figure 3): D1 [Sx,1]; D2 [Sx,2]; D3 [Sx,2 Sy,1]; D4 [Sx,2 Sz,1]; D5 [Sx,3 Sy,1 Sz,1]
      const D1 = { Sx: 1 }, D2 = { Sx: 2 }, D3 = { Sx: 2, Sy: 1 }, D4 = { Sx: 2, Sz: 1 }, D5 = { Sx: 3, Sy: 1, Sz: 1 }
      expect(dominates(D2, D1)).toBe(true)
      expect(dominates(D3, D2)).toBe(true)
      expect(dominates(D4, D2)).toBe(true)
      expect(concurrent(D3, D4)).toBe(true)
      expect(merge(D3, D4)).toEqual({ Sx: 2, Sy: 1, Sz: 1 })
      expect(dominates(D5, D3) && dominates(D5, D4)).toBe(true)
      expect(dominates(D1, D1)).toBe(false)
      expect(leq(D1, D1)).toBe(true)
    })
  })
})
