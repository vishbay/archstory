import { describe, expect, it } from 'vitest'
import { nextScenario } from './scenarios'
import { panelInsets } from './hooks'

const flows = [{ id: 'a', title: 'A' }, { id: 'b', title: 'B' }, { id: 'c', title: 'C' }]

describe('nextScenario', () => {
  it('offers the next scenario, and wraps to the first after the last', () => {
    expect(nextScenario(flows, 'a')).toEqual({ flow: flows[1], wrapped: false })
    expect(nextScenario(flows, 'c')).toEqual({ flow: flows[0], wrapped: true })
  })
  it('offers nothing when there is only one scenario or the current one is unknown', () => {
    expect(nextScenario([flows[0]], 'a')).toBeNull()
    expect(nextScenario(flows, 'zzz')).toBeNull()
  })
})

describe('panelInsets', () => {
  it('reserves the panel widths on a wide screen, and less on a compact one', () => {
    expect(panelInsets(1440, true, true)).toEqual({ left: 300, right: 380 })
    expect(panelInsets(1100, true, true)).toEqual({ left: 280, right: 340 })
  })
  it('reserves only a margin for a closed panel, and nothing when the panels stack', () => {
    expect(panelInsets(1440, false, false)).toEqual({ left: 12, right: 12 })
    expect(panelInsets(800, true, true)).toEqual({ left: 12, right: 12 })
  })
})
