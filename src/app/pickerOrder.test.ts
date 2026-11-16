import { describe, expect, it } from 'vitest'
import { LIBRARY } from '../library'
import { PROTOCOLS } from '../protocols'
import { byDifficulty } from './pickerOrder'

const d = (_id: string, difficulty?: 'easy' | 'medium' | 'hard') => ({ meta: { difficulty } }) as never as import('../model/schema').Design & { id: string }

describe('picker order', () => {
  it('lists easy, then medium, then hard, then designs with no difficulty, keeping ties in order', () => {
    const items = [{ id: 'h1', x: d('h1', 'hard') }, { id: 'none', x: d('none') }, { id: 'e1', x: d('e1', 'easy') }, { id: 'm1', x: d('m1', 'medium') }, { id: 'e2', x: d('e2', 'easy') }, { id: 'h2', x: d('h2', 'hard') }]
    expect(byDifficulty(items, i => i.x).map(i => i.id)).toEqual(['e1', 'e2', 'm1', 'h1', 'h2', 'none'])
  })
  it('puts the library in a rising difficulty order', () => {
    const order = byDifficulty(LIBRARY, x => x).map(x => x.meta.difficulty)
    const rank = { easy: 0, medium: 1, hard: 2 } as const
    const ranks = order.filter(Boolean).map(x => rank[x!])
    expect(ranks).toEqual([...ranks].sort((a, b) => a - b))
    expect(PROTOCOLS.length).toBeGreaterThan(0)
  })
})
