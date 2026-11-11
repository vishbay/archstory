import { describe, expect, it } from 'vitest'
import { LIBRARY } from '../library'
import { addFlow, addNode, appendStep, blankAttempt, connect, removeNode, stepKindFor, stepProblem } from './attempt'
import { runChecks } from './checks'
import type { Design } from '../model/schema'

const url = LIBRARY.find(d => d.id === 'url-shortener')!

/** Build an attempt from a list of kinds, returning ids in the same order. */
function build(kinds: string[]): { d: Design; ids: string[] } {
  let d = blankAttempt(url)
  const ids: string[] = []
  for (const k of kinds) { const r = addNode(d, k); d = r.design; ids.push(r.id) }
  return { d, ids }
}

describe('attempt editing', () => {
  it('gives unique ids and labels to repeated kinds', () => {
    const { d, ids } = build(['service', 'service'])
    expect(ids).toEqual(['service', 'service_2'])
    expect(d.nodes.map(n => n.label)).toEqual(['Service', 'Service 2'])
  })
  it('ignores self-loops and duplicate connections in either direction', () => {
    const { d, ids: [a, b] } = build(['service', 'cache'])
    const once = connect(d, a, b)
    expect(connect(connect(once, b, a), a, a).edges).toHaveLength(1)
  })
  it('infers step kinds from the drawing and flags hops with no connection', () => {
    const { d: d0, ids: [c, lb, svc, db] } = build(['web_client', 'load_balancer', 'service', 'sql_db'])
    let d = connect(connect(d0, c, lb), lb, svc)
    expect(stepKindFor(d, c, lb)).toBe('req')
    expect(stepKindFor(d, lb, c)).toBe('res')
    expect(stepKindFor(d, svc, svc)).toBe('local')
    const f = addFlow(d); d = f.design
    d = appendStep(appendStep(d, f.id, c, lb), f.id, svc, db)
    expect(stepProblem(d, d.flows[0].steps[0])).toBeNull()
    expect(stepProblem(d, d.flows[0].steps[1])).toBe('No connection between Service and SQL database')
  })
  it('removing a component removes its edges and flow steps', () => {
    const { d: d0, ids: [a, b] } = build(['service', 'cache'])
    let d = connect(d0, a, b); const f = addFlow(d); d = appendStep(f.design, f.id, a, b)
    const out = removeNode(d, b)
    expect(out.edges).toEqual([]); expect(out.flows[0].steps).toEqual([])
  })
})

describe('reference without flows', () => {
  const flowless = { ...chat0(), flows: [] }
  function chat0() { return LIBRARY.find(x => x.id === 'chat')! }
  const { d, ids: [c, lb, svc] } = build(['web_client', 'load_balancer', 'service'])
  const att = connect(connect(d, c, lb), lb, svc)
  it('says flows are not compared, once, and still asks for the learner\'s own flow', () => {
    const r = runChecks(att, flowless).checks
    expect(r.filter(x => x.id === 'flow-count')).toEqual([expect.objectContaining({ level: 'info' })])
    expect(r.find(x => x.id === 'flows')?.level).toBe('fail')
  })
  it('treats a reference with only empty flows the same way, and keeps component checks', () => {
    const emptyFlows = { ...flowless, flows: [{ id: 'f', title: 'Empty', steps: [] }] as Design['flows'] }
    const r = runChecks(att, emptyFlows).checks
    expect(r.some(x => x.id === 'flow-count' && /no request flows/.test(x.title))).toBe(true)
    expect(r.some(x => x.id.startsWith('has:'))).toBe(true)
  })
})

describe('monitoring check', () => {
  const chat = LIBRARY.find(x => x.id === 'chat')!
  const base = () => { const { d, ids: [c, lb, svc] } = build(['web_client', 'load_balancer', 'service']); return { d: connect(connect(d, c, lb), lb, svc) } }
  const monitoring = (d: Design) => runChecks(d, chat).checks.find(c => c.id === 'monitoring')!
  it('warns when the answer says nothing about monitoring, and hints at what the reference tracks', () => {
    const c = monitoring(base().d)
    expect(c.level).toBe('warn')
    expect(c.detail).toMatch(/Delivery speed/)
  })
  it('passes with a monitoring component or written reasoning', () => {
    expect(monitoring(addNode(base().d, 'metrics_store').design).level).toBe('pass')
    expect(monitoring({ ...base().d, reasoning: { monitoring: 'SLO: 99.9% of sends delivered in 500 ms; page on burn rate.' } }).level).toBe('pass')
    expect(monitoring({ ...base().d, reasoning: { monitoring: '   ' } }).level).toBe('warn')
  })
  it('does not call a monitoring component an unexplained extra', () => {
    const titles = runChecks(addNode(base().d, 'log_store').design, chat).checks.map(c => c.title)
    expect(titles.some(t => /log store|Log store/i.test(t))).toBe(false)
  })
})

describe('practice checks', () => {
  it('every reference design passes its own checks', () => {
    for (const ref of LIBRARY) {
      const { checks } = runChecks({ ...ref, id: `attempt-${ref.id}` }, ref)
      expect(checks.filter(c => c.level === 'fail' || c.level === 'warn').map(c => c.title), ref.id).toEqual([])
    }
  })
  it('treats a missing DNS as a gentle warning, not a failure', () => {
    const { d: d0, ids: [c, lb, svc] } = build(['web_client', 'load_balancer', 'service'])
    const d = connect(connect(d0, c, lb), lb, svc)
    const titles = runChecks(d, LIBRARY.find(x => x.id === 'chat')!).checks.map(x => `${x.level}: ${x.title}`)
    expect(titles).toContain('warn: Missing DNS (usually implied, but worth saying)')
  })
  it('asks for more when the attempt is nearly empty', () => {
    expect(runChecks(build(['service']).d, url).checks[0].id).toBe('size')
  })
  it('names missing pieces, anti-patterns and broken flows', () => {
    const { d: d0, ids: [c, svc, db] } = build(['web_client', 'service', 'sql_db'])
    let d = connect(connect(connect(d0, c, svc), svc, db), c, db)
    const f = addFlow(d); d = appendStep(appendStep(f.design, f.id, c, svc), f.id, svc, c)
    d = appendStep(d, f.id, c, 'nowhere')
    const titles = runChecks(d, url).checks.map(c => `${c.level}: ${c.title}`)
    expect(titles).toContain('fail: Missing a cache')
    expect(titles).toContain('fail: Missing a load balancer or API gateway')
    expect(titles).toContain('fail: Clients talk to a datastore directly')
    expect(titles).toContain('warn: Clients reach services without a load balancer or gateway')
    expect(titles).toContain('pass: Uses a database')
    expect(titles.some(t => t.startsWith('fail: "Flow 1" cannot run'))).toBe(true)
  })
})
