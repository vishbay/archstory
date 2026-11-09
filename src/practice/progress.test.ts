import { describe, expect, it } from 'vitest'
import { LIBRARY } from '../library'
import { addNode, blankAttempt } from './attempt'
import { percent, practised, progressOf } from './progress'
import { addSnapshot, attemptKey, newSnapshot, reviewKey, snapshotsKey, type Kv } from './snapshots'

const ref = LIBRARY[0]
const memory = (): Kv => { const m = new Map<string, unknown>(); return { get: k => (m.has(k) ? JSON.parse(JSON.stringify(m.get(k))) : null), set: (k, v) => (m.set(k, v), true) } }
const answer = addNode(blankAttempt(ref), 'client').design
const score = (p: number, t: number) => () => ({ passed: p, total: t })

describe('progressOf', () => {
  it('is empty for a problem never touched', () => {
    const p = progressOf(memory(), ref, score(0, 0))
    expect(p).toEqual({ inProgress: false, attempts: 0, best: null, review: null })
    expect(practised(p)).toBe(false)
  })

  it('counts an answer in progress and scores it', () => {
    const kv = memory(); kv.set(attemptKey(ref.id), answer)
    const p = progressOf(kv, ref, score(6, 12))
    expect(p.inProgress && practised(p)).toBe(true)
    expect(p.best).toEqual({ passed: 6, total: 12 })
  })

  it('takes the best pass rate across attempts and the current answer, even when totals differ', () => {
    const kv = memory(); kv.set(attemptKey(ref.id), answer)
    let list = addSnapshot([], newSnapshot([], answer, { passed: 9, total: 12 }, null, '', new Date(1000)))
    list = addSnapshot(list, newSnapshot(list, answer, { passed: 8, total: 16 }, null, '', new Date(2000)))
    kv.set(snapshotsKey(ref.id), list)
    const p = progressOf(kv, ref, score(7, 15))
    expect(p.attempts).toBe(2)
    expect(p.best).toEqual({ passed: 9, total: 12 })
    expect(percent(p.best!)).toBe(75)
  })

  it('reports saved attempts even after the working answer is cleared', () => {
    const kv = memory()
    kv.set(snapshotsKey(ref.id), addSnapshot([], newSnapshot([], answer, { passed: 3, total: 10 }, null, '', new Date(1000))))
    const p = progressOf(kv, ref, score(0, 0))
    expect(p.inProgress).toBe(false)
    expect(practised(p)).toBe(true)
    expect(p.best).toEqual({ passed: 3, total: 10 })
  })

  it('takes the best review score from attempts and the current review', () => {
    const kv = memory(); kv.set(attemptKey(ref.id), answer)
    const rev = (n: number) => ({ review: { overall: n }, sig: 'x', warnings: [] }) as never
    kv.set(snapshotsKey(ref.id), addSnapshot([], newSnapshot([], answer, { passed: 1, total: 2 }, rev(3), '', new Date(1000))))
    kv.set(reviewKey(ref.id), rev(4))
    expect(progressOf(kv, ref, score(1, 2)).review).toBe(4)
  })
})
