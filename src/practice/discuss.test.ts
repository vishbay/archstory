import { describe, expect, it } from 'vitest'
import { LIBRARY } from '../library'
import { discussPrompt } from './discuss'

const saas = LIBRARY.find(d => d.id === 'multi-tenant-saas')!

describe('discussPrompt', () => {
  it('tells the AI to answer about this design, cite step numbers and mark assumptions', () => {
    const p = discussPrompt(saas)
    expect(p).toContain('"Multi-tenant SaaS"')
    expect(p).toContain('source of truth')
    expect(p).toContain('THIS design')
    expect(p).toContain('the design does not specify this')
    expect(p).toContain('by number')
    expect(p.trimEnd().endsWith('## My question')).toBe(true)
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
