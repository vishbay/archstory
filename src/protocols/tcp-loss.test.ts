// TCP scenario "Packet loss": the numbers (sequence numbers, duplicate ACKs, ssthresh and cwnd, timeouts) are checked here so the content cannot drift.
import { describe, expect, it } from 'vitest'
import { PROTOCOLS } from '.'
import { rttTimes, rttToMs, stepDelay } from '../model/protocol'
import type { Flow } from '../model/schema'

const tcp = PROTOCOLS.find(p => p.id === 'tcp')!
const f: Flow = tcp.flows.find(x => x.id === 'loss')!
const MSS = 1460
const field = (i: number, name: string) => f.steps[i].fields?.find(x => x.name === name)?.value
/** The first number in a value, commas removed: "10,220 = 7 x 1,460" is 10220. */
const num = (s: string | undefined) => Number(((s ?? '').match(/\d[\d,]*/) ?? ['NaN'])[0].replace(/,/g, ''))
const wire = (i: number) => ({ seq: num(field(i, 'seq')), ack: num(field(i, 'ack')) })
const at = (label: RegExp, from = 0) => { const i = f.steps.findIndex((s, k) => k >= from && label.test(s.label)); if (i < 0) throw new Error(`no step ${label}`); return i }
/** The last number after "=" in a field value, as in "max(11,680 / 2, 2 x 1,460) = 5,840". */
const result = (i: number, name: string) => num((field(i, name) ?? '').split('=').at(-1)!.match(/[\d,]+/)![0])
const t = rttTimes(f.steps)

describe('TCP packet loss scenario', () => {
  it('is the fourth scenario, cites the RFCs it uses, and is a connection that is already open', () => {
    expect(tcp.flows.map(x => x.id)).toEqual(['connect', 'slow-start', 'refused', 'loss'])
    expect(f.title).toBe('Packet loss: fast retransmit and timeout')
    for (const rfc of ['9293', '5681', '6298', '2018']) expect(tcp.meta.source, rfc).toContain(`RFC ${rfc}`)
    expect(f.steps[0].state).toEqual({ client: 'ESTABLISHED', server: 'ESTABLISHED' })
  })

  it('uses only ESTABLISHED: there is no state change in a scenario about loss', () => {
    for (const s of f.steps) for (const v of Object.values(s.state ?? {})) expect(v).toBe('ESTABLISHED')
  })

  describe('part 1: a segment in the middle of a flight is lost', () => {
    const s1 = at(/^Segment 1 /), s2 = at(/^Segment 2 seq/), s39 = at(/^Segments 3 to 9/)

    it('numbers the response from the server ISN 5000 as in the first scenario: 9 segments of 1460 bytes, 5001 to 18140', () => {
      expect(wire(s1).seq).toBe(5000 + 1)
      expect(wire(s2).seq).toBe(wire(s1).seq + MSS)
      expect(wire(s39).seq).toBe(wire(s2).seq + MSS)
      expect(num(field(s39, 'segments'))).toBe(7)
      expect(num(field(s39, 'bytes'))).toBe(7 * MSS)
      const next = wire(s39).seq + num(field(s39, 'bytes'))
      expect(next).toBe(5001 + 9 * MSS)
      expect(next).toBe(18141)
      // The server acknowledges the client request of flow 1: 100 bytes from 1001.
      for (const i of [s1, s2, s39]) expect(wire(i).ack).toBe(1000 + 1 + 100)
    })

    it('loses segment 2 only: it is marked lost, takes no time, and the segments behind it arrive', () => {
      expect(f.steps[s2].lost).toBe(true)
      expect(stepDelay(f.steps[s2])).toBe(0)
      expect(f.steps[s1].lost).toBeUndefined()
      expect(f.steps[s39].lost).toBeUndefined()
      expect(t[s1]).toBe(0.5)
      expect(t[s2]).toBe(0.5)
      expect(t[s39]).toBe(0.5)
    })

    it('answers segment 1 with a new ACK, then repeats it exactly 3 times, naming the first missing byte', () => {
      const newAck = at(/^ACK ack=6461/), dups = f.steps.flatMap((s, i) => (/^Dup ACK/.test(s.label) ? [i] : []))
      expect(wire(newAck).ack).toBe(wire(s1).seq + MSS)
      expect(wire(newAck).ack).toBe(wire(s2).seq)                                   // the byte of the lost segment
      expect(dups).toHaveLength(3)
      dups.forEach((i, n) => {
        expect(wire(i).ack, `dup ${n + 1}`).toBe(wire(newAck).ack)
        expect(wire(i).seq).toBe(1101)                                              // the client sent nothing new
        expect(field(i, 'data')).toBe('0 bytes')
        expect(f.steps[i].label).toBe(`Dup ACK #${n + 1} ack=6461`)
        expect(i).toBe(dups[0] + n)                                                 // back to back
        expect(t[i]).toBe(1)
      })
      expect(dups[0]).toBe(newAck + 1)
    })

    it('fast retransmits on the third duplicate ACK, before any timeout can fire, and resends the lost segment', () => {
      const dup3 = at(/^Dup ACK #3/), fast = at(/fast retransmit/i, dup3), again = at(/^Segment 2 again/)
      expect(fast).toBe(dup3 + 1)
      expect(again).toBe(fast + 1)
      expect(wire(again).seq).toBe(wire(s2).seq)
      expect(field(again, 'data')).toBe(field(s2, 'data'))
      expect(t[fast]).toBe(1)                                                       // detected 1 RTT in
      expect(t[again]).toBe(1.5)
      // The whole repair is far inside the 1 second minimum retransmission timeout (20 RTT at 50 ms).
      expect(rttToMs(t[again] - t[s2], 50)).toBeLessThan(1000)
      expect(num(field(fast, 'duplicate ACKs'))).toBe(3)
    })

    it('sets ssthresh = max(FlightSize / 2, 2 x MSS) from the data outstanding, and cwnd = ssthresh + 3 x MSS (RFC 5681)', () => {
      const fast = at(/fast retransmit/i, at(/^Dup ACK #3/))
      const una = wire(at(/^ACK ack=6461/)).ack, nxt = 5001 + 9 * MSS
      const flight = nxt - una
      expect(num(field(fast, 'FlightSize'))).toBe(flight)
      expect(flight).toBe(8 * MSS)                                                  // segments 2 to 9, not the window of 10
      expect(result(fast, 'ssthresh')).toBe(Math.max(flight / 2, 2 * MSS))
      expect(result(fast, 'ssthresh')).toBe(4 * MSS)
      expect(result(fast, 'cwnd')).toBe(result(fast, 'ssthresh') + 3 * MSS)
      expect(result(0, 'cwnd')).toBe(10 * MSS)                                  // RFC 6928 initial window
    })

    it('ends with one cumulative ACK for the whole response and cwnd back down to ssthresh', () => {
      const fin = at(/^ACK ack=18141/), over = at(/^Recovery over/)
      expect(wire(fin).ack).toBe(wire(s39).seq + num(field(s39, 'bytes')))
      expect(t[fin]).toBe(2)
      expect(over).toBe(fin + 1)
      expect(result(over, 'cwnd')).toBe(4 * MSS)
      expect(result(over, 'ssthresh')).toBe(result(over, 'cwnd'))
    })
  })

  describe('part 2: the last segment of a flight is lost and only the timer can notice', () => {
    const req = at(/^PSH, ACK seq=1101/), start = at(/^cwnd = 4 MSS/), s1012 = at(/^Segments 10 to 12/)
    const lost1 = at(/^Segment 13 seq/), ack3 = at(/^ACK ack=22521/)

    it('reuses the connection: a second 100-byte request moves the client to sequence number 1201', () => {
      expect(wire(req).seq).toBe(1101)
      expect(num(field(req, 'data'))).toBe(100)
      expect(wire(req).ack).toBe(18141)
      for (const i of [ack3, at(/^ACK ack=23981/)]) expect(wire(i).seq).toBe(1101 + 100)
    })

    it('sends a flight of 4 segments (the window), numbered on from 18141, and loses the last one', () => {
      expect(result(start, 'cwnd')).toBe(4 * MSS)
      expect(num(field(start, 'response'))).toBe(4 * MSS)
      expect(wire(s1012).seq).toBe(18141)
      expect(num(field(s1012, 'bytes'))).toBe(3 * MSS)
      expect(wire(lost1).seq).toBe(wire(s1012).seq + 3 * MSS)
      expect(wire(lost1).seq).toBe(22521)
      expect(f.steps[lost1].lost).toBe(true)
      expect(lost1).toBe(s1012 + 1)
      expect(wire(lost1).seq + MSS).toBe(23981)
      for (const i of [s1012, lost1]) expect(wire(i).ack).toBe(1101 + 100)
    })

    it('gets an ACK for the first three segments only, and no duplicate ACK ever follows (nothing was sent behind the lost segment)', () => {
      expect(wire(ack3).ack).toBe(wire(lost1).seq)
      const after = f.steps.slice(lost1 + 1)
      expect(after.some(s => /^Dup ACK/.test(s.label))).toBe(false)
      expect(after.some(s => s.from === 'server' && s.to === 'client' && !s.lost && wire(f.steps.indexOf(s)).seq > wire(lost1).seq)).toBe(false)
    })

    it('waits the 1 second retransmission timeout (RFC 6298), expressed in one-way trips of the 50 ms reference path', () => {
      const wait = at(/^Silence: waiting 1 s/)
      expect(f.steps[wait].kind).toBe('local')
      expect(f.steps[wait].from).toBe('server')
      expect(wait).toBe(ack3 + 1)
      const oneWay = 50 / 2
      expect(stepDelay(f.steps[wait]) * oneWay).toBe(1000)                          // 1 s
      expect(t[wait] - t[ack3]).toBe(20)                                            // 20 round trips
      expect(rttToMs(t[wait] - t[ack3], 50)).toBe(1000)
      expect(field(wait, 'RTO')).toBe('1 s')
    })

    it('on the timeout cwnd collapses to 1 MSS, ssthresh = max(FlightSize / 2, 2 x MSS), the RTO doubles and segment 13 is resent', () => {
      const fire = at(/^Timeout: cwnd collapses/), again = at(/^Segment 13 again/)
      expect(fire).toBe(at(/^Silence: waiting 1 s/) + 1)
      expect(num(field(fire, 'FlightSize'))).toBe(MSS)                              // only segment 13 is outstanding
      expect(result(fire, 'ssthresh')).toBe(Math.max(MSS / 2, 2 * MSS))
      expect(result(fire, 'ssthresh')).toBe(2 * MSS)
      expect(result(fire, 'cwnd')).toBe(MSS)
      expect(field(fire, 'RTO')).toBe('1 s -> 2 s')
      expect(wire(again).seq).toBe(wire(lost1).seq)
      expect(field(again, 'data')).toBe(field(lost1, 'data'))
    })

    it('backs off: the second wait is 2 seconds (double), the retransmission before it was lost, and ssthresh is not touched again', () => {
      const first = at(/^Segment 13 again/), wait1 = at(/^Silence: waiting 1 s/), wait2 = at(/^Silence again: waiting 2 s/)
      expect(f.steps[first].lost).toBe(true)
      expect(stepDelay(f.steps[wait2])).toBe(2 * stepDelay(f.steps[wait1]))
      expect(rttToMs(stepDelay(f.steps[wait2]) / 2, 50)).toBe(2000)
      expect(field(wait2, 'RTO')).toBe('2 s')
      const second = at(/^Second timeout/)
      expect(second).toBe(wait2 + 1)
      expect(field(second, 'RTO')).toBe('2 s -> 4 s')
      expect(result(second, 'cwnd')).toBe(MSS)
      expect(result(second, 'ssthresh')).toBe(2 * MSS)
    })

    it('delivers on the second retransmission and ends with cwnd 1 -> 2 MSS, which equals ssthresh', () => {
      const second = at(/^Second timeout/), got = at(/^Segment 13 again/, second), final = at(/^ACK ack=23981/)
      expect(f.steps[got].lost).toBeUndefined()
      expect(wire(got).seq).toBe(22521)
      expect(wire(final).ack).toBe(wire(got).seq + MSS)
      const last = f.steps.length - 1
      expect(result(last, 'cwnd')).toBe(2 * MSS)
      expect(result(last, 'cwnd')).toBe(result(last, 'ssthresh'))
    })
  })

  it('loses exactly three messages: segment 2, segment 13 and its first retransmission, all req/res', () => {
    const lost = f.steps.filter(s => s.lost)
    expect(lost.map(s => s.label)).toEqual(['Segment 2 seq=6461', 'Segment 13 seq=22521', 'Segment 13 again seq=22521'])
    for (const s of lost) expect(['req', 'res']).toContain(s.kind)
  })

  it('totals 64 round trips: 3 seconds of timeouts (60 RTT) and 4 RTT of network time, at 50 ms', () => {
    expect(t.at(-1)).toBe(64)
    expect(rttToMs(t.at(-1)!, 50)).toBe(3200)
    expect(rttToMs(60, 50)).toBe(1000 + 2000)
  })

  it('every step has a detail, and the time never goes backwards', () => {
    f.steps.forEach((s, i) => { expect(s.detail, `step ${i + 1}`).toBeTruthy(); if (i) expect(t[i]).toBeGreaterThanOrEqual(t[i - 1]) })
  })
})
