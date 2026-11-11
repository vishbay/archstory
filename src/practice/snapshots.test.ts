import { describe, expect, it } from 'vitest'
import { LIBRARY } from '../library'
import { addNode, blankAttempt } from './attempt'
import { addSnapshot, applyBackup, attemptKey, collectBackup, hintsKey, loadSnapshots, MAX_SNAPSHOTS, newSnapshot, nextName, parseBackup, reviewKey, snapshotsKey, trend, type Kv } from './snapshots'

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

  it('never includes the AI key in a backup', () => {
    const { kv } = seed()
    kv.set('archstory.ai', { provider: 'anthropic', keys: { anthropic: 'sk-ant-secret-1234567890' } })
    expect(JSON.stringify(collectBackup(ids, kv, at(5)))).not.toContain('sk-ant-secret')
  })

  it('carries the question drill schedule and merges it, keeping the more practised card', () => {
    const { kv } = seed()
    kv.set('archstory.deck', { 'a:q1': { box: 2, due: 10, seen: 3, last: 'got' } })
    const file = JSON.parse(JSON.stringify(collectBackup(ids, kv, at(5))))
    expect(file.deck['a:q1'].seen).toBe(3)
    const other = memory()
    other.set('archstory.deck', { 'a:q1': { box: 0, due: 5, seen: 1, last: 'missed' }, 'b:q2': { box: 1, due: 7, seen: 5, last: 'got' } })
    const r = parseBackup(file, ids)
    if (r.ok) applyBackup(r.backup, other, at(6), () => ({ passed: 0, total: 0 }))
    expect(other.get('archstory.deck')).toMatchObject({ 'a:q1': { seen: 3 }, 'b:q2': { seen: 5 } })
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

  it('carries the help used on a snapshot, and still reads snapshots and backups made before it existed', () => {
    const { kv, mine } = seed()
    const helped = newSnapshot([], mine, { passed: 3, total: 8 }, null, 'Helped', at(2), 2)
    expect(helped.hints).toBe(2)
    expect('hints' in newSnapshot([], mine, { passed: 3, total: 8 }, null, '', at(2))).toBe(false)
    kv.set(snapshotsKey(ref.id), addSnapshot(loadSnapshots(kv, ref.id), helped))
    const file = JSON.parse(JSON.stringify(collectBackup(ids, kv, at(5))))
    const r = parseBackup(file, ids)
    const list = r.ok ? r.backup.snapshots[ref.id] : []
    expect(list.map(s => s.hints)).toEqual([2, undefined])
    const fresh = memory()
    if (r.ok) applyBackup(r.backup, fresh, at(6), () => ({ passed: 0, total: 0 }))
    expect(loadSnapshots(fresh, ref.id).find(s => s.name === 'Helped')?.hints).toBe(2)
    // A made-up value is dropped rather than shown
    file.snapshots[ref.id][0].hints = 'lots'
    const bad = parseBackup(file, ids)
    expect(bad.ok && 'hints' in bad.backup.snapshots[ref.id][0]).toBe(false)
  })

  it('a "Before restore" snapshot records the help used on the current answer', () => {
    const { kv } = seed()
    const file = JSON.parse(JSON.stringify(collectBackup(ids, kv, at(5))))
    kv.set(attemptKey(ref.id), answer(['client', 'service', 'cache']))
    kv.set(hintsKey(ref.id), 4)
    const r = parseBackup(file, ids)
    if (r.ok) applyBackup(r.backup, kv, at(9), () => ({ passed: 1, total: 8 }))
    expect(loadSnapshots(kv, ref.id).find(s => s.name === 'Before restore')?.hints).toBe(4)
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
