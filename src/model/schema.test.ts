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
