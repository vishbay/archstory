import { describe, expect, it } from 'vitest'
import { PROTOCOLS } from '../protocols'
import { groupBySection, KNOWN_SECTIONS, OTHER_SECTION } from '../protocols/sections'

// Home's Under the hood section renders groupBySection(protocols) as one heading and card grid per group (and nothing when the
// list is empty, while the lab is locked). The DOM itself is not rendered here: this test environment has no DOM library.
describe('Home: Under the hood grouping with the real modules', () => {
  const groups = groupBySection(PROTOCOLS)

  it('shows Network, Security, then Distributed systems and no catch-all heading', () => {
    expect(groups.map(g => g.section)).toEqual([...KNOWN_SECTIONS])
    expect(groups.map(g => g.section)).not.toContain(OTHER_SECTION)
  })

  it('shows every module exactly once, under the section it names', () => {
    const ids = groups.flatMap(g => g.designs.map(d => d.id))
    expect(ids.sort()).toEqual(PROTOCOLS.map(d => d.id).sort())
    for (const g of groups) for (const d of g.designs) expect(d.meta.section).toBe(g.section)
  })

  it('keeps each section in meta.order, which is the order the picker steps through', () => {
    for (const g of groups) {
      const orders = g.designs.map(d => d.meta.order ?? Infinity)
      expect(orders).toEqual([...orders].sort((a, b) => a - b))
    }
  })

  it('renders nothing while the lab is locked (an empty list)', () => {
    expect(groupBySection([])).toEqual([])
  })
})
