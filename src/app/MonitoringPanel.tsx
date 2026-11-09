import type { Design } from '../model/schema'
import { nameOf, type Cloud } from '../model/kinds'
import { budgetText, signalsFor, stackName, TELEMETRY, type SignalKind } from '../model/observability'

const SIGNAL_LABEL: Record<SignalKind, string> = { latency: 'Latency', traffic: 'Traffic', errors: 'Errors', saturation: 'Saturation' }

const PRACTICES = [
  'Put one trace id on every request and every log line (propagate the W3C traceparent header between services).',
  'Alert on symptoms users feel, such as an SLO burning too fast. Causes like a full disk go to dashboards and tickets.',
  'Log structured JSON, and never log secrets or personal data.',
  'Keep metric labels low-cardinality: per-tenant is fine, per-user explodes cost.',
  'Sample traces, but keep every error and the slowest 1%.',
]

/** The Monitoring tab: what to measure, when to page, and how to debug, for the design on screen. */
export function MonitoringPanel({ design, cloud, selected, onSelect }: {
  design: Design; cloud: Cloud; selected: string | null; onSelect: (id: string) => void
}) {
  const o = design.observability
  if (!o) return <p className="muted">This design has no monitoring section yet.</p>
  const byId = Object.fromEntries(design.nodes.map(n => [n.id, n]))
  const name = (id: string) => (byId[id] ? nameOf(byId[id], cloud) : id)
  const node = selected ? byId[selected] : undefined
  const sloName = (id: string) => o.slos.find(s => s.id === id)?.name ?? id
  const extras = o.signals.filter(s => !node || s.target === node.id)

  return (
    <>
      <h3>Monitoring</h3>
      <p className="muted small">Targets and thresholds here are illustrative: pick yours from the requirements and what users notice.</p>

      {o.slos.length > 0 && (
        <>
          <h4>Service level objectives</h4>
          {o.slos.map(s => (
            <div key={s.id} className="slo">
              <div className="slo-head"><b>{s.name}</b><span className="tag">{s.kind}</span></div>
              <div className="slo-target">{s.target}%{s.threshold ? ` within ${s.threshold}` : ''} <span className="muted">over {s.window} days</span></div>
              <p className="small">{s.sli}</p>
              <p className="small muted">Error budget: {budgetText(s)}.</p>
            </div>
          ))}
        </>
      )}

      {o.alerts.length > 0 && (
        <>
          <h4>Alerts</h4>
          <ul className="alerts">
            {[...o.alerts].sort((a, b) => (a.severity === b.severity ? 0 : a.severity === 'page' ? -1 : 1)).map(a => (
              <li key={a.id}>
                <span className={`sev-pill sev-${a.severity === 'page' ? 'critical' : 'minor'}`}>{a.severity === 'page' ? 'Page' : 'Ticket'}</span>
                <b>{a.when}</b>
                <p>{a.why}</p>
                <div className="alert-links">
                  {a.target && byId[a.target] && <button className="link" onClick={() => onSelect(a.target!)}>{name(a.target)}</button>}
                  {a.slo && <span className="muted small">protects “{sloName(a.slo)}”</span>}
                </div>
              </li>
            ))}
          </ul>
        </>
      )}

      <h4>{node ? `What to watch on ${name(node.id)}` : 'What to watch'}</h4>
      {node ? (
        <table className="kv signals">
          <tbody>
            {signalsFor(node.kind).map(s => (
              <tr key={s.signal}><th>{SIGNAL_LABEL[s.signal]}</th><td>{s.what}<code>{s.metric}</code></td></tr>
            ))}
          </tbody>
        </table>
      ) : <p className="muted small">Click a component to see its four golden signals: latency, traffic, errors and saturation.</p>}
      {extras.length > 0 && (
        <>
          <p className="small"><b>{node ? 'Specific to this design' : 'Signals that matter in this design'}</b></p>
          <ul className="alerts">
            {extras.map((s, i) => (
              <li key={i}>
                <b>{s.name}</b>{!node && <> <button className="link" onClick={() => onSelect(s.target)}>{name(s.target)}</button></>}
                {s.metric && <code>{s.metric}</code>}
                {s.why && <p>{s.why}</p>}
              </li>
            ))}
          </ul>
        </>
      )}

      {o.debug.length > 0 && (
        <>
          <h4>When something is wrong</h4>
          {o.debug.map(d => (
            <details key={d.symptom} className="debug">
              <summary>{d.symptom}</summary>
              <ol>{d.steps.map(st => <li key={st}>{st}</li>)}</ol>
            </details>
          ))}
        </>
      )}

      <h4>Telemetry stack</h4>
      <ul className="stack">
        {TELEMETRY.map(t => (
          <li key={t.id}><b>{stackName(t, cloud)}</b>{stackName(t, cloud) !== t.label && <span className="muted"> · {t.label}</span>}<p>{t.description}</p></li>
        ))}
      </ul>

      <details className="debug">
        <summary>Good habits</summary>
        <ul className="reqs">{PRACTICES.map(p => <li key={p}>{p}</li>)}</ul>
      </details>
    </>
  )
}
