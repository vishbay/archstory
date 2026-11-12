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
    expect(p).toContain('whole conversation')
  })

  it('names every flow up front, so the AI can confirm it saw them all', () => {
    const p = discussPrompt(saas)
    expect(p).toContain(`It has ${saas.nodes.length} components and ${saas.flows.length} request flows (${saas.flows.map(f => f.title).join('; ')}).`)
    for (const d of LIBRARY) for (const f of d.flows) expect(discussPrompt(d), `${d.id}: ${f.title}`).toContain(`Request flow: ${f.title}`)
  })

  it('tells the AI to confirm and wait when no question is given, and asks it when one is', () => {
    const wait = discussPrompt(saas)
    expect(wait.trimEnd().split('\n').at(-1)).toContain('I will send my questions in my next messages')
    expect(wait).toContain('do not suggest questions')
    expect(wait).not.toContain('## My question')
    const asked = discussPrompt(saas, { question: '  How does a tenant move to its own database?  ' })
    expect(asked.trimEnd().endsWith('## My question\nHow does a tenant move to its own database?')).toBe(true)
    expect(asked).not.toContain('What to do now')
    expect(discussPrompt(saas, { question: '   ' })).toContain('What to do now')
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
