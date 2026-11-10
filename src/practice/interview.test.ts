import { describe, expect, it } from 'vitest'
import { LIBRARY } from '../library'
import { addNode, blankAttempt } from './attempt'
import { runChecks } from './checks'
import { addUsage, apiMessages, candidateTurns, designBrief, emptyInterview, estimateCost, FINISH_REQUEST, formatTokens, interviewSystem, mentionParts, nextTurn, plainText } from './interview'

const ref = LIBRARY.find(d => d.id === 'url-shortener')!
const answer = (kinds: string[]) => kinds.reduce((d, k) => addNode(d, k).design, blankAttempt(ref))

describe('interviewer instructions', () => {
  it('state the problem and the rules, and keep the reference private and optional', () => {
    const s = interviewSystem(ref, true, runChecks(answer(['client']), ref).checks)
    expect(s).toContain('# The problem: URL Shortener')
    expect(s).toContain('one question at a time')
    expect(s).toContain('never reveal')
    expect(s).toContain('"kgs: Key Gen Service')
    expect(s).toContain('Automatic checks flagged')
    expect(interviewSystem(ref, false, [])).not.toContain('kgs: Key Gen Service')
    expect(s).not.toContain('—')
  })
})

describe('turns', () => {
  it('attaches the design only when it changed since the last message', () => {
    let st = emptyInterview('sys')
    const a = answer(['client', 'service'])
    const t1 = nextTurn(st, 'start', '', a)
    expect(t1.turn).toMatchObject({ hidden: true, role: 'user' }); expect(t1.turn.attachment).toContain('client: Client (client)')
    st = { ...st, turns: [t1.turn, { role: 'assistant', text: 'Walk me through it.' }], sentSig: t1.sentSig }
    const t2 = nextTurn(st, 'answer', '  It is a service.  ', a)
    expect(t2.turn.attachment).toBeUndefined(); expect(t2.turn.text).toBe('It is a service.')
    const t3 = nextTurn({ ...st, sentSig: t2.sentSig }, 'answer', 'Added a cache.', addNode(a, 'cache').design)
    expect(t3.turn.attachment).toContain('cache: Cache (cache)')
    expect(nextTurn(st, 'finish', '', a).turn.text).toBe(FINISH_REQUEST)
    expect(candidateTurns({ ...st, turns: [...st.turns, t2.turn] })).toBe(1)
  })
  it('sends the attached design with the message text, and alternates roles', () => {
    const msgs = apiMessages([{ role: 'user', text: 'go', attachment: 'DESIGN', hidden: true }, { role: 'assistant', text: 'q1' }, { role: 'user', text: 'a1' }])
    expect(msgs.map(m => m.role)).toEqual(['user', 'assistant', 'user'])
    expect(msgs[0].content).toBe('DESIGN\n\n---\ngo')
    expect(msgs[2].content).toBe('a1')
  })
  it('describes an empty design honestly', () => {
    expect(designBrief(blankAttempt(ref))).toContain('Components: none yet')
  })
})

describe('mentions', () => {
  it('turns {{id}} into links for known components and plain text otherwise', () => {
    const parts = mentionParts('What if {{cache}} dies, or {{ghost}}?', new Set(['cache']))
    expect(parts).toEqual([{ text: 'What if ' }, { id: 'cache' }, { text: ' dies, or ' }, { text: 'ghost' }, { text: '?' }])
    expect(plainText('Is {{cache}} needed?', id => id.toUpperCase())).toBe('Is CACHE needed?')
  })
})

describe('usage and cost', () => {
  it('adds up tokens and estimates cost only when prices are set', () => {
    const u = addUsage(addUsage({ input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, { input: 1000, output: 200, cacheRead: 5000, cacheWrite: 0 }), null)
    expect(u).toEqual({ input: 1000, output: 200, cacheRead: 5000, cacheWrite: 0 })
    expect(estimateCost(u, { input: '3', output: '15' })).toBeCloseTo((6000 * 3 + 200 * 15) / 1e6)
    expect(estimateCost(u, { input: '', output: '15' })).toBeNull()
    expect(estimateCost(u, { input: 'x', output: '15' })).toBeNull()
    expect(formatTokens(950)).toBe('950'); expect(formatTokens(1234)).toBe('1.2k'); expect(formatTokens(56_000)).toBe('56k')
  })
})
