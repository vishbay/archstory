import type { Cloud } from '../model/kinds'
import { SIGNAL_LABEL, signalsFor, stackName, telemetryLinks, telemetryPart } from '../model/observability'

/** One part of the telemetry stack (X-Ray, CloudWatch Logs...): what it does, what feeds it, and what to watch on it. */
export function TelemetryPartCard({ id, cloud, onSelect }: { id: string; cloud: Cloud; onSelect?: (id: string) => void }) {
  const t = telemetryPart(id)
  if (!t) return null
  const { from, to } = telemetryLinks(id)
  const name = (x: typeof t) => stackName(x, cloud)
  const list = (xs: typeof from) => xs.map((x, i) => (
    <span key={x.id}>{i > 0 && ', '}{onSelect ? <button className="link" onClick={() => onSelect(x.id)}>{name(x)}</button> : name(x)}</span>
  ))
  return (
    <>
      <h3>{name(t)}</h3>
      <p className="muted small">{name(t) !== t.label ? `${t.label} · ` : ''}Part of the telemetry stack</p>
      <p>{t.description}</p>
      <p className="net-note">
        {from.length ? <>Receives from {list(from)}.</> : <>Receives metrics, logs and traces from every component that emits them.</>}
        {to.length ? <> Sends to {list(to)}.</> : id === 'obs:oncall' ? <> It is the end of the chain: a person takes over.</> : <> Nothing is sent on from here: engineers query it when they are finding a cause.</>}
      </p>
      <h4>What to watch on it</h4>
      <table className="kv signals">
        <tbody>
          {signalsFor(t.kind).map(s => <tr key={s.signal}><th>{SIGNAL_LABEL[s.signal]}</th><td>{s.what}<code>{s.metric}</code></td></tr>)}
        </tbody>
      </table>
    </>
  )
}
