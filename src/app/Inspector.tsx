import { isOnPrem, isProtocol, type Design, type Flow, type WireField } from '../model/schema'
import { fmtRtt, rttTimes } from '../model/protocol'
import { ScenarioPicker } from './ScenarioPicker'
import { QuestionsPanel } from './Questions'
import { kindInfo, nameOf, TIER_INFO, tierOf, type Cloud } from '../model/kinds'
import { NodeIcon } from './NodeIcon'
import { MonitoringPanel } from './MonitoringPanel'
import { StepList } from './StepList'
import { Legend } from './Legend'
import { resolvePhases } from '../model/phases'
import { cloudIconUrl } from '../model/cloudIcons'
import { crossing, placement } from '../model/network'
import { haOf, impactOf, ON_PREM_TEXT, placementsOf, resilience, zoneName, type Impact } from '../model/availability'
import { footprintOf, homeRegion, regionDrill, regionImpactOf, replicationOf, STRATEGY_TEXT } from '../model/regions'
import type { ZoneState } from './BandCanvas'
import { KIND_INK, KIND_TEXT, KIND_VAR } from './stepKinds'
import type { Player } from './hooks'
import { useTabStrip } from './hooks'

export type InspectorTab = 'step' | 'component' | 'zones' | 'regions' | 'monitoring' | 'notes' | 'questions'

const HA_TEXT = {
  'active-active': 'Active in every zone behind the load balancer',
  'primary-standby': 'Primary in one zone, standby in another',
  'quorum': 'Quorum across zones (needs a majority)',
  'regional': 'Regional managed service (provider spreads it)',
  'single': 'Single zone only',
} as const

const FOOTPRINT_TEXT = {
  all: 'Runs in every region',
  primary: 'Runs only in the primary region',
  global: 'Global service outside any one region',
} as const
const REPLICATION_TEXT = {
  sync: 'synchronous cross-region replication', async: 'asynchronous cross-region replication',
  backup: 'cross-region backups only', none: 'no cross-region replication',
} as const

function ImpactList({ impacts, cloud }: { impacts: { node: Design['nodes'][number]; impact: Impact }[]; cloud: Cloud }) {
  return (
    <ul className="impacts">
      {impacts.map(({ node: n, impact }) => (
        <li key={n.id}>
          <span className={`node-tag inline tag-${impact.level}`}>{impact.tag}</span>
          <b>{nameOf(n, cloud)}</b>
          <p>{impact.text}</p>
        </li>
      ))}
    </ul>
  )
}

/** The anatomy of a message on the wire (protocol steps): header fields, flags and sections. */
export function WireTable({ fields }: { fields: WireField[] }) {
  const notes = fields.some(f => f.note)
  return (
    <>
      <h5 className="wire-title">On the wire</h5>
      <table className="wire">
        <thead><tr><th>Field</th><th>Value</th>{notes && <th>Why</th>}</tr></thead>
        <tbody>
          {fields.map((f, i) => (
            <tr key={i}><td className="wire-name">{f.name}</td><td className="wire-value">{f.value}</td>{notes && <td className="wire-note">{f.note}</td>}</tr>
          ))}
        </tbody>
      </table>
    </>
  )
}

const NOTE_ICON = { tradeoff: '⚖️', scaling: '📈', failure: '💥', security: '🔐', note: '📝' } as const

export function Inspector({ design, flow, player, cloud, network, monitoring = false, zone, regionFailed = null, selected, tab, onTab, onFlow, onSelect }: {
  design: Design; flow: Flow | undefined; player: Player; cloud: Cloud; network: boolean; monitoring?: boolean; zone: ZoneState; regionFailed?: number | null
  selected: string | null; tab: InspectorTab; onTab: (t: InspectorTab) => void; onFlow: (id: string) => void; onSelect?: (id: string) => void
}) {
  const byId = Object.fromEntries(design.nodes.map(n => [n.id, n]))
  const name = (id: string) => nameOf(byId[id], cloud)
  const { step, jump } = player
  const cur = flow?.steps[step]
  const node = selected ? byId[selected] : undefined
  const zones = network && (design.network?.zones ?? 1) > 1
  const mon = monitoring && !!design.observability
  const regions = !!design.regions
  const tabs = (['step', 'component', ...(zones ? ['zones'] as const : []), ...(regions ? ['regions'] as const : []), ...(mon ? ['monitoring'] as const : []), 'notes', ...(design.questions.length ? ['questions'] as const : [])] as const)
  const shown = (tab === 'zones' && !zones) || (tab === 'regions' && !regions) || (tab === 'monitoring' && !mon) || (tab === 'questions' && !design.questions.length) ? 'step' : tab
  const tabStrip = useTabStrip(shown)
  // In the regions view the canvas columns are regions, so instance labels and failures are regions too.
  const byRegion = zone.zl?.unit === 'region'
  const zoneFailed = byRegion ? null : zone.failed
  const colName = (z: number) => (byRegion ? design.regions!.regions[z].name : zoneName(z, cloud))
  const zoneOfInst = (id: string | null) => (id ? zone.zl?.insts.find(i => i.id === id)?.zone ?? null : null)
  const instLabel = (id: string | null) => { const z = zoneOfInst(id); return z === null ? '' : ` (${colName(z)})` }
  const hop = zone.hops?.[step]
  const downHere = cur && zoneFailed !== null && !zone.hops
    ? [cur.from, cur.to].map(id => byId[id]).find(n => impactOf(design, n, zoneFailed, cloud)?.level === 'down') : undefined
  const regionDownHere = cur && regionFailed !== null && regions && !byRegion
    ? [cur.from, cur.to].map(id => byId[id]).find(n => regionImpactOf(design, n, regionFailed)?.level === 'down') : undefined
  const res = zones ? resilience(design, zoneFailed ?? 0, cloud) : null
  const proto = isProtocol(design)
  const at = proto && flow && cur ? rttTimes(flow.steps)[step] : null
  const drill = regions ? regionDrill(design, regionFailed ?? homeRegion(design)) : null

  return (
    <>
      <div className="tabs" role="tablist" ref={tabStrip}>
        {tabs.map(t => (
          <button key={t} role="tab" aria-selected={shown === t} className={shown === t ? 'on' : ''} onClick={() => onTab(t)}>
            {t === 'step' ? 'Flow' : t === 'component' ? 'Component' : t === 'zones' ? 'Resilience' : t === 'regions' ? 'Regions' : t === 'monitoring' ? 'Monitoring' : t === 'questions' ? `Questions (${design.questions.length})` : `Notes (${design.notes.length})`}
          </button>
        ))}
      </div>

      <div className="panel-body">
        {shown === 'step' && flow && (
          <>
            {design.flows.length > 1 ? (
              <ScenarioPicker flows={design.flows} current={flow.id} onPick={onFlow} variant="heading" />
            ) : <h3>{flow.title}</h3>}
            {flow.summary && <p className="muted">{flow.summary}</p>}
            {cur ? (
              <div className="card current-card">
                <div className="card-meta">
                  <span>Step {step + 1} of {flow.steps.length}{resolvePhases(flow.steps)[step] ? ` · ${resolvePhases(flow.steps)[step]}` : ''}{at !== null ? ` · at ${fmtRtt(at)}` : ''}</span>
                  <span className="pill" style={{ color: KIND_INK[cur.kind], borderColor: KIND_VAR[cur.kind] }}>{KIND_TEXT[cur.kind]}</span>
                </div>
                <div className="card-hop">
                  <NodeIcon node={byId[cur.from]} cloud={cloud} size={18} /> {name(cur.from)}{hop && instLabel(hop.from)}
                  {cur.from !== cur.to && <> <span className="muted">→</span> <NodeIcon node={byId[cur.to]} cloud={cloud} size={18} /> {name(cur.to)}{hop && instLabel(hop.to)}</>}
                </div>
                <div className="mono" style={{ color: KIND_INK[cur.kind] }}>{cur.label}</div>
                {cur.detail && <p>{cur.detail}</p>}
                {network && crossing(design, cur, cloud) && <p className="net-note">🔒 {crossing(design, cur, cloud)}</p>}
                {hop?.cross && (byRegion
                  ? <p className="net-note">↔ Crosses from {colName(zoneOfInst(hop.from)!)} to {colName(zoneOfInst(hop.to)!)}: tens of milliseconds between distant regions, and inter-region transfer is billed per GB.</p>
                  : <p className="net-note">↔ Crosses from {zoneName(zoneOfInst(hop.from)!, cloud)} to {zoneName(zoneOfInst(hop.to)!, cloud)}: about 1 ms extra and billed per GB. Writes always go to the primary's zone.</p>)}
                {hop && cur.from !== cur.to && (!hop.from || !hop.to) && <p className="net-note bad">✕ This hop fails: {name(!hop.from ? cur.from : cur.to)} has no healthy instance.</p>}
                {downHere && <p className="net-note bad">✕ This hop fails: {downHere.label} is down while {zoneName(zoneFailed!, cloud)} is out.</p>}
                {regionDownHere && <p className="net-note bad">✕ This hop fails: {regionDownHere.label} is down while {design.regions!.regions[regionFailed!].name} is out.</p>}
                {cur.payload && <pre>{cur.payload}</pre>}
                {cur.state && Object.keys(cur.state).length > 0 && (
                  <div className="step-state"><span className="muted">State after:</span>
                    {Object.entries(cur.state).map(([id, v]) => <span key={id} className="pill">{byId[id] ? name(id) : id} {v}</span>)}</div>
                )}
                {cur.fields && cur.fields.length > 0 && <WireTable fields={cur.fields} />}
              </div>
            ) : (
              <div className="card muted">{proto ? 'Press ▶ or space to play the messages on the wire. ← → step through them.' : 'Press ▶ or space to send a request through the system. ← → step through it.'}</div>
            )}
            <StepList flow={flow} step={step} jump={jump} name={name} />
          </>
        )}
        {shown === 'step' && !flow && <p className="muted">This design has no request flows yet.</p>}

        {shown === 'component' && !node && <p className="muted">Click a component on the canvas to see what it does, its cloud equivalents, and the flows that use it.</p>}
        {shown === 'component' && node && (
          <>
            <h3 className="with-icon"><NodeIcon node={node} cloud={cloud} size={24} /> {node.label}</h3>
            {!proto && <p className="muted">{kindInfo(node.kind).label} · {TIER_INFO[tierOf(node)].title} tier{node.replicas ? ` · ×${node.replicas}` : ''}</p>}
            {node.description && <p>{node.description}</p>}
            {placement(design, node, cloud, placementsOf(design, node).length) && <p className="net-note">🔒 {placement(design, node, cloud, placementsOf(design, node).length)}</p>}
            {network && haOf(design, node) && (
              <p className="net-note">🛟 {HA_TEXT[haOf(design, node)!]}.
                {zoneFailed !== null && <> If {zoneName(zoneFailed, cloud)} fails: {impactOf(design, node, zoneFailed, cloud)!.text}</>}</p>
            )}
            {network && design.network && isOnPrem(node) && <p className="net-note">🛟 {ON_PREM_TEXT} The data centre is one site, so plan for it or the hybrid link going down.</p>}
            {footprintOf(design, node) && (
              <p className="net-note">🌍 {FOOTPRINT_TEXT[footprintOf(design, node)!]}{replicationOf(design, node) ? `, with ${REPLICATION_TEXT[replicationOf(design, node)!]}` : ''}.
                {regionFailed !== null && <> If {design.regions!.regions[regionFailed].name} fails: {regionImpactOf(design, node, regionFailed)!.text}</>}</p>
            )}
            {!proto && <table className="kv">
              <tbody>
                <tr><th>Neutral</th><td>{node.label}</td></tr>
                <tr><th>AWS</th><td className="with-icon">{cloudIconUrl(node, 'aws') && <NodeIcon node={node} cloud="aws" size={18} />}{node.cloud?.aws ?? 'n/a'}</td></tr>
                <tr><th>GCP</th><td className="with-icon">{cloudIconUrl(node, 'gcp') && <NodeIcon node={node} cloud="gcp" size={18} />}{node.cloud?.gcp ?? 'n/a'}</td></tr>
                {node.cloud?.azure && <tr><th>Azure</th><td>{node.cloud.azure}</td></tr>}
              </tbody>
            </table>}
            {design.notes.filter(n => n.target === node.id).map((n, i) => (
              <div key={i} className="note"><b>{NOTE_ICON[n.kind]} {n.kind}</b><p>{n.text}</p></div>
            ))}
            <h4>{proto ? 'In scenarios' : 'Used in flows'}</h4>
            <ul className="links">
              {design.flows.filter(f => f.steps.some(s => s.from === node.id || s.to === node.id)).map(f => (
                <li key={f.id}><button className="link" onClick={() => { onFlow(f.id); onTab('step') }}>{f.title}</button></li>
              ))}
            </ul>
          </>
        )}

        {shown === 'zones' && res && (
          <>
            <h3>If {zoneName(zoneFailed ?? 0, cloud)} fails</h3>
            {zoneFailed === null && <p className="muted small">Pick a zone in "Fail" on the canvas to see it live. Showing {zoneName(0, cloud)}.</p>}
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
            {res.onPrem.length > 0 && (
              <div className="card"><b>On the request path in your own data centre</b>
                <ul className="reqs">{res.onPrem.map(n => <li key={n.id}>{n.label}</li>)}</ul>
                <p className="small">Cloud zones do not cover them. The data centre is a single site: if it, or the hybrid link, goes down, these requests fail whatever the cloud zones do.</p></div>
            )}
            <h4>Per component</h4>
            <ImpactList impacts={res.impacts} cloud={cloud} />
          </>
        )}

        {shown === 'regions' && drill && design.regions && (
          <>
            <h3>If {drill.region.name} fails</h3>
            {regionFailed === null && <p className="muted small">Pick a region in "Fail a region" on the canvas to see it live. Showing {drill.region.name}.</p>}
            <table className="kv">
              <tbody>
                <tr><th>Strategy</th><td>{STRATEGY_TEXT[design.regions.strategy]} across {design.regions.regions.map(r => `${r.name} (${r.role})`).join(', ')}</td></tr>
                <tr><th>Targets</th><td>RTO {design.regions.rto}, RPO {design.regions.rpo}</td></tr>
                <tr><th>Failover</th><td>{design.regions.failover}{design.regions.dnsTtl ? ` (DNS TTL ${design.regions.dnsTtl} s)` : ''}</td></tr>
                <tr><th>Serving after</th><td>{drill.survivors.map(r => r.name).join(', ')}{drill.promoted ? ' (promoted)' : ''}</td></tr>
                <tr><th>Recovery time</th><td>{drill.rto}</td></tr>
                <tr><th>Data loss</th><td>{drill.rpo}</td></tr>
                <tr><th>Capacity</th><td>{drill.capacity}</td></tr>
              </tbody>
            </table>
            {drill.warnings.length > 0 && (
              <div className="card bad"><b>Gaps in the plan</b>
                <ul className="reqs">{drill.warnings.map(w => <li key={w}>{w}</li>)}</ul></div>
            )}
            <h4>Per component</h4>
            <ImpactList impacts={drill.impacts} cloud={cloud} />
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
