import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { layoutBands } from '../layout/bands'
import { LIBRARY } from '../library'
import { addAlert, addNode, addSlo, blankAttempt, emptyObservability, updateSlo } from '../practice/attempt'
import { MonitoringEditor } from './MonitoringEditor'

const ref = LIBRARY.find(d => d.id === 'multi-tenant-saas')!
const answer = ['web_client', 'service', 'sql_db'].reduce((d, k) => addNode(d, k).design, blankAttempt(ref))

describe('MonitoringEditor', () => {
  it('shows an empty plan with the add buttons, and a filled one with its error budget', () => {
    const empty = renderToStaticMarkup(createElement(MonitoringEditor, { design: answer, setAttempt: () => {}, layerOn: false, onLayer: () => {} }))
    expect(empty).toContain('+ Add an SLO')
    expect(empty).toContain('+ Add an alert')
    expect(empty).toContain('Show monitoring on the canvas')
    let d = addAlert(addSlo(answer))
    d = updateSlo(d, 'slo_1', { name: 'Checkout availability', target: 99.9 })
    const filled = renderToStaticMarkup(createElement(MonitoringEditor, { design: d, setAttempt: () => {}, layerOn: true, onLayer: () => {} }))
    expect(filled).toContain('Checkout availability')
    expect(filled).toContain('Error budget:')
    expect(filled).toContain('Hide monitoring on the canvas')
    expect(filled).not.toContain('—')
  })
  it('lets the canvas draw the monitoring lane for an answer with no SLOs yet', () => {
    const L = layoutBands({ ...answer, observability: emptyObservability() }, { observability: true })
    expect(L.obs).not.toBeNull()
  })
})
