// PROTOTYPE. Variant C: sequence-diagram lifelines. Topology is implicit; time runs top → bottom.
import { useEffect, useRef } from 'react'
import { KIND_COLOR, TIERS, type Cloud, type Design, type Flow } from './data'
import { Packet } from './Packet'

const COL = 132, ROW = 46, HEAD = 92, GUT = 44

export function SequenceView({ design, flow, step, cloud, packetMs, nonce, onJump }: {
  design: Design; flow: Flow; step: number; cloud: Cloud; packetMs: number; nonce: number; onJump: (i: number) => void
}) {
  const used = new Set(flow.steps.flatMap(s => [s.from, s.to]))
  const order = TIERS.map(t => t.id)
  const parts = design.nodes.filter(n => used.has(n.id)).sort((a, b) => order.indexOf(a.tier) - order.indexOf(b.tier))
  const cx = Object.fromEntries(parts.map((p, i) => [p.id, GUT + i * COL + COL / 2]))
  const W = GUT + parts.length * COL + 20, H = HEAD + flow.steps.length * ROW + 30
  const scroller = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = scroller.current
    if (el && step >= 0) el.scrollTo({ top: HEAD + step * ROW - el.clientHeight / 2, behavior: 'smooth' })
  }, [step])

  // tier bands over the participant headers
  const bands = TIERS.map(t => {
    const ps = parts.filter(p => p.tier === t.id)
    return ps.length ? { t, x: cx[ps[0].id] - COL / 2 + 4, w: ps.length * COL - 8 } : null
  }).filter(Boolean) as { t: typeof TIERS[number]; x: number; w: number }[]

  return (
    <div className="xp-seq" ref={scroller}>
      <svg width={W} height={H}>
        <defs>
          {Object.entries(KIND_COLOR).map(([k, c]) => (
            <marker key={k} id={`arr-${k}`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M0,0 L10,5 L0,10 z" fill={c} />
            </marker>
          ))}
        </defs>
        {bands.map(b => (
          <g key={b.t.id}>
            <rect x={b.x} y={6} width={b.w} height={18} rx={5} fill="#1e293b" />
            <text x={b.x + b.w / 2} y={19} textAnchor="middle" className="xp-seq-band">{b.t.title}</text>
          </g>
        ))}
        {parts.map(p => {
          const active = flow.steps[step] && (flow.steps[step].from === p.id || flow.steps[step].to === p.id)
          return (
            <g key={p.id}>
              <rect x={cx[p.id] - COL / 2 + 8} y={30} width={COL - 16} height={48} rx={9} fill="#0b1020"
                stroke={p.color} strokeWidth={active ? 3 : 1.5} />
              <text x={cx[p.id]} y={50} textAnchor="middle" fontSize={16}>{p.icon}</text>
              <text x={cx[p.id]} y={69} textAnchor="middle" className="xp-seq-name">{p.names[cloud]}</text>
              <line x1={cx[p.id]} x2={cx[p.id]} y1={78} y2={H - 10} stroke="#273249" strokeDasharray="4 5" />
            </g>
          )
        })}
        {flow.steps.map((s, i) => {
          const y = HEAD + i * ROW + ROW / 2
          const c = KIND_COLOR[s.kind]
          const op = i < step ? 0.75 : i === step ? 1 : 0.16
          const x1 = cx[s.from], x2 = cx[s.to]
          const local = s.from === s.to
          const path = local ? `M${x1},${y - 8} h34 v16 h-34` : `M${x1},${y} L${x2},${y}`
          return (
            <g key={i} opacity={op} onClick={() => onJump(i)} style={{ cursor: 'pointer' }}>
              <rect x={0} y={y - ROW / 2} width={W} height={ROW} fill={i === step ? '#ffffff0a' : 'transparent'} />
              <text x={12} y={y + 4} className="xp-seq-num">{i + 1}</text>
              <path d={path} fill="none" stroke={c} strokeWidth={i === step ? 2.5 : 1.6}
                strokeDasharray={s.kind === 'res' ? '6 4' : s.kind === 'async' ? '2 4' : undefined}
                markerEnd={`url(#arr-${s.kind})`} />
              <text x={local ? x1 + 40 : (x1 + x2) / 2} y={local ? y + 4 : y - 7} textAnchor={local ? 'start' : 'middle'}
                className="xp-seq-label" fill={c}>{s.label}</text>
              {i === step && <Packet key={`${flow.id}-${i}-${nonce}`} path={path} ms={packetMs} color={c} />}
            </g>
          )
        })}
      </svg>
    </div>
  )
}
