import { describe, expect, it } from 'vitest'
import { LIBRARY } from '../library'
import { addNode, blankAttempt } from './attempt'
import { runChecks } from './checks'
import { budgets, checklistScore, clock, end, itemDone, mmss, nextPhase, pause, PHASES, PLAN_MINUTES, PRESETS, report, resume, startSession, status, toggleTick } from './timed'

const MIN = 60_000
describe('timed interview plan', () => {
  it('follows the usual 45-minute shape', () => {
    expect(PLAN_MINUTES).toBe(45)
    expect(PHASES.map(p => p.id)).toEqual(['requirements', 'estimates', 'interface', 'design', 'deep', 'wrap'])
  })
  it('scales each preset to whole minutes that add up exactly', () => {
    for (const t of PRESETS) {
      const b = budgets(t)
      expect(b.reduce((a, x) => a + x, 0)).toBe(t * MIN)
      expect(b.every(x => x >= MIN && x % MIN === 0)).toBe(true)
    }
    expect(budgets(45).map(x => x / MIN)).toEqual(PHASES.map(p => p.minutes))
  })
})

describe('the clock', () => {
  it('excludes pauses and survives being rebuilt from stored state', () => {
    let s = startSession(45, 0)
    s = pause(s, 2 * MIN)
    expect(clock(s, 10 * MIN)).toBe(2 * MIN)
    s = resume(JSON.parse(JSON.stringify(s)), 10 * MIN)
    expect(clock(s, 11 * MIN)).toBe(3 * MIN)
  })
  it('nudges when a phase runs over, but never moves on by itself', () => {
    const s = startSession(45, 0)
    const st = status(s, 7 * MIN)
    expect(st.index).toBe(0); expect(st.over).toBe(2 * MIN); expect(st.totalLeft).toBe(38 * MIN)
  })
  it('records when each phase began and reports planned against actual', () => {
    let s = startSession(45, 0)
    s = nextPhase(s, 7 * MIN)          // requirements took 7 minutes
    s = nextPhase(s, 10 * MIN)         // estimates took 3
    const r = report(s, 12 * MIN)
    expect(r[0]).toMatchObject({ planned: 5 * MIN, actual: 7 * MIN })
    expect(r[1]).toMatchObject({ planned: 5 * MIN, actual: 3 * MIN })
    expect(r[2].actual).toBe(2 * MIN)  // the phase in progress so far
    expect(r[3].actual).toBeNull()
  })
  it('ends after the last phase and then stops counting', () => {
    let s = startSession(30, 0)
    for (let i = 0; i < PHASES.length; i++) s = nextPhase(s, (i + 1) * MIN)
    expect(s.endedAt).toBe(PHASES.length * MIN)
    expect(clock(s, 99 * MIN)).toBe(PHASES.length * MIN)
    expect(end(s, 120 * MIN).endedAt).toBe(PHASES.length * MIN)
    expect(pause(s, 100 * MIN).pausedAt).toBeNull()
  })
})

describe('checklist', () => {
  const ref = LIBRARY.find(d => d.id === 'url-shortener')!
  it('ticks items automatically from the answer, and by hand for things said out loud', () => {
    let a = blankAttempt(ref)
    const wrote = PHASES[0].items.find(i => i.id === 'written')!
    let s = startSession(45, 0)
    expect(itemDone(s, PHASES[0], wrote, a, runChecks(a, ref).checks)).toEqual({ done: false, auto: false })
    a = { ...a, reasoning: { requirements: 'Read heavy, 100:1.' } }
    expect(itemDone(s, PHASES[0], wrote, a, runChecks(a, ref).checks)).toEqual({ done: true, auto: true })
    const scale = PHASES[0].items.find(i => i.id === 'scale')!
    s = toggleTick(s, 'requirements:scale')
    expect(itemDone(s, PHASES[0], scale, a, []).done).toBe(true)
    expect(itemDone(toggleTick(s, 'requirements:scale'), PHASES[0], scale, a, []).done).toBe(false)
  })
  it('notices an entry point and connected components in the drawing', () => {
    let a = blankAttempt(ref)
    for (const k of ['client', 'load_balancer', 'service', 'database']) a = addNode(a, k).design
    const entry = PHASES[3].items.find(i => i.id === 'entry')!
    expect(itemDone(startSession(45, 0), PHASES[3], entry, a, []).auto).toBe(true)
    const score = checklistScore(startSession(45, 0), a, runChecks(a, ref).checks)
    expect(score.total).toBe(PHASES.reduce((n, p) => n + p.items.length, 0))
  })
  it('formats time, including time past zero', () => {
    expect(mmss(65_000)).toBe('1:05'); expect(mmss(-61_000)).toBe('-1:01'); expect(mmss(0)).toBe('0:00')
  })
})
