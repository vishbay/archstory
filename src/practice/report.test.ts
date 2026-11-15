import { describe, expect, it } from 'vitest'
import { LIBRARY } from '../library'
import { addNode, addNote, addOutline, addRequirement, blankAttempt, removeNode, removeNote, updateNote, writtenNotes } from './attempt'
import { designBrief } from './interview'
import { attemptReport } from './report'
import { parseReview, reviewPrompt, signature, type Review } from './review'

const ref = LIBRARY.find(d => d.id === 'multi-tenant-saas')!
const base = () => {
  let d = addNode(addNode(blankAttempt(ref), 'api_gateway').design, 'sql_db').design
  d = addOutline(d, d.nodes[1].id, 'Pooled', 'tenant').design
  return addRequirement(d, 'nonFunctional', 'Works offline')
}
const review = (d: ReturnType<typeof base>): { review: Review; sig: string } => {
  const p = parseReview({
    overall: 3, summary: 'Good skeleton.',
    scores: [{ dimension: 'security', score: 2, comment: 'Isolation unclear.' }],
    findings: [
      { target: d.nodes[1].id, severity: 'critical', title: 'No leak guard', detail: 'A bug leaks rows.', suggestion: 'Force row-level security.', fix: 'write' },
      { target: null, severity: 'praise', title: 'Right split', fix: 'sideways' },
    ],
    followUps: ['How do you move a tenant?'],
  }, d)
  if (!p.ok) throw new Error(p.errors.join())
  return { review: p.review, sig: signature(d) }
}

describe('notes on components', () => {
  it('add, edit and remove, go with their component, and blank ones are not part of the answer', () => {
    let d = base()
    const id = d.nodes[1].id
    d = addNote(d, id)
    expect(writtenNotes(d)).toEqual([])
    d = updateNote(d, 0, { kind: 'security', text: ' RLS is forced on every pooled table ' })
    expect(writtenNotes(d)).toHaveLength(1)
    expect(removeNote(d, 0).notes).toEqual([])
    expect(removeNode(d, id).notes).toEqual([])
  })
  it('reach the review prompt and the interviewer brief, and change the signature', () => {
    const d0 = base()
    const d = updateNote(addNote(d0, d0.nodes[1].id), 0, { kind: 'security', text: 'RLS forced' })
    expect(reviewPrompt(d, ref, [], false)).toContain('"text":"RLS forced"')
    expect(reviewPrompt(addNote(d0, d0.nodes[1].id), ref, [], false)).not.toContain('"notes":[{')
    expect(designBrief(d)).toContain('[security] RLS forced')
    expect(signature(d)).not.toBe(signature(d0))
    expect(signature(addNote(d0, d0.nodes[1].id))).toBe(signature(d0))
  })
})

describe('review fix labels', () => {
  it('keep a valid label, drop an unknown one, and are explained in the prompt', () => {
    const d = base()
    const r = review(d).review
    expect(r.findings.find(f => f.title === 'No leak guard')?.fix).toBe('write')
    expect(r.findings.find(f => f.title === 'Right split')?.fix).toBeUndefined()
    expect(reviewPrompt(d, ref, [], false)).toContain('"fix" says what kind of change')
  })
})

describe('report', () => {
  it('puts the answer, my notes, the review and the JSON in one readable file', () => {
    const d = updateNote(addNote(base(), base().nodes[1].id), 0, { kind: 'security', text: 'RLS forced' })
    const md = attemptReport({ attempt: d, reference: ref, review: review(d), checks: { passed: 11, total: 14 }, at: new Date('2026-11-15T10:00:00Z') })
    expect(md).toContain('# Multi-tenant SaaS: my practice answer')
    expect(md).toContain('Saved 2026-11-15 · automatic checks passed 11 of 14 · AI review 3 out of 5')
    expect(md).toContain('Non-functional: Works offline')
    expect(md).toContain('in "Pooled"')
    expect(md).toContain('(Security): RLS forced')
    expect(md).toContain('**Critical: No leak guard** (SQL database) [Write it]')
    expect(md).toContain('To fix: Force row-level security.')
    expect(md).toContain('```json')
    expect(md).not.toContain('—')
  })
  it('says when there is no review, and when the review is for an older answer', () => {
    const d = base()
    expect(attemptReport({ attempt: d, reference: ref, review: null, at: new Date() })).toContain('no AI review yet')
    const stale = { ...review(d), sig: 'old' }
    expect(attemptReport({ attempt: d, reference: ref, review: stale, at: new Date() })).toContain('earlier version of the answer')
  })
})
