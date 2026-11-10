// Saved attempts: named snapshots of a practice answer, plus one backup file holding every attempt, review and
// snapshot so work can move between browsers. Pure functions over a small key-value interface, so they are testable.
import { parseDesign, type Design } from '../model/schema'
import type { StoredReview } from '../app/ReviewPanel'
import { cleanDeck, type Deck } from './cards'

export const MAX_SNAPSHOTS = 20

export interface Snapshot {
  id: string; name: string; at: string; design: Design
  passed: number; total: number
  /** The pasted AI review's overall score (1 to 5), when there was one. */
  overall: number | null; review: StoredReview | null
}
export interface Kv { get(key: string): unknown; set(key: string, value: unknown): boolean }
export interface Backup {
  app: 'archstory'; kind: 'practice-backup'; version: 1; exportedAt: string
  attempts: Record<string, Design>; reviews: Record<string, StoredReview>; snapshots: Record<string, Snapshot[]>
  /** Follow-up question review schedule (added later; older backups do not have it). */
  deck?: Deck
}

export const attemptKey = (id: string) => `archstory.attempt.${id}`
export const reviewKey = (id: string) => `archstory.review.${id}`
export const snapshotsKey = (id: string) => `archstory.snapshots.${id}`
export const DECK_KEY = 'archstory.deck'

export const loadSnapshots = (kv: Kv, id: string): Snapshot[] => {
  const v = kv.get(snapshotsKey(id))
  return Array.isArray(v) ? v.filter(isSnapshot) : []
}

function isSnapshot(v: unknown): v is Snapshot {
  const s = v as Snapshot
  return !!s && typeof s.id === 'string' && typeof s.name === 'string' && typeof s.at === 'string' && !!s.design
    && typeof s.passed === 'number' && typeof s.total === 'number'
}

/** "Attempt N" with N one more than the highest already used, so deleting one never reuses a name. */
export function nextName(list: Snapshot[]): string {
  const used = list.map(s => /^Attempt (\d+)$/.exec(s.name)?.[1]).filter(Boolean).map(Number)
  return `Attempt ${Math.max(0, ...used) + 1}`
}

export function newSnapshot(list: Snapshot[], design: Design, score: { passed: number; total: number }, review: StoredReview | null, name: string, now: Date): Snapshot {
  return {
    id: `s${now.getTime().toString(36)}${list.length}`, name: name.trim() || nextName(list), at: now.toISOString(), design,
    passed: score.passed, total: score.total, overall: review?.review.overall ?? null, review,
  }
}

/** Newest first, capped so browser storage does not fill up. */
export const addSnapshot = (list: Snapshot[], s: Snapshot): Snapshot[] =>
  [s, ...list.filter(x => x.id !== s.id)].sort((a, b) => b.at.localeCompare(a.at)).slice(0, MAX_SNAPSHOTS)

/** Change in the share of checks passed, in percentage points, against the next older snapshot. The check count itself shifts as an answer grows, so raw counts are not comparable. */
export function trend(list: Snapshot[], i: number): number | null {
  const a = list[i], b = list[i + 1]
  if (!a || !b || !a.total || !b.total) return null
  return Math.round((a.passed / a.total - b.passed / b.total) * 100)
}

export function collectBackup(problemIds: string[], kv: Kv, now: Date): Backup {
  const out: Backup = { app: 'archstory', kind: 'practice-backup', version: 1, exportedAt: now.toISOString(), attempts: {}, reviews: {}, snapshots: {} }
  for (const id of problemIds) {
    const a = kv.get(attemptKey(id)) as Design | null
    if (a && a.nodes?.length) out.attempts[id] = a
    const r = kv.get(reviewKey(id)) as StoredReview | null
    if (r && out.attempts[id]) out.reviews[id] = r
    const s = loadSnapshots(kv, id)
    if (s.length) out.snapshots[id] = s
  }
  const deck = cleanDeck(kv.get(DECK_KEY))
  if (Object.keys(deck).length) out.deck = deck
  return out
}

export type BackupResult = { ok: true; backup: Backup; skipped: string[] } | { ok: false; errors: string[] }

/** Accepts only a backup this app wrote; designs are re-validated and problems that no longer exist are skipped. */
export function parseBackup(input: unknown, problemIds: string[]): BackupResult {
  const b = input as Partial<Backup> | null
  if (!b || typeof b !== 'object' || b.app !== 'archstory' || b.kind !== 'practice-backup') {
    return { ok: false, errors: ['This is not an ArchStory practice backup. Use "Back up" in the Attempts section to make one.'] }
  }
  if (b.version !== 1) return { ok: false, errors: [`Unsupported backup version: ${String(b.version)}.`] }
  const known = new Set(problemIds), skipped: string[] = []
  const out: Backup = { app: 'archstory', kind: 'practice-backup', version: 1, exportedAt: String(b.exportedAt ?? ''), attempts: {}, reviews: {}, snapshots: {} }
  const valid = (d: unknown) => { const r = parseDesign(d); return r.ok ? r.design : null }
  for (const [id, d] of Object.entries(b.attempts ?? {})) {
    if (!known.has(id)) { skipped.push(`${id}: problem not in this version`); continue }
    const design = valid(d)
    if (design) out.attempts[id] = design; else skipped.push(`${id}: attempt is not a valid design`)
  }
  for (const [id, r] of Object.entries(b.reviews ?? {})) {
    if (known.has(id) && r && typeof r === 'object' && 'review' in r && 'sig' in r) out.reviews[id] = r as StoredReview
  }
  for (const [id, list] of Object.entries(b.snapshots ?? {})) {
    if (!known.has(id)) { skipped.push(`${id}: problem not in this version`); continue }
    const ok = (Array.isArray(list) ? list : []).filter(isSnapshot).flatMap(s => { const design = valid(s.design); return design ? [{ ...s, design }] : [] })
    if (ok.length) out.snapshots[id] = ok
  }
  const deck = cleanDeck(b.deck)
  if (Object.keys(deck).length) out.deck = deck
  if (!Object.keys(out.attempts).length && !Object.keys(out.snapshots).length && !out.deck) return { ok: false, errors: ['The backup holds no usable attempts.', ...skipped] }
  return { ok: true, backup: out, skipped }
}

/** Equal after validation, which fills in schema defaults on both sides. */
const sameDesign = (a: Design, b: Design) => {
  const norm = (d: Design) => { const r = parseDesign(d); return JSON.stringify(r.ok ? r.design : d) }
  return norm(a) === norm(b)
}

/**
 * Writes a backup into storage without losing anything: snapshots are merged by id, and a current answer that
 * differs from the backed-up one is first saved as a "Before restore" snapshot.
 */
export function applyBackup(backup: Backup, kv: Kv, now: Date, score: (id: string, d: Design) => { passed: number; total: number }): { attempts: number; snapshots: number; kept: number } {
  let attempts = 0, snapshots = 0, kept = 0
  const ids = new Set([...Object.keys(backup.attempts), ...Object.keys(backup.snapshots)])
  for (const id of ids) {
    let list = loadSnapshots(kv, id)
    const current = kv.get(attemptKey(id)) as Design | null
    const incoming = backup.attempts[id]
    if (incoming && current?.nodes?.length && !sameDesign(current, incoming)) {
      const review = kv.get(reviewKey(id)) as StoredReview | null
      list = addSnapshot(list, newSnapshot(list, current, score(id, current), review, 'Before restore', now)); kept++
    }
    for (const s of backup.snapshots[id] ?? []) {
      if (!list.some(x => x.id === s.id)) snapshots++
      list = addSnapshot(list, s)
    }
    kv.set(snapshotsKey(id), list)
    if (incoming) {
      kv.set(attemptKey(id), incoming); attempts++
      if (backup.reviews[id]) kv.set(reviewKey(id), backup.reviews[id])
    }
  }
  if (backup.deck) {
    const mine = cleanDeck(kv.get(DECK_KEY))
    for (const [k, c] of Object.entries(backup.deck)) if (!mine[k] || c.seen > mine[k].seen) mine[k] = c
    kv.set(DECK_KEY, mine)
  }
  return { attempts, snapshots, kept }
}
