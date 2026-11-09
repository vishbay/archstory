import { describe, expect, it } from 'vitest'
import { KINDS } from './kinds'
import { budgetText, emits, isTelemetry, signalsFor, telemetryNodes, TELEMETRY_EDGES, traceId } from './observability'

describe('standard signals', () => {
  it('every known kind has the four golden signals, one of each', () => {
    for (const kind of Object.keys(KINDS)) {
      const s = signalsFor(kind)
      expect(s.map(x => x.signal).sort(), kind).toEqual(['errors', 'latency', 'saturation', 'traffic'])
      for (const x of s) { expect(x.what.length).toBeGreaterThan(5); expect(x.metric).toBeTruthy() }
    }
  })
  it('falls back to service signals for an unknown kind', () => {
    expect(signalsFor('quantum_thing')).toEqual(signalsFor('service'))
  })
  it('says which telemetry each kind emits', () => {
    expect(emits('service')).toEqual({ metrics: true, logs: true, traces: true })
    expect(emits('sql_db')).toEqual({ metrics: true, logs: true, traces: false })
    expect(emits('dns')).toEqual({ metrics: true, logs: false, traces: false })
    expect(emits('payment_provider')).toEqual({ metrics: false, logs: false, traces: false })
  })
})

describe('error budgets', () => {
  it('turns an availability target into minutes of outage', () => {
    expect(budgetText({ kind: 'availability', target: 99.9, window: 30 })).toMatch(/^43\.2 minutes of full outage per 30 days/)
    expect(budgetText({ kind: 'availability', target: 99.99, window: 30 })).toMatch(/^4\.3 minutes/)
    expect(budgetText({ kind: 'availability', target: 99.999, window: 30 })).toMatch(/^26 seconds/)
    expect(budgetText({ kind: 'availability', target: 99, window: 30 })).toMatch(/^7\.2 hours/)
  })
  it('describes other SLOs as a share of events and handles a 100% target', () => {
    expect(budgetText({ kind: 'latency', target: 99, window: 30, threshold: '< 100 ms' })).toBe('1% of events may miss "< 100 ms" per 30 days')
    expect(budgetText({ kind: 'correctness', target: 100, window: 30 })).toBe('No budget: a single miss is an incident')
  })
})

describe('telemetry stack and traces', () => {
  it('has six parts connected as collector to stores to alerts to on-call', () => {
    const nodes = telemetryNodes()
    expect(nodes).toHaveLength(6)
    expect(nodes.every(n => isTelemetry(n.id) && KINDS[n.kind])).toBe(true)
    const ids = new Set(nodes.map(n => n.id))
    expect(TELEMETRY_EDGES.every(([a, b]) => ids.has(a) && ids.has(b))).toBe(true)
  })
  it('makes a stable 16-hex trace id per flow', () => {
    expect(traceId('hit')).toBe(traceId('hit'))
    expect(traceId('hit')).not.toBe(traceId('miss'))
    expect(traceId('hit')).toMatch(/^[0-9a-f]{16}$/)
  })
})
