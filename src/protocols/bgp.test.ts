// BGP module: the FSM, the hold time arithmetic, the AS_PATH rules, the best path order and longest prefix match are
// recomputed here from the states, fields and data cards the timeline shows, so the text cannot drift from RFC 4271.
import { describe, expect, it } from 'vitest'
import { PROTOCOLS } from '.'
import { dataAt, stateChanges, stepDelay } from '../model/protocol'
import type { Flow, Step } from '../model/schema'

const bgp = PROTOCOLS.find(p => p.id === 'bgp')!
const flowOf = (id: string): Flow => bgp.flows.find(f => f.id === id)!
const field = (s: Step, name: string) => s.fields?.find(x => x.name === name)?.value
const AS: Record<string, number> = { cust: 64500, isp1: 64501, isp2: 64502, origin: 64503, bad: 64504 }

// RFC 4271 section 8.2.2: every transition the text of each state allows between the six states.
const STATES = ['Idle', 'Connect', 'Active', 'OpenSent', 'OpenConfirm', 'Established']
const LEGAL: Record<string, string[]> = {
  Idle: ['Connect', 'Active'],
  Connect: ['Connect', 'Active', 'OpenSent', 'OpenConfirm', 'Idle'],
  Active: ['Connect', 'OpenSent', 'OpenConfirm', 'Idle'],
  OpenSent: ['Active', 'OpenConfirm', 'Idle'],
  OpenConfirm: ['Established', 'Idle'],
  Established: ['Idle'],
}

// ---- the decision process, RFC 4271 9.1.2 and 9.1.2.2 -----------------------------------------------------------------
interface Route { name: string; localPref: number; path: number[]; origin: number; med: number; ebgp: boolean; igp: number; id: string; peer: string }
const ipNum = (ip: string) => ip.split('.').reduce((a, o) => a * 256 + Number(o), 0)
const ORIGIN = { IGP: 0, EGP: 1, INCOMPLETE: 2 } as const
const neighbourAs = (r: Route) => r.path[0]
/** Applies the criteria in the RFC order, removing routes until one remains. Returns the winner and the criterion that decided. */
function decide(routes: Route[]): { best: Route; by: string } {
  const steps: [string, (rs: Route[]) => Route[]][] = [
    ['highest LOCAL_PREF', rs => { const m = Math.max(...rs.map(r => r.localPref)); return rs.filter(r => r.localPref === m) }],
    ['shortest AS_PATH', rs => { const m = Math.min(...rs.map(r => r.path.length)); return rs.filter(r => r.path.length === m) }],
    ['lowest ORIGIN', rs => { const m = Math.min(...rs.map(r => r.origin)); return rs.filter(r => r.origin === m) }],
    ['lowest MED', rs => rs.filter(m => !rs.some(n => neighbourAs(n) === neighbourAs(m) && n.med < m.med))],
    ['eBGP over iBGP', rs => (rs.some(r => r.ebgp) ? rs.filter(r => r.ebgp) : rs)],
    ['lowest IGP cost', rs => { const m = Math.min(...rs.map(r => r.igp)); return rs.filter(r => r.igp === m) }],
    ['lowest BGP Identifier', rs => { const m = Math.min(...rs.map(r => ipNum(r.id))); return rs.filter(r => ipNum(r.id) === m) }],
    ['lowest peer address', rs => { const m = Math.min(...rs.map(r => ipNum(r.peer))); return rs.filter(r => ipNum(r.peer) === m) }],
  ]
  let left = routes, by = 'only route'
  for (const [name, keep] of steps) {
    if (left.length === 1) break
    const next = keep(left)
    if (next.length < left.length) by = name
    left = next
  }
  return { best: left[0], by }
}
const route = (o: Partial<Route> & { name: string }): Route => ({ localPref: 100, path: [64501, 64503], origin: ORIGIN.IGP, med: 0, ebgp: true, igp: 0, id: '192.0.2.2', peer: '192.0.2.2', ...o })

// ---- addresses and prefixes -----------------------------------------------------------------------------------------
const parseCidr = (c: string) => { const [ip, len] = c.split('/'); return { net: ipNum(ip), len: Number(len) } }
const inPrefix = (ip: string, c: string) => { const { net, len } = parseCidr(c); const shift = 2 ** (32 - len); return Math.floor(ipNum(ip) / shift) === Math.floor(net / shift) }
/** Longest prefix match over lines like "198.51.100.0/24 isp1": the target of the most specific route that contains the address. */
function lpm(lines: string[], ip: string): string | undefined {
  const hits = lines.map(l => l.split(' ')).filter(([c]) => inPrefix(ip, c))
  hits.sort((a, b) => parseCidr(b[0]).len - parseCidr(a[0]).len)
  return hits[0]?.[1]
}

// ---- RFC 6811 origin validation -------------------------------------------------------------------------------------
interface Vrp { prefix: string; maxLength: number; asn: number }
function validate(route: { prefix: string; asn: number }, vrps: Vrp[]): 'Valid' | 'Invalid' | 'NotFound' {
  const rl = parseCidr(route.prefix).len
  const covering = vrps.filter(v => parseCidr(v.prefix).len <= rl && inPrefix(route.prefix.split('/')[0], v.prefix))
  if (covering.length === 0) return 'NotFound'
  return covering.some(v => rl <= v.maxLength && v.asn === route.asn) ? 'Valid' : 'Invalid'
}

describe('bgp module', () => {
  it('is the sixteenth module, in Network, hard, with the RFCs it read as sources', () => {
    expect(bgp.meta.order).toBe(16)
    expect(bgp.meta.section).toBe('Network')
    expect(bgp.meta.difficulty).toBe('hard')
    expect(bgp.meta.layout).toBeUndefined()
    for (const r of ['RFC 4271', 'RFC 6811', 'RFC 7454', 'RFC 8212', 'RFC 5398', 'RFC 5737']) expect(bgp.meta.source, r).toContain(r)
    expect(bgp.flows.map(f => f.id)).toEqual(['session', 'bestpath', 'hijack'])
    expect(bgp.flows.map(f => f.steps.length)).toEqual([13, 10, 11])
    expect(bgp.notes).toHaveLength(5)
    expect(bgp.questions).toHaveLength(6)
    for (const q of bgp.questions) expect(q.a.split(/(?<=[.!?])\s+(?=[A-Z])/).length, q.id).toBeLessThanOrEqual(4)
  })

  it('says its values are illustrative, uses the documentation ranges only, and keeps cards within 21 characters and 6 lines', () => {
    expect(bgp.meta.summary).toMatch(/illustrative/)
    for (const f of bgp.flows) expect(f.summary, f.id).toMatch(/[Ii]llustrative/)
    const text = JSON.stringify(bgp).replace(/sections? [\d. and]+/g, '')   // RFC section numbers such as 9.1.2.2 are not addresses
    for (const m of text.matchAll(/\b(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})(?:\/\d+)?\b/g)) {
      if (Number(m[1]) < 10) continue   // an RFC section number such as 9.2.1.1, not an address
      const ip = `${m[1]}.${m[2]}.${m[3]}`
      expect(['192.0.2', '198.51.100', '203.0.113', '10.255.255'], m[0]).toContain(ip)
    }
    for (const m of text.matchAll(/\bAS (\d{5})\b/g)) expect(Number(m[1]), m[0]).toBeGreaterThanOrEqual(64496)
    expect(Object.values(AS).every(a => a >= 64496 && a <= 64511)).toBe(true)   // RFC 5398
    for (const f of bgp.flows) for (const [i, s] of f.steps.entries()) {
      expect(s.label.length, `${f.id} ${i + 1}: ${s.label}`).toBeLessThanOrEqual(30)
      for (const [id, v] of Object.entries(s.data ?? {})) {
        expect(v.items.length, `${f.id} ${i + 1} ${id}`).toBeLessThanOrEqual(6)
        for (const t of [v.title ?? '', ...v.items]) expect(t.length, `${f.id} ${i + 1} ${id}: ${t}`).toBeLessThanOrEqual(21)
      }
    }
  })

  describe('the session flow', () => {
    const f = flowOf('session')

    it('uses only RFC 4271 state names, moving along legal transitions, and ends Established on both sides', () => {
      const now: Record<string, string> = { cust: 'Idle', isp1: 'Idle' }
      f.steps.forEach((s, i) => {
        for (const [actor, next] of Object.entries(s.state ?? {})) {
          expect(STATES, `step ${i + 1}`).toContain(next)
          if (next !== now[actor]) expect(LEGAL[now[actor]], `step ${i + 1}: ${actor} ${now[actor]} -> ${next}`).toContain(next)
          now[actor] = next
        }
      })
      expect(now).toEqual({ cust: 'Established', isp1: 'Established' })
    })

    it('walks the active side Idle, Connect, OpenSent, OpenConfirm, Established and the passive side through Active', () => {
      const seen = (a: string) => stateChanges(f).flatMap(c => (c[a] ? [c[a]] : []))
      expect(seen('cust')).toEqual(['Connect', 'OpenSent', 'OpenConfirm', 'Established'])
      expect(seen('isp1')).toEqual(['Idle', 'Active', 'OpenSent', 'OpenConfirm', 'Established'])
    })

    it('connects to TCP port 179 before any BGP message, and only then sends OPEN', () => {
      const syn = f.steps.findIndex(s => field(s, 'flags') === 'SYN')
      const open = f.steps.findIndex(s => field(s, 'message')?.startsWith('OPEN'))
      expect(syn).toBeGreaterThan(-1)
      expect(field(f.steps[syn], 'destination port')).toBe('179')
      expect(field(f.steps[syn + 1], 'source port')).toBe('179')
      expect(open).toBeGreaterThan(syn + 2)
      expect(f.steps[syn + 2].state).toEqual({ cust: 'OpenSent', isp1: 'OpenSent' })   // both send OPEN once TCP is up
    })

    it('negotiates the smaller hold time on both sides, and the keepalive time is one third of it', () => {
      const opens = f.steps.filter(s => field(s, 'message')?.startsWith('OPEN'))
      expect(opens).toHaveLength(2)
      const proposed = (s: Step) => Number(field(s, 'hold time')!.replace(' s', ''))
      const [fromCust, fromIsp] = [opens.find(s => s.from === 'cust')!, opens.find(s => s.from === 'isp1')!]
      const negotiated = Math.min(proposed(fromCust), proposed(fromIsp))
      expect([proposed(fromCust), proposed(fromIsp), negotiated]).toEqual([180, 90, 90])
      // The cards each side shows are the arithmetic: peer value, own value, the minimum, a third of it.
      for (const [side, peer, own] of [['isp1', fromCust, fromIsp], ['cust', fromIsp, fromCust]] as const) {
        const card = f.steps.map((_, i) => dataAt(f, i)[side]).filter(c => c?.title === 'hold time').at(-1)!
        const num = (l: string) => Number(l.match(/(\d+) s$/)![1])
        expect(num(card.items[0]), `${side} peer`).toBe(proposed(peer))
        expect(num(card.items[1]), `${side} own`).toBe(proposed(own))
        expect(num(card.items[2]), `${side} hold timer`).toBe(negotiated)
        expect(num(card.items[3]), `${side} keepalive`).toBe(negotiated / 3)
      }
      // The configured values on the first cards are what the OPEN messages carry.
      expect(dataAt(f, 0).cust.items).toContain('hold time 180 s')
      expect(dataAt(f, 1).isp1.items).toContain('hold time 90 s')
      expect(proposed(fromCust)).toBeGreaterThanOrEqual(3)
      expect(proposed(fromIsp)).toBeGreaterThanOrEqual(3)
    })

    it('waits one third of the hold time for the keepalive, in milliseconds that do not change with distance', () => {
      const i = f.steps.findIndex(s => s.wait !== undefined)
      expect(f.steps[i].wait).toBe((90 / 3) * 1000)
      expect(field(f.steps[i], 'keepalive time')).toBe('30 s')
      expect(stepDelay(f.steps[i], 50) * 50).toBe(stepDelay(f.steps[i], 150) * 150)   // the same time at every distance
      expect(f.steps[i + 1].label).toMatch(/KEEPALIVE/)
    })

    it('uses the RFC message sizes and type codes: KEEPALIVE is the 19 octet header, the smallest OPEN is 29', () => {
      for (const s of f.steps) {
        const m = field(s, 'message')
        if (m?.startsWith('KEEPALIVE')) { expect(m).toBe('KEEPALIVE (type 4)'); if (field(s, 'length')) expect(field(s, 'length')).toMatch(/^19 octets/) }
        if (m?.startsWith('OPEN')) { expect(m).toBe('OPEN (type 1)'); expect(field(s, 'version')).toBe('4') }
        if (m?.startsWith('UPDATE')) expect(m).toBe('UPDATE (type 2)')
      }
      const open = f.steps.find(s => field(s, 'message')?.startsWith('OPEN') && field(s, 'length'))!
      expect(field(open, 'length')).toMatch(/^29 octets/)
      expect(19 + (1 + 2 + 2 + 4 + 1)).toBe(29)   // header + version, AS, hold time, identifier, optional parameter length
    })

    it('carries the AS number of the sender in each OPEN and in the AS_PATH of the first UPDATE, which has no LOCAL_PREF', () => {
      for (const s of f.steps) if (field(s, 'message')?.startsWith('OPEN')) expect(Number(field(s, 'my autonomous system'))).toBe(AS[s.from])
      const u = f.steps.find(s => field(s, 'message')?.startsWith('UPDATE'))!
      expect(field(u, 'AS_PATH')).toBe(String(AS.cust))
      expect(field(u, 'NLRI')).toBe('203.0.113.0/24')
      expect(u.fields!.some(x => x.name === 'LOCAL_PREF')).toBe(false)   // not sent to external peers (RFC 4271 5.1.5)
      expect(f.steps.indexOf(u)).toBeGreaterThan(f.steps.findIndex(s => s.state?.isp1 === 'Established'))
    })
  })

  describe('the best path flow', () => {
    const f = flowOf('bestpath')
    const updates = f.steps.filter(s => field(s, 'message')?.startsWith('UPDATE'))
    const pathOf = (s: Step) => field(s, 'AS_PATH')!.split(' ').map(Number)

    it('every UPDATE to an external peer starts with the AS of the sender, and the origin starts with its own AS', () => {
      for (const s of updates) expect(pathOf(s)[0], `${s.from} to ${s.to}`).toBe(AS[s.from])
      const fromOrigin = updates.filter(s => s.from === 'origin')
      for (const s of fromOrigin) expect(pathOf(s).every(a => a === AS.origin)).toBe(true)
    })

    it('a propagated path is the sender AS prepended to the path it received (and prepending twice makes the path longer)', () => {
      const received = (s: Step) => updates.find(u => u.to === s.from && f.steps.indexOf(u) < f.steps.indexOf(s))!
      for (const s of updates.filter(u => u.from !== 'origin')) expect(pathOf(s), `${s.from} to ${s.to}`).toEqual([AS[s.from], ...pathOf(received(s))])
      const toIsp1 = updates.find(s => s.to === 'isp1')!, toIsp2 = updates.find(s => s.to === 'isp2')!
      expect(pathOf(toIsp1)).toEqual([AS.origin])
      expect(pathOf(toIsp2)).toEqual([AS.origin, AS.origin])
    })

    it('uses the interface address on the link as NEXT_HOP, and the same prefix in every UPDATE', () => {
      for (const s of updates) { expect(field(s, 'NLRI')).toBe('198.51.100.0/24'); expect(field(s, 'NEXT_HOP')).toMatch(/^192\.0\.2\.\d+$/) }
      expect(new Set(updates.map(s => field(s, 'NEXT_HOP'))).size).toBe(updates.length)   // a different link address each time
    })

    it('the origin ignores a route whose AS_PATH contains its own AS (loop detection)', () => {
      const back = updates.find(s => s.to === 'origin')!
      expect(pathOf(back)).toContain(AS.origin)
      const i = f.steps.indexOf(back)
      expect(f.steps[i + 1].from).toBe('origin')
      expect(field(f.steps[i + 1], 'local AS')).toBe(String(AS.origin))
      expect(field(f.steps[i + 1], 'received AS_PATH')).toBe(pathOf(back).join(' '))
      expect(dataAt(f, i + 1).origin.items.join(' ')).toMatch(/loop: dropped/)
      // No other update loops back to its own sender or the receiver.
      for (const s of updates.filter(u => u !== back)) expect(pathOf(s), `${s.from} to ${s.to}`).not.toContain(AS[s.to])
    })

    it('lists the decision steps in RFC 4271 order', () => {
      const step = f.steps.find(s => field(s, 'decision order'))!
      expect(field(step, 'decision order')!.split('; ')).toEqual([
        'highest LOCAL_PREF', 'shortest AS_PATH', 'lowest ORIGIN', 'lowest MED (same neighbour AS)', 'eBGP over iBGP',
        'lowest IGP cost to NEXT_HOP', 'lowest BGP Identifier', 'lowest peer address',
      ])
    })

    it('the card chooses the route the decision process chooses, and it is decided by AS_PATH length', () => {
      const i = f.steps.findIndex(s => field(s, 'decision order'))
      const card = dataAt(f, i).cust.items
      const parse = (letter: string) => card.find(l => l.startsWith(`${letter} `))!.slice(2).split(' ').map(Number)
      const pref = card.find(l => l.startsWith('LOCAL_PREF'))!.replace('LOCAL_PREF ', '').split(', ').map(Number)
      const origin = card.find(l => l.startsWith('ORIGIN'))!.replace('ORIGIN ', '').split(', ').map(x => ORIGIN[x as keyof typeof ORIGIN])
      const [idA, idB] = field(f.steps[i], 'BGP Identifier A, B')!.split(', ')
      const A = route({ name: 'A', path: parse('A'), localPref: pref[0], origin: origin[0], id: idA, peer: idA })
      const B = route({ name: 'B', path: parse('B'), localPref: pref[1], origin: origin[1], id: idB, peer: idB })
      expect(A.path).toEqual(updates.find(s => s.to === 'cust' && s.from === 'isp1')!.fields!.find(x => x.name === 'AS_PATH')!.value.split(' ').map(Number))
      expect(B.path).toEqual(updates.find(s => s.to === 'cust' && s.from === 'isp2')!.fields!.find(x => x.name === 'AS_PATH')!.value.split(' ').map(Number))
      const { best, by } = decide([A, B])
      expect(card.find(l => l.startsWith('best '))).toMatch(new RegExp(`^best ${best.name}: path ${A.path.length} < ${B.path.length}$`))
      expect(by).toBe('shortest AS_PATH')
      expect([A.path.length, B.path.length]).toEqual([2, 3])
      // The traffic then follows route A: its next hop is isp1 and the packet goes there.
      const pk = f.steps.find(s => s.label.startsWith('Packet'))!
      expect(pk.to).toBe('isp1')
      expect(field(pk, 'next hop')).toBe(field(updates.find(s => s.from === 'isp1' && s.to === 'cust')!, 'NEXT_HOP'))
      // Had the paths been equal, the lowest BGP Identifier would have won, and that is isp1.
      const tied = decide([{ ...A, path: [AS.isp1, AS.origin] }, { ...B, path: [AS.isp2, AS.origin] }])
      expect([tied.best.name, tied.by]).toEqual(['A', 'lowest BGP Identifier'])
    })

    it('forwards the packet to the origin along the route that was chosen', () => {
      const pk = f.steps.filter(s => s.label.startsWith('Packet'))
      expect(pk.map(s => [s.from, s.to])).toEqual([['cust', 'isp1'], ['isp1', 'origin']])
      for (const s of pk) expect(inPrefix(field(s, 'destination')!, '198.51.100.0/24')).toBe(true)
    })
  })

  describe('the decision process model', () => {
    it('applies the criteria in order: an earlier one wins even when every later one disagrees', () => {
      const base = { name: 'x' }
      const hi = route({ ...base, name: 'hi', localPref: 200, path: [1, 2, 3, 4], origin: ORIGIN.INCOMPLETE, med: 50, ebgp: false, igp: 90, id: '192.0.2.99', peer: '192.0.2.99' })
      const lo = route({ ...base, name: 'lo' })
      expect(decide([hi, lo])).toMatchObject({ by: 'highest LOCAL_PREF', best: { name: 'hi' } })
      const short = route({ name: 'short', path: [1, 2], origin: ORIGIN.INCOMPLETE, med: 50, ebgp: false, igp: 90 })
      expect(decide([short, route({ name: 'long', path: [1, 2, 3] })])).toMatchObject({ by: 'shortest AS_PATH', best: { name: 'short' } })
      expect(decide([route({ name: 'igp' }), route({ name: 'inc', origin: ORIGIN.INCOMPLETE })])).toMatchObject({ by: 'lowest ORIGIN', best: { name: 'igp' } })
      expect(decide([route({ name: 'e', med: 10 }), route({ name: 'f', med: 5 })])).toMatchObject({ by: 'lowest MED', best: { name: 'f' } })
      // MED is only comparable between routes from the same neighbouring AS.
      expect(decide([route({ name: 'a', path: [64501, 1], med: 10, id: '192.0.2.2', peer: '192.0.2.2' }), route({ name: 'b', path: [64502, 1], med: 5, id: '192.0.2.6', peer: '192.0.2.6' })]))
        .toMatchObject({ by: 'lowest BGP Identifier', best: { name: 'a' } })
      expect(decide([route({ name: 'i', ebgp: false }), route({ name: 'e' })])).toMatchObject({ by: 'eBGP over iBGP', best: { name: 'e' } })
      expect(decide([route({ name: 'far', igp: 20 }), route({ name: 'near', igp: 10 })])).toMatchObject({ by: 'lowest IGP cost', best: { name: 'near' } })
      expect(decide([route({ name: 'x', id: '192.0.2.9', peer: '192.0.2.1' }), route({ name: 'y', id: '192.0.2.5', peer: '192.0.2.8' })])).toMatchObject({ by: 'lowest BGP Identifier', best: { name: 'y' } })
      expect(decide([route({ name: 'p', peer: '192.0.2.8' }), route({ name: 'q', peer: '192.0.2.3' })])).toMatchObject({ by: 'lowest peer address', best: { name: 'q' } })
    })
  })

  describe('the hijack flow', () => {
    const f = flowOf('hijack')
    const tableAt = (i: number) => dataAt(f, i).cust.items

    it('a /25 from the wrong AS and its path: the hijacker origin is not the owner, the ISP prepends its own AS', () => {
      const bad = f.steps.find(s => s.from === 'bad')!
      expect(field(bad, 'NLRI')).toBe('198.51.100.0/25')
      expect(field(bad, 'AS_PATH')).toBe(String(AS.bad))
      const fwd = f.steps.find(s => s.from === 'isp2' && s.to === 'cust' && field(s, 'message'))!
      expect(field(fwd, 'AS_PATH')).toBe(`${AS.isp2} ${AS.bad}`)
      expect(parseCidr('198.51.100.0/25').len).toBeGreaterThan(parseCidr('198.51.100.0/24').len)
      expect(inPrefix('198.51.100.0', '198.51.100.0/24') && inPrefix('198.51.100.127', '198.51.100.0/25') && !inPrefix('198.51.100.128', '198.51.100.0/25')).toBe(true)
    })

    it('every packet follows the longest prefix match of the table the customer has at that moment', () => {
      f.steps.forEach((s, i) => {
        if (s.from !== 'cust' || !s.label.startsWith('Packet')) return
        const dst = field(s, 'destination')!
        const target = lpm(tableAt(i), dst)
        expect(s.to, `step ${i + 1}: ${dst}`).toBe(target)
      })
      const packets = f.steps.filter(s => s.from === 'cust' && s.label.startsWith('Packet'))
      expect(packets.map(s => [field(s, 'destination'), s.to])).toEqual([['198.51.100.7', 'isp2'], ['198.51.100.200', 'isp1'], ['198.51.100.7', 'isp1']])
    })

    it('the more specific route takes the lower half only: the /25 covers .0 to .127, the /24 keeps the rest', () => {
      const i = f.steps.findIndex(s => s.label.startsWith('Longest'))
      const table = tableAt(i)
      expect(table).toEqual(['198.51.100.0/24 isp1', '198.51.100.0/25 isp2'])
      for (let host = 0; host < 256; host++) expect(lpm(table, `198.51.100.${host}`), `.${host}`).toBe(host < 128 ? 'isp2' : 'isp1')
      expect(field(f.steps[i], '198.51.100.7')).toMatch(/via isp2/)
      expect(field(f.steps[i], '198.51.100.200')).toMatch(/via isp1/)
    })

    it('the traffic reaches the hijacker for .7 and the origin once the route is Invalid', () => {
      const labels = f.steps.map(s => `${s.from}>${s.to} ${s.label}`)
      expect(labels).toContain('isp2>bad Packet to 198.51.100.7')
      expect(f.steps.at(-1)).toMatchObject({ from: 'isp1', to: 'origin' })
      expect(f.steps.some(s => s.from === 'bad' && s.to !== 'isp2')).toBe(false)
    })

    it('the ROV step recomputes: covered but not matched is Invalid, and the table loses the /25', () => {
      const i = f.steps.findIndex(s => field(s, 'validation state'))
      const s = f.steps[i]
      const [prefix, maxLen, asn] = field(s, 'VRP (illustrative ROA)')!.match(/^(\S+), maxLength (\d+), AS (\d+)$/)!.slice(1)
      const vrps: Vrp[] = [{ prefix, maxLength: Number(maxLen), asn: Number(asn) }]
      const [rp, ras] = field(s, 'route')!.match(/^(\S+), origin AS (\d+)$/)!.slice(1)
      expect(validate({ prefix: rp, asn: Number(ras) }, vrps)).toBe(field(s, 'validation state'))
      expect(field(s, 'validation state')).toBe('Invalid')
      expect(tableAt(i)).toEqual(['198.51.100.0/24 isp1'])
      // The RFC 6811 outcomes around it.
      expect(validate({ prefix: '198.51.100.0/24', asn: AS.origin }, vrps)).toBe('Valid')
      expect(validate({ prefix: '198.51.100.0/24', asn: AS.bad }, vrps)).toBe('Invalid')
      expect(validate({ prefix: '198.51.100.0/25', asn: AS.origin }, vrps)).toBe('Invalid')   // right AS, too specific for the maxLength
      expect(validate({ prefix: '198.51.100.0/25', asn: AS.bad }, vrps)).toBe('Invalid')
      expect(validate({ prefix: '203.0.113.0/24', asn: AS.cust }, vrps)).toBe('NotFound')
      expect(validate({ prefix: '198.51.100.0/25', asn: AS.origin }, [{ ...vrps[0], maxLength: 25 }])).toBe('Valid')
      expect(Number(asn)).toBe(AS.origin)
      expect(Number(ras)).toBe(AS.bad)
    })

    it('the lines about filters name the RFC 7454 recommendations that were read', () => {
      const i = f.steps.findIndex(s => s.label.startsWith('No filter'))
      expect(f.steps[i].detail).toMatch(/RFC 7454/)
      expect(f.steps[i].detail).toMatch(/longer than \/24/)
      expect(f.steps[i].fields!.find(x => x.name === 'prefix length filter')!.note).toMatch(/longer than \/24/)
    })
  })

  it('a flow that has states keeps every actor Established outside the session flow', () => {
    for (const id of ['bestpath', 'hijack']) for (const s of flowOf(id).steps) for (const v of Object.values(s.state ?? {})) expect(v, id).toBe('Established')
  })
})
