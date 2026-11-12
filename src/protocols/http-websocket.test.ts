import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { PROTOCOLS } from '.'
import type { Flow } from '../model/schema'
import { rttTimes, stateChanges } from '../model/protocol'

const byId = (id: string) => { const d = PROTOCOLS.find(p => p.id === id); if (!d) throw new Error(`no protocol ${id}`); return d }
const flowOf = (d: string, f: string): Flow => { const x = byId(d).flows.find(y => y.id === f); if (!x) throw new Error(`no flow ${f}`); return x }
const field = (f: Flow, i: number, name: string) => f.steps[i].fields?.find(x => x.name === name)?.value
const at = (f: Flow, label: string | RegExp) => {
  const i = f.steps.findIndex(s => (typeof label === 'string' ? s.label === label : label.test(s.label)))
  if (i < 0) throw new Error(`${f.id}: no step ${label}`)
  return i
}
const hex = (s: string) => s.trim().split(/\s+/).map(b => parseInt(b, 16))

describe('HTTP versions', () => {
  it('sits after DNS and TCP in the protocol order, with three flows', () => {
    const ids = PROTOCOLS.map(p => p.id)
    expect(byId('http').meta.order).toBe(5)
    expect(ids.indexOf('http')).toBeGreaterThan(ids.indexOf('tcp'))
    expect(byId('http').flows.map(f => f.id)).toEqual(['h1', 'h2', 'h3'])
  })

  it('setup costs 2 RTT over TCP + TLS and 1 RTT over QUIC: the HTML lands at 3 RTT, 3 RTT and 2 RTT', () => {
    for (const [id, label, html, total] of [['h1', 'c1: 200 OK, index.html', 3, 6], ['h2', 'HEADERS + DATA stream 1', 3, 5], ['h3', 'stream 0: HEADERS + DATA', 2, 4]] as const) {
      const f = flowOf('http', id), t = rttTimes(f.steps)
      expect(t[at(f, label)], `${id} HTML`).toBe(html)
      expect(t.at(-1), `${id} total`).toBe(total)
    }
    // The first request goes out right after setup: arrives at 2.5 RTT over TCP + TLS, 1.5 over QUIC.
    expect(rttTimes(flowOf('http', 'h1').steps)[at(flowOf('http', 'h1'), 'c1: Finished, GET /')]).toBe(2.5)
    expect(rttTimes(flowOf('http', 'h2').steps)[at(flowOf('http', 'h2'), 'HEADERS stream 1: GET /')]).toBe(2.5)
    expect(rttTimes(flowOf('http', 'h3').steps)[at(flowOf('http', 'h3'), '1-RTT: HEADERS stream 0: GET /')]).toBe(1.5)
  })

  it('the page-loaded figures in the text match the timeline (25 ms per one-way trip)', () => {
    for (const id of ['h1', 'h2', 'h3']) {
      const f = flowOf('http', id), total = rttTimes(f.steps).at(-1)!
      const loaded = f.steps.flatMap(s => s.fields ?? []).find(x => x.name === 'page loaded')!.value
      expect(loaded, id).toBe(`${total} RTT = ${total * 50} ms`)
    }
  })

  it('HTTP/1.1: one request at a time per connection, and the second connection pays 2 RTT of setup', () => {
    const f = flowOf('http', 'h1'), t = rttTimes(f.steps)
    for (const c of ['c1', 'c2']) {
      // Requests and responses on one connection strictly alternate once it is set up.
      const http = f.steps.filter(s => s.label.startsWith(`${c}:`) && /GET|200 OK/.test(s.label)).map(s => (s.from === 'browser' ? 'req' : 'res'))
      expect(http.length, c).toBeGreaterThan(0)
      http.forEach((k, i) => expect(k, `${c} message ${i + 1}`).toBe(i % 2 ? 'res' : 'req'))
    }
    // c2's SYN leaves at 3 RTT and its first request at 5 RTT: 2 RTT of TCP + TLS.
    const syn2 = at(f, 'c2: SYN'), get2 = at(f, 'c2: Finished, GET /hero.jpg')
    expect(t[get2] - t[syn2]).toBe(2)
    // Head-of-line blocking: app.js could have gone at 3 RTT but waits behind the slow stylesheet until 5.
    const parse = at(f, /^parse HTML/), app = at(f, 'c1: GET /app.js')
    expect(t[app] - 0.5 - t[parse]).toBe(2)
    expect(field(f, app, 'queued for')).toBe('2 RTT (100 ms)')
    expect(app).toBeGreaterThan(at(f, /style\.css \(slow\)/))
  })

  it('the stylesheet takes 1 RTT of server time in every version', () => {
    for (const [id, req, res] of [['h1', 'c1: GET /style.css', /200 OK, style\.css/], ['h2', 'HEADERS stream 3: GET /style.css', /stream 3 \(style\.css\)/], ['h3', 'stream 4: GET /style.css', /^stream 4: style\.css/]] as const) {
      const f = flowOf('http', id), t = rttTimes(f.steps)
      // arrival of the response = arrival of the request + 1 RTT of work + half an RTT back
      expect(t[at(f, res)] - t[at(f, req)], id).toBe(1.5)
    }
  })

  it('ALPN picks http/1.1, h2 and h3', () => {
    const sel = (id: string) => flowOf('http', id).steps.flatMap(s => s.fields ?? []).find(x => x.name === 'ALPN selected')?.value
    expect(sel('h1')).toBe('http/1.1')
    expect(sel('h2')).toBe('h2')
    expect(flowOf('http', 'h3').steps.flatMap(s => s.fields ?? []).find(x => x.name === 'CRYPTO frame')!.value).toMatch(/ALPN h3/)
  })

  it('HTTP/2 client streams are odd and increasing, connection frames use stream 0, the preface is 24 bytes', () => {
    const f = flowOf('http', 'h2')
    const ids = f.steps.filter(s => s.kind === 'req').flatMap(s => [...s.label.matchAll(/stream (\d+)/g)].map(m => Number(m[1])))
    expect(ids).toEqual([1, 3, 5, 7])
    const preface = field(f, at(f, 'Finished, preface, SETTINGS'), 'preface')!
    expect(preface.replace(/\\r/g, '\r').replace(/\\n/g, '\n')).toHaveLength(24)
    expect(field(f, at(f, 'Finished, preface, SETTINGS'), 'frame')).toMatch(/stream 0/)
  })

  it('HPACK: the second request header bytes are flagged as an illustration and are far smaller', () => {
    const f = flowOf('http', 'h2')
    const bytes = (i: number) => f.steps[i].fields!.find(x => x.name.startsWith('header bytes'))!
    const first = bytes(at(f, 'HEADERS stream 1: GET /')), later = bytes(at(f, 'HEADERS stream 5: GET /app.js'))
    for (const b of [first, later]) { expect(b.name).toMatch(/illustration/); expect(b.note).toMatch(/not a measurement/) }
    const n = (v: string) => Number(v.match(/about (\d+) with HPACK/)![1])
    expect(n(later.value)).toBeLessThan(n(first.value) / 10)
  })

  it('HTTP/3: client bidirectional streams are 0 mod 4, unidirectional 2 mod 4, server unidirectional 3 mod 4 (RFC 9000 2.1)', () => {
    const f = flowOf('http', 'h3')
    const bidi = f.steps.filter(s => s.kind === 'req').flatMap(s => [...s.label.matchAll(/stream (\d+)/g)].map(m => Number(m[1])))
    expect(bidi).toEqual([0, 4, 8, 12])
    expect(field(f, at(f, '1-RTT: HEADERS stream 0: GET /'), 'control stream')).toMatch(/^stream 2\b/)
    expect(field(f, at(f, 'HANDSHAKE_DONE, SETTINGS'), 'control stream')).toMatch(/^stream 3\b/)
    expect(field(f, at(f, /^Initial: ClientHello/), 'transport')).toBe('UDP, port 443')
  })

  it('a lost packet stalls every HTTP/2 stream but only its own HTTP/3 stream', () => {
    expect(flowOf('http', 'h2').steps.at(-1)!.state?.browser).toBe('loss: all wait')
    expect(flowOf('http', 'h3').steps.at(-1)!.state?.browser).toBe('loss: 1 waits')
  })
})

describe('WebSocket', () => {
  const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11'
  const up = flowOf('websocket', 'upgrade')

  it('Sec-WebSocket-Accept is base64(SHA-1(key + GUID)) of the key actually sent', () => {
    const key = field(up, at(up, 'GET /chat, Upgrade: websocket'), 'Sec-WebSocket-Key')!
    expect(Buffer.from(key, 'base64')).toHaveLength(16)
    const accept = field(up, at(up, '101 Switching Protocols'), 'Sec-WebSocket-Accept')
    expect(accept).toBe(createHash('sha1').update(key + GUID).digest('base64'))
    expect(up.steps[at(up, '101 Switching Protocols')].payload).toContain(`Sec-WebSocket-Accept: ${accept}`)
    expect(up.steps[at(up, '101 Switching Protocols')].detail).toContain(GUID)
  })

  it('the masked client frame decodes to the same text as the unmasked server frame', () => {
    const c = hex(field(up, at(up, 'text frame "Hello" (masked)'), 'bytes')!)
    const s = hex(field(up, at(up, 'text frame "Hello" (unmasked)'), 'bytes')!)
    // byte 0: FIN + text opcode; byte 1: MASK bit and the 7-bit length
    expect(c[0]).toBe(0x80 | 0x1)
    expect(c[1] & 0x80).toBe(0x80)
    expect(s[1] & 0x80).toBe(0)
    const len = c[1] & 0x7f, key = c.slice(2, 6), body = c.slice(6)
    expect(body).toHaveLength(len)
    const text = String.fromCharCode(...body.map((b, i) => b ^ key[i % 4]))
    expect(text).toBe('Hello')
    expect(String.fromCharCode(...s.slice(2))).toBe(text)
    expect(s.slice(2)).toHaveLength(s[1] & 0x7f)
    expect(c).toHaveLength(2 + 4 + len)
  })

  it('header sizes for the three length encodings', () => {
    const header = (n: number, masked: boolean) => 2 + (n > 65535 ? 8 : n > 125 ? 2 : 0) + (masked ? 4 : 0)
    const notes = up.steps.flatMap(s => s.fields ?? []).filter(x => x.name.startsWith('length '))
    expect(notes.map(x => Number(x.note!.match(/Header (\d+) bytes/)![1]))).toEqual([header(125, false), header(65535, false), header(65536, false)])
  })

  it('opens 1 RTT after the GET and the first reply is back at 2 RTT', () => {
    const t = rttTimes(up.steps)
    const open = up.steps.findIndex(s => s.state?.browser === 'OPEN')
    expect(t[open]).toBe(1)
    expect(t.at(-1)).toBe(2)
    expect(up.steps.findIndex(s => s.state?.server === 'OPEN')).toBeLessThan(open)
  })

  const WS_STATES = ['CONNECTING', 'OPEN', 'CLOSING', 'CLOSED']
  const LEGAL: Record<string, string[]> = { CONNECTING: ['OPEN', 'CLOSED'], OPEN: ['CLOSING', 'CLOSED'], CLOSING: ['CLOSED'], CLOSED: ['CONNECTING'] }

  it('browser and server use the four WebSocket states along legal moves, and every flow ends CLOSED except the open one', () => {
    for (const f of byId('websocket').flows) {
      const now: Record<string, string> = {}
      f.steps.forEach((s, i) => {
        for (const [actor, next] of Object.entries(s.state ?? {})) {
          if (actor === 'lb') { expect(['HTTP', 'TUNNEL', 'CLOSED']).toContain(next); now.lb = next; continue }
          expect(WS_STATES, `${f.id} step ${i + 1}`).toContain(next)
          if (now[actor] && now[actor] !== next) expect(LEGAL[now[actor]], `${f.id} step ${i + 1}: ${actor} ${now[actor]} -> ${next}`).toContain(next)
          now[actor] = next
        }
      })
      if (f.id !== 'upgrade') expect(now, f.id).toEqual({ browser: 'CLOSED', lb: 'CLOSED', server: 'CLOSED' })
    }
    const seen = (f: Flow, a: string) => stateChanges(f).flatMap(c => (c[a] ? [c[a]] : []))
    expect(seen(up, 'browser')).toEqual(['CONNECTING', 'OPEN'])
    expect(seen(flowOf('websocket', 'close'), 'browser').slice(-2)).toEqual(['CLOSING', 'CLOSED'])
  })

  it('client frames are masked, server frames are not', () => {
    for (const f of byId('websocket').flows) f.steps.forEach((s, i) => {
      const m = field(f, i, 'MASK, payload length')
      if (m) expect(m.startsWith(s.from === 'browser' ? '1' : '0'), `${f.id} step ${i + 1}`).toBe(true)
    })
  })

  it('heartbeat: ping 0x9, pong 0xA, interval below the idle timeout, and the pong answers within 1 RTT', () => {
    const f = flowOf('websocket', 'heartbeat'), t = rttTimes(f.steps)
    const ping = at(f, 'Ping (opcode 0x9)'), pong = at(f, 'Pong (opcode 0xA, masked)')
    expect(Number(field(f, ping, 'first byte')) & 0x0f).toBe(0x9)
    expect(Number(field(f, pong, 'first byte')) & 0x0f).toBe(0xa)
    expect(parseInt(field(f, ping, 'interval')!)).toBeLessThan(parseInt(field(f, 0, 'idle timeout')!))
    expect(t[at(f, 'Pong relayed')] - t[ping]).toBe(1)
    // Without heartbeats the browser learns of the cut as 1006.
    expect(field(f, f.steps.length - 1, 'close event')).toMatch(/^code 1006/)
  })

  it('close: 1000 is 03 e8 on the wire, the server echoes it and closes TCP first, 1 RTT after ws.close()', () => {
    const f = flowOf('websocket', 'close'), t = rttTimes(f.steps)
    const close = at(f, 'Close 1000 (masked)')
    expect(field(f, close, 'status code')).toBe(`1000 = ${(1000).toString(16).padStart(4, '0').replace(/(..)(..)/, '$1 $2')}`)
    expect(Number(field(f, close, 'first byte')) & 0x0f).toBe(0x8)
    const echo = f.steps.findIndex((s, i) => i > close && s.from === 'server' && /Close 1000/.test(s.label))
    const serverFin = f.steps.findIndex((s, i) => i > echo && s.from === 'server' && s.label === 'TCP FIN')
    const browserFin = f.steps.findIndex((s, i) => i > echo && s.to === 'browser' && s.label === 'TCP FIN')
    expect(serverFin).toBeGreaterThan(echo)
    expect(serverFin).toBeLessThan(browserFin)
    expect(t[browserFin] - (t[close] - 0.5)).toBe(1)
  })

  it('1006 is reported but never sent, and reconnect waits follow full-jitter exponential backoff', () => {
    const f = flowOf('websocket', 'close')
    // No Close frame ever carries 1006.
    for (const fl of byId('websocket').flows) for (const s of fl.steps) if (/^Close/.test(s.label)) expect(s.label).not.toMatch(/1006/)
    const waits = f.steps.filter(s => /^attempt \d+: wait/.test(s.label)).map(s => s.label.match(/^attempt (\d+): wait random\(0, (\d+) s\)/)!.slice(1).map(Number))
    const base = 1, cap = 30
    expect(waits.length).toBe(2)
    for (const [n, max] of waits) expect(max).toBe(Math.min(cap, base * 2 ** (n - 1)))
    // Every reconnect pays 2 RTT of TCP + TLS before its GET.
    for (const s of f.steps) if (/^new TCP \+ TLS/.test(s.label)) expect(s.delay).toBe(4)
  })
})
