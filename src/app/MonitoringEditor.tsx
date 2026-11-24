import type { Design } from '../model/schema'
import { ALERT_SEVERITIES, SLO_KINDS } from '../model/schema'
import { budgetText } from '../model/observability'
import { addAlert, addSlo, removeAlert, removeSlo, updateAlert, updateSlo } from '../practice/attempt'
import { Seg } from './CanvasToolbar'

const KIND_HELP: Record<string, string> = {
  availability: 'Requests that succeed',
  latency: 'Requests answered fast enough',
  freshness: 'Data that is recent enough',
  durability: 'Data that is not lost',
  correctness: 'Answers that are right',
}
const TIPS = [
  'Pick SLOs from what users notice: success rate and speed first.',
  'Page on symptoms, such as an SLO burning its error budget fast. Send causes, like a full disk, to a ticket or a dashboard.',
  'Give every alert a condition with a threshold and a duration, and say why it pages or only files a ticket.',
]

/** The Monitoring tab: define the SLOs and alerts for your own answer. They count in the checks, the AI review and the interviewer. */
export function MonitoringEditor({ design, setAttempt, layerOn, onLayer }: {
  design: Design; setAttempt: (d: Design, key?: string) => void; layerOn: boolean; onLayer: () => void
}) {
  const o = design.observability
  const slos = o?.slos ?? [], alerts = o?.alerts ?? []
  return (
    <>
      <h3>Monitoring</h3>
      <p className="muted small">How would you know it is healthy, and who gets woken up when it is not? Add the objectives you would hold it to, and the alerts that protect them.</p>
      <button onClick={onLayer} aria-pressed={layerOn}>{layerOn ? 'Hide monitoring on the canvas' : 'Show monitoring on the canvas'}</button>

      <h4>Service level objectives</h4>
      {slos.length === 0 && <p className="muted small">None yet. Start with availability and latency.</p>}
      {slos.map(s => (
        <div key={s.id} className="mon-card">
          <div className="row">
            <label className="field mon-grow">Name
              <input type="text" value={s.name} placeholder="e.g. Checkout availability" onChange={e => setAttempt(updateSlo(design, s.id, { name: e.target.value }), `slo:${s.id}:name`)} />
            </label>
            <button className="link mon-x" onClick={() => setAttempt(removeSlo(design, s.id))} aria-label={`Remove SLO ${s.name || s.id}`} title="Remove">✕</button>
          </div>
          <div className="field-row">
            <label className="field">Kind
              <select value={s.kind} onChange={e => setAttempt(updateSlo(design, s.id, { kind: e.target.value as typeof s.kind }))}>
                {SLO_KINDS.map(k => <option key={k} value={k}>{k[0].toUpperCase() + k.slice(1)}: {KIND_HELP[k]}</option>)}
              </select>
            </label>
            <label className="field">Target, percent
              <input type="number" min={50} max={100} step={0.1} value={s.target}
                onChange={e => { const v = Number(e.target.value); if (Number.isFinite(v)) setAttempt(updateSlo(design, s.id, { target: Math.min(100, Math.max(50, v)) }), `slo:${s.id}:target`) }} />
            </label>
          </div>
          <div className="field-row">
            <label className="field">Good means (optional)
              <input type="text" value={s.threshold ?? ''} placeholder="e.g. < 300 ms" onChange={e => setAttempt(updateSlo(design, s.id, { threshold: e.target.value || undefined }), `slo:${s.id}:th`)} />
            </label>
            <label className="field">Window, days
              <input type="number" min={1} step={1} value={s.window}
                onChange={e => { const v = Math.round(Number(e.target.value)); if (Number.isFinite(v) && v > 0) setAttempt(updateSlo(design, s.id, { window: v }), `slo:${s.id}:win`) }} />
            </label>
          </div>
          <label className="field">How it is measured
            <textarea rows={2} value={s.sli} placeholder="Good events divided by all events, and where it is measured, for example at the load balancer."
              onChange={e => setAttempt(updateSlo(design, s.id, { sli: e.target.value }), `slo:${s.id}:sli`)} />
          </label>
          <p className="muted small">Error budget: {budgetText(s)}.</p>
        </div>
      ))}
      <button onClick={() => setAttempt(addSlo(design))}>+ Add an SLO</button>

      <h4>Alerts</h4>
      {alerts.length === 0 && <p className="muted small">None yet. Think about what should wake someone, and what can wait for the morning.</p>}
      {alerts.map(a => (
        <div key={a.id} className="mon-card">
          <div className="row">
            <Seg label="Severity" value={a.severity} onChange={v => setAttempt(updateAlert(design, a.id, { severity: v }))}
              options={ALERT_SEVERITIES.map(v => ({ key: v, label: v === 'page' ? 'Page now' : 'Ticket' }))} />
            <span className="spacer" />
            <button className="link mon-x" onClick={() => setAttempt(removeAlert(design, a.id))} aria-label="Remove this alert" title="Remove">✕</button>
          </div>
          <label className="field">When
            <textarea rows={2} value={a.when} placeholder="The condition, with a threshold and a duration, for example error budget burning at 14x for 5 minutes."
              onChange={e => setAttempt(updateAlert(design, a.id, { when: e.target.value }), `alert:${a.id}:when`)} />
          </label>
          <label className="field">Why this severity
            <textarea rows={2} value={a.why} placeholder="What it protects, and why it is worth waking someone, or why it can wait."
              onChange={e => setAttempt(updateAlert(design, a.id, { why: e.target.value }), `alert:${a.id}:why`)} />
          </label>
          <div className="field-row">
            <label className="field">Watches (optional)
              <select value={a.target ?? ''} onChange={e => setAttempt(updateAlert(design, a.id, { target: e.target.value || undefined }))}>
                <option value="">Nothing in particular</option>
                {design.nodes.map(n => <option key={n.id} value={n.id}>{n.label}</option>)}
              </select>
            </label>
            <label className="field">Protects (optional)
              <select value={a.slo ?? ''} onChange={e => setAttempt(updateAlert(design, a.id, { slo: e.target.value || undefined }))}>
                <option value="">No SLO</option>
                {slos.map(s => <option key={s.id} value={s.id}>{s.name || s.id}</option>)}
              </select>
            </label>
          </div>
        </div>
      ))}
      <button onClick={() => setAttempt(addAlert(design))}>+ Add an alert</button>

      <h4>Tips</h4>
      <ul className="reqs">{TIPS.map(t => <li key={t}>{t}</li>)}</ul>
    </>
  )
}
