import { describe, expect, it } from 'vitest'
import { checkImport } from './importCheck'
import { STARTER_DESIGN } from './starterDesign'

const base = { schema: 'archstory/v1', id: 'demo', meta: { title: 'Demo' } }

describe('checkImport', () => {
  it('is empty for blank input', () => {
    expect(checkImport('   \n').status).toBe('empty')
  })
  it('reports broken JSON and schema problems separately', () => {
    const bad = checkImport('{ "schema": ')
    expect(bad.status === 'invalid' && bad.errors[0]).toMatch(/^Not valid JSON/)
    const shape = checkImport(JSON.stringify({ ...base, nodes: [] }))
    expect(shape.status === 'invalid' && shape.errors[0]).toMatch(/^nodes/)
  })
  it('summarises a valid design, also inside an AI answer with prose and fences', () => {
    const c = checkImport('Here you go:\n```json\n' + JSON.stringify(STARTER_DESIGN) + '\n```')
    expect(c.status).toBe('valid')
    if (c.status === 'valid') {
      expect(c.summary).toBe('4 components · 3 connections · 1 flow (6 steps)')
      expect(c.warnings).toEqual([])
    }
  })
  it('warns about missing flows and unconnected components without rejecting the file', () => {
    const c = checkImport(JSON.stringify({ ...base, nodes: [{ id: 'a', label: 'A', kind: 'service' }, { id: 'b', label: 'B', kind: 'cache' }] }))
    expect(c.status).toBe('valid')
    if (c.status === 'valid') {
      expect(c.warnings).toHaveLength(2)
      expect(c.warnings[1]).toBe('Not connected to anything: A, B.')
    }
  })
  it('uses singular and plural correctly', () => {
    const c = checkImport(JSON.stringify({ ...base, nodes: [{ id: 'a', label: 'A', kind: 'service' }] }))
    expect(c.status === 'valid' && c.summary).toBe('1 component · 0 connections · 0 flows (0 steps)')
  })
})
