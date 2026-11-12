// Sequence-diagram view of one flow: lifelines in tier order, time runs top → bottom.
// Protocol designs (Under the hood) keep the actors in the order the file declares them, show each actor's current state
// under its header, mark state changes on the lifelines and label every step with the time elapsed in round trips.
import { useEffect, useMemo, useRef } from 'react'
import { isProtocol, type Design, type Flow, type StepKind } from '../model/schema'
import { colorOf, iconOf, nameOf, TIER_INFO, tierOf, type Cloud } from '../model/kinds'
import { cloudIconUrl } from '../model/cloudIcons'
import { layoutBands } from '../layout/bands'
import { fmtRtt, phaseBudget, phaseOfStep, rttTimes, stateAt, stateChanges } from '../model/protocol'
import { Packet } from './Packet'
import { KIND_INK, KIND_VAR } from './stepKinds'
import type { Player } from './hooks'

const ROW = 46
const LABEL_EM = 6.6   // rough width of one label character (.tl-label is 11px), enough to tell whether a label fits
const fit = (s: string, n = 17) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s)

export function Timeline({ design, flow, player, cloud, onSelect }: {
  design: Design; flow: Flow; player: Player; cloud: Cloud; onSelect: (id: string) => void
}) {
  const { step, nonce, packetMs, jump } = player
  const proto = isProtocol(design)
  // Protocols: wider columns for wire labels, a taller head for the state pills, a wider gutter for the time labels.
  const COL = proto ? 176 : 136, HEAD = proto ? 104 : 92, GUT = proto ? 64 : 40, TOP = proto ? 6 : 28
  const parts = useMemo(() => {
    if (isProtocol(design)) return design.nodes   // every actor, in file order, so columns stay put across scenarios
    const L = layoutBands(design)
    const band = Object.fromEntries(L.bands.map((b, i) => [b.tier, i]))
    const used = new Set(flow.steps.flatMap(s => [s.from, s.to]))
    return design.nodes.filter(n => used.has(n.id))
      .sort((a, b) => band[tierOf(a)] - band[tierOf(b)] || L.pos[a.id].x - L.pos[b.id].x)
  }, [design, flow])
  const times = useMemo(() => rttTimes(flow.steps), [flow])
  const changes = useMemo(() => stateChanges(flow), [flow])
  const budget = useMemo(() => (proto ? phaseBudget(flow.steps) : []), [proto, flow])
  const curPhase = phaseOfStep(flow.steps, step)
  // The bar and its labels show the phases that cost time; the ones that cost none (local cache checks, rendering) are named in the tooltip.
  const paid = budget.filter(b => b.rtt > 0), free = budget.filter(b => b.rtt <= 0).map(b => b.name)
  const states = proto ? stateAt(flow, step) : {}
  const cx = Object.fromEntries(parts.map((p, i) => [p.id, GUT + i * COL + COL / 2]))
  const W = GUT + parts.length * COL + 24, H = HEAD + flow.steps.length * ROW + 24
  const scroller = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = scroller.current
    if (el && step >= 0) el.scrollTo({ top: HEAD + step * ROW - el.clientHeight / 2, behavior: 'smooth' })
  }, [step, HEAD])

  const bands: { title: string; x: number; w: number }[] = []
  if (!proto) for (const p of parts) {
    const title = TIER_INFO[tierOf(p)].title, last = bands.at(-1)
    if (last?.title === title) last.w += COL
    else bands.push({ title, x: cx[p.id] - COL / 2, w: COL })
  }
  const cur = flow.steps[step]
  const dash: Record<StepKind, string | undefined> = { req: undefined, res: '6 4', async: '2 4', local: undefined }
  const total = times.at(-1) ?? 0

  return (
    <div className={`timeline${proto ? ' proto' : ''}`} ref={scroller}>
      {proto && (
        <div className="tl-top">
          <div className="tl-clock" role="status" aria-live="polite" title="Elapsed time, counting every message as one one-way trip (half a round trip)">
            <span className="muted">Time so far</span> <b>{fmtRtt(step >= 0 ? times[step] : 0)}</b>
            <span className="muted"> of {fmtRtt(total)}</span>
          </div>
          {budget.length >= 2 && (
            <div className="tl-budget" aria-label="Time budget by phase, in round trips"
              title={`Round trips spent in each phase${free.length ? `. No network time: ${free.join(', ')}` : ''}`}>
              <span className="muted">Time budget</span>
              <span className="tlb-bar" aria-hidden="true">
                {paid.map(b => (
                  <i key={b.name} className={b.name === curPhase ? 'cur' : ''} style={{ flexGrow: b.rtt }} />
                ))}
              </span>
              <span className="tlb-legend">
                {paid.map(b => (
                  <span key={b.name} className={`tlb-chip${b.name === curPhase ? ' cur' : ''}`} data-phase={b.name} title={`${b.name}: ${fmtRtt(b.rtt)}`}>
                    {b.name} <b>{Number(b.rtt.toFixed(2))}</b>
                  </span>
                ))}
                <span className="muted">RTT</span>
              </span>
            </div>
          )}
        </div>
      )}
      <svg width={W} height={H}>
        <defs>
          {Object.entries(KIND_VAR).map(([k, c]) => (
            <marker key={k} id={`arr-${k}`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M0,0 L10,5 L0,10 z" style={{ fill: c }} />
            </marker>
          ))}
        </defs>
        {bands.map(b => (
          <g key={b.title}>
            <rect x={b.x + 4} y={4} width={b.w - 8} height={18} rx={5} className="tl-band" />
            <text x={b.x + b.w / 2} y={17} textAnchor="middle" className="tl-band-text">{b.title}</text>
          </g>
        ))}
        {parts.map(p => {
          const active = cur && (cur.from === p.id || cur.to === p.id)
          const st = states[p.id]
          return (
            <g key={p.id} onClick={() => onSelect(p.id)} style={{ cursor: 'pointer' }} data-actor={p.id}>
              <rect x={cx[p.id] - COL / 2 + 8} y={TOP} width={COL - 16} height={50} rx={9} className="tl-head"
                style={{ stroke: colorOf(p), strokeWidth: active ? 3 : 1.5 }} />
              {cloudIconUrl(p, cloud) && !proto
                ? <image href={cloudIconUrl(p, cloud)!} x={cx[p.id] - 10} y={TOP + 4} width={20} height={20} />
                : <text x={cx[p.id]} y={TOP + 21} textAnchor="middle" fontSize={16}>{iconOf(p)}</text>}
              <text x={cx[p.id]} y={TOP + 40} textAnchor="middle" className="tl-name">{fit(nameOf(p, cloud), proto ? 24 : 17)}<title>{nameOf(p, cloud)}</title></text>
              {proto && st && (
                <g className="tl-state" data-state={st}>
                  <rect x={cx[p.id] - (st.length * 6.6 + 18) / 2} y={TOP + 58} width={st.length * 6.6 + 18} height={20} rx={10} />
                  <text x={cx[p.id]} y={TOP + 72} textAnchor="middle">{st}</text>
                </g>
              )}
              <line x1={cx[p.id]} x2={cx[p.id]} y1={TOP + (proto && st ? 78 : 50)} y2={H - 8} className="tl-life" />
            </g>
          )
        })}
        {flow.steps.map((s, i) => {
          const y = HEAD + i * ROW + ROW / 2
          const c = KIND_VAR[s.kind]
          const x1 = cx[s.from], x2 = cx[s.to], local = s.from === s.to
          // A local step's loop and label go to the right, or to the left when the label would run past the edge (the last column).
          const left = local && x1 + 40 + s.label.length * LABEL_EM > W - 4
          const side = left ? -1 : 1
          const path = local ? `M${x1},${y - 8} h${34 * side} v16 h${-34 * side}` : `M${x1},${y} L${x2},${y}`
          return (
            <g key={i} opacity={i <= step ? 1 : 0.22} onClick={() => jump(i)} style={{ cursor: 'pointer' }}>
              <rect x={0} y={y - ROW / 2} width={W} height={ROW} className={i === step ? 'tl-row cur' : 'tl-row'} />
              <text x={10} y={proto ? y - 2 : y + 4} className="tl-num">{i + 1}</text>
              {proto && <text x={10} y={y + 12} className="tl-time">{fmtRtt(times[i])}</text>}
              <path d={path} fill="none" style={{ stroke: c }} strokeOpacity={i < step ? 0.75 : 1} strokeWidth={i === step ? 2.5 : 1.6}
                strokeDasharray={dash[s.kind]} markerEnd={`url(#arr-${s.kind})`} />
              <text x={local ? x1 + 40 * side : (x1 + x2) / 2} y={local ? y + 4 : y - 7} textAnchor={local ? (left ? 'end' : 'start') : 'middle'}
                className="tl-label" style={{ fill: KIND_INK[s.kind] }}>{s.label}</text>
              {Object.entries(changes[i]).map(([id, v]) => {
                if (cx[id] === undefined) return null
                // State text goes on the side away from a local step's loop.
                const away = local && id === s.from ? -side : 1
                return (
                  <g key={id} className="tl-change" data-actor={id}>
                    <circle cx={cx[id]} cy={y} r={4.5} />
                    <text x={cx[id] + 8 * away} y={y + 16} textAnchor={away < 0 ? 'end' : 'start'}>{v}</text>
                  </g>
                )
              })}
              {i === step && <Packet key={`${flow.id}-${i}-${nonce}`} path={path} ms={packetMs} color={c} />}
            </g>
          )
        })}
      </svg>
    </div>
  )
}
