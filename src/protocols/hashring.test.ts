// Consistent hashing module: the ring arithmetic is recomputed here from the tokens and key positions the cards show,
// so which node owns which key, and how many keys move on a join, cannot drift from the text.
import { describe, expect, it } from 'vitest'
import { PROTOCOLS } from '.'
import { dataAt, rttTimes, rttToMs, stepDelay } from '../model/protocol'
import type { Flow } from '../model/schema'

const ring = PROTOCOLS.find(p => p.id === 'hashring')!
const flowOf = (id: string): Flow => ring.flows.find(f => f.id === id)!
const nodes = ['a', 'b', 'c', 'd', 'e']

// The independent model: a ring of tokens, and a key belongs to the first token at or after its position going clockwise.
type Tokens = Record<string, number[]>
function owner(tokens: Tokens, pos: number, dead: string[] = []): string {
  const all = Object.entries(tokens).flatMap(([n, ts]) => (dead.includes(n) ? [] : ts.map(t => [t, n] as const))).sort((x, y) => x[0] - y[0])
  return (all.find(([t]) => t >= pos) ?? all[0])[1]
}
const owners = (tokens: Tokens, keys: Record<string, number>, dead: string[] = []) => Object.fromEntries(Object.entries(keys).map(([k, p]) => [k, owner(tokens, p, dead)]))
const keysOf = (own: Record<string, string>, n: string) => Object.entries(own).filter(([, o]) => o === n).map(([k]) => k)

/** What the cards say: key positions from the client's card, tokens and keys from each node's card. */
const keyPositions = (f: Flow): Record<string, number> =>
  Object.fromEntries(f.steps[0].data!.client.items.map(it => { const [k, p] = it.split(' '); return [k, Number(p)] }))
const tokensShown = (d: NonNullable<Flow['steps'][number]['data']>): Tokens =>
  Object.fromEntries(Object.entries(d).filter(([id]) => nodes.includes(id)).map(([id, v]) => {
    const line = v.items.find(i => /^tokens? /.test(i))!
    return [id, line.replace(/^tokens? /, '').split(',').map(x => Number(x.trim()))]
  }))
const keysShown = (v: { items: string[] }) => { const l = v.items.find(i => i.startsWith('keys: '))!.slice(6); return /^(none|none yet)$/.test(l) ? [] : l.split(' ') }
const ownsShown = (v: { items: string[] }) => { const m = v.items.find(i => i.startsWith('owns '))!.match(/\((\d+),(\d+)\]/)!; return [Number(m[1]), Number(m[2])] }

describe('hash ring module', () => {
  it('is the tenth module, in Distributed systems, with a free layout and the papers as its sources', () => {
    expect(ring.meta.order).toBe(10)
    expect(ring.meta.section).toBe('Distributed systems')
    expect(ring.meta.difficulty).toBe('medium')
    expect(ring.meta.layout).toBe('free')
    expect(ring.meta.source).toMatch(/Karger/)
    expect(ring.meta.source).toMatch(/Dynamo/)
    expect(ring.meta.source).toMatch(/1997/)
    expect(ring.flows.map(f => f.id)).toEqual(['lookup', 'join', 'vnodes'])
    expect(ring.flows.map(f => f.steps.length)).toEqual([9, 8, 10])
    expect(ring.notes).toHaveLength(5)
    expect(ring.questions).toHaveLength(6)
    for (const q of ring.questions) expect(q.a.split(/(?<=[.!?])\s+(?=[A-Z])/).length, q.id).toBeLessThanOrEqual(4)
  })

  it('keeps every data line short enough for a timeline card (21 characters) and every view within the lines a card can show', () => {
    for (const f of ring.flows) for (const [i, step] of f.steps.entries()) for (const [id, v] of Object.entries(step.data ?? {})) {
      for (const it of v.items) expect(it.length, `${f.id} step ${i + 1} ${id}: ${it}`).toBeLessThanOrEqual(21)
      if (id !== 'client') expect(v.items.length, `${f.id} step ${i + 1} ${id}`).toBeLessThanOrEqual(6)
    }
  })

  it('says its numbers are made up', () => {
    expect(ring.meta.summary).toMatch(/made-up/)
    expect(JSON.stringify(ring.flows[0].steps[0])).toMatch(/illustrative/)
  })

  it('has the eight keys, shown by the client card, at the same positions in every scenario', () => {
    const first = keyPositions(flowOf('lookup'))
    expect(first).toEqual({ k1: 5, k2: 18, k3: 29, k4: 41, k5: 53, k6: 66, k7: 78, k8: 92 })
    expect(keyPositions(flowOf('join'))).toEqual(first)
  })

  describe('look up a key', () => {
    const f = flowOf('lookup')
    const keys = keyPositions(f)
    const t1 = tokensShown(f.steps[0].data!)

    it('puts one token per machine on the ring: A 8, B 33, C 60, D 85', () => {
      expect(t1).toEqual({ a: [8], b: [33], c: [60], d: [85] })
    })

    it('what each card says it owns is what the ring rule gives, and every key has exactly one owner', () => {
      const own = owners(t1, keys)
      for (const n of ['a', 'b', 'c', 'd']) {
        const v = f.steps[0].data![n]
        expect(keysShown(v), n).toEqual(keysOf(own, n))
        const [lo, hi] = ownsShown(v)
        expect(hi).toBe(t1[n][0])
        // The arc (lo, hi] holds exactly this node's keys, wrapping past 99 for the first token.
        const inArc = (p: number) => (lo < hi ? p > lo && p <= hi : p > lo || p <= hi)
        expect(Object.entries(keys).filter(([, p]) => inArc(p)).map(([k]) => k), n).toEqual(keysOf(own, n))
      }
      expect(Object.keys(own)).toHaveLength(8)
      expect(['a', 'b', 'c', 'd'].map(n => keysOf(own, n).length)).toEqual([2, 2, 2, 2])
    })

    it('hashes k5 to 53 and walks clockwise a, b, c: the first token at or after 53 is C at 60', () => {
      expect(f.steps[1].label).toBe('hash(k5) = 53')
      expect(keys.k5).toBe(53)
      expect(owner(t1, 53)).toBe('c')
      const visited = f.steps.filter(s => s.kind === 'local' && s.from !== 'client').map(s => s.from)
      expect(visited).toEqual(['a', 'b', 'c'])
      // Each earlier token is before 53, and the last is the first at or after it.
      expect(t1.a[0]).toBeLessThan(53)
      expect(t1.b[0]).toBeLessThan(53)
      expect(t1.c[0]).toBeGreaterThanOrEqual(53)
      expect(f.steps.at(-1)).toMatchObject({ from: 'c', to: 'client', kind: 'res' })
    })

    it('forwards only along successor edges and the answer comes straight from the owner', () => {
      const hops = f.steps.filter(s => s.kind === 'req').map(s => `${s.from}>${s.to}`)
      expect(hops).toEqual(['client>a', 'a>b', 'b>c'])
    })

    it('a position past the last token wraps to the first: 92 belongs to A', () => {
      expect(owner(t1, 92)).toBe('a')
      expect(owner(t1, 85)).toBe('d')        // a key exactly on a token belongs to it
      expect(owner(t1, 86)).toBe('a')
    })

    it('marks the node being checked on its card', () => {
      for (const [i, id] of [[3, 'a'], [5, 'b'], [7, 'c']] as const) expect(f.steps[i].data![id].mark, `${id}`).toBeDefined()
    })
  })

  describe('a node joins', () => {
    const f = flowOf('join')
    const keys = keyPositions(f)
    const before = tokensShown(f.steps[0].data!)
    const joined = { ...before, e: [45] }
    const ownBefore = owners(before, keys), ownAfter = owners(joined, keys)

    it('E takes token 45, between B at 33 and C at 60, and its arc is (33, 45]', () => {
      expect(before).toEqual({ a: [8], b: [33], c: [60], d: [85] })
      expect(tokensShown(f.steps[1].data!)).toEqual({ e: [45] })
      expect(f.steps[1].data!.e.items).toContain('owns (33,45]')
      expect(33).toBeLessThan(45)
      expect(45).toBeLessThan(60)
    })

    it('moves only the keys in (33, 45], and only from C: that is k4 at 41', () => {
      const moved = Object.keys(keys).filter(k => ownBefore[k] !== ownAfter[k])
      expect(moved).toEqual(['k4'])
      expect(ownBefore.k4).toBe('c')
      expect(ownAfter.k4).toBe('e')
      // every moved key lay in the arc, every key in the arc moved
      expect(Object.entries(keys).filter(([, p]) => p > 33 && p <= 45).map(([k]) => k)).toEqual(moved)
      expect(keys.k5).toBe(53)
      expect(ownAfter.k5).toBe('c')       // 53 is above 45, so it stays
    })

    it('shows the cards after the transfer exactly as the ring rule gives them', () => {
      const after = dataAt(f, f.steps.length - 1)
      for (const n of nodes) expect(keysShown(after[n]), n).toEqual(keysOf(ownAfter, n))
      expect(keysShown(after.e)).toEqual(['k4'])
      expect(keysShown(after.c)).toEqual(['k5'])
      expect(ownsShown(after.c)).toEqual([45, 60])
      expect(ownsShown(after.e)).toEqual([33, 45])
      expect(nodes.map(n => keysOf(ownAfter, n).length)).toEqual([2, 2, 1, 2, 1])
    })

    it('K/N: 8 keys over 5 machines is 1.6 expected, 1 moved; hash mod N would have moved 7 of 8', () => {
      const K = Object.keys(keys).length
      expect(K / 5).toBe(1.6)
      const modMoved = Object.values(keys).filter(p => p % 4 !== p % 5).length
      expect(modMoved).toBe(7)
      const last = f.steps.at(-1)!
      expect(last.fields!.find(x => x.name === 'keys moved')!.value).toBe('1 of 8 (k4)')
      expect(last.fields!.find(x => x.name === 'expected')!.value).toBe('K / N = 8 / 5 = 1.6')
      expect(last.fields!.find(x => x.name === 'hash mod N instead')!.value).toBe(`${modMoved} of ${K} move`)
      expect(last.label).toBe('1 of 8 keys moved')
    })

    it('the machines that do not give up an arc keep every key (A, B and D)', () => {
      for (const n of ['a', 'b', 'd']) expect(keysOf(ownAfter, n)).toEqual(keysOf(ownBefore, n))
    })

    it('one transfer between neighbours: E asks C, C answers E', () => {
      const wire = f.steps.filter(s => s.kind === 'req' || s.kind === 'res').map(s => `${s.from}>${s.to}`)
      expect(wire).toEqual(['e>c', 'c>e'])
    })
  })

  describe('virtual nodes', () => {
    const f = flowOf('vnodes')
    const keys = keyPositions(flowOf('lookup'))
    const v = tokensShown(f.steps[0].data!)

    it('gives every machine 3 distinct tokens, 12 in all', () => {
      expect(v).toEqual({ a: [4, 47, 68], b: [41, 62, 83], c: [10, 35, 72], d: [22, 58, 90] })
      const all = Object.values(v).flat()
      expect(all).toHaveLength(12)
      expect(new Set(all).size).toBe(12)
      for (const t of all) { expect(t).toBeGreaterThanOrEqual(0); expect(t).toBeLessThanOrEqual(99) }
    })

    it('the cards list the keys the rule gives: two each, so the load is even', () => {
      const own = owners(v, keys)
      for (const n of ['a', 'b', 'c', 'd']) expect(keysShown(f.steps[0].data![n]), n).toEqual(keysOf(own, n))
      expect(['a', 'b', 'c', 'd'].map(n => keysOf(own, n).length)).toEqual([2, 2, 2, 2])
    })

    it('k2 at 18 goes to the token at 22, which is D', () => {
      expect(keys.k2).toBe(18)
      expect(owner(v, 18)).toBe('d')
      expect(f.steps[1].label).toMatch(/hash\(k2\) = 18/)
    })

    it('when D fails its two keys go to two different machines, C and B, so nobody takes more than one extra', () => {
      const own = owners(v, keys), after = owners(v, keys, ['d'])
      const dKeys = keysOf(own, 'd')
      expect(dKeys).toEqual(['k2', 'k5'])
      expect(dKeys.map(k => after[k])).toEqual(['c', 'b'])
      expect(new Set(dKeys.map(k => after[k])).size).toBe(2)
      const loads = ['a', 'b', 'c'].map(n => keysOf(after, n).length)
      expect(loads).toEqual([2, 3, 3])
      expect(Math.max(...loads)).toBe(3)
      // the final card values agree
      const last = dataAt(f, f.steps.length - 1)
      for (const n of ['a', 'b', 'c']) expect(keysShown(last[n]), n).toEqual(keysOf(after, n))
      expect(last.d.items).toContain('down')
    })

    it('with one token each, the same failure sends both of D\'s keys to A and doubles its load (2 to 4)', () => {
      const one = { a: [8], b: [33], c: [60], d: [85] }
      const own = owners(one, keys), after = owners(one, keys, ['d'])
      const dKeys = keysOf(own, 'd')
      expect(dKeys).toEqual(['k6', 'k7'])
      expect(dKeys.map(k => after[k])).toEqual(['a', 'a'])
      expect(keysOf(own, 'a')).toHaveLength(2)
      expect(keysOf(after, 'a')).toHaveLength(4)
      const note = f.steps.at(-1)!.fields!.map(x => `${x.name} ${x.value} ${x.note ?? ''}`).join(' | ')
      expect(note).toContain('k6 and k7 both to A')
      expect(note).toContain('A goes from 2 keys to 4')
    })

    it('uses the loss feature: the lookup to the dead machine is lost, then the client waits its 100 ms timeout (2 RTT at 50 ms)', () => {
      const lostAt = f.steps.findIndex(s => s.lost)
      expect(lostAt).toBeGreaterThan(0)
      expect(f.steps[lostAt]).toMatchObject({ from: 'client', to: 'd', kind: 'req' })
      const wait = f.steps[lostAt + 1]
      expect(wait.kind).toBe('local')
      expect(stepDelay(wait)).toBe(4)
      expect(rttToMs(stepDelay(wait) / 2, 50)).toBe(100)
      const t = rttTimes(f.steps)
      expect(t[lostAt]).toBe(t[lostAt - 1])           // the lost message takes no time
      expect(t[lostAt + 1] - t[lostAt]).toBe(2)       // the wait is 2 RTT
      expect(f.steps.filter(s => s.lost)).toHaveLength(1)
    })

    it('marks D down in its state pill only after it crashes', () => {
      const i = f.steps.findIndex(s => s.state?.d === 'DOWN')
      expect(i).toBe(4)
      for (const s of f.steps.slice(0, i)) expect(s.state?.d).not.toBe('DOWN')
    })

    it('the failover works because the next distinct machines hold replicas: after D come C and B', () => {
      const ordered = Object.entries(v).flatMap(([n, ts]) => ts.map(t => [t, n] as const)).sort((x, y) => x[0] - y[0])
      const i = ordered.findIndex(([t]) => t === 22)
      const next: string[] = []
      for (let k = 1; next.length < 2 && k < 12; k++) { const n = ordered[(i + k) % 12][1]; if (n !== 'd' && !next.includes(n)) next.push(n) }
      expect(next).toEqual(['c', 'b'])
      expect(f.steps.find(s => s.label === 'get k2 from C')!.fields!.find(x => x.name === 'replica on')!.value).toBe('C and B')
    })
  })
})
