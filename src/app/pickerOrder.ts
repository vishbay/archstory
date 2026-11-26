import type { Design } from '../model/schema'
import { MOST_ASKED } from '../library/popularity'

const RANK = { easy: 0, medium: 1, hard: 2 } as const

/** Easy first, then medium, then hard, and designs with no difficulty (the learner's own) last. Ties keep the order they came in. */
export function byDifficulty<T>(items: T[], design: (x: T) => Design): T[] {
  const rank = (x: T) => RANK[design(x).meta.difficulty ?? 'hard'] ?? 3
  const own = (x: T) => (design(x).meta.difficulty ? 0 : 1)
  return items.map((x, i) => ({ x, i })).sort((a, b) => own(a.x) - own(b.x) || rank(a.x) - rank(b.x) || a.i - b.i).map(v => v.x)
}

/** Most asked in interviews first. Designs that are not in the ranking (your own, or newer ones) come last, in the order they came in. */
export function byPopularity<T>(items: T[], design: (x: T) => Design): T[] {
  const rank = (x: T) => { const i = MOST_ASKED.indexOf(design(x).id); return i < 0 ? Infinity : i }
  return items.map((x, i) => ({ x, i })).sort((a, b) => (rank(a.x) === rank(b.x) ? a.i - b.i : rank(a.x) - rank(b.x))).map(v => v.x)
}
