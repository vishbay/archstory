import { describe, expect, it } from 'vitest'
import { LIBRARY } from '../library'
import { addAlert, addNode, addSlo, blankAttempt, connect, removeAlert, removeNode, removeSlo, updateAlert, updateSlo, writtenMonitoring } from './attempt'
import { runChecks } from './checks'
import { designBrief } from './interview'
import { attemptReport } from './report'
import { reviewPrompt, signature } from './review'

const ref = LIBRARY.find(d => d.id === 'multi-tenant-saas')!
const base = () => ['web_client', 'service', 'sql_db'].reduce((d, k) => addNode(d, k).design, blankAttempt(ref))
const planned = () => {
  let d = base()
  d = addSlo(d)
  const slo = d.observability!.slos[0]
  d = updateSlo(d, slo.id, { name: 'API availability', kind: 'availability', target: 99.95, sli: 'Requests without a 5xx, at the gateway' })
  d = addAlert(d)
  const alert = d.observability!.alerts[0]
  d = updateAlert(d, alert.id, { severity: 'page', when: 'Error budget burning at 14x for 5 minutes', why: 'Users are failing now', slo: slo.id, target: d.nodes[0].id })
  return d
}

describe('monitoring plan', () => {
  it('adds, edits and removes SLOs and alerts, with ids that stay unique', () => {
    let d = addSlo(addSlo(base()))
    expect(d.observability!.slos.map(s => s.id)).toEqual(['slo_1', 'slo_2'])
    d = removeSlo(d, 'slo_1')
    expect(addSlo(d).observability!.slos.map(s => s.id)).toEqual(['slo_2', 'slo_1'])
    const p = planned()
    expect(p.observability!.alerts[0].slo).toBe('slo_1')
    const dropped = removeSlo(p, 'slo_1')
    expect(dropped.observability!.alerts[0].slo).toBeUndefined()
    expect(removeAlert(dropped, 'alert_1').observability).toBeUndefined()
  })
  it('counts only filled in SLOs and alerts as part of the answer', () => {
    const blank = addAlert(addSlo(base()))
    expect(writtenMonitoring(blank)).toEqual({ slos: [], alerts: [] })
    const w = writtenMonitoring(planned())
    expect(w.slos).toHaveLength(1)
    expect(w.alerts).toHaveLength(1)
  })
  it('forgets an alert target when its component is deleted, and cannot connect to a component that is not there', () => {
    const d = planned()
    const gone = removeNode(d, d.nodes[0].id)
    expect(gone.observability!.alerts[0].target).toBeUndefined()
    expect(connect(d, d.nodes[0].id, 'obs:collector')).toBe(d)
  })
  it('satisfies the monitoring check once something is written, and not for blank forms', () => {
    const find = (d: ReturnType<typeof base>) => runChecks(d, ref).checks.find(c => c.id === 'monitoring')
    expect(find(base())?.level).toBe('warn')
    expect(find(addSlo(base()))?.level).toBe('warn')
    expect(find(planned())?.level).toBe('pass')
  })
  it('reaches the review prompt, the interviewer brief, the report and the signature', () => {
    const d = planned()
    expect(reviewPrompt(d, ref, [], false)).toContain('"monitoring":{"slos":[')
    expect(reviewPrompt(addSlo(base()), ref, [], false)).not.toContain('"monitoring"')
    expect(designBrief(d)).toContain('SLOs they defined:')
    expect(designBrief(d)).toContain('- [page] Error budget burning at 14x for 5 minutes (Users are failing now)')
    const md = attemptReport({ attempt: d, reference: ref, review: null, at: new Date('2026-11-24') })
    expect(md).toContain('## My monitoring plan')
    expect(md).toContain('API availability (availability): 99.95%')
    expect(md).toContain('Page: Error budget burning at 14x for 5 minutes')
    expect(signature(d)).not.toBe(signature(base()))
    expect(signature(addSlo(base()))).toBe(signature(base()))
  })
})
