import { describe, expect, it } from 'vitest'
import { LIBRARY } from '../library'
import { parseDesign } from '../model/schema'
import { addNode, blankAttempt, connect } from './attempt'
import { applySkeleton, duplicateNode, searchKinds, SKELETONS } from './quick'

describe('searchKinds', () => {
  it('finds kinds by name, then by what people call them', () => {
    expect(searchKinds('cach')[0]).toBe('cache')
    expect(searchKinds('redis')[0]).toBe('cache')
    expect(searchKinds('postgres')[0]).toBe('sql_db')
    expect(searchKinds('kafka')[0]).toBe('stream')
    expect(searchKinds('lb')[0]).toBe('load_balancer')
    expect(searchKinds('s3')[0]).toBe('object_store')
    expect(searchKinds('zzzz')).toEqual([])
    expect(searchKinds('').length).toBeGreaterThan(30)
  })
})

describe('duplicateNode', () => {
  it('copies a component with its settings and its connections', () => {
    let d = blankAttempt(LIBRARY[0])
    for (const k of ['load_balancer', 'service', 'sql_db']) d = addNode(d, k).design
    d = connect(connect(d, 'load_balancer', 'service'), 'service', 'sql_db')
    d = { ...d, nodes: d.nodes.map(n => (n.id === 'service' ? { ...n, replicas: 3, cloud: { aws: 'ECS Fargate' } } : n)) }
    d = { ...d, edges: d.edges.map(e => (e.to === 'sql_db' ? { ...e, async: true } : e)) }
    const r = duplicateNode(d, 'service')!
    const copy = r.design.nodes.find(n => n.id === r.id)!
    expect(copy).toMatchObject({ kind: 'service', label: 'Service 2', replicas: 3, cloud: { aws: 'ECS Fargate' } })
    expect(r.design.edges).toContainEqual({ from: 'load_balancer', to: r.id })
    expect(r.design.edges).toContainEqual({ from: r.id, to: 'sql_db', async: true })
    expect(duplicateNode(r.design, r.id)!.design.nodes.at(-1)!.label).toBe('Service 3')
    expect(duplicateNode(d, 'nope')).toBeNull()
  })
})

describe('skeletons', () => {
  it('each one is a valid, fully connected starting point', () => {
    for (const s of SKELETONS) {
      const d = applySkeleton(blankAttempt(LIBRARY[0]), s)
      expect(d.nodes).toHaveLength(s.kinds.length)
      expect(parseDesign(d).ok, s.id).toBe(true)
      const linked = new Set(d.edges.flatMap(e => [e.from, e.to]))
      expect(d.nodes.every(n => linked.has(n.id)), s.id).toBe(true)
    }
  })
})
