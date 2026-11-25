import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { LIBRARY } from '../library'
import { signalsFor, TELEMETRY, telemetryLinks } from '../model/observability'
import { MonitoringPanel } from './MonitoringPanel'
import { TelemetryPartCard } from './TelemetryPartCard'

const mt = LIBRARY.find(d => d.id === 'multi-tenant-saas')!

describe('telemetry parts', () => {
  it('have their own signals instead of the generic service ones, and know what feeds them', () => {
    for (const t of TELEMETRY.filter(x => x.id !== 'obs:collector')) {
      const metrics = signalsFor(t.kind).map(s => s.metric).join(' ')
      expect(metrics, t.id).not.toContain('http_server')
    }
    expect(telemetryLinks('obs:collector').from).toEqual([])
    expect(telemetryLinks('obs:collector').to.map(t => t.id)).toEqual(['obs:metrics', 'obs:logs', 'obs:traces'])
    expect(telemetryLinks('obs:oncall').to).toEqual([])
    expect(telemetryLinks('obs:alerts').from.map(t => t.id)).toEqual(['obs:metrics'])
  })
  it('show a card with the product for the chosen cloud, what feeds it and what to watch', () => {
    const aws = renderToStaticMarkup(createElement(TelemetryPartCard, { id: 'obs:traces', cloud: 'aws' }))
    expect(aws).toContain('X-Ray')
    expect(aws).toContain('Receives from')
    expect(aws).toContain('AWS Distro for OpenTelemetry')
    expect(aws).toContain('engineers query it')
    expect(aws).toContain('What to watch on it')
    expect(aws).toContain('trace_spans_dropped_total')
    expect(renderToStaticMarkup(createElement(TelemetryPartCard, { id: 'obs:traces', cloud: 'gcp' }))).toContain('Cloud Trace')
    expect(renderToStaticMarkup(createElement(TelemetryPartCard, { id: 'obs:oncall', cloud: 'neutral' }))).toContain('a person takes over')
    expect(renderToStaticMarkup(createElement(TelemetryPartCard, { id: 'obs:nothing', cloud: 'aws' }))).toBe('')
    expect(aws).not.toContain('—')
  })
  it('appear at the top of the Monitoring tab when one is selected, and not for an ordinary component', () => {
    const sel = renderToStaticMarkup(createElement(MonitoringPanel, { design: mt, cloud: 'aws', selected: 'obs:traces', onSelect: () => {} }))
    expect(sel.indexOf('Part of the telemetry stack')).toBeGreaterThan(-1)
    expect(sel.indexOf('Part of the telemetry stack')).toBeLessThan(sel.indexOf('Service level objectives'))
    expect(sel).not.toContain('Click a component to see its four golden signals')
    const plain = renderToStaticMarkup(createElement(MonitoringPanel, { design: mt, cloud: 'aws', selected: 'app', onSelect: () => {} }))
    expect(plain).not.toContain('Part of the telemetry stack')
    expect(plain).toContain('What to watch on')
  })
})
