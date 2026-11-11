// How far a learner has got with each problem, for the Home page: read from the saved answer and saved attempts.
import type { Design } from '../model/schema'
import type { StoredReview } from '../app/ReviewPanel'
import { attemptKey, loadSnapshots, reviewKey, type Kv } from './snapshots'

export interface Progress {
  /** There is a saved answer with components in it. */
  inProgress: boolean
  /** Saved attempts (snapshots). */
  attempts: number
  /** The best share of checks passed across the current answer and every saved attempt. */
  best: { passed: number; total: number } | null
  /** The best pasted AI review score (1 to 5), if any. */
  review: number | null
}

export const practised = (p: Progress) => p.inProgress || p.attempts > 0
/** How many of these designs the learner has started or saved an attempt for. */
export const practisedCount = (designs: Design[], progress: Record<string, Progress>) => designs.filter(d => progress[d.id] && practised(progress[d.id])).length
export const percent = (b: { passed: number; total: number }) => (b.total ? Math.round((b.passed / b.total) * 100) : 0)

export function progressOf(kv: Kv, ref: Design, score: (answer: Design, ref: Design) => { passed: number; total: number }): Progress {
  const snaps = loadSnapshots(kv, ref.id)
  const current = kv.get(attemptKey(ref.id)) as Design | null
  const inProgress = !!current?.nodes?.length
  const scores = snaps.filter(s => s.total > 0).map(s => ({ passed: s.passed, total: s.total }))
  if (inProgress) { const c = score(current!, ref); if (c.total > 0) scores.push({ passed: c.passed, total: c.total }) }
  const best = scores.reduce<Progress['best']>((a, s) => (!a || s.passed / s.total > a.passed / a.total ? s : a), null)
  const reviews = snaps.map(s => s.overall).filter((n): n is number => n !== null)
  const cur = kv.get(reviewKey(ref.id)) as StoredReview | null
  if (inProgress && cur?.review?.overall) reviews.push(cur.review.overall)
  return { inProgress, attempts: snaps.length, best, review: reviews.length ? Math.max(...reviews) : null }
}
