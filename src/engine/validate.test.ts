import { describe, expect, it } from 'vitest'
import { urlShortener as p } from '../problems/urlShortener'
import { validate } from './validate'

describe('url shortener validator', () => {
  it('reference solution passes every rule', () => {
    const r = validate(p.reference.diagram, p)
    expect(r.results.filter(x => !x.passed).map(x => x.rule.id)).toEqual([])
  })
  it('empty diagram fails required rules', () => {
    const r = validate({ nodes: [], edges: [] }, p)
    expect(r.allRequiredPass).toBe(false)
    expect(r.requiredPassed).toBe(0)
  })
  it('flags client → database shortcut and missing cache', () => {
    const d = {
      nodes: [{ id: 'c', kind: 'client' as const }, { id: 'db', kind: 'database' as const }],
      edges: [{ id: 'e', source: 'c', target: 'db' }],
    }
    const r = validate(d, p)
    const failed = r.results.filter(x => !x.passed).map(x => x.rule.id)
    expect(failed).toContain('no-direct-db')
    expect(failed).toContain('cache')
  })
  it('accepts edges drawn in either direction', () => {
    const d = {
      nodes: [{ id: 'a', kind: 'api_server' as const }, { id: 'c', kind: 'cache' as const }],
      edges: [{ id: 'e', source: 'c', target: 'a' }],
    }
    expect(validate(d, p).results.find(x => x.rule.id === 'cache')!.passed).toBe(true)
  })
})
