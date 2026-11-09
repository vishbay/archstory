import { describe, expect, it } from 'vitest'
import { phaseGroups, resolvePhases } from './phases'

const steps = (...p: (string | undefined)[]) => p.map(phase => ({ phase }))

describe('phases', () => {
  it('groups consecutive steps with the same phase', () => {
    expect(phaseGroups(steps('DNS', 'DNS', 'Request in', 'Request in', 'Request in', 'Response')))
      .toEqual([{ name: 'DNS', start: 0, end: 1 }, { name: 'Request in', start: 2, end: 4 }, { name: 'Response', start: 5, end: 5 }])
  })
  it('lets a step with no phase continue the previous stage', () => {
    expect(resolvePhases(steps('A', undefined, 'B', undefined))).toEqual(['A', 'A', 'B', 'B'])
    expect(phaseGroups(steps('A', undefined, 'B'))).toEqual([{ name: 'A', start: 0, end: 1 }, { name: 'B', start: 2, end: 2 }])
  })
  it('returns null when no step has a phase, so the list stays flat', () => {
    expect(phaseGroups(steps(undefined, undefined))).toBeNull()
    expect(phaseGroups([])).toBeNull()
  })
  it('keeps unnamed leading steps in their own group', () => {
    expect(phaseGroups(steps(undefined, 'A'))).toEqual([{ name: '', start: 0, end: 0 }, { name: 'A', start: 1, end: 1 }])
  })
  it('treats the same name that reappears later as a new group', () => {
    expect(phaseGroups(steps('A', 'B', 'A'))?.map(g => g.name)).toEqual(['A', 'B', 'A'])
  })
})
