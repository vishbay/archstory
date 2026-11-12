import { describe, expect, it } from 'vitest'
import { PROTOCOLS } from '.'
import { LIBRARY } from '../library'
import { findEdge, isProtocol, type Flow } from '../model/schema'
import { phaseBudget, rttTimes, stateChanges, stepDelay } from '../model/protocol'
import { resolvePhases } from '../model/phases'

const byId = (id: string) => { const d = PROTOCOLS.find(p => p.id === id); if (!d) throw new Error(`no protocol ${id}`); return d }
const flowOf = (d: string, f: string): Flow => { const x = byId(d).flows.find(y => y.id === f); if (!x) throw new Error(`no flow ${f}`); return x }

describe('protocol designs', () => {
  it('loads the protocol modules in order, all marked as protocols and kept out of the library', () => {
    expect(PROTOCOLS.map(p => p.id)).toEqual(['dns', 'tcp', 'tls', 'url', 'http', 'websocket', 'loadbalancing', 'nat', 'oauth'])
    expect(PROTOCOLS.map(p => p.meta.order)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9])
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

// RFC 8446 appendix A state names, per side.
const TLS_STATES = {
  client: ['START', 'WAIT_SH', 'WAIT_EE', 'WAIT_CERT_CR', 'WAIT_CERT', 'WAIT_CV', 'WAIT_FINISHED', 'CONNECTED'],
  server: ['START', 'RECVD_CH', 'NEGOTIATED', 'WAIT_EOED', 'WAIT_FLIGHT2', 'WAIT_CERT', 'WAIT_CV', 'WAIT_FINISHED', 'CONNECTED'],
}
// Legal moves in appendix A (a state may also be repeated). WAIT_FLIGHT2 -> WAIT_FINISHED is the "no client auth" branch.
const TLS_LEGAL: Record<'client' | 'server', Record<string, string[]>> = {
  client: {
    START: ['WAIT_SH'], WAIT_SH: ['START', 'WAIT_EE'], WAIT_EE: ['WAIT_CERT_CR', 'WAIT_FINISHED'],
    WAIT_CERT_CR: ['WAIT_CV', 'WAIT_CERT'], WAIT_CERT: ['WAIT_CV'], WAIT_CV: ['WAIT_FINISHED'], WAIT_FINISHED: ['CONNECTED'], CONNECTED: [],
  },
  server: {
    START: ['RECVD_CH'], RECVD_CH: ['START', 'NEGOTIATED'], NEGOTIATED: ['WAIT_EOED', 'WAIT_FLIGHT2', 'WAIT_FINISHED'],
    WAIT_EOED: ['WAIT_FLIGHT2', 'WAIT_FINISHED'], WAIT_FLIGHT2: ['WAIT_CERT', 'WAIT_FINISHED'], WAIT_CERT: ['WAIT_CV', 'WAIT_FINISHED'],
    WAIT_CV: ['WAIT_FINISHED'], WAIT_FINISHED: ['CONNECTED'], CONNECTED: [],
  },
}

describe('TLS 1.3', () => {
  const tls = byId('tls')
  const field = (f: Flow, i: number, n: string) => f.steps[i].fields?.find(x => x.name === n)?.value
  /** Index of the first step carrying `message` sent by `from`, at or after `after`. */
  const msg = (f: Flow, m: string, from?: string, after = 0) =>
    f.steps.findIndex((s, i) => i >= after && field(f, i, 'message') === m && (!from || s.from === from))
  /** When a step leaves its sender, in RTT: its arrival minus its own one-way delay. */
  const sentAt = (f: Flow, i: number) => rttTimes(f.steps)[i] - stepDelay(f.steps[i]) / 2

  it('uses only RFC 8446 appendix A state names, moving along legal transitions', () => {
    for (const f of tls.flows) {
      const now: Record<string, string> = { client: 'START', server: 'START' }
      f.steps.forEach((s, i) => {
        for (const [actor, next] of Object.entries(s.state ?? {}) as ['client' | 'server', string][]) {
          expect(TLS_STATES[actor], `${f.id} step ${i + 1}`).toContain(next)
          if (next !== now[actor]) expect(TLS_LEGAL[actor][now[actor]], `${f.id} step ${i + 1}: ${actor} ${now[actor]} -> ${next}`).toContain(next)
          now[actor] = next
        }
      })
      if (f.id !== 'bad-cert') expect(now, `${f.id} ends connected`).toEqual({ client: 'CONNECTED', server: 'CONNECTED' })
    }
  })

  it('every TLS message names its type and its protection', () => {
    for (const f of tls.flows) f.steps.forEach((s, i) => {
      if (s.kind === 'local') return
      expect(field(f, i, 'message'), `${f.id} step ${i + 1}`).toBeTruthy()
      expect(field(f, i, 'protection'), `${f.id} step ${i + 1}`).toBeTruthy()
    })
  })

  it('keeps the RFC order: ClientHello, ServerHello, EncryptedExtensions, Certificate, CertificateVerify, Finished, client Finished', () => {
    for (const id of ['full', 'hrr']) {
      const f = flowOf('tls', id)
      const sh = msg(f, 'ServerHello')
      const order = [
        msg(f, 'ClientHello'), sh, msg(f, 'EncryptedExtensions', 'server', sh), msg(f, 'Certificate', 'server', sh),
        msg(f, 'CertificateVerify', 'server', sh), msg(f, 'Finished', 'server', sh), msg(f, 'Finished', 'client', sh),
      ]
      for (const i of order) expect(i, `${id}: ${order}`).toBeGreaterThanOrEqual(0)
      expect([...order].sort((a, b) => a - b), id).toEqual(order)
    }
    const r = flowOf('tls', 'resume')
    const rOrder = ['ClientHello', 'ServerHello', 'EncryptedExtensions', 'Finished'].map(m => msg(r, m)).concat(msg(r, 'EndOfEarlyData'), msg(r, 'Finished', 'client'))
    expect([...rOrder].sort((a, b) => a - b)).toEqual(rOrder)
    expect(msg(r, 'Certificate'), 'no certificate with a PSK').toBe(-1)
    expect(msg(r, 'CertificateVerify')).toBe(-1)
  })

  it('draws the encryption boundary where RFC 8446 puts it', () => {
    const expected: Record<string, RegExp> = {
      ClientHello: /^plaintext$/, ServerHello: /^plaintext$/, HelloRetryRequest: /^plaintext$/,
      EncryptedExtensions: /^server handshake keys$/, Certificate: /^server handshake keys$/, CertificateVerify: /^server handshake keys$/,
      EndOfEarlyData: /^client early data keys$/, NewSessionTicket: /^server application keys$/, alert: /^client handshake keys$/,
    }
    for (const f of tls.flows) f.steps.forEach((s, i) => {
      const m = field(f, i, 'message'), p = field(f, i, 'protection')
      if (!m) return
      const at = `${f.id} step ${i + 1} ${m}`
      if (m === 'Finished') expect(p, at).toBe(`${s.from} handshake keys`)
      else if (m === 'application data') {
        // 0-RTT data goes before the ServerHello reaches the client; everything else uses application keys.
        const early = i < msg(f, 'ServerHello')
        expect(p, at).toBe(early ? 'client early data keys' : `${s.from} application keys`)
      } else expect(p, at).toMatch(expected[m])
    })
  })

  it('full handshake: ServerHello at 1 RTT, client Finished and the request leave at 1 RTT, response at 2', () => {
    const f = flowOf('tls', 'full'), t = rttTimes(f.steps)
    expect(t[msg(f, 'ClientHello')]).toBe(0.5)
    for (const m of ['ServerHello', 'EncryptedExtensions', 'Certificate', 'CertificateVerify']) expect(t[msg(f, m)], m).toBe(1)
    expect(t[msg(f, 'Finished', 'server')]).toBe(1)
    const fin = msg(f, 'Finished', 'client')
    expect(sentAt(f, fin)).toBe(1)
    expect(t[fin]).toBe(1.5)
    const get = msg(f, 'application data', 'client')
    expect(get).toBeGreaterThan(fin)
    expect(t[get]).toBe(1.5)
    // The server's 0.5-RTT data leaves with its own flight, before the client's Finished.
    expect(msg(f, 'application data', 'server')).toBeLessThan(fin)
    expect(t[msg(f, 'NewSessionTicket')]).toBe(2)
    expect(msg(f, 'NewSessionTicket')).toBeGreaterThan(fin)
    expect(t.at(-1)).toBe(2)
  })

  it('0-RTT: the request arrives with the ClientHello at 0.5 RTT and the answer is back at 1', () => {
    const f = flowOf('tls', 'resume'), t = rttTimes(f.steps)
    const ch = msg(f, 'ClientHello'), early = msg(f, 'application data', 'client')
    expect(early).toBe(ch + 1)
    expect(t[ch]).toBe(0.5)
    expect(t[early]).toBe(0.5)
    expect(field(f, ch, 'early_data')).toBeDefined()
    expect(field(f, ch, 'pre_shared_key.identity')).toBeDefined()
    const resp = msg(f, 'application data', 'server')
    expect(t[resp]).toBe(1)
    expect(resp).toBeLessThan(msg(f, 'Finished', 'client'))
  })

  it('HelloRetryRequest: the special random, a second ClientHello, and the client connected at 2 RTT', () => {
    const f = flowOf('tls', 'hrr'), t = rttTimes(f.steps)
    const hrr = msg(f, 'HelloRetryRequest')
    expect(field(f, hrr, 'random')).toBe('CF 21 AD 74 E5 9A 61 11 BE 1D 8C 02 1E 65 B8 91 C2 A2 11 16 7A BB 8C 5E 07 9E 09 E2 C8 A8 33 9C')
    expect(field(f, hrr, 'key_share')).toMatch(/secp256r1/)
    const ch2 = msg(f, 'ClientHello', 'client', hrr)
    expect(ch2).toBeGreaterThan(hrr)
    expect(field(f, ch2, 'key_share')).toMatch(/^secp256r1/)
    expect(t[msg(f, 'ServerHello')]).toBe(2)
    const fin = msg(f, 'Finished', 'client')
    expect(sentAt(f, fin)).toBe(2)
    expect(f.steps[fin].state?.client).toBe('CONNECTED')
  })

  it('a certificate from an unknown CA ends in a fatal unknown_ca alert and no request', () => {
    const f = flowOf('tls', 'bad-cert')
    const alert = msg(f, 'alert')
    expect(field(f, alert, 'description')).toBe('unknown_ca (48)')
    expect(field(f, alert, 'level')).toBe('fatal (2)')
    expect(msg(f, 'application data')).toBe(-1)
    expect(msg(f, 'Finished', 'client')).toBe(-1)
  })
})

describe('Type a URL', () => {
  const first = flowOf('url', 'first'), repeat = flowOf('url', 'repeat')

  it('goes caches, DNS, TCP, TLS, HTTP in that order', () => {
    const order = phaseBudget(first.steps).map(b => b.name)
    const at = (p: string) => order.indexOf(p)
    for (const p of ['Look in caches', 'DNS', 'TCP', 'TLS', 'HTTP', 'Render']) expect(order, p).toContain(p)
    expect(at('Look in caches')).toBeLessThan(at('DNS'))
    expect(at('DNS')).toBeLessThan(at('TCP'))
    expect(at('TCP')).toBeLessThan(at('TLS'))
    expect(at('TLS')).toBeLessThan(at('HTTP'))
    expect(order.at(-1)).toBe('Render')
    // Phases do not come back later in the flow.
    const names = resolvePhases(first.steps)
    expect(names.filter((n, i) => n !== names[i - 1])).toEqual(order)
  })

  it('spends the round trips the latency model says: resolver 10 ms (0.2 RTT), server 50 ms (1 RTT)', () => {
    const b = Object.fromEntries(phaseBudget(first.steps).map(x => [x.name, x.rtt]))
    expect(b).toEqual({ 'Look in caches': 0, DNS: 0.2, TCP: 1, TLS: 1, HTTP: 1, Subresources: 1, Render: 0 })
    expect(rttTimes(first.steps).at(-1)).toBeCloseTo(4.2)
    // Every message to the resolver is a 0.2 one-way unit, every message to the server a full one.
    for (const s of first.steps) {
      if (s.kind === 'local') continue
      const resolverLeg = s.from === 'resolver' || s.to === 'resolver'
      expect(stepDelay(s), `${s.label}`).toBe(resolverLeg ? 0.2 : 1)
    }
  })

  it('a repeat visit on the open connection has no DNS, TCP or TLS and costs 1 RTT', () => {
    const b = phaseBudget(repeat.steps)
    expect(b.map(x => x.name)).toEqual(['Look in caches', 'HTTP', 'Render'])
    expect(repeat.steps.some(s => s.to === 'resolver')).toBe(false)
    expect(rttTimes(repeat.steps).at(-1)).toBe(1)
    expect(repeat.steps.find(s => s.from === 'server')?.label).toMatch(/^304/)
  })
})
