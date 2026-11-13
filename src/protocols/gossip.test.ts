// Gossip module: the per-round key-version maps, the convergence round count, the SWIM indirect ping count and the
// incarnation override rules are recomputed here from the data cards and message fields the timeline shows.
import { describe, expect, it } from 'vitest'
import { PROTOCOLS } from '.'
import { dataAt, stateChanges, type DataView } from '../model/protocol'
import { findEdge, type Flow, type Step } from '../model/schema'

const gossip = PROTOCOLS.find(p => p.id === 'gossip')!
const flowOf = (id: string): Flow => gossip.flows.find(f => f.id === id)!
const NODES = ['a', 'b', 'c', 'd', 'e']
const KEYS = ['x', 'y', 'z']
const field = (s: Step, name: string) => s.fields!.find(x => x.name === name)!.value
const idxOf = (f: Flow, p: (s: Step) => boolean, from = 0) => f.steps.findIndex((s, i) => i >= from && p(s))
const sentences = (a: string) => a.split(/(?<=[.!?])\s+(?=[A-Z])/).length

// ---- key version maps
const parseMap = (v: DataView): { vers: number[]; round: number } => ({
  vers: KEYS.map(k => Number(v.items.find(i => i.startsWith(`${k}: `))!.split(': ')[1])),
  round: Number(v.items.find(i => i.startsWith('round '))!.split(' ')[1]),
})
const mapText = (v: number[]) => KEYS.map((k, i) => `${k}${v[i]}`).join(' ')
const maxMap = (a: number[], b: number[]) => a.map((n, i) => Math.max(n, b[i]))

// ---- SWIM membership views and the preference rules of section 4.2 of the paper
type Status = 'alive' | 'suspect' | 'dead'
interface View { status: Status; inc: number }
type Msg = { type: 'Alive' | 'Suspect'; inc: number } | { type: 'Confirm' }
const parseView = (v: DataView): View => {
  const m = v.items[0].match(/^E: (alive|suspect|dead)(?:, inc (\d+))?$/)!
  return { status: m[1] as Status, inc: Number(m[2] ?? 0) }
}
const parseMsg = (t: string): Msg => {
  if (t === 'Confirm E') return { type: 'Confirm' }
  const m = t.match(/^(Alive|Suspect) E inc (\d+)$/)!
  return { type: m[1] as 'Alive' | 'Suspect', inc: Number(m[2]) }
}
/** The view after a message reaches a member: Confirm beats everything; Alive l beats Suspect or Alive with a lower inc;
 *  Suspect l beats Suspect with a lower inc and Alive with an inc up to and including l. A dead entry stays dead. */
const apply = (v: View, m: Msg): View => {
  if (v.status === 'dead') return v
  if (m.type === 'Confirm') return { status: 'dead', inc: v.inc }
  if (m.type === 'Alive') return m.inc > v.inc ? { status: 'alive', inc: m.inc } : v
  if (v.status === 'alive') return m.inc >= v.inc ? { status: 'suspect', inc: m.inc } : v
  return m.inc > v.inc ? { status: 'suspect', inc: m.inc } : v
}
const viewAt = (f: Flow, i: number, id: string): View => parseView(dataAt(f, i)[id])

describe('gossip module', () => {
  it('is the fifteenth module, in Distributed systems, medium, citing Demers and SWIM', () => {
    expect(gossip.meta.order).toBe(15)
    expect(gossip.meta.section).toBe('Distributed systems')
    expect(gossip.meta.difficulty).toBe('medium')
    expect(gossip.meta.layout).toBeUndefined()
    expect(gossip.meta.source).toMatch(/Demers/)
    expect(gossip.meta.source).toMatch(/SWIM/)
    expect(gossip.flows.map(f => f.id)).toEqual(['anti-entropy', 'swim-detection', 'swim-refute'])
    expect(gossip.flows.map(f => f.steps.length)).toEqual([12, 13, 10])
    for (const f of gossip.flows) { expect(f.steps.length).toBeGreaterThanOrEqual(8); expect(f.steps.length).toBeLessThanOrEqual(14) }
    expect(gossip.nodes.map(n => n.id)).toEqual(NODES)
    expect(gossip.questions).toHaveLength(6)
    for (const q of gossip.questions) expect(sentences(q.a), q.id).toBeLessThanOrEqual(4)
    expect(gossip.notes.length).toBeGreaterThanOrEqual(5)
    for (const f of gossip.flows) for (const s of f.steps) { expect(s.label.length).toBeLessThanOrEqual(30); if (s.kind !== 'res') expect(s.detail).toBeTruthy() }
  })

  it('every pair of the five nodes can talk (a ping can go to any member)', () => {
    for (let i = 0; i < 5; i++) for (let j = i + 1; j < 5; j++) expect(findEdge(gossip, NODES[i], NODES[j]), `${NODES[i]}-${NODES[j]}`).not.toBeNull()
  })

  it('says its cluster and choices are illustrative and keeps every data card within a timeline card (21 characters, 6 lines)', () => {
    expect(gossip.meta.summary).toMatch(/illustrative/)
    for (const f of gossip.flows) expect(f.summary, f.id).toMatch(/illustrative/)
    expect(JSON.stringify(flowOf('anti-entropy').steps[0])).toMatch(/illustrative/)
    expect(JSON.stringify(flowOf('anti-entropy').steps[1])).toMatch(/illustrative/)
    for (const f of gossip.flows) for (const [i, s] of f.steps.entries()) for (const [id, v] of Object.entries(s.data ?? {})) {
      expect(v.items.length, `${f.id} step ${i + 1} ${id}`).toBeLessThanOrEqual(6)
      for (const it of [v.title ?? '', ...v.items]) expect(it.length, `${f.id} step ${i + 1} ${id}: ${it}`).toBeLessThanOrEqual(21)
    }
  })

  describe('anti-entropy rounds', () => {
    const f = flowOf('anti-entropy')
    const start = Object.fromEntries(NODES.map(n => [n, parseMap(dataAt(f, 0)[n]).vers]))
    const full = NODES.reduce((m, n) => maxMap(m, start[n]), [0, 0, 0])
    const exchanges = f.steps.filter(s => s.kind === 'req')

    it('starts from different maps and the newest version of every key is the maximum over the nodes', () => {
      expect(start).toEqual({ a: [2, 0, 0], b: [1, 0, 0], c: [0, 1, 0], d: [0, 0, 0], e: [0, 0, 1] })
      expect(full).toEqual([2, 1, 1])
      for (const n of NODES) expect(parseMap(dataAt(f, 0)[n]).round).toBe(0)
    })

    it('every exchange leaves both nodes with the higher version of each key, as the message fields say, and nothing else changes', () => {
      const now = structuredClone(start)
      f.steps.forEach((s, i) => {
        if (s.kind !== 'req') return
        const a = s.from, b = s.to
        expect(field(s, `${a.toUpperCase()} sends`), `step ${i + 1}`).toBe(mapText(now[a]))
        expect(field(s, `${b.toUpperCase()} replies`), `step ${i + 1}`).toBe(mapText(now[b]))
        const m = maxMap(now[a], now[b])
        expect(field(s, 'both keep'), `step ${i + 1}`).toBe(mapText(m))
        now[a] = m; now[b] = [...m]
        for (const n of NODES) expect(parseMap(dataAt(f, i)[n]).vers, `step ${i + 1} ${n}`).toEqual(now[n])
        // versions never go down
        for (const n of [a, b]) m.forEach((v, k) => expect(v).toBeGreaterThanOrEqual(start[n][k]))
      })
    })

    it('each round has every node start exactly one exchange, 5 per round, 2 rounds', () => {
      expect(exchanges).toHaveLength(10)
      for (let r = 0; r < 2; r++) expect(exchanges.slice(r * 5, r * 5 + 5).map(s => s.from).sort()).toEqual(NODES)
      for (const s of exchanges) expect(s.from).not.toBe(s.to)
      // the round shown on the cards matches the round the exchange belongs to
      f.steps.forEach((s, i) => {
        if (s.kind !== 'req') return
        const round = Math.floor(exchanges.indexOf(s) / 5) + 1
        expect(parseMap(dataAt(f, i)[s.from]).round).toBe(round)
        expect(parseMap(dataAt(f, i)[s.to]).round).toBe(round)
      })
    })

    it('converges after exactly 2 rounds for the illustrative choices: not after round 1, all five maps equal after round 2', () => {
      const state = structuredClone(start)
      const afterRound: Record<string, number[]>[] = []
      exchanges.forEach((s, k) => {
        const m = maxMap(state[s.from], state[s.to])
        state[s.from] = m; state[s.to] = [...m]
        if (k % 5 === 4) afterRound.push(structuredClone(state))
      })
      const converged = afterRound.map(st => NODES.every(n => st[n].join() === full.join()))
      expect(converged).toEqual([false, true])
      expect(converged.indexOf(true) + 1).toBe(2)
      // after round 1 the only node still behind is A, which lacks y and z
      expect(NODES.filter(n => afterRound[0][n].join() !== full.join())).toEqual(['a'])
      expect(afterRound[0].a).toEqual([2, 0, 0])
      // the summary and the last step say the same count
      expect(f.steps.at(-1)!.label).toMatch(/round 2/)
      expect(f.steps.at(-1)!.detail).toMatch(/2 rounds/)
      // and 2 rounds is in line with a log N epidemic for N = 5
      expect(afterRound.length).toBeLessThanOrEqual(Math.ceil(Math.log2(NODES.length)))
    })

    it('a node is Current exactly when its map equals the newest map', () => {
      const now: Record<string, string> = {}
      f.steps.forEach((s, i) => {
        Object.assign(now, s.state ?? {})
        const cards = dataAt(f, i)
        for (const n of NODES) expect(now[n], `step ${i + 1} ${n}`).toBe(parseMap(cards[n]).vers.join() === full.join() ? 'Current' : 'Stale')
      })
      expect(stateChanges(f).flatMap(c => Object.values(c)).every(v => v === 'Current' || v === 'Stale')).toBe(true)
      expect(Object.values(f.steps.at(-1)!.state!)).toEqual(NODES.map(() => 'Current'))
    })
  })

  describe('SWIM failure detection', () => {
    const f = flowOf('swim-detection')

    it('probes E directly, then asks k = 2 other members to ping it, which is fewer than the 3 candidates and never A or E', () => {
      const pings = f.steps.filter(s => s.kind === 'req' && s.fields?.some(x => x.name === 'type' && x.value === 'ping') && s.to === 'e')
      expect(pings.map(s => s.from)).toEqual(['a', 'b', 'c'])
      expect(pings.every(s => s.lost)).toBe(true)
      const reqs = f.steps.filter(s => s.kind === 'req' && s.fields?.some(x => x.name === 'type' && x.value === 'ping-req'))
      const k = Number(field(reqs[0], 'k'))
      expect(k).toBe(2)
      expect(reqs).toHaveLength(k)
      expect(reqs.every(s => s.from === 'a' && Number(field(s, 'k')) === k && field(s, 'target') === 'E')).toBe(true)
      const via = reqs.map(s => s.to)
      expect(new Set(via).size).toBe(k)
      for (const v of via) expect(['a', 'e']).not.toContain(v)
      const candidates = NODES.filter(n => n !== 'a' && n !== 'e')
      expect(k).toBeLessThanOrEqual(candidates.length)
      // each member asked pings E in turn
      expect(pings.slice(1).map(s => s.from)).toEqual(via)
    })

    it('the first ack timeout (200 ms) is shorter than the protocol period, and the indirect probe comes only after it', () => {
      const timeout = idxOf(f, s => s.kind === 'local' && s.wait === 200)
      const firstReq = idxOf(f, s => s.fields?.some(x => x.value === 'ping-req') ?? false)
      expect(timeout).toBeGreaterThan(idxOf(f, s => s.kind === 'req' && s.to === 'e'))
      expect(firstReq).toBeGreaterThan(timeout)
      const period = f.steps.filter(s => s.from === 'a' && s.kind === 'local' && s.wait !== undefined).slice(0, 2).reduce((t, s) => t + s.wait!, 0)
      expect(f.steps[timeout].wait!).toBeLessThan(period)
      expect(period).toBe(1000)
    })

    it('A suspects after the period without any ack, and declares dead only after the suspicion timer', () => {
      const suspect = idxOf(f, s => s.kind === 'local' && s.label.startsWith('period ends'))
      expect(viewAt(f, suspect - 1, 'a')).toEqual({ status: 'alive', inc: 0 })
      expect(viewAt(f, suspect, 'a')).toEqual({ status: 'suspect', inc: 0 })
      // no ack from E or from the relays before then
      expect(f.steps.slice(0, suspect).some(s => s.kind === 'res')).toBe(false)
      const dead = idxOf(f, s => s.kind === 'local' && s.label.startsWith('suspicion timer'))
      expect(dead).toBeGreaterThan(suspect)
      expect(f.steps[dead].wait).toBe(5000)
      expect(viewAt(f, dead, 'a').status).toBe('dead')
      expect(f.steps[0].state!.e).toBe('Crashed')
    })

    it('every piggybacked update changes the receiver exactly as the override rules say', () => {
      f.steps.forEach((s, i) => {
        const g = s.fields?.find(x => x.name === 'gossip')
        if (!g) return
        const before = viewAt(f, i - 1, s.to), after = viewAt(f, i, s.to)
        expect(after, `step ${i + 1}: ${g.value} at ${s.to}`).toEqual(apply(before, parseMsg(g.value)))
        expect(after).not.toEqual(before)
      })
    })

    it('the sender already holds the update it piggybacks, and updates only move along pings', () => {
      f.steps.forEach((s, i) => {
        const g = s.fields?.find(x => x.name === 'gossip')
        if (!g) return
        const sender = viewAt(f, i - 1, s.from)
        const m = parseMsg(g.value)
        expect(sender.status, `step ${i + 1}`).toBe(m.type === 'Confirm' ? 'dead' : m.type.toLowerCase())
        expect(s.kind).toBe('req')
      })
    })
  })

  describe('refuting a suspicion', () => {
    const f = flowOf('swim-refute')

    it('E raises its own incarnation by 1 only after hearing it is suspected in its current incarnation', () => {
      const heard = idxOf(f, s => s.to === 'e' && s.fields?.some(x => x.name === 'gossip') === true)
      const msg = parseMsg(field(f.steps[heard], 'gossip'))
      expect(msg).toEqual({ type: 'Suspect', inc: 0 })
      expect(viewAt(f, heard, 'e').inc).toBe(0)
      const refute = idxOf(f, s => s.kind === 'local' && s.from === 'e')
      expect(refute).toBe(heard + 1)
      expect(viewAt(f, refute, 'e')).toEqual({ status: 'alive', inc: (msg as { inc: number }).inc + 1 })
    })

    it('every update follows the override rules: Alive with a higher incarnation beats Suspect, a stale Suspect does not beat it', () => {
      f.steps.forEach((s, i) => {
        const g = s.fields?.find(x => x.name === 'gossip')
        if (!g) return
        const before = viewAt(f, i - 1, s.to), after = viewAt(f, i, s.to)
        if (s.to === 'e') { expect(after).toEqual(before); return }   // E only hears the accusation here
        expect(after, `step ${i + 1}: ${g.value} at ${s.to}`).toEqual(apply(before, parseMsg(g.value)))
      })
      const stale = idxOf(f, s => s.label.includes('(old)'))
      expect(viewAt(f, stale - 1, 'c')).toEqual({ status: 'alive', inc: 0 })
      // the same old message arriving after the refutation changes nothing
      expect(apply({ status: 'alive', inc: 1 }, { type: 'Suspect', inc: 0 })).toEqual({ status: 'alive', inc: 1 })
    })

    it('ends with every member holding E alive at incarnation 1, with no Confirm sent', () => {
      const end = f.steps.length - 1
      for (const n of NODES) expect(viewAt(f, end, n), n).toEqual({ status: 'alive', inc: 1 })
      expect(JSON.stringify(f.steps.map(s => s.fields ?? []))).not.toMatch(/Confirm/)
      expect(dataAt(f, end).a.items).toContain('timer cancelled')
    })
  })

  describe('override rules (SWIM section 4.2)', () => {
    const al = (inc: number): View => ({ status: 'alive', inc }), su = (inc: number): View => ({ status: 'suspect', inc })
    it('Alive with a higher incarnation overrides Suspect and Alive; with an equal or lower one it does not', () => {
      expect(apply(su(0), { type: 'Alive', inc: 1 })).toEqual(al(1))
      expect(apply(al(0), { type: 'Alive', inc: 1 })).toEqual(al(1))
      expect(apply(su(1), { type: 'Alive', inc: 1 })).toEqual(su(1))
      expect(apply(su(2), { type: 'Alive', inc: 1 })).toEqual(su(2))
    })
    it('Suspect overrides Alive of the same or lower incarnation and Suspect of a lower one', () => {
      expect(apply(al(1), { type: 'Suspect', inc: 1 })).toEqual(su(1))
      expect(apply(al(0), { type: 'Suspect', inc: 1 })).toEqual(su(1))
      expect(apply(su(0), { type: 'Suspect', inc: 1 })).toEqual(su(1))
      expect(apply(al(2), { type: 'Suspect', inc: 1 })).toEqual(al(2))
      expect(apply(su(1), { type: 'Suspect', inc: 1 })).toEqual(su(1))
    })
    it('Confirm overrides everything', () => {
      for (const v of [al(0), al(5), su(0), su(5)]) expect(apply(v, { type: 'Confirm' }).status).toBe('dead')
    })
  })
})
