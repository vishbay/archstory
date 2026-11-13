// Two-phase commit module: message order, state transitions, the commit point and the round-trip arithmetic are checked
// from the steps, states and log cards the timeline shows.
import { describe, expect, it } from 'vitest'
import { PROTOCOLS } from '.'
import { dataAt, phaseBudget, rttTimes, stateAt, stateChanges } from '../model/protocol'
import type { Flow, Step } from '../model/schema'

const tpc = PROTOCOLS.find(p => p.id === 'twopc')!
const flowOf = (id: string): Flow => tpc.flows.find(f => f.id === id)!
const PARTS = ['pa', 'pb']
const base = (s: string) => s.replace(/ \(in doubt\)$/, '')
const idxOf = (f: Flow, p: (s: Step) => boolean, from = 0) => f.steps.findIndex((s, i) => i >= from && p(s))
const fromCoord = (s: Step, to: string, word: string) => s.kind === 'req' && s.from === 'coordinator' && s.to === to && s.label.startsWith(word)
const forcedCommit = (f: Flow) => idxOf(f, s => !!s.data?.coordinator?.items.some(i => /^COMMIT tx\d+ \[forced\]$/.test(i)))

describe('two-phase commit module', () => {
  it('is the twelfth module, in Distributed systems, hard, with Gray and the textbook as its sources', () => {
    expect(tpc.meta.order).toBe(12)
    expect(tpc.meta.section).toBe('Distributed systems')
    expect(tpc.meta.difficulty).toBe('hard')
    expect(tpc.meta.layout).toBeUndefined()
    expect(tpc.meta.source).toMatch(/Gray/)
    expect(tpc.flows.map(f => f.id)).toEqual(['commit', 'abort', 'blocking'])
    expect(tpc.flows.map(f => f.steps.length)).toEqual([12, 10, 14])
    expect(tpc.nodes.map(n => n.id)).toEqual(['client', 'coordinator', 'pa', 'pb'])
    expect(tpc.questions).toHaveLength(6)
    for (const q of tpc.questions) expect(q.a.split(/(?<=[.!?])\s+(?=[A-Z])/).length, q.id).toBeLessThanOrEqual(4)
    expect(tpc.meta.summary).toMatch(/illustrative/)
    expect(JSON.stringify(flowOf('commit').steps[0])).toMatch(/illustrative/)
  })

  it('keeps every data line within a timeline card (21 characters, 6 lines)', () => {
    for (const f of tpc.flows) for (const [i, s] of f.steps.entries()) for (const [id, v] of Object.entries(s.data ?? {})) {
      expect(v.items.length, `${f.id} step ${i + 1} ${id}`).toBeLessThanOrEqual(6)
      for (const it of [v.title ?? '', ...v.items]) expect(it.length, `${f.id} step ${i + 1} ${id}: ${it}`).toBeLessThanOrEqual(21)
    }
  })

  it('participants move only Init to Prepared or Aborted, and Prepared to Committed or Aborted; names are Init, Prepared, Committed, Aborted', () => {
    const legal = new Set(['Init>Prepared', 'Init>Aborted', 'Prepared>Committed', 'Prepared>Aborted'])
    for (const f of tpc.flows) {
      const now: Record<string, string> = {}
      f.steps.forEach((s, i) => {
        for (const [id, raw] of Object.entries(s.state ?? {}).filter(([k]) => PARTS.includes(k))) {
          const st = base(raw)
          expect(['Init', 'Prepared', 'Committed', 'Aborted'], `${f.id} step ${i + 1}`).toContain(st)
          if (raw.startsWith('Prepared')) expect(raw).toBe('Prepared (in doubt)')
          if (now[id] && now[id] !== st) expect(legal.has(`${now[id]}>${st}`), `${f.id} step ${i + 1} ${id}: ${now[id]} to ${st}`).toBe(true)
          now[id] = st
        }
      })
    }
  })

  it('the coordinator moves Init, Waiting, then Committed or Aborted, and never back', () => {
    const legal = new Set(['Init>Waiting', 'Waiting>Committed', 'Waiting>Aborted'])
    for (const f of tpc.flows) {
      const seq = stateChanges(f).flatMap(c => (c.coordinator ? [c.coordinator] : []))
      seq.slice(1).forEach((st, k) => expect(legal.has(`${seq[k]}>${st}`), `${f.id}: ${seq[k]} to ${st}`).toBe(true))
      expect(['Committed', 'Aborted']).toContain(seq.at(-1))
    }
  })

  it('no participant that is Prepared (voted YES) decides alone: it leaves Prepared only on a COMMIT or ABORT from the coordinator', () => {
    for (const f of tpc.flows) {
      const now: Record<string, string> = {}
      f.steps.forEach((s, i) => {
        for (const [id, raw] of Object.entries(s.state ?? {}).filter(([k]) => PARTS.includes(k))) {
          if (now[id] === 'Prepared' && base(raw) !== 'Prepared') {
            expect(s, `${f.id} step ${i + 1}`).toMatchObject({ kind: 'req', from: 'coordinator', to: id })
            expect(s.label).toMatch(/^(COMMIT|ABORT)/)
          }
          now[id] = base(raw)
        }
      })
    }
  })

  describe('commit', () => {
    const f = flowOf('commit')

    it('runs in message order: request, PREPARE x2, votes x2, forced decision, COMMIT x2, ACK x2, END, answer', () => {
      expect(f.steps.map(s => (s.kind === 'local' ? 'local' : `${s.from}>${s.to}`))).toEqual([
        'client>coordinator', 'coordinator>pa', 'coordinator>pb', 'pa>coordinator', 'pb>coordinator', 'local',
        'coordinator>pa', 'coordinator>pb', 'pa>coordinator', 'pb>coordinator', 'local', 'coordinator>client'])
      expect(f.steps.map(s => s.label.split(' ')[0])).toEqual(['commit', 'PREPARE', 'PREPARE', 'vote', 'vote', 'force', 'COMMIT', 'COMMIT', 'ACK', 'ACK', 'write', 'committed'])
    })

    it('forces the COMMIT record to the coordinator log (the commit point) before any COMMIT message, and after every vote is YES', () => {
      const point = forcedCommit(f)
      expect(point).toBeGreaterThan(0)
      expect(f.steps[point].state?.coordinator).toBe('Committed')
      expect(point).toBeLessThan(idxOf(f, s => s.label.startsWith('COMMIT') && s.kind === 'req'))
      const yes = f.steps.slice(0, point).filter(s => s.kind === 'res' && s.fields?.some(x => x.name === 'vote' && x.value === 'YES')).length
      expect(yes).toBe(PARTS.length)
      expect(f.steps.slice(0, point).some(s => s.fields?.some(x => x.value === 'NO'))).toBe(false)
      expect(f.steps[point].data!.coordinator.items).toContain('= the commit point')
    })

    it('each participant forces a prepare record before voting YES, and a commit record before it acknowledges', () => {
      for (const id of PARTS) {
        const prep = idxOf(f, s => s.kind === 'req' && s.to === id && s.label.startsWith('PREPARE'))
        const vote = idxOf(f, s => s.kind === 'res' && s.from === id && s.label.startsWith('vote'))
        const commit = idxOf(f, s => s.kind === 'req' && s.to === id && s.label.startsWith('COMMIT'))
        const ack = idxOf(f, s => s.kind === 'res' && s.from === id && s.label === 'ACK')
        expect(dataAt(f, prep)[id].items.some(i => /^PREPARE tx\d+ \[forced\]$/.test(i))).toBe(true)
        expect(base(stateAt(f, prep)[id])).toBe('Prepared')
        expect(prep).toBeLessThan(vote)
        expect(dataAt(f, commit)[id].items.some(i => /^COMMIT tx\d+ \[forced\]$/.test(i))).toBe(true)
        expect(commit).toBeLessThan(ack)
        expect(stateAt(f, ack)[id]).toBe('Committed')
      }
    })

    it('locks are held from the update until the decision arrives, and released only then', () => {
      for (const id of PARTS) {
        const commit = idxOf(f, s => s.kind === 'req' && s.to === id && s.label.startsWith('COMMIT'))
        for (let i = 0; i < commit; i++) expect(dataAt(f, i)[id].items.some(l => /^lock .* held$/.test(l)), `${id} step ${i + 1}`).toBe(true)
        expect(dataAt(f, commit)[id].items.some(l => /released$/.test(l))).toBe(true)
      }
    })

    it('costs 2 coordinator-participant round trips plus the clients own: 3 round trips, 8 messages, 5 forced writes', () => {
      const t = rttTimes(f.steps)
      expect(t.at(-1)).toBe(3)
      const b = Object.fromEntries(phaseBudget(f.steps).map(p => [p.name, p.rtt]))
      expect(b['Phase 1: prepare']).toBe(1)
      expect(b['Phase 2: commit']).toBe(1)
      expect(b['Request'] + b['Finish']).toBe(1)
      expect(Object.entries(b).filter(([k]) => k.startsWith('Phase')).reduce((n, [, v]) => n + v, 0)).toBe(2)
      const n = PARTS.length
      expect(f.steps.filter(s => s.kind !== 'local' && PARTS.includes(s.from === 'coordinator' ? s.to : s.from)).length).toBe(4 * n)
      const end = dataAt(f, f.steps.length - 1)
      const forced = [end.coordinator, end.pa, end.pb].flatMap(v => v.items).filter(i => i.endsWith('[forced]')).length
      expect(forced).toBe(1 + 2 * n)
    })

    it('writes the END record only after both ACKs, then answers the client', () => {
      const acks = f.steps.map((s, i) => (s.label === 'ACK' ? i : -1)).filter(i => i >= 0)
      const end = idxOf(f, s => s.label.startsWith('write END'))
      expect(acks).toHaveLength(2)
      expect(end).toBeGreaterThan(Math.max(...acks))
      expect(f.steps.at(-1)).toMatchObject({ from: 'coordinator', to: 'client', kind: 'res' })
    })
  })

  describe('a participant votes NO', () => {
    const f = flowOf('abort')

    it('decides ABORT after a NO, never sends COMMIT and tells only the participant that voted YES', () => {
      expect(f.steps.some(s => s.label.startsWith('COMMIT'))).toBe(false)
      expect(f.steps.some(s => s.fields?.some(x => x.name === 'vote' && x.value === 'NO'))).toBe(true)
      const decide = idxOf(f, s => s.state?.coordinator === 'Aborted')
      const no = idxOf(f, s => s.fields?.some(x => x.value === 'NO') ?? false)
      expect(decide).toBeGreaterThan(no)
      const aborts = f.steps.filter(s => s.kind === 'req' && s.label.startsWith('ABORT'))
      expect(aborts.map(s => s.to)).toEqual(['pb'])
      expect(f.steps.at(-1)!.fields![0].value).toBe('aborted')
    })

    it('the NO voter aborts and releases on its own (it never voted YES), and the YES voter rolls back on ABORT and releases its lock', () => {
      const prepA = idxOf(f, s => fromCoord(s, 'pa', 'PREPARE'))
      expect(stateAt(f, prepA).pa).toBe('Aborted')
      expect(dataAt(f, prepA).pa.items).toContain('lock acct 7 released')
      const abortB = idxOf(f, s => fromCoord(s, 'pb', 'ABORT'))
      expect(stateAt(f, abortB - 1).pb).toBe('Prepared (in doubt)')
      expect(stateAt(f, abortB).pb).toBe('Aborted')
      expect(dataAt(f, abortB).pb.items).toContain('lock item 9 released')
    })
  })

  describe('the coordinator crashes after the participants prepared', () => {
    const f = flowOf('blocking')
    const point = forcedCommit(f)
    const crash = idxOf(f, s => s.label === 'coordinator crashes')
    const recover = idxOf(f, s => s.label.startsWith('coordinator restarts'))
    const resend = idxOf(f, s => fromCoord(s, 'pa', 'COMMIT'))

    it('the commit point is logged, then the coordinator crashes before any COMMIT is sent', () => {
      expect(point).toBeGreaterThan(0)
      expect(crash).toBeGreaterThan(point)
      expect(f.steps.slice(0, crash).some(s => s.label.startsWith('COMMIT') && s.kind === 'req')).toBe(false)
      expect(dataAt(f, crash).coordinator.title).toBe('log (down)')
    })

    it('both participants are Prepared (in doubt) and hold their locks from the votes until the decision is resent', () => {
      for (let i = idxOf(f, s => s.kind === 'res' && s.label.startsWith('vote')); i < resend; i++) {
        for (const id of PARTS) expect(stateAt(f, i)[id], `step ${i + 1} ${id}`).toBe('Prepared (in doubt)')
      }
      for (const id of PARTS) {
        const blocked = dataAt(f, idxOf(f, s => s.label.startsWith('Prepared, no decision')))[id]
        expect(blocked.items.some(l => /BLOCKED$/.test(l))).toBe(true)
      }
    })

    it('no participant changes state between the crash and the coordinator resending the decision, even after asking each other', () => {
      for (let i = crash; i < resend; i++) expect(Object.keys(stateChanges(f)[i]).filter(k => PARTS.includes(k)), `step ${i + 1}`).toEqual([])
      const ask = idxOf(f, s => s.kind === 'req' && s.from === 'pa' && s.to === 'pb')
      const answer = idxOf(f, s => s.kind === 'res' && s.from === 'pb' && s.to === 'pa')
      expect(ask).toBeGreaterThan(crash)
      expect(answer).toBeGreaterThan(ask)
      expect(base(stateAt(f, answer).pb)).toBe('Prepared')
      expect(base(stateAt(f, answer).pa)).toBe('Prepared')
    })

    it('waits are in milliseconds: A gives up waiting after 5000 ms, the coordinator restarts after 20000 ms', () => {
      expect(f.steps.filter(s => s.wait !== undefined).map(s => [s.from, s.wait])).toEqual([['pa', 5000], ['coordinator', 20000]])
      expect(recover).toBeGreaterThan(crash)
      expect(recover).toBeLessThan(resend)
    })

    it('the recovered coordinator finds COMMIT without END in its log, resends COMMIT to both, and finishes with END after both ACKs', () => {
      const log = dataAt(f, recover).coordinator.items
      expect(log.some(l => /^COMMIT tx\d+ \[forced\]$/.test(l))).toBe(true)
      expect(log.some(l => l.startsWith('END'))).toBe(false)
      expect(f.steps.filter((s, i) => i > recover && s.kind === 'req' && s.label.startsWith('COMMIT')).map(s => s.to)).toEqual(['pa', 'pb'])
      const last = dataAt(f, f.steps.length - 1)
      expect(last.coordinator.items.at(-1)).toMatch(/^END tx\d+$/)
      expect(stateAt(f, f.steps.length - 1)).toMatchObject({ pa: 'Committed', pb: 'Committed' })
    })
  })
})
