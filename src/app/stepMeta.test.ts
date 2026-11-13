import { describe, expect, it } from 'vitest'
import { PROTOCOLS } from '../protocols'
import { rttTimes } from '../model/protocol'
import { resolvePhases } from '../model/phases'
import { customRttNote, stepMetaText } from './stepMeta'

// The Inspector's Flow tab builds its step meta line with stepMetaText; the TCP "Packet loss" scenario has lost steps and waits.
const tcp = PROTOCOLS.find(p => p.id === 'tcp')!
const loss = tcp.flows.find(f => f.id === 'loss')!
const metaAt = (i: number, rttMs: number, custom = false) =>
  stepMetaText({ step: i, total: loss.steps.length, phase: resolvePhases(loss.steps)[i], at: rttTimes(loss.steps, rttMs)[i], lost: loss.steps[i].lost, rttMs, custom })

describe('Flow tab step meta line', () => {
  it('says "lost in the network" for a lost step and gives no time for it', () => {
    expect(loss.steps[2].lost).toBe(true)
    const t = metaAt(2, 50)
    expect(t).toContain(`Step 3 of ${loss.steps.length}`)
    expect(t).toContain('lost in the network')
    expect(t).not.toMatch(/ at \d/)
  })

  it('gives the time of a wait step from its fixed milliseconds, which do not scale with the distance', () => {
    const i = loss.steps.findIndex(s => s.wait === 1000)
    expect(i).toBeGreaterThan(0)
    const at50 = rttTimes(loss.steps, 50), at150 = rttTimes(loss.steps, 150)
    expect((at50[i] - at50[i - 1]) * 50).toBeCloseTo(1000, 6)
    expect((at150[i] - at150[i - 1]) * 150).toBeCloseTo(1000, 6)
    expect(metaAt(i, 50)).toMatch(/ · at [\d.]+ RTT, [\d.,]+ (ms|s)$/)
    expect(metaAt(i, 50)).not.toContain('lost')
  })

  it('shows the phase when the step has one and the round trip time when the distance is not the module reference', () => {
    expect(stepMetaText({ step: 0, total: 4, phase: 'Handshake', at: 0.5, rttMs: 50, custom: false })).toBe('Step 1 of 4 · Handshake · at 0.5 RTT, 25 ms')
    expect(stepMetaText({ step: 0, total: 4, at: 1.5, rttMs: 150, custom: true })).toBe('Step 1 of 4 · at 1.5 RTT, 225 ms (at 150 ms round trip)')
    expect(stepMetaText({ step: 1, total: 4, at: 0, lost: true, rttMs: 10, custom: true })).toBe('Step 2 of 4 · lost in the network (at 10 ms round trip)')
  })

  it('is just the step count for a design with no clock', () => {
    expect(stepMetaText({ step: 2, total: 5, phase: 'Reads', at: null, rttMs: 50, custom: true })).toBe('Step 3 of 5 · Reads')
  })

  it('writes a custom distance without float noise', () => {
    expect(customRttNote(70)).toBe('70 ms round trip')
    expect(customRttNote(12.34)).toBe('12.3 ms round trip')
  })
})
