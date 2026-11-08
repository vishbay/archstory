// Sequence-diagram view of one flow: lifelines in tier order, time runs top → bottom.
import { useEffect, useMemo, useRef } from 'react'
import type { Design, Flow, StepKind } from '../model/schema'
import { colorOf, iconOf, nameOf, TIER_INFO, tierOf, type Cloud } from '../model/kinds'
import { cloudIconUrl } from '../model/cloudIcons'
import { layoutBands } from '../layout/bands'
import { Packet } from './Packet'
import { KIND_VAR } from './stepKinds'
import type { Player } from './hooks'

const COL = 136, ROW = 46, HEAD = 92, GUT = 40
const fit = (s: string) => (s.length > 17 ? `${s.slice(0, 16).trimEnd()}…` : s)

export function Timeline({ design, flow, player, cloud, onSelect }: {
  design: Design; flow: Flow; player: Player; cloud: Cloud; onSelect: (id: string) => void
}) {
  const { step, nonce, packetMs, jump } = player
  const parts = useMemo(() => {
    const L = layoutBands(design)
    const band = Object.fromEntries(L.bands.map((b, i) => [b.tier, i]))
    const used = new Set(flow.steps.flatMap(s => [s.from, s.to]))
    return design.nodes.filter(n => used.has(n.id))
      .sort((a, b) => band[tierOf(a)] - band[tierOf(b)] || L.pos[a.id].x - L.pos[b.id].x)
  }, [design, flow])
  const cx = Object.fromEntries(parts.map((p, i) => [p.id, GUT + i * COL + COL / 2]))
  const W = GUT + parts.length * COL + 24, H = HEAD + flow.steps.length * ROW + 24
  const scroller = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = scroller.current
    if (el && step >= 0) el.scrollTo({ top: HEAD + step * ROW - el.clientHeight / 2, behavior: 'smooth' })
  }, [step])

  const bands: { title: string; x: number; w: number }[] = []
  for (const p of parts) {
    const title = TIER_INFO[tierOf(p)].title, last = bands.at(-1)
    if (last?.title === title) last.w += COL
    else bands.push({ title, x: cx[p.id] - COL / 2, w: COL })
  }
  const cur = flow.steps[step]
  const dash: Record<StepKind, string | undefined> = { req: undefined, res: '6 4', async: '2 4', local: undefined }

  return (
    <div className="timeline" ref={scroller}>
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
          return (
            <g key={p.id} onClick={() => onSelect(p.id)} style={{ cursor: 'pointer' }}>
              <rect x={cx[p.id] - COL / 2 + 8} y={28} width={COL - 16} height={50} rx={9} className="tl-head"
                style={{ stroke: colorOf(p), strokeWidth: active ? 3 : 1.5 }} />
              {cloudIconUrl(p, cloud)
                ? <image href={cloudIconUrl(p, cloud)!} x={cx[p.id] - 10} y={32} width={20} height={20} />
                : <text x={cx[p.id]} y={49} textAnchor="middle" fontSize={16}>{iconOf(p)}</text>}
              <text x={cx[p.id]} y={68} textAnchor="middle" className="tl-name">{fit(nameOf(p, cloud))}<title>{nameOf(p, cloud)}</title></text>
              <line x1={cx[p.id]} x2={cx[p.id]} y1={78} y2={H - 8} className="tl-life" />
            </g>
          )
        })}
        {flow.steps.map((s, i) => {
          const y = HEAD + i * ROW + ROW / 2
          const c = KIND_VAR[s.kind]
          const x1 = cx[s.from], x2 = cx[s.to], local = s.from === s.to
          const path = local ? `M${x1},${y - 8} h34 v16 h-34` : `M${x1},${y} L${x2},${y}`
          return (
            <g key={i} opacity={i < step ? 0.8 : i === step ? 1 : 0.22} onClick={() => jump(i)} style={{ cursor: 'pointer' }}>
              <rect x={0} y={y - ROW / 2} width={W} height={ROW} className={i === step ? 'tl-row cur' : 'tl-row'} />
              <text x={10} y={y + 4} className="tl-num">{i + 1}</text>
              <path d={path} fill="none" style={{ stroke: c }} strokeWidth={i === step ? 2.5 : 1.6}
                strokeDasharray={dash[s.kind]} markerEnd={`url(#arr-${s.kind})`} />
              <text x={local ? x1 + 40 : (x1 + x2) / 2} y={local ? y + 4 : y - 7} textAnchor={local ? 'start' : 'middle'}
                className="tl-label" style={{ fill: c }}>{s.label}</text>
              {i === step && <Packet key={`${flow.id}-${i}-${nonce}`} path={path} ms={packetMs} color={c} />}
            </g>
          )
        })}
      </svg>
    </div>
  )
}
