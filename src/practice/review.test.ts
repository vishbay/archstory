import { describe, expect, it } from 'vitest'
import { LIBRARY } from '../library'
import { extractJson } from '../app/share'
import { addNode, blankAttempt } from './attempt'
import { runChecks } from './checks'
import { parseReview, reviewPrompt, signature } from './review'

const url = LIBRARY.find(d => d.id === 'url-shortener')!
const attempt = (() => {
  let d = blankAttempt(url)
  for (const k of ['web_client', 'service', 'sql_db']) d = addNode(d, k).design
  return { ...d, reasoning: { estimates: '4k redirects/s avg' } }
})()

const answer = {
  schema: 'archstory-review/v1', overall: '3', summary: 'Solid start.',
  scores: [{ dimension: 'data', score: 4, comment: 'ok' }],
  findings: [
    { target: null, severity: 'praise', title: 'Clear flow' },
    { target: 'service', severity: 'major', title: 'Single instance', detail: 'x', suggestion: 'Run 3 behind a load balancer' },
    { target: 'ghost', severity: 'minor', title: 'Typo target' },
  ],
  followUps: ['How do you avoid collisions?'],
}

describe('review prompt', () => {
  it('includes the problem, the answer, reasoning, checks, rubric and component ids', () => {
    const p = reviewPrompt(attempt, url, runChecks(attempt, url).checks, true)
    expect(p).toContain('# Problem: URL Shortener')
    expect(p).toContain('"id":"sql_db"')
    expect(p).toContain('4k redirects/s avg')
    expect(p).toContain('Missing a cache')
    expect(p).toContain('# A reference answer for comparison')
    expect(p).toContain('"service", "sql_db"')
    expect(p).not.toContain('—')
  })
  it('can leave the reference out', () => {
    expect(reviewPrompt(attempt, url, [], false)).not.toContain('reference answer')
  })
})

describe('parseReview', () => {
  it('accepts a fenced answer, coerces numbers, sorts by severity and demotes unknown targets', () => {
    const r = parseReview(JSON.parse(extractJson('Here you go:\n```json\n' + JSON.stringify(answer) + '\n```')), attempt)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.review.overall).toBe(3)
    expect(r.review.findings.map(f => f.severity)).toEqual(['major', 'minor', 'praise'])
    expect(r.review.findings[1].target).toBeNull()
    expect(r.warnings[0]).toMatch(/unknown component "ghost"/)
  })
  it('rejects malformed reviews with paths', () => {
    const r = parseReview({ ...answer, findings: [{ severity: 'catastrophic', title: 'x' }] }, attempt)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errors[0]).toMatch(/^findings\.0\.severity/)
  })
  it('signature changes when the answer changes', () => {
    expect(signature(attempt)).not.toBe(signature(addNode(attempt, 'cache').design))
  })
})

describe('forgiving review parsing', () => {
  it('derives a headline for a finding that has none instead of rejecting the review', () => {
    const r = parseReview({ ...answer, findings: [{ target: null, severity: 'major', detail: 'All reads hit one primary. That will not scale.' }, { severity: 'minor' }] }, attempt)
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.review.findings.map(f => f.title)).toEqual(['All reads hit one primary.', 'Finding'])
  })
})
