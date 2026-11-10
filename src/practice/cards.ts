// Spaced repetition for follow-up questions (a simple Leitner schedule). A question you get right comes back after
// longer and longer gaps; one you miss comes back tomorrow. Days are counted in the learner's local calendar.
import type { Design, Question } from '../model/schema'

export type Rating = 'missed' | 'partly' | 'got'
export interface CardState { box: number; due: number; seen: number; last: Rating }
export type Deck = Record<string, CardState>   // keyed by "designId:questionId"

/** Days until the next review for each box. */
export const INTERVALS = [1, 2, 4, 8, 16, 32]

/** Today as a whole number of days, in local time, so a card due "tomorrow" turns up after midnight. */
export const dayOf = (ms: number) => { const d = new Date(ms); return Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86_400_000) }
export const cardKey = (designId: string, q: Question) => `${designId}:${q.id}`

export function rate(card: CardState | undefined, rating: Rating, today: number): CardState {
  const box = rating === 'missed' ? 0 : rating === 'partly' ? Math.max(0, (card?.box ?? 0)) : Math.min(INTERVALS.length - 1, (card ? card.box + 1 : 1))
  const days = rating === 'missed' ? 1 : INTERVALS[box]
  return { box, due: today + days, seen: (card?.seen ?? 0) + 1, last: rating }
}

export interface DrillCard { design: Design; question: Question; key: string; state?: CardState }

/** Questions due today (seen before and now due), then new ones, up to a daily limit of new cards. */
export function dueCards(designs: Design[], deck: Deck, today: number, newLimit = 10): DrillCard[] {
  const all = designs.flatMap(d => d.questions.map(q => ({ design: d, question: q, key: cardKey(d.id, q), state: deck[cardKey(d.id, q)] })))
  const due = all.filter(c => c.state && c.state.due <= today).sort((a, b) => a.state!.due - b.state!.due || a.state!.box - b.state!.box)
  const fresh = all.filter(c => !c.state).slice(0, newLimit)
  return [...due, ...fresh]
}

export function deckStats(designs: Design[], deck: Deck, today: number) {
  const keys = designs.flatMap(d => d.questions.map(q => cardKey(d.id, q)))
  const seen = keys.filter(k => deck[k])
  return {
    total: keys.length, seen: seen.length,
    due: seen.filter(k => deck[k].due <= today).length,
    learned: seen.filter(k => deck[k].box >= 3).length,   // reached an 8-day gap
  }
}

/** Keep only well-formed entries from storage. */
export function cleanDeck(raw: unknown): Deck {
  const out: Deck = {}
  if (!raw || typeof raw !== 'object') return out
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    const c = v as CardState
    if (c && Number.isInteger(c.box) && Number.isFinite(c.due) && ['missed', 'partly', 'got'].includes(c.last)) out[k] = { box: Math.min(Math.max(c.box, 0), INTERVALS.length - 1), due: c.due, seen: c.seen | 0, last: c.last }
  }
  return out
}
