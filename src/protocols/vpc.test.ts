// VPC module: route table longest prefix match, the NAT translation per flow (the reply is translated back), security group
// statefulness versus network ACL statelessness, and NACL rule order are recomputed from the fields and cards the timeline shows.
import { describe, expect, it } from 'vitest'
import { PROTOCOLS } from '.'
import { dataAt, rttTimes } from '../model/protocol'
import type { Flow, Step } from '../model/schema'

const vpc = PROTOCOLS.find(p => p.id === 'vpc')!
const flowOf = (id: string): Flow => vpc.flows.find(f => f.id === id)!
const field = (s: Step, name: string) => s.fields?.find(x => x.name === name)?.value

// ---- addresses ------------------------------------------------------------------------------------------------------
const ipNum = (ip: string) => ip.split('.').reduce((a, o) => a * 256 + Number(o), 0)
const parseCidr = (c: string) => { const [ip, len] = c.split('/'); return { net: ipNum(ip), len: Number(len) } }
const inCidr = (ip: string, c: string) => { const { net, len } = parseCidr(c); const shift = 2 ** (32 - len); return Math.floor(ipNum(ip) / shift) === Math.floor(net / shift) }
const ep = (s: string) => { const [ip, port] = s.split(':'); return { ip, port: Number(port) } }
const PUBLIC_RANGES = ['192.0.2.0/24', '198.51.100.0/24', '203.0.113.0/24']   // RFC 5737
const VPC_CIDR = '10.0.0.0/16'

/** Longest prefix match over route lines "10.0.0.0/16 local": the target of the most specific route that contains the address. */
function lookup(routes: string[], ip: string): string | undefined {
  const hits = routes.map(l => l.split(' ')).filter(([c]) => inCidr(ip, c))
  hits.sort((a, b) => parseCidr(b[0]).len - parseCidr(a[0]).len)
  return hits[0]?.[1]
}

// ---- network ACL (stateless, ordered) and security group (stateful, unordered) ---------------------------------------
interface Rule { num: number; allow: boolean; proto: 'tcp' | 'all'; from: number; to: number; cidr: string }
const parseRule = (name: string, value: string): { dir: 'in' | 'out'; rule: Rule } => {
  const [, dir, num] = name.match(/^NACL (in|out) (\d+|\*)$/)!
  const m = value.match(/^(ALLOW|DENY) (all|tcp (\d+)(?:-(\d+))?) (?:from|to) (\S+)$/)!
  const tcp = m[2] !== 'all'
  return { dir: dir as 'in' | 'out', rule: { num: num === '*' ? Infinity : Number(num), allow: m[1] === 'ALLOW', proto: tcp ? 'tcp' : 'all', from: tcp ? Number(m[3]) : 0, to: tcp ? Number(m[4] ?? m[3]) : 65535, cidr: m[5] } }
}
/** Rules in force after step `upTo`, from every "NACL in 100" style field up to then. */
const rulesAt = (f: Flow, upTo: number) => {
  const out: Record<'in' | 'out', Rule[]> = { in: [], out: [] }
  f.steps.slice(0, upTo + 1).forEach(s => s.fields?.forEach(x => {
    if (!/^NACL (in|out) (\d+|\*)$/.test(x.name)) return
    const { dir, rule } = parseRule(x.name, x.value)
    out[dir] = [...out[dir].filter(r => r.num !== rule.num), rule]
  }))
  return out
}
/** Lowest numbered rule that matches decides; no match is the catch-all deny. `port` is the destination port, `peer` the other address. */
function nacl(rules: Rule[], port: number, peer: string): { allow: boolean; rule: number } {
  const hit = [...rules].sort((a, b) => a.num - b.num).find(r => (r.proto === 'all' || (port >= r.from && port <= r.to)) && inCidr(peer, r.cidr))
  return hit ? { allow: hit.allow, rule: hit.num } : { allow: false, rule: Infinity }
}
const verdict = (v: { allow: boolean; rule: number }) => `${v.allow ? 'ALLOW' : 'DENY'} by rule ${v.rule === Infinity ? '*' : v.rule}`

describe('vpc module', () => {
  it('is the seventeenth module, in Network, medium, citing the AWS VPC documentation as the reference', () => {
    expect(vpc.meta.order).toBe(17)
    expect(vpc.meta.section).toBe('Network')
    expect(vpc.meta.difficulty).toBe('medium')
    expect(vpc.meta.layout).toBeUndefined()
    expect(vpc.meta.source).toMatch(/AWS VPC User Guide/)
    expect(vpc.meta.source).toMatch(/AWS behaviour is the reference/)
    expect(vpc.meta.source).toMatch(/RFC 5737/)
    expect(vpc.flows.map(f => f.id)).toEqual(['private-out', 'public-igw', 'blocked'])
    expect(vpc.flows.map(f => f.steps.length)).toEqual([14, 13, 13])
    expect(vpc.nodes.map(n => n.id)).toEqual(['priv', 'nat', 'pub', 'igw', 'host'])
    expect(vpc.notes).toHaveLength(5)
    expect(vpc.questions).toHaveLength(6)
    for (const q of vpc.questions) expect(q.a.split(/(?<=[.!?])\s+(?=[A-Z])/).length, q.id).toBeLessThanOrEqual(4)
  })

  it('says its values are illustrative, keeps cards within 21 characters and 6 lines, and labels short', () => {
    expect(vpc.meta.summary).toMatch(/illustrative/)
    for (const f of vpc.flows) expect(f.summary, f.id).toMatch(/[Ii]llustrative/)
    for (const f of vpc.flows) for (const [i, s] of f.steps.entries()) {
      expect(s.label.length, `${f.id} ${i + 1}: ${s.label}`).toBeLessThanOrEqual(30)
      for (const [id, v] of Object.entries(s.data ?? {})) {
        expect(v.items.length, `${f.id} ${i + 1} ${id}`).toBeLessThanOrEqual(6)
        for (const t of [v.title ?? '', ...v.items]) expect(t.length, `${f.id} ${i + 1} ${id}: ${t}`).toBeLessThanOrEqual(21)
      }
    }
  })

  it('every address is a documentation address on the public side or a private 10.0.0.0/16 address inside', () => {
    const text = JSON.stringify(vpc).replace(/RFC \d+/g, '')
    for (const m of text.matchAll(/\b(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})(?:\/\d+)?\b/g)) {
      const ip = m[1]
      if (ip === '0.0.0.0') continue
      expect(PUBLIC_RANGES.some(c => inCidr(ip, c)) || inCidr(ip, VPC_CIDR), m[0]).toBe(true)
    }
  })

  describe('route tables', () => {
    it('longest prefix match: the VPC range stays local, everything else takes 0.0.0.0/0, a more specific route wins', () => {
      const priv = dataAt(flowOf('private-out'), 0).priv.items
      expect(priv).toEqual(['10.0.0.0/16 local', '0.0.0.0/0 nat-gw'])
      expect(lookup(priv, '198.51.100.20')).toBe('nat-gw')
      expect(lookup(priv, '10.0.0.30')).toBe('local')
      const pub = dataAt(flowOf('public-igw'), 0).pub.items
      expect(lookup(pub, '198.51.100.20')).toBe('igw')
      expect(lookup(pub, '10.0.1.25')).toBe('local')
      // AWS route priority example: a /32 has priority over a /24, which has priority over 0.0.0.0/0.
      expect(lookup(['10.10.2.0/24 a', '10.10.2.15/32 b', '0.0.0.0/0 c'], '10.10.2.15')).toBe('b')
      expect(lookup(['10.10.2.0/24 a', '10.10.2.15/32 b', '0.0.0.0/0 c'], '10.10.2.16')).toBe('a')
      expect(lookup(['10.10.2.0/24 a', '10.10.2.15/32 b', '0.0.0.0/0 c'], '8.8.8.8')).toBe('c')
    })

    it('the route lookup step names the destination and the target the table gives', () => {
      for (const [id, actor, target] of [['private-out', 'priv', 'nat-gw'], ['public-igw', 'pub', 'igw']] as const) {
        const f = flowOf(id), s = f.steps[0]
        expect(lookup(dataAt(f, 0)[actor].items, field(s, 'destination')!)).toBe(target)
        expect(field(s, 'target')).toBe(target)
      }
    })
  })

  describe('NAT gateway flow', () => {
    const f = flowOf('private-out')
    const at = (label: RegExp) => f.steps.findIndex(s => label.test(s.label))
    const src = (i: number) => ep(field(f.steps[i], 'src')!), dst = (i: number) => ep(field(f.steps[i], 'dst')!)

    it('translates the source twice on the way out: instance to NAT private address and port, then to the Elastic IP', () => {
      const [a, b, c] = [1, 3, 5]
      expect(f.steps[a]).toMatchObject({ from: 'priv', to: 'nat' })
      expect(f.steps[b]).toMatchObject({ from: 'nat', to: 'igw' })
      expect(f.steps[c]).toMatchObject({ from: 'igw', to: 'host' })
      const table = dataAt(f, 2).nat.items
      const orig = ep(table[0]), mapped = ep(table[1].replace('as ', ''))
      expect(src(a)).toEqual(orig)
      expect(src(b)).toEqual(mapped)
      const eip = dataAt(f, 4).igw.items.map(l => l.split(' '))
      expect(eip).toEqual([['private', mapped.ip], ['public', src(c).ip]])
      expect(src(c).port).toBe(mapped.port)
      // The destination never changes on the way out.
      for (const i of [a, b, c]) expect(dst(i)).toEqual({ ip: '198.51.100.20', port: 443 })
      // The instance and the gateway private address are inside the VPC; the Elastic IP is a public address.
      expect(inCidr(orig.ip, VPC_CIDR) && inCidr(mapped.ip, VPC_CIDR)).toBe(true)
      expect(inCidr(src(c).ip, VPC_CIDR)).toBe(false)
      expect(mapped.port).toBeGreaterThanOrEqual(1024)   // a NAT gateway uses ports 1024 to 65535
      expect(mapped.port).toBeLessThanOrEqual(65535)
    })

    it('translates the reply back through the same two mappings, so the instance sees the host it called', () => {
      const out = [1, 3, 5], back = [6, 8, 10]
      expect(back.map(i => [f.steps[i].from, f.steps[i].to])).toEqual([['host', 'igw'], ['igw', 'nat'], ['nat', 'priv']])
      // The reply goes to the mapped endpoints in reverse order and always comes from the host.
      expect(dst(6)).toEqual(src(out[2]))
      expect(dst(8)).toEqual(src(out[1]))
      expect(dst(10)).toEqual(src(out[0]))
      for (const i of back) expect(src(i)).toEqual({ ip: '198.51.100.20', port: 443 })
      for (const i of back) expect(field(f.steps[i], 'flags')).toBe('SYN, ACK')
      // The lookup step reads the port from the table the card shows.
      const lookupStep = f.steps[at(/^Lookup/)]
      expect(field(lookupStep, 'lookup')).toBe(`port ${dst(8).port}`)
      expect(field(lookupStep, 'result')).toBe(dataAt(f, 2).nat.items[0])
    })

    it('an unsolicited connection from the internet finds no entry: no table port equals the destination port', () => {
      const i = f.steps.findIndex(s => s.label.startsWith('Unsolicited'))
      const eipIp = src(5).ip
      expect(dst(i).ip).toBe(eipIp)
      const arriving = dst(i + 1)
      expect(arriving.ip).toBe(ep(dataAt(f, 2).nat.items[1].replace('as ', '')).ip)
      const mappedPorts = [ep(dataAt(f, 2).nat.items[1].replace('as ', '')).port]
      expect(mappedPorts).not.toContain(arriving.port)
      const drop = f.steps[i + 2]
      expect(drop).toMatchObject({ from: 'nat', to: 'nat' })
      expect(field(drop, 'result')).toMatch(/no entry/)
      expect(field(drop, 'lookup')).toBe(`port ${arriving.port}`)
      // The flow ends there: nothing is delivered to the private instance.
      expect(f.steps.slice(i).some(s => s.to === 'priv')).toBe(false)
    })

    it('the connection goes through the NAT gateway before the internet gateway, and the round trip to the host is 1 RTT', () => {
      const t = rttTimes(f.steps)
      const first = f.steps.findIndex(s => s.label.startsWith('SYN to')), reply = f.steps.findIndex(s => s.label.endsWith(':41000'))
      expect(f.steps.map(s => s.to).indexOf('nat')).toBeLessThan(f.steps.map(s => s.to).indexOf('igw'))
      expect(t[reply] - (t[first] - 0.025)).toBeCloseTo(1, 5)   // from the SYN leaving to the reply arriving
    })

    it('the TCP states of the instance follow the handshake', () => {
      expect(f.steps.flatMap(s => (s.state?.priv ? [s.state.priv] : []))).toEqual(['CLOSED', 'SYN_SENT', 'ESTABLISHED'])
    })
  })

  describe('internet gateway flow', () => {
    const f = flowOf('public-igw')
    const src = (i: number) => ep(field(f.steps[i], 'src')!), dst = (i: number) => ep(field(f.steps[i], 'dst')!)
    const map = dataAt(f, 2).igw.items.map(l => l.split(' ')[1])   // private, public

    it('one-to-one NAT: the source private address becomes the public one on the way out, and back for replies, ports untouched', () => {
      const [priv, pubIp] = map
      expect([priv, pubIp]).toEqual(['10.0.0.30', '203.0.113.77'])
      // outgoing connection
      expect([src(1).ip, src(3).ip]).toEqual([priv, pubIp])
      expect(src(3).port).toBe(src(1).port)
      expect([dst(4).ip, dst(6).ip]).toEqual([pubIp, priv])
      expect(dst(6).port).toBe(dst(4).port)
      // inbound connection
      expect([dst(7).ip, dst(9).ip]).toEqual([pubIp, priv])
      expect([src(10).ip, src(12).ip]).toEqual([priv, pubIp])
      expect(dst(9).port).toBe(dst(7).port)
      expect(src(12).port).toBe(src(10).port)
      // The packets before and after the translation travel in the same direction, and the instance only ever sees private addresses.
      for (const i of [1, 6, 9, 10]) expect(inCidr(field(f.steps[i], 'src')!.split(':')[0], VPC_CIDR) || inCidr(field(f.steps[i], 'dst')!.split(':')[0], VPC_CIDR), `step ${i + 1}`).toBe(true)
      for (const s of f.steps) if (s.kind !== 'local' && (s.from === 'pub' || s.to === 'pub')) {
        const instanceSide = s.from === 'pub' ? src(f.steps.indexOf(s)) : dst(f.steps.indexOf(s))
        expect(instanceSide.ip, s.label).toBe(priv)
      }
    })

    it('the public address appears only between the internet gateway and the host', () => {
      f.steps.forEach((s, i) => {
        if (s.kind === 'local') return
        const internetSide = (s.from === 'igw' && s.to === 'host') || (s.from === 'host' && s.to === 'igw')
        const ips = [field(s, 'src'), field(s, 'dst')].map(x => ep(x!).ip)
        expect(ips.includes('203.0.113.77'), `step ${i + 1}`).toBe(internetSide)
        expect(ips.includes('10.0.0.30'), `step ${i + 1}`).toBe(!internetSide)
      })
    })

    it('a private subnet route table has no route to the internet gateway, a public one has', () => {
      const pubRoutes = dataAt(f, 0).pub.items.map(l => l.split(' ')[1])
      const privRoutes = dataAt(flowOf('private-out'), 0).priv.items.map(l => l.split(' ')[1])
      expect(pubRoutes).toContain('igw')
      expect(privRoutes).not.toContain('igw')
    })

    it('a round trip to the host is 1 RTT in both directions', () => {
      const t = rttTimes(f.steps)
      expect(t[6] - (t[1] - 0.1 / 2)).toBeCloseTo(1, 5)
      expect(t[12] - (t[7] - 0.9 / 2)).toBeCloseTo(1, 5)
    })
  })

  describe('security group versus network ACL', () => {
    const f = flowOf('blocked')
    const src = (i: number) => ep(field(f.steps[i], 'src')!), dst = (i: number) => ep(field(f.steps[i], 'dst')!)
    const sg = dataAt(f, 0).pub.items.map(l => { const [dir, proto, port, cidr] = l.split(' '); return { dir, proto, port: Number(port), cidr } })

    it('the rules shown are the ones the verdicts use: every packet step carries the verdict the rule set gives', () => {
      f.steps.forEach((s, i) => {
        const v = field(s, 'NACL in verdict') ?? field(s, 'NACL out verdict')
        if (!v || s.kind === 'local') return   // the local step at the end is checked in the rule order test
        const inbound = s.from === 'igw' && s.to === 'pub'
        const rules = rulesAt(f, i)[inbound ? 'in' : 'out']
        const pkt = { port: dst(i).port, peer: inbound ? src(i).ip : dst(i).ip }
        const result = nacl(rules, pkt.port, pkt.peer)
        expect(v, `step ${i + 1}`).toBe(verdict(result))
        expect(!!s.lost, `step ${i + 1} lost`).toBe(!result.allow)   // dropped exactly when the ACL denies
      })
    })

    it('the stateless ACL drops the reply (destination port 52000 matches no outbound rule) and the fix is a range that contains it', () => {
      const lostStep = f.steps.findIndex(s => s.lost)
      expect(f.steps.filter(s => s.lost)).toHaveLength(1)
      expect(f.steps[lostStep]).toMatchObject({ from: 'pub', to: 'igw' })
      const clientPort = dst(lostStep).port
      expect(clientPort).toBe(52000)
      expect(clientPort).toBeGreaterThanOrEqual(49152)   // inside the Windows Server 2008 and later range, an example client
      const before = rulesAt(f, lostStep).out
      expect(before.filter(r => r.allow).every(r => clientPort < r.from || clientPort > r.to)).toBe(true)
      expect(nacl(before, clientPort, dst(lostStep).ip)).toEqual({ allow: false, rule: Infinity })
      const fixStep = f.steps.findIndex(s => field(s, 'NACL out 110'))
      expect(fixStep).toBeGreaterThan(lostStep)
      const after = rulesAt(f, fixStep).out
      expect(nacl(after, clientPort, dst(lostStep).ip)).toEqual({ allow: true, rule: 110 })
      // The reply that goes through after the fix is the same packet.
      const ok = f.steps.findIndex((s, i) => i > fixStep && s.from === 'pub' && s.to === 'igw')
      expect([src(ok), dst(ok)]).toEqual([src(lostStep), dst(lostStep)])
      // The range covers every ephemeral range AWS lists: Linux, Windows Server 2008 and later, ELB, NAT gateway, Lambda.
      const fix = rulesAt(f, fixStep).out.find(r => r.num === 110)!
      for (const [lo, hi] of [[32768, 61000], [49152, 65535], [1024, 65535]]) expect(lo >= fix.from && hi <= fix.to).toBe(true)
      // The old Windows range (to Server 2003) is covered too, which is why 1024 to 65535 is the practical choice.
      expect(1025 >= fix.from && 5000 <= fix.to).toBe(true)
    })

    it('the stateful security group lets the same reply out although no outbound rule matches it', () => {
      const out = sg.filter(r => r.dir === 'out'), inn = sg.filter(r => r.dir === 'in')
      expect(inn).toEqual([{ dir: 'in', proto: 'tcp', port: 443, cidr: '0.0.0.0/0' }])
      const syn = f.steps.findIndex((s, i) => i > 0 && s.from === 'igw' && s.to === 'pub')
      const allowedIn = inn.some(r => r.port === dst(syn).port && inCidr(src(syn).ip, r.cidr))
      expect(allowedIn).toBe(true)
      const replyAt = f.steps.findIndex(s => s.label === 'Security group: reply allowed')
      const [rs, rd] = field(f.steps[replyAt], 'reply')!.split(' to ')
      expect([ep(rs), ep(rd)]).toEqual([{ ip: src(f.steps.findIndex(s => s.lost)).ip, port: 443 }, dst(f.steps.findIndex(s => s.lost))])
      const matchesOutRule = out.some(r => ep(rd).port === r.port && inCidr(ep(rd).ip, r.cidr))
      expect(matchesOutRule).toBe(false)               // no outbound rule matches...
      expect(field(f.steps[replyAt], 'outbound rule matches')).toBe('none')
      expect(field(f.steps[replyAt], 'result')).toMatch(/^ALLOWED/)   // ...yet the reply is allowed, because the group is stateful
      // The same two rule sets behave differently: the ACL out rule 100 is the same single port 443 rule.
      const nacl100 = rulesAt(f, 0).out.find(r => r.num === 100)!
      expect([nacl100.from, nacl100.to]).toEqual([out[0].port, out[0].port])
    })

    it('rules are evaluated from the lowest number: a deny at 90 beats the allow at 100 for the same packet, and the catch-all comes last', () => {
      const last = f.steps.length - 1
      const s = f.steps[last]
      const [pIp, pPort] = field(s, 'packet')!.split(' to ')[0].split(':')
      const before = rulesAt(f, last - 1).in, after = rulesAt(f, last).in
      expect(nacl(before, 443, pIp)).toEqual({ allow: true, rule: 100 })
      expect(nacl(after, 443, pIp)).toEqual({ allow: false, rule: 90 })
      expect(Number(pPort)).toBe(52000)
      expect(field(s, 'NACL in verdict')).toBe(verdict(nacl(after, 443, pIp)))
      // A different client is still allowed by rule 100, and a deny numbered above the allow would never be reached.
      expect(nacl(after, 443, '203.0.113.9')).toEqual({ allow: true, rule: 100 })
      const wrongOrder = [...after.filter(r => r.num !== 90), { num: 105, allow: false, proto: 'tcp' as const, from: 443, to: 443, cidr: '198.51.100.20/32' }]
      expect(nacl(wrongOrder, 443, pIp)).toEqual({ allow: true, rule: 100 })
      // The catch-all has the highest possible number and denies; AWS numbers rules 1 to 32766.
      expect(after.at(-1)?.num ?? 0).toBeLessThanOrEqual(32766)
      expect(after.find(r => r.num === Infinity)).toMatchObject({ allow: false, cidr: '0.0.0.0/0' })
      expect(nacl(after, 22, '203.0.113.9')).toEqual({ allow: false, rule: Infinity })
    })

    it('the client retransmits after a fixed wait, 1 second (RFC 6298 initial RTO), whatever the distance', () => {
      const w = f.steps.find(s => s.wait !== undefined)!
      expect(w.wait).toBe(1000)
      expect(w.from).toBe('host')
      expect(f.steps.indexOf(w)).toBe(f.steps.findIndex(s => s.lost) + 1)
    })

    it('the inbound packets pass the network ACL before the instance sees them, and the instance TCP state follows', () => {
      const states = f.steps.flatMap(s => (s.state?.pub ? [s.state.pub] : []))
      expect(states).toEqual(['LISTEN', 'SYN_RCVD'])
      expect(f.steps.flatMap(s => (s.state?.host ? [s.state.host] : []))).toEqual(['CLOSED', 'SYN_SENT', 'ESTABLISHED'])
    })
  })
})
