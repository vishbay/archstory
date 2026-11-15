import { describe, expect, it } from 'vitest'
import { LIBRARY } from '../library'
import { layoutBands } from '../layout/bands'
import { addNode, addOutline, addRequirement, blankAttempt, customRequirements, removeNode, removeRequirement, setNodeGroup, updateGroup } from './attempt'
import { designBrief, emptyInterview, interviewSystem, nextTurn } from './interview'
import { reviewPrompt, signature } from './review'

const ref = LIBRARY.find(d => d.id === 'url-shortener')!

describe('own requirements', () => {
  it('adds, trims, ignores blanks and repeats, and removes, without touching the problem', () => {
    let a = blankAttempt(ref)
    a = addRequirement(a, 'functional', '  Links  expire after 30 days ')
    a = addRequirement(a, 'nonFunctional', 'Works offline')
    expect(addRequirement(a, 'functional', 'Links expire after 30 days')).toBe(a)
    expect(addRequirement(a, 'functional', '   ')).toBe(a)
    expect(customRequirements(a, ref)).toEqual({ functional: ['Links expire after 30 days'], nonFunctional: ['Works offline'] })
    expect(ref.requirements.functional).not.toContain('Links expire after 30 days')
    expect(customRequirements(removeRequirement(a, 'functional', 'Links expire after 30 days'), ref).functional).toEqual([])
  })

  it('reach the review prompt, the interviewer and its design brief, and a change makes the brief resend', () => {
    const plain = blankAttempt(ref)
    const mine = addRequirement(plain, 'nonFunctional', 'Works offline')
    expect(reviewPrompt(plain, ref, [], false)).not.toContain('added themselves')
    expect(reviewPrompt(mine, ref, [], false)).toContain('- Non-functional: Works offline')
    expect(interviewSystem(ref, false, [], mine)).toContain('- Non-functional: Works offline')
    expect(designBrief(mine, ref)).toContain('Works offline')
    expect(designBrief(plain, ref)).not.toContain('added themselves')
    const st = emptyInterview('')
    const first = nextTurn(st, 'answer', 'hi', plain, ref)
    expect(nextTurn({ ...st, sentSig: first.sentSig }, 'answer', 'hi', plain, ref).turn.attachment).toBeUndefined()
    expect(nextTurn({ ...st, sentSig: first.sentSig }, 'answer', 'hi', mine, ref).turn.attachment).toContain('Works offline')
  })
})

describe('outlines (groups) in an answer', () => {
  const base = () => addNode(addNode(addNode(blankAttempt(ref), 'service').design, 'sql_db').design, 'cache').design
  it('draw around the components put in them and disappear when emptied', () => {
    let d = base()
    const [a, b] = d.nodes
    const made = addOutline(d, a.id, ' Enterprise  silo: Acme ', 'tenant')
    d = setNodeGroup(made.design, b.id, made.id)
    expect(d.groups).toEqual([{ id: 'enterprise_silo_acme', label: 'Enterprise silo: Acme', kind: 'tenant' }])
    expect(layoutBands(d).groups.map(g => g.label)).toEqual(['Enterprise silo: Acme'])
    expect(setNodeGroup(d, a.id, undefined).groups).toHaveLength(1)
    expect(setNodeGroup(setNodeGroup(d, a.id, undefined), b.id, undefined).groups).toEqual([])
    expect(removeNode(removeNode(d, a.id), b.id).groups).toEqual([])
    expect(updateGroup(d, made.id, { kind: 'region' }).groups[0].kind).toBe('region')
  })
  it('keep unique ids and reach the review prompt and the interviewer brief', () => {
    const d0 = base()
    const one = addOutline(d0, d0.nodes[0].id, 'Silo', 'tenant')
    const two = addOutline(one.design, one.design.nodes[1].id, 'Silo', 'tenant')
    expect(two.id).not.toBe(one.id)
    expect(reviewPrompt(one.design, ref, [], false)).toContain('"groups":[{"id":"silo","label":"Silo","kind":"tenant"}]')
    expect(designBrief(one.design)).toContain('inside the outline "Silo"')
    expect(signature(one.design)).not.toBe(signature(d0))
    expect(signature(d0)).toBe(signature({ ...d0, groups: [] }))
  })
})
