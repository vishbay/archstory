import { describe, expect, it } from 'vitest'
import { PROTOCOLS } from '.'
import { rttTimes, stateChanges } from '../model/protocol'
import type { Flow } from '../model/schema'

const byId = (id: string) => { const d = PROTOCOLS.find(p => p.id === id); if (!d) throw new Error(`no protocol ${id}`); return d }
const flowOf = (d: string, f: string): Flow => { const x = byId(d).flows.find(y => y.id === f); if (!x) throw new Error(`no flow ${f}`); return x }
const field = (f: Flow, i: number, name: string) => f.steps[i].fields?.find(x => x.name === name)?.value
const num = (s: string | undefined) => Number((s ?? '').replace(/,/g, ''))
const idx = (f: Flow, pred: (s: Flow['steps'][number]) => boolean, from = 0) => f.steps.findIndex((s, i) => i >= from && pred(s))
const seen = (f: Flow, actor: string) => stateChanges(f).flatMap(c => (c[actor] ? [c[actor]] : []))

describe('load balancing, NAT and OAuth modules', () => {
  it('sort after DNS and TCP as orders 7, 8 and 9', () => {
    expect(['loadbalancing', 'nat', 'oauth'].map(id => byId(id).meta.order)).toEqual([7, 8, 9])
    for (const id of ['loadbalancing', 'nat', 'oauth']) {
      expect(byId(id).questions).toHaveLength(6)
      for (const q of byId(id).questions) expect(q.a.split(/(?<=[.!?])\s+(?=[A-Z])/).length, `${id}/${q.id}`).toBeLessThanOrEqual(4)
    }
  })
})

describe('Load balancing', () => {
  it('L4: hashes once, then every packet of the connection goes to Server A and never to B', () => {
    const f = flowOf('loadbalancing', 'l4')
    const hash = idx(f, s => s.kind === 'local' && /hash/.test(s.label))
    const firstToBackend = idx(f, s => s.from === 'lb' && s.to !== 'client' && s.to !== 'lb')
    expect(hash).toBeGreaterThan(0)
    expect(hash).toBeLessThan(firstToBackend)
    const backends = f.steps.filter(s => s.from === 'lb' && (s.to === 'a' || s.to === 'b')).map(s => s.to)
    expect(new Set(backends)).toEqual(new Set(['a']))
    expect(f.steps.some(s => s.from === 'b' || s.to === 'b')).toBe(false)
    // The client's source address reaches the backend unchanged.
    expect(field(f, firstToBackend, 'src')).toBe(field(f, 0, 'src'))
  })

  it('L4 timing: handshake through to the backend at 1.1 RTT, response at 3.3 RTT', () => {
    const f = flowOf('loadbalancing', 'l4')
    const t = rttTimes(f.steps)
    const est = idx(f, s => s.state?.client === 'ESTABLISHED')
    expect(t[est]).toBeCloseTo(1.1)
    expect(t.at(-1)).toBeCloseTo(3.3)
  })

  it('PROXY protocol v2: the 12-byte signature spells \\r\\n\\r\\n\\0\\r\\nQUIT\\n and an IPv4 TCP header is 16 + 12 = 28 bytes', () => {
    const f = flowOf('loadbalancing', 'l4')
    const i = idx(f, s => !!s.fields?.some(x => x.name === 'v2 signature'))
    const bytes = field(f, i, 'v2 signature')!.split(' ').map(h => parseInt(h, 16))
    expect(bytes).toHaveLength(12)
    expect(String.fromCharCode(...bytes)).toBe('\r\n\r\n\0\r\nQUIT\n')
    const addr = 4 + 4 + 2 + 2
    expect(parseInt(field(f, i, 'v2 addresses')!)).toBe(addr)
    expect(parseInt(field(f, i, 'PROXY v2 (if used)')!)).toBe(12 + 1 + 1 + 2 + addr)
  })

  it('L7: handshakes end at the LB, the request is routed after it is read, and the first response is back at 3.1 RTT', () => {
    const f = flowOf('loadbalancing', 'l7')
    const t = rttTimes(f.steps)
    const backendSteps = f.steps.filter(s => ['a', 'b'].includes(s.from) || ['a', 'b'].includes(s.to))
    for (const s of backendSteps) expect(s.label).not.toMatch(/SYN|Hello/)
    const req = idx(f, s => s.from === 'client' && /GET \/api\/cart/.test(s.label))
    const route = idx(f, s => s.kind === 'local')
    expect(t[req]).toBeCloseTo(2.5)
    expect(route).toBe(req + 1)
    const firstOk = idx(f, s => s.to === 'client' && /200/.test(s.label))
    expect(t[firstOk]).toBeCloseTo(3.1)
    const fwd = f.steps[route + 1]
    expect(fwd.payload).toMatch(/X-Forwarded-For: 198\.51\.100\.7/)
    expect(fwd.payload).toMatch(/Forwarded: for=198\.51\.100\.7;proto=https;host=example\.com/)
  })

  it('L7 retry: a reset from B is followed by the same idempotent GET on A, costing one extra backend round trip', () => {
    const f = flowOf('loadbalancing', 'l7')
    const t = rttTimes(f.steps)
    const rst = idx(f, s => s.from === 'b' && s.label === 'RST')
    const sent = f.steps[rst - 1], retry = f.steps[idx(f, s => s.from === 'lb' && s.to === 'a', rst)]
    expect(sent.to).toBe('b')
    expect(retry.label.split(' ').slice(0, 2)).toEqual(sent.label.split(' ').slice(0, 2))
    expect(sent.label).toMatch(/^GET /)
    // From the client sending the request to the answer: 1.1 RTT without a failure (1 to the LB, 0.1 to a backend),
    // plus one extra backend round trip (0.1 RTT) for the attempt on B.
    const start = idx(f, s => s.from === 'client' && s.label === sent.label)
    expect(t.at(-1)! - t[start - 1]).toBeCloseTo(1.2)
  })

  it('health checks: B goes healthy, failing, unhealthy, draining, removed, and gets no new requests once out', () => {
    const f = flowOf('loadbalancing', 'health')
    expect(seen(f, 'b')).toEqual(['healthy', 'failing 1 of 3', 'unhealthy', 'draining', 'removed'])
    const out = idx(f, s => s.state?.b === 'unhealthy')
    expect(f.steps.slice(out).some(s => s.from === 'lb' && s.to === 'b')).toBe(false)
    const newReq = idx(f, s => s.from === 'client', out)
    expect(f.steps[newReq + 1]).toMatchObject({ from: 'lb', to: 'a' })
    expect(f.steps.slice(out).some(s => s.from === 'b' && /in-flight/.test(s.label))).toBe(true)
  })
})

describe('NAT', () => {
  it('rewrites the source on the way out and the destination on the way back, with one consistent entry', () => {
    const f = flowOf('nat', 'outbound')
    const entry = idx(f, s => s.kind === 'local' && s.from === 'nat')
    const inside = field(f, entry, 'inside'), outside = field(f, entry, 'outside')
    expect(inside).toBe('10.0.1.10:41000')
    expect(outside).toBe('203.0.113.10:50000')
    const out = idx(f, s => s.from === 'host' && s.to === 'nat')
    expect(out).toBeLessThan(entry)
    expect(field(f, out, 'src')).toBe(inside)
    expect(field(f, entry + 1, 'src')).toBe(outside)
    expect(field(f, entry + 1, 'dst')).toBe(field(f, out, 'dst'))
    const back = idx(f, s => s.from === 'server')
    expect(field(f, back, 'dst')).toBe(outside)
    const toHost = idx(f, s => s.from === 'nat' && s.to === 'host')
    expect(field(f, toHost, 'dst')).toBe(inside)
    expect(field(f, toHost, 'src')).toBe(field(f, out, 'dst'))
  })

  it('times the outbound flow: SYN at the server at 0.5 RTT, established at 1, response at 2, as without NAT', () => {
    const f = flowOf('nat', 'outbound')
    const t = rttTimes(f.steps)
    expect(t[idx(f, s => s.from === 'nat' && s.to === 'server')]).toBeCloseTo(0.5)
    expect(t[idx(f, s => s.state?.host === 'ESTABLISHED')]).toBeCloseTo(1)
    expect(t[idx(f, s => s.label === 'response to :41000')]).toBeCloseTo(2)
    expect(seen(f, 'nat')).toEqual(['0 entries', '1 entry', '1 established', '0 entries'])
    expect(seen(f, 'host').at(-1)).toBe('CLOSED')
  })

  it('never forwards unsolicited packets to the private host', () => {
    const f = flowOf('nat', 'unsolicited')
    expect(f.steps.some(s => s.to === 'host')).toBe(false)
    const drops = f.steps.filter(s => s.kind === 'local' && /drop/.test(s.label))
    expect(drops).toHaveLength(2)
  })

  it('port exhaustion arithmetic adds up', () => {
    const f = flowOf('nat', 'exhaustion')
    const ports = 65535 - 1024 + 1
    expect(ports).toBe(64512)
    const demand = idx(f, s => !!s.fields?.some(x => x.name === 'total'))
    const total = num(field(f, demand, 'instances')) * num(field(f, demand, 'connections each'))
    expect(num(field(f, demand, 'total'))).toBe(total)
    const pool = idx(f, s => !!s.fields?.some(x => x.name === 'port range'))
    expect(field(f, pool, 'port range')).toBe(`1024 to 65535 = ${ports.toLocaleString('en-US')}`)
    expect(total).toBeGreaterThan(ports)
    expect(field(f, pool, 'still wanted')).toBe(`80,000 - 64,512 = ${(total - ports).toLocaleString('en-US')}`)
    const two = idx(f, s => !!s.fields?.some(x => x.name === 'ports per destination'))
    expect(field(f, two, 'ports per destination')).toBe(`2 x 64,512 = ${(2 * ports).toLocaleString('en-US')}`)
    expect(2 * ports).toBeGreaterThanOrEqual(total)
    const reuse = idx(f, s => !!s.fields?.some(x => x.name === 'ports needed'))
    expect(field(f, reuse, 'ports needed')).toBe(`200 x 50 = ${(200 * 50).toLocaleString('en-US')}`)
    // The connection that does not fit is dropped before the second address exists, and goes out on it afterwards.
    const dropped = idx(f, s => /No free port/.test(s.label)), added = idx(f, s => s.state?.nat === '2 public IPs')
    expect(dropped).toBeLessThan(added)
    expect(field(f, idx(f, s => s.from === 'nat' && s.to === 'server'), 'src')).toMatch(/^203\.0\.113\.11:/)
  })
})

describe('OAuth', () => {
  const login = () => flowOf('oauth', 'login')

  it('PKCE ordering: verifier made first, only the challenge in the URL, state checked before the code is redeemed', () => {
    const f = login()
    const make = idx(f, s => s.kind === 'local' && /code_verifier/.test(s.label))
    const authz = idx(f, s => /\/authorize/.test(s.label))
    const callback = idx(f, s => /\/callback/.test(s.label))
    const stateCheck = idx(f, s => s.kind === 'local' && /^state matches/.test(s.label))
    const token = idx(f, s => /POST \/token/.test(s.label))
    const verify = idx(f, s => s.from === 'as' && s.kind === 'local')
    expect(make).toBe(0)
    expect([make, authz, callback, stateCheck, token, verify]).toEqual([...[make, authz, callback, stateCheck, token, verify]].sort((a, b) => a - b))
    expect(f.steps[authz].payload).toMatch(/code_challenge=.*code_challenge_method=S256/)
    expect(f.steps[authz].payload).not.toMatch(/code_verifier/)
    expect(field(f, authz, 'response_type')).toBe('code')
    expect(field(f, authz, 'scope')).toMatch(/^openid profile/)
    for (const k of ['client_id', 'redirect_uri', 'state', 'nonce', 'code_challenge', 'code_challenge_method']) expect(field(f, authz, k), k).toBeTruthy()
    expect(f.steps[token].payload).toMatch(/grant_type=authorization_code.*code_verifier=/s)
    expect(field(f, token, 'redirect_uri')).toBe(field(f, authz, 'redirect_uri'))
    expect(field(f, callback, 'state')).toBe('<same random>')
  })

  it('a 32-byte verifier and a SHA-256 challenge are both 43 base64url characters', () => {
    expect(Buffer.alloc(32).toString('base64url')).toHaveLength(43)
    expect(login().steps[0].fields!.find(x => x.name === 'code_verifier')!.value).toMatch(/^<43 characters/)
  })

  it('times the login: the token response at 3 RTT and the first API answer at 4 RTT', () => {
    const f = login()
    const t = rttTimes(f.steps)
    expect(t[idx(f, s => s.from === 'as' && s.to === 'app' && /tokens/.test(s.label))]).toBe(3)
    expect(t.at(-1)).toBe(4)
    expect(f.steps.at(-1)).toMatchObject({ from: 'api', to: 'app' })
    expect(seen(f, 'app')).toEqual(['signed out', 'redirected', 'code received', 'signed in'])
  })

  it('the token response carries all three tokens, the ID token goes to the app and the access token to the API', () => {
    const f = login()
    const res = f.steps[idx(f, s => s.from === 'as' && s.to === 'app' && /tokens/.test(s.label))]
    const body = JSON.parse(res.payload!.split('\n\n')[1])
    expect(Object.keys(body).sort()).toEqual(['access_token', 'expires_in', 'id_token', 'refresh_token', 'scope', 'token_type'])
    expect(body.token_type).toBe('Bearer')
    expect(body.expires_in).toBe(900)
    expect(res.fields!.find(x => x.name === 'id_token')!.value).toMatch(/audience photo-app/)
    expect(f.steps.filter(s => s.to === 'api').every(s => !/id_token/.test(s.payload ?? ''))).toBe(true)
  })

  it('JWT: the encoded header decodes to the header shown, exp - iat equals expires_in, and AQAB is 65537', () => {
    const f = flowOf('oauth', 'validate')
    const enc = field(f, 0, 'header (encoded)')!, json = field(f, 0, 'header')!
    expect(Buffer.from(enc, 'base64url').toString()).toBe(json)
    expect(Buffer.from(json).toString('base64url')).toBe(enc)
    const iat = Number(field(f, 0, 'iat')), exp = Number(field(f, 0, 'exp'))
    expect(exp - iat).toBe(900)
    expect(new Date(iat * 1000).toISOString()).toBe('2026-11-12T09:00:00.000Z')
    const jwks = idx(f, s => s.from === 'as' && s.to === 'api')
    expect(parseInt(Buffer.from(field(f, jwks, 'e')!, 'base64url').toString('hex'), 16)).toBe(65537)
    expect(field(f, jwks, 'kid')).toBe(JSON.parse(json).kid)
    expect(JSON.parse(f.steps[jwks].payload!).keys[0].kid).toBe(JSON.parse(json).kid)
  })

  it('validation order: algorithm check, key fetch, signature, claims, scope, then the answer', () => {
    const f = flowOf('oauth', 'validate')
    const order = [/alg/, /jwks/, /signature/, /iss, aud, exp/, /scope/].map(r => idx(f, s => r.test(s.label)))
    expect(order.every(i => i > 0)).toBe(true)
    expect(order).toEqual([...order].sort((a, b) => a - b))
    expect(seen(f, 'api')).toEqual(['unverified', 'signature OK', 'authorized'])
  })

  it('refresh: 401 invalid_token, rotation, a replayed RT1 revokes the family, a stolen code without the verifier gets invalid_grant', () => {
    const f = flowOf('oauth', 'refresh')
    expect(f.steps[1].payload).toMatch(/^HTTP\/1\.1 401 Unauthorized\nWWW-Authenticate: Bearer error="invalid_token"/)
    const refresh = idx(f, s => s.from === 'app' && /refresh RT1/.test(s.label))
    expect(refresh).toBe(2)
    expect(f.steps[refresh].payload).toMatch(/grant_type=refresh_token/)
    expect(seen(f, 'as')).toEqual(['RT1 active', 'RT2 active', 'family revoked'])
    const replay = idx(f, s => s.from === 'attacker' && /RT1/.test(s.label))
    expect(replay).toBeGreaterThan(idx(f, s => s.state?.as === 'RT2 active'))
    const answers = f.steps.filter(s => s.to === 'attacker')
    expect(answers).toHaveLength(2)
    for (const a of answers) expect(JSON.parse(a.payload!.split('\n\n')[1])).toEqual({ error: 'invalid_grant' })
    // The attacker never gets anything but errors, and never talks to the API.
    expect(f.steps.some(s => s.from === 'attacker' && s.to === 'api')).toBe(false)
  })
})
