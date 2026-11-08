import { describe, expect, it } from 'vitest'
import { parseDesign } from '../model/schema'
import { STARTER_DESIGN } from './starterDesign'

describe('starter design', () => {
  it('is valid, so the "Start from an example" button never offers a broken file', () => {
    const r = parseDesign(JSON.parse(JSON.stringify(STARTER_DESIGN)))
    expect(r.ok ? [] : r.errors).toEqual([])
  })
  it('stays small and has no em dashes', () => {
    expect(STARTER_DESIGN.nodes.length).toBeLessThanOrEqual(5)
    expect(JSON.stringify(STARTER_DESIGN)).not.toContain('—')
  })
})
