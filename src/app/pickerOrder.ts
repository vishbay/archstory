import type { Design } from '../model/schema'

const RANK = { easy: 0, medium: 1, hard: 2 } as const

/** Easy first, then medium, then hard, and designs with no difficulty (the learner's own) last. Ties keep the order they came in. */
export function byDifficulty<T>(items: T[], design: (x: T) => Design): T[] {
  const rank = (x: T) => RANK[design(x).meta.difficulty ?? 'hard'] ?? 3
  const own = (x: T) => (design(x).meta.difficulty ? 0 : 1)
  return items.map((x, i) => ({ x, i })).sort((a, b) => own(a.x) - own(b.x) || rank(a.x) - rank(b.x) || a.i - b.i).map(v => v.x)
}
