import { describe, expect, it } from 'vitest'
import { PROTOCOLS } from '.'
import type { Design } from '../model/schema'
import { groupBySection, KNOWN_SECTIONS, OTHER_SECTION } from './sections'

const d = (id: string, section?: string, order?: number): Design => ({
  schema: 'archstory/v1', id, meta: { title: id, tags: [], kind: 'protocol', section, order },
  requirements: { functional: [], nonFunctional: [], scale: [] }, nodes: [{ id: 'a', label: 'A', kind: 'client' }],
  groups: [], edges: [], flows: [], notes: [], questions: [],
})

describe('sections', () => {
  it('lists the known sections first in their order, then others by name, then modules with none', () => {
    const g = groupBySection([d('x', 'Zebra'), d('y'), d('z', 'Distributed systems'), d('w', 'Network'), d('v', 'Apples'), d('u', 'Security')])
    expect(g.map(s => s.section)).toEqual([...KNOWN_SECTIONS, 'Apples', 'Zebra', OTHER_SECTION])
  })

  it('sorts inside a section by meta.order, then by title for modules without one', () => {
    const g = groupBySection([d('c', 'Network', 3), d('b', 'Network', 1), d('z'), d('beta', 'Network'), d('alpha', 'Network')])
    expect(g[0].designs.map(x => x.id)).toEqual(['b', 'c', 'alpha', 'beta'])
  })

  it('keeps every design exactly once and ignores blank section names', () => {
    const all = [d('a', 'Network'), d('b', '  '), d('c', 'Security')]
    const g = groupBySection(all)
    expect(g.flatMap(s => s.designs).map(x => x.id).sort()).toEqual(['a', 'b', 'c'])
    expect(g.at(-1)).toMatchObject({ section: OTHER_SECTION })
    expect(groupBySection([])).toEqual([])
  })

  it('groups the real modules: Network, Security, then Distributed systems, each in meta.order', () => {
    const g = groupBySection(PROTOCOLS)
    expect(g.map(s => [s.section, s.designs.map(x => x.id)])).toEqual([
      ['Network', ['dns', 'tcp', 'url', 'http', 'websocket', 'loadbalancing', 'nat']],
      ['Security', ['tls', 'oauth']],
      ['Distributed systems', ['hashring', 'raft', 'twopc', 'sagas', 'quorums', 'gossip']],
    ])
  })

  it('gives every module a section', () => {
    for (const p of PROTOCOLS) expect(p.meta.section, p.id).toBeTruthy()
  })
})
