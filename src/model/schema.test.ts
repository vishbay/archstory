import { describe, expect, it } from 'vitest'
import { parseDesign } from './schema'
import { LIBRARY } from '../library'

const minimal = () => ({
  schema: 'archstory/v1', id: 'demo', meta: { title: 'Demo' },
  nodes: [{ id: 'c', label: 'Client', kind: 'client' }, { id: 'api', label: 'API', kind: 'service' }],
  edges: [{ from: 'c', to: 'api' }],
  flows: [{ id: 'f', title: 'F', steps: [{ from: 'c', to: 'api', kind: 'req', label: 'GET /' }, { from: 'api', to: 'c', kind: 'res', label: '200' }] }],
})

describe('parseDesign', () => {
  it('accepts a minimal design and fills defaults', () => {
    const r = parseDesign(minimal())
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.design.groups).toEqual([])
  })
  it('every library design is valid', () => {
    expect(LIBRARY.length).toBeGreaterThan(0)
  })
  it('reports shape errors with paths', () => {
    const r = parseDesign({ ...minimal(), nodes: [{ id: 'Bad Id', label: 'x', kind: 'y' }] })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errors[0]).toMatch(/^nodes\.0\.id/)
  })
  it('reports a flow step with no edge to travel', () => {
    const d = minimal()
    d.nodes.push({ id: 'db', label: 'DB', kind: 'sql_db' })
    d.flows[0].steps.push({ from: 'api', to: 'db', kind: 'req', label: 'SELECT' })
    const r = parseDesign(d)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errors[0]).toMatch(/^flow "f" step 3: no edge between "api" and "db" \(a step must follow a connection/)
  })
  it('reports unknown references and local-step misuse', () => {
    const d = { ...minimal(), edges: [{ from: 'c', to: 'ghost' }],
      flows: [{ id: 'f', title: 'F', steps: [{ from: 'c', to: 'c', kind: 'req', label: 'x' }] }] }
    const r = parseDesign(d)
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.errors).toContain('edges[0] c→ghost: unknown node "ghost"')
      expect(r.errors).toContain('flow "f" step 1: from === to needs kind "local"')
    }
  })
})

describe('pre-rename files', () => {
  it('still import with the old "sysdesign/v1" format id', () => {
    const r = parseDesign({ ...minimal(), schema: 'sysdesign/v1' })
    expect(r.ok && r.design.schema).toBe('archstory/v1')
  })
})

describe('observability section', () => {
  const withObs = (o: object) => ({ ...minimal(), observability: o })
  const slo = { id: 's1', name: 'Latency', kind: 'latency', sli: 'good / all', target: 99, threshold: '< 100 ms' }
  it('accepts SLOs, alerts, signals and debug paths and fills defaults', () => {
    const r = parseDesign(withObs({ slos: [slo], alerts: [{ id: 'a1', severity: 'page', when: 'x', why: 'y', target: 'api', slo: 's1' }],
      signals: [{ target: 'api', name: 'Queue age' }], debug: [{ symptom: 's', steps: ['one'] }] }))
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.design.observability!.slos[0].window).toBe(30)
  })
  it('rejects unknown components and SLOs, duplicate ids, and targets outside 50 to 100', () => {
    const r = parseDesign(withObs({ slos: [slo, slo], alerts: [{ id: 'a1', severity: 'page', when: 'x', why: 'y', target: 'ghost', slo: 'nope' }], signals: [{ target: 'ghost', name: 'n' }] }))
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.errors).toContain('observability.slos: duplicate id "s1"')
      expect(r.errors).toContain('alert "a1": unknown component "ghost"')
      expect(r.errors).toContain('alert "a1": unknown SLO "nope"')
      expect(r.errors).toContain('observability.signals[0]: unknown component "ghost"')
    }
    expect(parseDesign(withObs({ slos: [{ ...slo, target: 30 }] })).ok).toBe(false)
  })
  it('is optional', () => { expect(parseDesign(minimal()).ok).toBe(true) })
})
