import { describe, expect, it } from 'vitest'
import { LIBRARY } from '../library'
import { discussPrompt } from './discuss'
import { PROTOCOLS } from '../protocols'

const saas = LIBRARY.find(d => d.id === 'multi-tenant-saas')!

describe('discussPrompt', () => {
  it('tells the AI to answer about this design, cite step numbers and mark assumptions', () => {
    const p = discussPrompt(saas)
    expect(p).toContain('"Multi-tenant SaaS"')
    expect(p).toContain('source of truth')
    expect(p).toContain('THIS design')
    expect(p).toContain('the design does not specify this')
    expect(p).toContain('by number')
    expect(p).toContain('whole conversation')
  })

  it('names every flow up front, so the AI can confirm it saw them all', () => {
    const p = discussPrompt(saas)
    expect(p).toContain(`It has ${saas.nodes.length} components and ${saas.flows.length} request flows (${saas.flows.map(f => f.title).join('; ')}).`)
    for (const d of LIBRARY) for (const f of d.flows) expect(discussPrompt(d), `${d.id}: ${f.title}`).toContain(`Request flow: ${f.title}`)
  })

  it('tells the AI to confirm and wait when no question is given, and asks it when one is', () => {
    const wait = discussPrompt(saas)
    expect(wait.trimEnd().split('\n').at(-1)).toContain('I will send my questions in my next messages')
    expect(wait).toContain('do not suggest questions')
    expect(wait).not.toContain('## My question')
    const asked = discussPrompt(saas, { question: '  How does a tenant move to its own database?  ' })
    expect(asked.trimEnd().endsWith('## My question\nHow does a tenant move to its own database?')).toBe(true)
    expect(asked).not.toContain('What to do now')
    expect(discussPrompt(saas, { question: '   ' })).toContain('What to do now')
  })

  it('carries every component, connection, flow step and note of every library design', () => {
    for (const d of LIBRARY) {
      const p = discussPrompt(d)
      for (const n of d.nodes) expect(p, `${d.id}: component ${n.label}`).toContain(n.label)
      const label = (id: string) => d.nodes.find(n => n.id === id)!.label
      for (const e of d.edges) expect(p, `${d.id}: ${e.from} -> ${e.to}`).toContain(`${label(e.from)} -> ${label(e.to)}`)
      for (const f of d.flows) {
        expect(p).toContain(`Request flow: ${f.title}`)
        f.steps.forEach((s, i) => expect(p, `${d.id}/${f.id} step ${i + 1}`).toContain(`${i + 1}. [${s.kind}]`))
        for (const s of f.steps) expect(p).toContain(s.label)
      }
      for (const n of d.notes) expect(p, `${d.id}: note`).toContain(n.text)
      for (const q of d.questions) expect(p).toContain(q.q)
    }
  })

  it('flags the scenario being watched', () => {
    const f = saas.flows[1]
    const p = discussPrompt(saas, { flowId: f.id })
    expect(p).toContain(`Request flow: ${f.title}  <- the scenario I am watching right now`)
    expect(p.match(/the scenario I am watching right now/g)).toHaveLength(1)
    expect(discussPrompt(saas)).not.toContain('watching right now')
  })

  it('leaves the model answers out unless asked, and adds the JSON only when asked', () => {
    const q = saas.questions[0]
    expect(discussPrompt(saas)).not.toContain(q.a)
    expect(discussPrompt(saas)).toContain('answers left out on purpose')
    expect(discussPrompt(saas, { answers: true })).toContain(q.a)
    expect(discussPrompt(saas)).not.toContain('"schema": "archstory/v1"')
    expect(discussPrompt(saas, { json: true })).toContain('"schema": "archstory/v1"')
  })

  it('includes regions and on-premises details when the design has them', () => {
    const mr = discussPrompt(LIBRARY.find(d => d.id === 'multi-region-app')!)
    expect(mr).toContain('## Regions and disaster recovery')
    expect(mr).toMatch(/RTO .*RPO/)
    expect(discussPrompt(LIBRARY.find(d => d.id === 'cloud-migration')!)).toContain('Runs on premises')
  })

  it('uses no em or en dashes in the text it writes', () => {
    const skeleton = discussPrompt({ ...saas, meta: { ...saas.meta, summary: '' }, requirements: { functional: [], nonFunctional: [], scale: [] }, nodes: [{ id: 'a', label: 'A', kind: 'service' }], edges: [], flows: [], notes: [], questions: [], observability: undefined, network: undefined, regions: undefined })
    expect(skeleton).not.toMatch(/[—–]/)
  })
})

describe('discussPrompt for a protocol (Under the hood)', () => {
  const tcp = PROTOCOLS.find(d => d.id === 'tcp')!
  const dns = PROTOCOLS.find(d => d.id === 'dns')!

  it('uses protocol wording, not system design wording', () => {
    const p = discussPrompt(dns)
    expect(p.startsWith('I am studying how DNS works')).toBe(true)
    expect(p).not.toContain('system design')
    expect(p).toContain(`It has ${dns.nodes.length} actors and ${dns.flows.length} scenarios (${dns.flows.map(f => f.title).join('; ')}).`)
    expect(p).toContain('## Key ideas\nWhat it does:')
    expect(p).toContain('Gotchas:')
    expect(p).toContain('By the numbers:')
    expect(p).toContain('## Actors')
    expect(p).not.toContain('## Requirements')
    expect(p).not.toContain('## Components')
    expect(p).not.toContain('## Network')
    expect(p).not.toContain('## Monitoring')
    expect(p).not.toContain('Request flow:')
    expect(p).toContain('Sources: RFC 1034')
    expect(p.trimEnd().split('\n').at(-1)).toContain('I will send my questions in my next messages')
    expect(p).toContain('saying how many actors and scenarios it has')
  })

  it('walks every message with its time, fields on the wire and the state after it', () => {
    const p = discussPrompt(tcp)
    for (const f of tcp.flows) expect(p).toContain(`## Scenario: ${f.title}`)
    expect(p).toContain('2. [req] Client -> Server: SYN seq=1000 (at 0.5 RTT, 25 ms)')
    expect(p).toContain('3. [res] Server -> Client: SYN, ACK seq=5000 ack=1001 (at 1 RTT, 50 ms)')
    expect(p).toContain('On the wire: flags = SYN, ACK (Two jobs in one segment')
    expect(p).toContain('ack = 1001 (1000 + 1')
    expect(p).toContain('State after this step: Client SYN_SENT, Server SYN_RCVD')
    expect(p).toContain('Total: 3.5 RTT, 175 ms.')
    for (const q of tcp.questions) expect(p).toContain(q.q)
    expect(p).not.toContain(tcp.questions[0].a)
    expect(discussPrompt(tcp, { answers: true })).toContain(tcp.questions[0].a)
  })

  it('flags the watched scenario, takes a first question, and stays free of em and en dashes', () => {
    const p = discussPrompt(dns, { flowId: 'nxdomain', question: 'Why 300 seconds?' })
    expect(p).toContain('## Scenario: NXDOMAIN and negative caching  <- the scenario I am watching right now')
    expect(p.trimEnd().endsWith('## My question\nWhy 300 seconds?')).toBe(true)
    for (const d of PROTOCOLS) expect(discussPrompt(d, { answers: true }), d.id).not.toMatch(/[—–]/)
  })

  it('adds fields and state to a system design walkthrough only when its steps have them', () => {
    expect(discussPrompt(saas)).not.toContain('On the wire:')
    const f = saas.flows[0]
    const withWire = { ...saas, flows: [{ ...f, steps: [{ ...f.steps[0], fields: [{ name: 'method', value: 'GET' }] }, ...f.steps.slice(1)] }] }
    expect(discussPrompt(withWire)).toContain('On the wire: method = GET')
  })
})

describe('discussPrompt: lost messages, data views and milliseconds (Under the hood)', () => {
  const tcp = PROTOCOLS.find(d => d.id === 'tcp')!
  const ring = PROTOCOLS.find(d => d.id === 'hashring')!

  it('lists each step\'s data views as "Data after this step: node (title): item, item"', () => {
    const p = discussPrompt(ring)
    expect(p).toContain('Data after this step: Node A (ring): token 8, owns (85,8], keys: k1 k8')
    // marked items say they changed
    expect(p).toMatch(/Data after this step: Node C \(ring\): token 60, owns \(33,60\], keys: k4 k5 \[changed\]/)
    expect(p).toContain('Data after this step: Client (lookup): k5 hashes to 53 [changed]')
    // several actors on one line, separated by semicolons
    expect(p).toMatch(/Data after this step: Client \(keys\): k1 5, k2 18, k3 29, k4 41, k5 53, k6 66, k7 78, k8 92; Node A \(ring\)/)
    // every step that has data gets exactly one such line
    const steps = ring.flows.flatMap(f => f.steps).filter(s => s.data && Object.keys(s.data).length)
    expect(p.match(/Data after this step:/g)).toHaveLength(steps.length)
  })

  it('says "empty" for a data view with no items, and leaves steps without data alone', () => {
    const d = structuredClone(ring)
    d.flows[0].steps[0].data = { a: { items: [] } }
    expect(discussPrompt(d)).toContain('Data after this step: Node A: empty')
    expect(discussPrompt(tcp)).not.toContain('Data after this step')
    expect(discussPrompt(PROTOCOLS.find(x => x.id === 'dns')!)).not.toContain('Data after this step')
  })

  it('marks a lost message instead of giving it a time, and explains what "lost" means', () => {
    const p = discussPrompt(tcp)
    expect(p).toMatch(/\[res\] Server -> Client: Segment 2 seq=6461 \(lost: never arrives\)/)
    expect(p).toContain('A step marked "lost" is sent but never arrives')
    expect(p).toContain('Silence: waiting 1 s for the RTO (at 23 RTT, 1.15 s)')
    expect(p).toContain('Total: 64 RTT, 3.2 s.')
  })

  it('gives milliseconds for the module\'s reference round trip, and says what it is', () => {
    expect(discussPrompt(tcp)).toContain('Times below assume a reference round trip time of 50 ms.')
    expect(discussPrompt(tcp)).toContain('Milliseconds are for the reference round trip time given below.')
    const d = structuredClone(tcp)
    d.meta.rtt = 80
    expect(discussPrompt(d)).toContain('reference round trip time of 80 ms')
    expect(discussPrompt(d)).toContain('(at 0.5 RTT, 40 ms)')
  })

  it('does not change a system design prompt', () => {
    const p = discussPrompt(saas)
    expect(p).not.toContain('Data after this step')
    expect(p).not.toContain('reference round trip')
  })
})
