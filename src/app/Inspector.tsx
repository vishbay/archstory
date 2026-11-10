import type { Design, Flow } from '../model/schema'
import { QuestionsPanel } from './Questions'
import { kindInfo, nameOf, TIER_INFO, tierOf, type Cloud } from '../model/kinds'
import { NodeIcon } from './NodeIcon'
import { MonitoringPanel } from './MonitoringPanel'
import { StepList } from './StepList'
import { Legend } from './Legend'
import { resolvePhases } from '../model/phases'
import { cloudIconUrl } from '../model/cloudIcons'
import { crossing, placement } from '../model/network'
import { haOf, impactOf, placementsOf, resilience, zoneName } from '../model/availability'
import type { ZoneState } from './BandCanvas'
import { KIND_TEXT, KIND_VAR } from './stepKinds'
import type { Player } from './hooks'

export type InspectorTab = 'step' | 'component' | 'zones' | 'monitoring' | 'notes' | 'questions'

const HA_TEXT = {
  'active-active': 'Active in every zone behind the load balancer',
  'primary-standby': 'Primary in one zone, standby in another',
  'quorum': 'Quorum across zones (needs a majority)',
  'regional': 'Regional managed service (provider spreads it)',
  'single': 'Single zone only',
} as const

const NOTE_ICON = { tradeoff: '⚖️', scaling: '📈', failure: '💥', security: '🔐', note: '📝' } as const

export function Inspector({ design, flow, player, cloud, network, monitoring = false, zone, selected, tab, onTab, onFlow, onSelect }: {
  design: Design; flow: Flow | undefined; player: Player; cloud: Cloud; network: boolean; monitoring?: boolean; zone: ZoneState
  selected: string | null; tab: InspectorTab; onTab: (t: InspectorTab) => void; onFlow: (id: string) => void; onSelect?: (id: string) => void
}) {
  const byId = Object.fromEntries(design.nodes.map(n => [n.id, n]))
  const name = (id: string) => nameOf(byId[id], cloud)
  const { step, jump } = player
  const cur = flow?.steps[step]
  const node = selected ? byId[selected] : undefined
  const zones = network && (design.network?.zones ?? 1) > 1
  const mon = monitoring && !!design.observability
  const tabs = (['step', 'component', ...(zones ? ['zones'] as const : []), ...(mon ? ['monitoring'] as const : []), 'notes', ...(design.questions.length ? ['questions'] as const : [])] as const)
  const shown = (tab === 'zones' && !zones) || (tab === 'monitoring' && !mon) || (tab === 'questions' && !design.questions.length) ? 'step' : tab
  const zoneOfInst = (id: string | null) => (id ? zone.zl?.insts.find(i => i.id === id)?.zone ?? null : null)
  const instLabel = (id: string | null) => { const z = zoneOfInst(id); return z === null ? '' : ` (${zoneName(z, cloud)})` }
  const hop = zone.hops?.[step]
  const downHere = cur && zone.failed !== null && !zone.hops
    ? [cur.from, cur.to].map(id => byId[id]).find(n => impactOf(design, n, zone.failed!, cloud)?.level === 'down') : undefined
  const res = zones ? resilience(design, zone.failed ?? 0, cloud) : null

  return (
    <>
      <div className="tabs" role="tablist">
        {tabs.map(t => (
          <button key={t} role="tab" aria-selected={shown === t} className={shown === t ? 'on' : ''} onClick={() => onTab(t)}>
            {t === 'step' ? 'Flow' : t === 'component' ? 'Component' : t === 'zones' ? 'Resilience' : t === 'monitoring' ? 'Monitoring' : t === 'questions' ? `Questions (${design.questions.length})` : `Notes (${design.notes.length})`}
          </button>
        ))}
      </div>

      <div className="panel-body">
        {shown === 'step' && flow && (
          <>
            {design.flows.length > 1 ? (
              <div className="scenario-head">
                <span className="scenario-label">Scenario {design.flows.findIndex(f => f.id === flow.id) + 1} of {design.flows.length}</span>
                <select className="scenario-pick" value={flow.id} onChange={e => onFlow(e.target.value)} aria-label="Choose scenario" title="Choose which scenario to watch">
                  {design.flows.map(f => <option key={f.id} value={f.id}>{f.title}</option>)}
                </select>
              </div>
            ) : <h3>{flow.title}</h3>}
            {flow.summary && <p className="muted">{flow.summary}</p>}
            {cur ? (
              <div className="card current-card">
                <div className="card-meta">
                  <span>Step {step + 1} of {flow.steps.length}{resolvePhases(flow.steps)[step] ? ` · ${resolvePhases(flow.steps)[step]}` : ''}</span>
                  <span className="pill" style={{ color: KIND_VAR[cur.kind], borderColor: KIND_VAR[cur.kind] }}>{KIND_TEXT[cur.kind]}</span>
                </div>
                <div className="card-hop">
                  <NodeIcon node={byId[cur.from]} cloud={cloud} size={18} /> {name(cur.from)}{hop && instLabel(hop.from)}
                  {cur.from !== cur.to && <> <span className="muted">→</span> <NodeIcon node={byId[cur.to]} cloud={cloud} size={18} /> {name(cur.to)}{hop && instLabel(hop.to)}</>}
                </div>
                <div className="mono" style={{ color: KIND_VAR[cur.kind] }}>{cur.label}</div>
                {cur.detail && <p>{cur.detail}</p>}
                {network && crossing(design, cur, cloud) && <p className="net-note">🔒 {crossing(design, cur, cloud)}</p>}
                {hop?.cross && <p className="net-note">↔ Crosses from {zoneName(zoneOfInst(hop.from)!, cloud)} to {zoneName(zoneOfInst(hop.to)!, cloud)}: about 1 ms extra and billed per GB. Writes always go to the primary's zone.</p>}
                {hop && cur.from !== cur.to && (!hop.from || !hop.to) && <p className="net-note bad">✕ This hop fails: {name(!hop.from ? cur.from : cur.to)} has no healthy instance.</p>}
                {downHere && <p className="net-note bad">✕ This hop fails: {downHere.label} is down while {zoneName(zone.failed!, cloud)} is out.</p>}
                {cur.payload && <pre>{cur.payload}</pre>}
              </div>
            ) : (
              <div className="card muted">Press ▶ or space to send a request through the system. ← → step through it.</div>
            )}
            <StepList flow={flow} step={step} jump={jump} name={name} />
          </>
        )}
        {shown === 'step' && !flow && <p className="muted">This design has no request flows yet.</p>}

        {shown === 'component' && !node && <p className="muted">Click a component on the canvas to see what it does, its cloud equivalents, and the flows that use it.</p>}
        {shown === 'component' && node && (
          <>
            <h3 className="with-icon"><NodeIcon node={node} cloud={cloud} size={24} /> {node.label}</h3>
            <p className="muted">{kindInfo(node.kind).label} · {TIER_INFO[tierOf(node)].title} tier{node.replicas ? ` · ×${node.replicas}` : ''}</p>
            {node.description && <p>{node.description}</p>}
            {placement(design, node, cloud, placementsOf(design, node).length) && <p className="net-note">🔒 {placement(design, node, cloud, placementsOf(design, node).length)}</p>}
            {network && haOf(design, node) && (
              <p className="net-note">🛟 {HA_TEXT[haOf(design, node)!]}.
                {zone.failed !== null && <> If {zoneName(zone.failed, cloud)} fails: {impactOf(design, node, zone.failed, cloud)!.text}</>}</p>
            )}
            <table className="kv">
              <tbody>
                <tr><th>Neutral</th><td>{node.label}</td></tr>
                <tr><th>AWS</th><td className="with-icon">{cloudIconUrl(node, 'aws') && <NodeIcon node={node} cloud="aws" size={18} />}{node.cloud?.aws ?? 'n/a'}</td></tr>
                <tr><th>GCP</th><td className="with-icon">{cloudIconUrl(node, 'gcp') && <NodeIcon node={node} cloud="gcp" size={18} />}{node.cloud?.gcp ?? 'n/a'}</td></tr>
                {node.cloud?.azure && <tr><th>Azure</th><td>{node.cloud.azure}</td></tr>}
              </tbody>
            </table>
            {design.notes.filter(n => n.target === node.id).map((n, i) => (
              <div key={i} className="note"><b>{NOTE_ICON[n.kind]} {n.kind}</b><p>{n.text}</p></div>
            ))}
            <h4>Used in flows</h4>
            <ul className="links">
              {design.flows.filter(f => f.steps.some(s => s.from === node.id || s.to === node.id)).map(f => (
                <li key={f.id}><button className="link" onClick={() => { onFlow(f.id); onTab('step') }}>{f.title}</button></li>
              ))}
            </ul>
          </>
        )}

        {shown === 'zones' && res && (
          <>
            <h3>If {zoneName(zone.failed ?? 0, cloud)} fails</h3>
            {zone.failed === null && <p className="muted small">Pick a zone in "Fail" on the canvas to see it live. Showing {zoneName(0, cloud)}.</p>}
            <table className="kv">
              <tbody>
                <tr><th>Recovery time</th><td>{res.rto}</td></tr>
                <tr><th>Data loss</th><td>{res.rpo}</td></tr>
                <tr><th>Capacity rule</th><td>{res.perZoneShare}: the surviving zones must carry peak on their own.</td></tr>
              </tbody>
            </table>
            {res.spofs.length > 0 && (
              <div className="card bad"><b>Single points of failure on the request path</b>
                <ul className="reqs">{res.spofs.map(n => <li key={n.id}>{n.label}</li>)}</ul></div>
            )}
            <h4>Per component</h4>
            <ul className="impacts">
              {res.impacts.map(({ node: n, impact }) => (
                <li key={n.id}>
                  <span className={`node-tag inline tag-${impact.level}`}>{impact.tag}</span>
                  <b>{nameOf(n, cloud)}</b>
                  <p>{impact.text}</p>
                </li>
              ))}
            </ul>
          </>
        )}

        {shown === 'monitoring' && <MonitoringPanel design={design} cloud={cloud} selected={selected} onSelect={id => onSelect?.(id)} />}

        {shown === 'questions' && <QuestionsPanel design={design} cloud={cloud} onSelect={id => onSelect?.(id)} />}

        {shown === 'notes' && (
          design.notes.length === 0 ? <p className="muted">No design notes.</p> :
            design.notes.map((n, i) => (
              <div key={i} className="note">
                <b>{NOTE_ICON[n.kind]} {n.kind}{n.target && byId[n.target] ? ` · ${byId[n.target].label}` : ''}</b>
                <p>{n.text}</p>
              </div>
            ))
        )}
      </div>
      {shown === 'step' && flow && <Legend monitoring={monitoring && !!design.observability} />}
    </>
  )
}
