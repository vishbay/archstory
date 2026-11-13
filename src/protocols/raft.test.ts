// Raft module: the election, commit and repair arithmetic is recomputed here from the data cards and message fields the
// timeline shows, so the text, the cards and the rules of the paper (Figure 2, section 5.4) cannot drift apart.
import { describe, expect, it } from 'vitest'
import { PROTOCOLS } from '.'
import { dataAt, stateChanges, type DataView } from '../model/protocol'
import type { Flow, Step } from '../model/schema'

const raft = PROTOCOLS.find(p => p.id === 'raft')!
const flowOf = (id: string): Flow => raft.flows.find(f => f.id === id)!
const SERVERS = ['s1', 's2', 's3']
const majority = (n: number) => Math.floor(n / 2) + 1

interface Entry { index: number; term: number; cmd: string }
interface Srv { term: number; voted: string; log: Entry[]; commit: number; lines: string[] }
const parse = (v: DataView): Srv => {
  const m = v.items[0].match(/^term (\d+), votedFor (\w+)$/)!
  const log = v.items.flatMap(i => { const e = i.match(/^(\d+): SET (\S+) \(term (\d+)\)$/); return e ? [{ index: Number(e[1]), term: Number(e[3]), cmd: e[2] }] : [] })
  const commit = Number(v.items.find(i => /^commitIndex \d+$/.test(i))!.split(' ')[1])
  return { term: Number(m[1]), voted: m[2], log, commit, lines: v.items }
}
/** What each server's card shows after step `i` (index into steps). */
const cardsAt = (f: Flow, i: number): Record<string, Srv> =>
  Object.fromEntries(Object.entries(dataAt(f, i)).filter(([id]) => SERVERS.includes(id)).map(([id, v]) => [id, parse(v)]))
const field = (s: Step, name: string) => s.fields!.find(x => x.name === name)!.value
const last = (log: Entry[]) => log.at(-1) ?? { index: 0, term: 0, cmd: '' }
/** The candidate's log is at least as up to date as the voter's (Figure 2, RequestVote receiver, and section 5.4.1). */
const upToDate = (cand: { index: number; term: number }, voter: { index: number; term: number }) =>
  cand.term > voter.term || (cand.term === voter.term && cand.index >= voter.index)
const idxOf = (f: Flow, p: (s: Step) => boolean, from = 0) => f.steps.findIndex((s, i) => i >= from && p(s))

describe('raft module', () => {
  it('is the eleventh module, in Distributed systems, hard, with the paper as its source', () => {
    expect(raft.meta.order).toBe(11)
    expect(raft.meta.section).toBe('Distributed systems')
    expect(raft.meta.difficulty).toBe('hard')
    expect(raft.meta.layout).toBeUndefined()
    expect(raft.meta.source).toMatch(/Ongaro and Ousterhout/)
    expect(raft.meta.source).toMatch(/2014/)
    expect(raft.flows.map(f => f.id)).toEqual(['election', 'replication', 'failover'])
    expect(raft.flows.map(f => f.steps.length)).toEqual([11, 13, 13])
    expect(raft.nodes.map(n => n.id)).toEqual(['client', 's1', 's2', 's3'])
    expect(raft.questions).toHaveLength(6)
    for (const q of raft.questions) expect(q.a.split(/(?<=[.!?])\s+(?=[A-Z])/).length, q.id).toBeLessThanOrEqual(4)
    expect(raft.notes.length).toBeGreaterThanOrEqual(5)
  })

  it('says its numbers are illustrative and keeps every data card within a timeline card (21 characters, 6 lines)', () => {
    expect(raft.meta.summary).toMatch(/illustrative/)
    expect(flowOf('election').summary).toMatch(/illustrative/)
    expect(flowOf('failover').summary).toMatch(/illustrative/)
    expect(JSON.stringify(flowOf('election').steps[0])).toMatch(/illustrative/)
    expect(JSON.stringify(flowOf('replication').steps[0])).toMatch(/illustrative/)
    for (const f of raft.flows) for (const [i, s] of f.steps.entries()) for (const [id, v] of Object.entries(s.data ?? {})) {
      expect(v.items.length, `${f.id} step ${i + 1} ${id}`).toBeLessThanOrEqual(6)
      for (const it of [v.title ?? '', ...v.items]) expect(it.length, `${f.id} step ${i + 1} ${id}: ${it}`).toBeLessThanOrEqual(21)
    }
  })

  it('uses only Follower, Candidate and Leader, with legal transitions', () => {
    const legal = new Set(['Follower>Candidate', 'Candidate>Leader', 'Candidate>Follower', 'Leader>Follower'])
    for (const f of raft.flows) {
      const now: Record<string, string> = {}
      f.steps.forEach((s, i) => {
        for (const [id, st] of Object.entries(s.state ?? {})) {
          expect(['Follower', 'Candidate', 'Leader'], `${f.id} step ${i + 1}`).toContain(st)
          if (now[id] && now[id] !== st) expect(legal.has(`${now[id]}>${st}`), `${f.id} step ${i + 1} ${id}: ${now[id]} to ${st}`).toBe(true)
          now[id] = st
        }
      })
    }
  })

  it('a term never goes down, and a server votes for at most one candidate in a term', () => {
    for (const f of raft.flows) {
      const seen: Record<string, Srv> = {}
      f.steps.forEach((s, i) => {
        for (const id of Object.keys(s.data ?? {}).filter(k => SERVERS.includes(k))) {
          const now = cardsAt(f, i)[id], was = seen[id]
          if (was) {
            expect(now.term, `${f.id} step ${i + 1} ${id}`).toBeGreaterThanOrEqual(was.term)
            if (now.term === was.term && was.voted !== 'none') expect(now.voted, `${f.id} step ${i + 1} ${id}: one vote per term`).toBe(was.voted)
          }
          seen[id] = now
        }
      })
    }
  })

  describe('leader election', () => {
    const f = flowOf('election')
    const first = cardsAt(f, 0)

    it('starts with three Followers in term 0 and the shortest timeout (190 ms, S1) fires first, inside 150 to 300 ms', () => {
      expect(Object.values(first).map(c => [c.term, c.voted])).toEqual([[0, 'none'], [0, 'none'], [0, 'none']])
      const timeouts = Object.fromEntries(Object.entries(dataAt(f, 0)).map(([id, v]) => [id, Number(v.items.find(i => i.startsWith('timeout '))!.split(' ')[1])]))
      expect(timeouts).toEqual({ s1: 190, s2: 240, s3: 285 })
      for (const t of Object.values(timeouts)) { expect(t).toBeGreaterThanOrEqual(150); expect(t).toBeLessThanOrEqual(300) }
      expect(f.steps[0].wait).toBe(Math.min(...Object.values(timeouts)))
      expect(Object.entries(timeouts).sort((a, b) => a[1] - b[1])[0][0]).toBe('s1')
      expect(f.steps[0].kind).toBe('local')
    })

    it('the Candidate raises its term by 1 and votes for itself', () => {
      const i = idxOf(f, s => s.state?.s1 === 'Candidate')
      const c = cardsAt(f, i).s1
      expect(c.term).toBe(first.s1.term + 1)
      expect(c.voted).toBe('S1')
    })

    it('RequestVote carries the candidate term and last log position, and the votes follow the rules', () => {
      const cand = cardsAt(f, idxOf(f, s => s.state?.s1 === 'Candidate')).s1
      const reqs = f.steps.map((s, i) => [s, i] as const).filter(([s]) => s.kind === 'req' && s.label.startsWith('RequestVote'))
      expect(reqs).toHaveLength(2)
      for (const [s, i] of reqs) {
        expect(Number(field(s, 'term'))).toBe(cand.term)
        expect(field(s, 'candidateId')).toBe('S1')
        expect(Number(field(s, 'lastLogIndex'))).toBe(last(cand.log).index)
        expect(Number(field(s, 'lastLogTerm'))).toBe(last(cand.log).term)
        const voter = cardsAt(f, i - 1)[s.to]
        expect(voter.voted, 'free to vote').toBe('none')
        expect(upToDate({ index: last(cand.log).index, term: last(cand.log).term }, last(voter.log))).toBe(true)
        const after = cardsAt(f, i)[s.to]
        expect(after).toMatchObject({ term: 1, voted: 'S1' })
      }
    })

    it('becomes Leader only with a majority of 3 servers (2 votes, its own and one more), and its term has one Leader', () => {
      const win = idxOf(f, s => s.state?.s1 === 'Leader')
      const granted = f.steps.slice(0, win).filter(s => s.kind === 'res' && s.to === 's1' && s.fields?.some(x => x.name === 'voteGranted' && x.value === 'true')).length
      expect(1 + granted).toBeGreaterThanOrEqual(majority(SERVERS.length))
      expect(majority(3)).toBe(2)
      expect(1 + granted).toBe(2)   // it does not wait for S3
      expect(f.steps.filter(s => s.state && Object.values(s.state).includes('Leader'))).toHaveLength(1)
    })

    it('heartbeats are AppendEntries with no entries, and they reset the Followers timers', () => {
      const hb = f.steps.filter(s => s.kind === 'req' && s.label.startsWith('AppendEntries'))
      expect(hb).toHaveLength(2)
      for (const s of hb) { expect(field(s, 'entries')).toBe('none'); expect(s.from).toBe('s1') }
      const end = dataAt(f, f.steps.length - 1)
      expect(end.s2.items.join()).toMatch(/reset/)
      expect(end.s3.items.join()).toMatch(/reset/)
    })
  })

  describe('log replication and commit', () => {
    const f = flowOf('replication')
    const commitAt = idxOf(f, s => s.label.startsWith('majority'))

    it('follows the order: write, own append, replicate, majority ack, commit, client reply, late ack, heartbeat with the commit index', () => {
      const order = [
        idxOf(f, s => s.from === 'client' && s.kind === 'req'),
        idxOf(f, s => s.kind === 'local' && s.label.startsWith('append')),
        idxOf(f, s => s.kind === 'req' && s.from === 's1' && s.to === 's2' && s.label.startsWith('AppendEntries idx')),
        idxOf(f, s => s.kind === 'res' && s.from === 's2'),
        commitAt,
        idxOf(f, s => s.kind === 'res' && s.to === 'client'),
        idxOf(f, s => s.kind === 'res' && s.from === 's3'),
        idxOf(f, s => s.kind === 'req' && s.label === 'AppendEntries, commit 1'),
      ]
      expect(order.every(i => i >= 0)).toBe(true)
      expect([...order].sort((a, b) => a - b)).toEqual(order)
    })

    it('the leader appends the entry (index 1, term 1) before it sends it, and the entry is not committed yet', () => {
      const own = cardsAt(f, idxOf(f, s => s.kind === 'local' && s.label.startsWith('append'))).s1
      expect(own.log).toEqual([{ index: 1, term: 1, cmd: 'x=1' }])
      expect(own.commit).toBe(0)
      expect(own.term).toBe(1)
    })

    it('AppendEntries names the entry before the new one, and Followers append it', () => {
      for (const to of ['s2', 's3']) {
        const i = idxOf(f, s => s.kind === 'req' && s.to === to && s.label.startsWith('AppendEntries idx'))
        const s = f.steps[i]
        expect(Number(field(s, 'prevLogIndex'))).toBe(0)
        expect(Number(field(s, 'prevLogTerm'))).toBe(0)
        expect(field(s, 'entries')).toBe('[1: SET x=1 (term 1)]')
        expect(cardsAt(f, i)[to].log).toEqual([{ index: 1, term: 1, cmd: 'x=1' }])
      }
    })

    it('commitIndex moves from 0 to 1 once a majority (2 of 3) holds the entry, before S3 has replied and before the client is answered', () => {
      const before = cardsAt(f, commitAt - 1).s1, after = cardsAt(f, commitAt).s1
      expect([before.commit, after.commit]).toEqual([0, 1])
      const acks = f.steps.slice(0, commitAt).filter(s => s.kind === 'res' && s.to === 's1' && field(s, 'success') === 'true').length
      expect(1 + acks).toBe(majority(3))
      const reply = idxOf(f, s => s.to === 'client' && s.kind === 'res')
      const s3 = idxOf(f, s => s.from === 's3' && s.to === 's1' && s.kind === 'res')
      expect(reply).toBeGreaterThan(commitAt)
      expect(s3).toBeGreaterThan(reply)
      // the entry is from the leader's own term, which is what allows counting replicas
      expect(after.log[after.commit - 1].term).toBe(after.term)
      expect(after.lines).toContain('applied: x=1')
    })

    it('Followers learn commitIndex 1 from the next AppendEntries, never beyond their log or the leaderCommit', () => {
      const hb = f.steps.map((s, i) => [s, i] as const).filter(([s]) => s.kind === 'req' && s.label === 'AppendEntries, commit 1')
      expect(hb).toHaveLength(2)
      for (const [s, i] of hb) {
        const before = cardsAt(f, i - 1)[s.to], after = cardsAt(f, i)[s.to]
        expect(before.commit).toBe(0)
        expect(after.commit).toBe(Math.min(Number(field(s, 'leaderCommit')), last(after.log).index))
        expect(after.commit).toBe(1)
        expect(Number(field(s, 'prevLogIndex'))).toBe(last(after.log).index)
        expect(after.lines).toContain('applied: x=1')
      }
      expect(f.steps[idxOf(f, s => s.kind === 'local' && s.label.startsWith('next heartbeat'))].wait).toBe(50)
    })

    it('the heartbeat interval is much shorter than the shortest election timeout', () => {
      expect(50).toBeLessThan(150)
    })
  })

  describe('leader failure and log repair', () => {
    const f = flowOf('failover')
    const start = cardsAt(f, 0)
    const winAt = idxOf(f, s => s.state?.s2 === 'Leader')

    it('starts from the logs: S1 [1,2,3] commit 2, S2 [1,2] commit 1, S3 [1] commit 1, all term 1', () => {
      expect(start.s1.log.map(e => e.index)).toEqual([1, 2, 3])
      expect(start.s2.log.map(e => e.index)).toEqual([1, 2])
      expect(start.s3.log.map(e => e.index)).toEqual([1])
      expect([start.s1.commit, start.s2.commit, start.s3.commit]).toEqual([2, 1, 1])
      for (const c of Object.values(start)) { expect(c.term).toBe(1); for (const e of c.log) expect(e.term).toBe(1) }
      // Entry 2 is committed because it is on a majority (S1 and S2); entry 3 is only on S1.
      const holders = (i: number) => SERVERS.filter(id => start[id].log.some(e => e.index === i)).length
      expect(holders(2)).toBeGreaterThanOrEqual(majority(3))
      expect(holders(3)).toBe(1)
    })

    it('election timeout waits: S3 waits 190 ms (inside 150 to 300), and the later S2 timeout is shown as a short remainder', () => {
      const waits = f.steps.filter(s => s.wait !== undefined)
      expect(waits.map(s => [s.from, s.wait])).toEqual([['s3', 190], ['s2', 60]])
      expect(waits[0].wait).toBeGreaterThanOrEqual(150)
      expect(waits[0].wait).toBeLessThanOrEqual(300)
    })

    it('every vote follows the rules: higher terms are adopted, and a vote is granted only to an up-to-date log that is not already voted for another', () => {
      const reqs = f.steps.map((s, i) => [s, i] as const).filter(([s]) => s.kind === 'req' && s.label.startsWith('RequestVote'))
      expect(reqs).toHaveLength(2)
      const outcomes: boolean[] = []
      for (const [s, i] of reqs) {
        const cand = cardsAt(f, i - 1)[s.from], voterBefore = cardsAt(f, i - 1)[s.to], voterAfter = cardsAt(f, i)[s.to]
        const term = Number(field(s, 'term'))
        expect(term).toBe(cand.term)
        expect(Number(field(s, 'lastLogIndex'))).toBe(last(cand.log).index)
        expect(Number(field(s, 'lastLogTerm'))).toBe(last(cand.log).term)
        const free = term > voterBefore.term || voterBefore.voted === 'none' || voterBefore.voted === s.from.toUpperCase()
        const grant = term >= voterBefore.term && free && upToDate(last(cand.log), last(voterBefore.log))
        const reply = f.steps.slice(i + 1).find(r => r.kind === 'res' && r.from === s.to && r.to === s.from)!
        expect(field(reply, 'voteGranted') === 'true').toBe(grant)
        expect(Number(field(reply, 'term'))).toBe(Math.max(term, voterBefore.term))
        expect(voterAfter.term).toBe(Math.max(term, voterBefore.term))
        expect(voterAfter.voted).toBe(grant ? s.from.toUpperCase() : 'none')
        outcomes.push(grant)
      }
      expect(outcomes).toEqual([false, true])   // the lagging S3 is refused, the longer log of S2 wins
    })

    it('S3 cannot win with one vote of 3, and S2 wins term 3 with 2 of 3 (the dead S1 still counts in the size)', () => {
      expect(f.steps.some(s => s.state?.s3 === 'Leader')).toBe(false)
      const granted = f.steps.slice(0, winAt).filter(s => s.kind === 'res' && s.to === 's2' && field(s, 'voteGranted') === 'true').length
      expect(1 + granted).toBe(majority(3))
      expect(cardsAt(f, winAt).s2.term).toBe(3)
      // S3 steps down from Candidate to Follower when it sees term 3.
      expect(stateChanges(f).flatMap(c => (c.s3 ? [c.s3] : []))).toEqual(['Follower', 'Candidate', 'Follower'])
    })

    it('the new leader holds every committed entry of the old one, and the unreplicated entry 3 is left behind', () => {
      const leader = cardsAt(f, winAt).s2
      for (const e of start.s1.log.slice(0, start.s1.commit)) expect(leader.log).toContainEqual(e)
      expect(leader.log.some(e => e.index === 3)).toBe(false)
    })

    it('a new leader starts nextIndex at its last index + 1 and steps back one at a time on each refusal', () => {
      const leader = cardsAt(f, winAt).s2
      const nextOf = (i: number) => Number(dataAt(f, i).s2.items.find(l => l.startsWith('S3 next '))!.split(' ')[2].replace(',', ''))
      expect(nextOf(winAt)).toBe(last(leader.log).index + 1)
      const aes = f.steps.map((s, i) => [s, i] as const).filter(([s]) => s.kind === 'req' && s.from === 's2' && s.to === 's3' && s.label.startsWith('AppendEntries'))
      expect(aes).toHaveLength(2)
      aes.forEach(([s, i], k) => {
        expect(Number(field(s, 'prevLogIndex'))).toBe(nextOf(i - 1) - 1)
        const s3 = cardsAt(f, i - 1).s3
        const prevTerm = Number(field(s, 'prevLogTerm'))
        const matches = Number(field(s, 'prevLogIndex')) === 0 || s3.log.some(e => e.index === Number(field(s, 'prevLogIndex')) && e.term === prevTerm)
        const reply = f.steps.slice(i + 1).find(r => r.kind === 'res' && r.from === 's3')!
        expect(field(reply, 'success') === 'true', `attempt ${k + 1}`).toBe(matches)
        if (!matches) expect(nextOf(f.steps.indexOf(reply))).toBe(nextOf(i) - 1)
      })
    })

    it('log matching after repair: the accepted request gives S3 exactly the leader log, and both logs end identical', () => {
      const [, i2] = f.steps.map((s, i) => [s, i] as const).filter(([s]) => s.kind === 'req' && s.from === 's2' && s.to === 's3' && s.label.startsWith('AppendEntries'))[1]
      const s = f.steps[i2]
      const prev = Number(field(s, 'prevLogIndex'))
      const sent = [...field(s, 'entries').matchAll(/(\d+): SET (\S+) \(term (\d+)\)/g)].map(m => ({ index: Number(m[1]), term: Number(m[3]), cmd: m[2] }))
      const before = cardsAt(f, i2 - 1).s3
      expect(cardsAt(f, i2).s3.log).toEqual([...before.log.filter(e => e.index <= prev), ...sent])
      const end = cardsAt(f, f.steps.length - 1)
      expect(end.s3.log).toEqual(end.s2.log)
      expect(end.s3.log.map(e => e.index)).toEqual([1, 2])
      // Log Matching: two logs with the same term at the same index agree on everything up to it.
      for (const e of end.s3.log) expect(end.s2.log.find(x => x.index === e.index)).toEqual(e)
    })

    it('does not commit an entry of an older term by counting replicas: the leader commitIndex stays 1', () => {
      const end = cardsAt(f, f.steps.length - 1)
      // Entry 2 is now on S2 and S3, a majority, but it has term 1 and the leader is in term 3.
      expect(end.s2.log[1].term).toBeLessThan(end.s2.term)
      for (let i = winAt; i < f.steps.length; i++) expect(cardsAt(f, i).s2.commit).toBe(1)
    })
  })
})
