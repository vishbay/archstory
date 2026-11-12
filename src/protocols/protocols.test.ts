import { describe, expect, it } from 'vitest'
import { PROTOCOLS } from '.'
import { LIBRARY } from '../library'
import { findEdge, isProtocol, type Flow } from '../model/schema'
import { rttTimes, stateChanges } from '../model/protocol'

const byId = (id: string) => { const d = PROTOCOLS.find(p => p.id === id); if (!d) throw new Error(`no protocol ${id}`); return d }
const flowOf = (d: string, f: string): Flow => { const x = byId(d).flows.find(y => y.id === f); if (!x) throw new Error(`no flow ${f}`); return x }

describe('protocol designs', () => {
  it('loads DNS then TCP, all marked as protocols and kept out of the library', () => {
    expect(PROTOCOLS.map(p => p.id)).toEqual(['dns', 'tcp'])
    for (const p of PROTOCOLS) expect(isProtocol(p)).toBe(true)
    expect(LIBRARY.some(isProtocol)).toBe(false)
    const lib = new Set(LIBRARY.map(d => d.id))
    for (const p of PROTOCOLS) expect(lib.has(p.id), p.id).toBe(false)
  })

  it('every step travels a declared edge, names known actors, and teaches', () => {
    for (const d of PROTOCOLS) {
      const ids = new Set(d.nodes.map(n => n.id))
      for (const f of d.flows) f.steps.forEach((s, i) => {
        const at = `${d.id}/${f.id} step ${i + 1}`
        if (s.kind === 'local') expect(s.from, at).toBe(s.to)
        else expect(findEdge(d, s.from, s.to), at).not.toBeNull()
        for (const k of Object.keys(s.state ?? {})) expect(ids.has(k), `${at}: state key ${k}`).toBe(true)
        if (s.kind === 'req' || s.kind === 'async') expect(s.detail, `${at} needs a detail`).toBeTruthy()
      })
      expect(d.questions.length).toBeGreaterThanOrEqual(5)
      expect(d.questions.length).toBeLessThanOrEqual(6)
      expect(d.meta.source).toMatch(/RFC/)
    }
  })

  it('uses no em or en dashes anywhere in the text', () => {
    for (const d of PROTOCOLS) expect(JSON.stringify(d), d.id).not.toMatch(/[–—]/)
  })
})

// RFC 9293 figure 5, plus the resets the text allows (a RST in SYN_SENT or SYN_RCVD). Underscored names as netstat shows them.
const TCP_STATES = ['CLOSED', 'LISTEN', 'SYN_SENT', 'SYN_RCVD', 'ESTABLISHED', 'FIN_WAIT_1', 'FIN_WAIT_2', 'CLOSE_WAIT', 'CLOSING', 'LAST_ACK', 'TIME_WAIT']
const LEGAL: Record<string, string[]> = {
  CLOSED: ['LISTEN', 'SYN_SENT'],
  LISTEN: ['SYN_RCVD', 'SYN_SENT', 'CLOSED'],
  SYN_SENT: ['SYN_RCVD', 'ESTABLISHED', 'CLOSED'],
  SYN_RCVD: ['ESTABLISHED', 'FIN_WAIT_1', 'LISTEN', 'CLOSED'],
  ESTABLISHED: ['FIN_WAIT_1', 'CLOSE_WAIT', 'CLOSED'],
  FIN_WAIT_1: ['FIN_WAIT_2', 'CLOSING', 'TIME_WAIT', 'CLOSED'],
  FIN_WAIT_2: ['TIME_WAIT', 'CLOSED'],
  CLOSE_WAIT: ['LAST_ACK', 'CLOSED'],
  CLOSING: ['TIME_WAIT', 'CLOSED'],
  LAST_ACK: ['CLOSED'],
  TIME_WAIT: ['CLOSED'],
}

/** Parses "SYN, ACK seq=5000 ack=1001" style fields from a step. */
const wire = (f: Flow, i: number) => {
  const get = (n: string) => f.steps[i].fields?.find(x => x.name === n)?.value
  return { flags: get('flags') ?? '', seq: Number(get('seq')), ack: Number(get('ack')) }
}

describe('TCP', () => {
  const tcp = byId('tcp')

  it('only uses RFC 9293 state names and moves along legal transitions', () => {
    for (const f of tcp.flows) {
      // A scenario that starts mid-connection (slow start) declares where it starts; the others start with no connection.
      const now: Record<string, string> = f.id === 'slow-start' ? { ...f.steps[0].state } : { client: 'CLOSED', server: 'CLOSED' }
      f.steps.forEach((s, i) => {
        for (const [actor, next] of Object.entries(s.state ?? {})) {
          expect(TCP_STATES, `${f.id} step ${i + 1}`).toContain(next)
          if (next !== now[actor]) expect(LEGAL[now[actor]], `${f.id} step ${i + 1}: ${actor} ${now[actor]} -> ${next}`).toContain(next)
          now[actor] = next
        }
      })
      if (f.id !== 'slow-start') expect(now, `${f.id} ends with both sides closed`).toEqual({ client: 'CLOSED', server: 'CLOSED' })
    }
  })

  it('walks the full lifetime: handshake, then FIN_WAIT and TIME_WAIT on the closer, CLOSE_WAIT and LAST_ACK on the other side', () => {
    const f = flowOf('tcp', 'connect')
    const seen = (actor: string) => stateChanges(f).flatMap(c => (c[actor] ? [c[actor]] : []))
    expect(seen('client')).toEqual(['CLOSED', 'SYN_SENT', 'ESTABLISHED', 'FIN_WAIT_1', 'FIN_WAIT_2', 'TIME_WAIT', 'CLOSED'])
    expect(seen('server')).toEqual(['LISTEN', 'SYN_RCVD', 'ESTABLISHED', 'CLOSE_WAIT', 'LAST_ACK', 'CLOSED'])
  })

  it('handshake and close numbers add up: SYN and FIN use one sequence number, ACK names the next byte expected', () => {
    const f = flowOf('tcp', 'connect')
    const idx = (flags: string, from = 0) => f.steps.findIndex((s, i) => i >= from && s.fields?.some(x => x.name === 'flags' && x.value === flags))
    const syn = wire(f, idx('SYN')), synack = wire(f, idx('SYN, ACK')), ack = wire(f, idx('ACK'))
    expect(synack.ack).toBe(syn.seq + 1)
    expect(ack.seq).toBe(syn.seq + 1)
    expect(ack.ack).toBe(synack.seq + 1)

    const req = wire(f, idx('PSH, ACK')), resI = idx('PSH, ACK', idx('PSH, ACK') + 1), res = wire(f, resI)
    const len = (i: number) => parseInt(f.steps[i].fields!.find(x => x.name === 'data')!.value)
    expect(req.seq).toBe(ack.seq)                       // a bare ACK used no sequence number
    expect(res.seq).toBe(synack.seq + 1)
    expect(res.ack).toBe(req.seq + len(idx('PSH, ACK')))

    const fin1I = idx('FIN, ACK'), fin1 = wire(f, fin1I)
    expect(fin1.seq).toBe(req.seq + len(idx('PSH, ACK')))
    expect(fin1.ack).toBe(res.seq + len(resI))
    const ackFin1 = wire(f, fin1I + 1)
    expect(ackFin1.ack).toBe(fin1.seq + 1)
    const fin2I = idx('FIN, ACK', fin1I + 1), fin2 = wire(f, fin2I)
    expect(fin2.seq).toBe(ackFin1.seq)                  // the ACK before it used none
    const last = wire(f, fin2I + 1)
    expect(last.flags).toBe('ACK')
    expect(last.seq).toBe(fin1.seq + 1)
    expect(last.ack).toBe(fin2.seq + 1)
  })

  it('answers a SYN to a closed port with RST, ACK: seq 0 and ack = SYN seq + 1 (RFC 9293 3.10.7.1)', () => {
    const f = flowOf('tcp', 'refused')
    const syn = wire(f, 0), rst = wire(f, 1)
    expect(syn.flags).toBe('SYN')
    expect(rst.flags).toBe('RST, ACK')
    expect(rst.seq).toBe(0)
    expect(rst.ack).toBe(syn.seq + 1)
  })

  it('times the handshake in round trips', () => {
    // Each message is one one-way trip (half an RTT), times are when it arrives: SYN 0.5, SYN-ACK 1, ACK 1.5.
    // The request is sent right behind the final ACK (delay 0), so it also arrives at 1.5 RTT: the client could send
    // it after one RTT, and it takes half an RTT more to cross. The response is back at 2 RTT.
    const f = flowOf('tcp', 'connect')
    const t = rttTimes(f.steps)
    expect(t.slice(0, 6)).toEqual([0, 0.5, 1, 1.5, 1.5, 2])
  })

  it('slow start: 10 segments, the window doubles each RTT, and each flight lands one RTT after the last', () => {
    const f = flowOf('tcp', 'slow-start')
    const t = rttTimes(f.steps)
    const flights = f.steps.flatMap((s, i) => (s.from === 'server' && s.to === 'client' ? [i] : []))
    const segs = flights.map(i => Number(f.steps[i].fields!.find(x => x.name === 'segments')!.value))
    expect(segs).toEqual([10, 20, 40])
    expect(flights.map(i => t[i])).toEqual([1, 2, 3])
  })
})

describe('DNS', () => {
  const contacted = (f: Flow) => f.steps.filter(s => s.kind !== 'local').map(s => s.to)

  it('a cold lookup asks the root, then the TLD, then the authoritative server, and only then answers', () => {
    const order = contacted(flowOf('dns', 'cold')).filter(id => ['root', 'tld', 'auth'].includes(id))
    expect(order).toEqual(['root', 'tld', 'auth'])
    const f = flowOf('dns', 'cold')
    const answer = f.steps.findIndex(s => s.from === 'resolver' && s.to === 'browser')
    expect(answer).toBeGreaterThan(f.steps.findIndex(s => s.from === 'auth'))
    expect(rttTimes(f.steps).at(-1)).toBe(4)
  })

  it('sets RD on the stub query, AA only on the authoritative answer, RA on the resolver answer', () => {
    const f = flowOf('dns', 'cold')
    const field = (i: number, n: string) => f.steps[i].fields?.find(x => x.name === n)?.value
    const q = f.steps.findIndex(s => s.from === 'browser' && s.to === 'resolver')
    expect(field(q, 'RD')).toBe('1')
    const auth = f.steps.findIndex(s => s.from === 'auth')
    expect(field(auth, 'QR / AA')).toBe('1 / 1')
    for (const ref of ['root', 'tld']) expect(field(f.steps.findIndex(s => s.from === ref), 'QR / AA')).toBe('1 / 0')
    const ans = f.steps.findIndex(s => s.from === 'resolver' && s.to === 'browser')
    expect(field(ans, 'RD / RA')).toBe('1 / 1')
    expect(field(ans, 'ID')).toBe(field(q, 'ID'))
  })

  it('a cache hit contacts no root, TLD or authoritative server', () => {
    const to = contacted(flowOf('dns', 'cached'))
    for (const id of ['root', 'tld', 'auth']) expect(to).not.toContain(id)
    expect(rttTimes(flowOf('dns', 'cached').steps).at(-1)).toBe(1)
  })

  it('caches NXDOMAIN for min(SOA TTL, SOA MINIMUM) as RFC 2308 says', () => {
    const f = flowOf('dns', 'nxdomain')
    const nx = f.steps.find(s => s.from === 'auth')!
    const soa = nx.fields!.find(x => x.name === 'authority')!.value.split(/\s+/)
    const minimum = Number(soa.at(-1)), ttl = Number(soa[1])
    expect(ttl).toBe(Math.min(3600, minimum))
    expect(nx.fields!.find(x => x.name === 'RCODE')!.value).toMatch(/^3 /)
    expect(contacted(f)).not.toContain('root')
  })
})
