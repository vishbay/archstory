import { describe, expect, it } from 'vitest'
import { LIBRARY } from '../library'
import { cardKey, cleanDeck, dayOf, deckStats, dueCards, INTERVALS, rate, type Deck } from './cards'

const today = 20_000
describe('schedule', () => {
  it('spaces a question further apart each time you get it, and brings a miss back tomorrow', () => {
    let c = rate(undefined, 'got', today)
    expect(c).toMatchObject({ box: 1, due: today + INTERVALS[1], seen: 1 })
    c = rate(c, 'got', c.due); expect(c.box).toBe(2)
    c = rate(c, 'missed', c.due); expect(c).toMatchObject({ box: 0, last: 'missed' }); expect(c.due).toBe(today + INTERVALS[1] + INTERVALS[2] + 1)
  })
  it('keeps a partly-right answer in its box', () => {
    const c = rate({ box: 3, due: today, seen: 4, last: 'got' }, 'partly', today)
    expect(c).toMatchObject({ box: 3, due: today + INTERVALS[3] })
  })
  it('never goes past the last box', () => {
    let c = rate(undefined, 'got', today)
    for (let i = 0; i < 20; i++) c = rate(c, 'got', c.due)
    expect(c.box).toBe(INTERVALS.length - 1)
  })
  it('counts days in local time', () => {
    expect(dayOf(new Date(2026, 10, 10, 23, 59).getTime()) + 1).toBe(dayOf(new Date(2026, 10, 11, 0, 1).getTime()))
  })
})

describe('what to drill', () => {
  it('starts with new questions, limited per day', () => {
    const due = dueCards(LIBRARY, {}, today, 10)
    expect(due).toHaveLength(10); expect(due.every(c => !c.state)).toBe(true)
  })
  it('puts questions that are due before new ones, and leaves future ones out', () => {
    const [a, b, c] = LIBRARY[0].questions
    const deck: Deck = {
      [cardKey(LIBRARY[0].id, a)]: { box: 2, due: today - 1, seen: 2, last: 'got' },
      [cardKey(LIBRARY[0].id, b)]: { box: 0, due: today, seen: 1, last: 'missed' },
      [cardKey(LIBRARY[0].id, c)]: { box: 3, due: today + 5, seen: 3, last: 'got' },
    }
    const due = dueCards(LIBRARY, deck, today, 2)
    expect(due.map(x => x.question.id).slice(0, 2)).toEqual([a.id, b.id])
    expect(due.some(x => x.question.id === c.id && x.design.id === LIBRARY[0].id)).toBe(false)
    expect(due).toHaveLength(4)
    expect(deckStats(LIBRARY, deck, today)).toMatchObject({ seen: 3, due: 2, learned: 1 })
  })
  it('ignores junk in storage', () => {
    expect(cleanDeck({ x: { box: 'a' }, y: { box: 9, due: 1, seen: 2, last: 'got' }, z: null })).toEqual({ y: { box: INTERVALS.length - 1, due: 1, seen: 2, last: 'got' } })
    expect(cleanDeck('nope')).toEqual({})
  })
})

describe('library questions', () => {
  it('every design has 4 to 8 questions with answers and no em dashes', () => {
    for (const d of LIBRARY) {
      expect(d.questions.length, d.id).toBeGreaterThanOrEqual(4); expect(d.questions.length, d.id).toBeLessThanOrEqual(8)
      for (const q of d.questions) { expect(q.a.length, `${d.id}/${q.id}`).toBeGreaterThan(80); expect(q.q + q.a).not.toContain('—'); expect(q.targets.length).toBeGreaterThan(0) }
    }
  })
})
