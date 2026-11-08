import { describe, expect, it } from 'vitest'
import { commit, initHistory, redo, undo } from './history'

describe('history', () => {
  it('undoes and redoes, and a new edit clears redo', () => {
    let h = commit(commit(initHistory('a'), 'b', undefined, 0), 'c', undefined, 10)
    h = undo(h); expect(h.present).toBe('b')
    h = undo(h); expect(h.present).toBe('a')
    expect(undo(h)).toBe(h)
    h = redo(h); expect(h.present).toBe('b')
    h = commit(h, 'x', undefined, 20); expect(h.future).toEqual([])
  })
  it('collapses rapid edits to the same field into one step', () => {
    let h = initHistory('')
    for (const [v, t] of [['S', 0], ['Se', 200], ['Ser', 400]] as const) h = commit(h, v, 'label:svc', t)
    expect(h.past).toEqual(['']); expect(undo(h).present).toBe('')
    h = commit(h, 'Serv', 'label:svc', 3000)               // a pause starts a new step
    expect(h.past).toEqual(['', 'Ser'])
    h = commit(h, 'z', 'label:other', 3100)                 // a different field starts a new step
    expect(h.past).toEqual(['', 'Ser', 'Serv'])
  })
})
