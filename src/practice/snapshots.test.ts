import { describe, expect, it } from 'vitest'
import { LIBRARY } from '../library'
import { addNode, blankAttempt } from './attempt'
import { addSnapshot, applyBackup, attemptKey, collectBackup, loadSnapshots, MAX_SNAPSHOTS, newSnapshot, nextName, parseBackup, reviewKey, snapshotsKey, trend, type Kv } from './snapshots'

const ref = LIBRARY[0]
const ids = LIBRARY.map(d => d.id)
const answer = (kinds: string[]) => kinds.reduce((d, k) => addNode(d, k).design, blankAttempt(ref))
const memory = (): Kv & { data: Map<string, unknown> } => {
  const data = new Map<string, unknown>()
  return { data, get: k => (data.has(k) ? JSON.parse(JSON.stringify(data.get(k))) : null), set: (k, v) => { data.set(k, v); return true } }
}
const at = (n: number) => new Date(Date.UTC(2026, 0, 1, 0, 0, n))
const snap = (list: Parameters<typeof newSnapshot>[0], passed: number, n: number, name = '') =>
  newSnapshot(list, answer(['client']), { passed, total: 10 }, null, name, at(n))

describe('snapshots', () => {
  it('names attempts in sequence and never reuses a deleted number', () => {
    let list = addSnapshot([], snap([], 3, 1))
    list = addSnapshot(list, snap(list, 5, 2))
    expect(list.map(s => s.name)).toEqual(['Attempt 2', 'Attempt 1'])
    expect(nextName(list.filter(s => s.name === 'Attempt 1'))).toBe('Attempt 2')
    expect(snap(list, 6, 3, '  Redo with queue ').name).toBe('Redo with queue')
  })

  it('keeps the newest first and caps the list', () => {
    let list: ReturnType<typeof addSnapshot> = []
    for (let i = 0; i < MAX_SNAPSHOTS + 5; i++) list = addSnapshot(list, snap(list, i % 10, i))
    expect(list).toHaveLength(MAX_SNAPSHOTS)
    expect(list[0].at > list[1].at).toBe(true)
  })

  it('shows the change in pass rate in points, even when the check count differs', () => {
    let list = addSnapshot([], snap([], 4, 1))
    list = addSnapshot(list, snap(list, 7, 2))
    expect(trend(list, 0)).toBe(30)
    expect(trend(list, 1)).toBeNull()
    const other = newSnapshot(list, answer(['client']), { passed: 9, total: 12 }, null, '', at(3))
    expect(trend(addSnapshot(list, other), 0)).toBe(5)
    const none = newSnapshot(list, answer(['client']), { passed: 0, total: 0 }, null, '', at(4))
    expect(trend(addSnapshot(list, none), 0)).toBeNull()
  })
})

describe('practice backup', () => {
  const seed = () => {
    const kv = memory()
    const mine = answer(['client', 'service'])
    kv.set(attemptKey(ref.id), mine)
    kv.set(snapshotsKey(ref.id), addSnapshot([], newSnapshot([], mine, { passed: 2, total: 8 }, null, '', at(1))))
    return { kv, mine }
  }

  it('round-trips attempts and snapshots through JSON', () => {
    const { kv, mine } = seed()
    const file = JSON.parse(JSON.stringify(collectBackup(ids, kv, at(5))))
    const r = parseBackup(file, ids)
    expect(r.ok && r.backup.attempts[ref.id].nodes).toHaveLength(mine.nodes.length)
    const fresh = memory()
    if (r.ok) applyBackup(r.backup, fresh, at(6), () => ({ passed: 0, total: 0 }))
    expect(loadSnapshots(fresh, ref.id)).toHaveLength(1)
    expect((fresh.get(attemptKey(ref.id)) as { nodes: unknown[] }).nodes).toHaveLength(2)
  })

  it('omits problems with no work', () => {
    expect(Object.keys(collectBackup(ids, memory(), at(1)).attempts)).toEqual([])
  })

  it('rejects files that are not backups and skips unknown problems and invalid designs', () => {
    expect(parseBackup({ schema: 'archstory/v1' }, ids).ok).toBe(false)
    expect(parseBackup(null, ids).ok).toBe(false)
    const { kv } = seed()
    const file = JSON.parse(JSON.stringify(collectBackup(ids, kv, at(5))))
    file.attempts['no-such-problem'] = file.attempts[ref.id]
    file.attempts[ids[1]] = { nope: true }
    const r = parseBackup(file, ids)
    expect(r.ok && r.skipped.length).toBe(2)
    expect(parseBackup({ ...file, version: 2 }, ids).ok).toBe(false)
  })

  it('never loses a different current answer: it becomes a "Before restore" snapshot', () => {
    const { kv } = seed()
    const file = JSON.parse(JSON.stringify(collectBackup(ids, kv, at(5))))
    const current = answer(['client', 'service', 'cache', 'database'])
    kv.set(attemptKey(ref.id), current)
    kv.set(reviewKey(ref.id), null)
    const r = parseBackup(file, ids)
    const summary = r.ok ? applyBackup(r.backup, kv, at(9), () => ({ passed: 1, total: 8 })) : null
    expect(summary?.kept).toBe(1)
    const list = loadSnapshots(kv, ref.id)
    expect(list.map(s => s.name)).toContain('Before restore')
    expect(list.find(s => s.name === 'Before restore')!.design.nodes).toHaveLength(4)
    expect((kv.get(attemptKey(ref.id)) as { nodes: unknown[] }).nodes).toHaveLength(2)
  })

  it('restoring the same backup twice adds nothing new', () => {
    const { kv } = seed()
    const r = parseBackup(JSON.parse(JSON.stringify(collectBackup(ids, kv, at(5)))), ids)
    if (!r.ok) throw new Error('parse')
    const first = applyBackup(r.backup, kv, at(6), () => ({ passed: 0, total: 0 }))
    expect(first).toEqual({ attempts: 1, snapshots: 0, kept: 0 })
    expect(loadSnapshots(kv, ref.id)).toHaveLength(1)
  })
})
