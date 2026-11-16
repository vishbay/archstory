// Small pictures for the interview guide: a phase pipeline, a design growing in steps, the decision loop, a latency scale and an estimate chain.
// All inline SVG or plain HTML, coloured by the page's theme variables, so they follow light and dark.
import { TIER_INFO } from '../model/kinds'
import { ESTIMATE_CHAIN, EVOLVE, GUIDE_PHASES, LATENCIES, LOOP, TIER_ORDER, TIER_WALK, type MiniStage } from '../practice/guide'
import { MINI, miniGeometry } from '../practice/guideLayout'

/** What each phase leaves you holding, as a row of steps joined by arrows. */
export function PhasePipeline({ onPick }: { onPick: (i: number) => void }) {
  return (
    <ol className="gv-pipe" aria-label="What each phase produces">
      {GUIDE_PHASES.map((p, i) => (
        <li key={p.id} style={{ animationDelay: `${i * 70}ms` }}>
          <button onClick={() => onPick(i)}>
            <span className="gv-dot">{i + 1}</span>
            <b>{p.title}</b>
            <span>{p.output}</span>
          </button>
        </li>
      ))}
    </ol>
  )
}

function Mini({ stage, n }: { stage: MiniStage; n: number }) {
  const g = miniGeometry(stage), { bw, bh } = MINI
  const marker = `gv-arrow-${n}`
  return (
    <svg className="gv-mini" viewBox={`0 0 ${g.width} ${g.height}`} role="img" aria-label={`${stage.title}: ${stage.boxes.map(b => b.label).join(', ')}`}>
      <defs><marker id={marker} viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto"><path d="M0 0L8 4L0 8z" className="gv-arrowhead" /></marker></defs>
      {g.lines.map(l => <line key={l.key} x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2} className="gv-edge" markerEnd={`url(#${marker})`} />)}
      {g.boxes.map(b => (
        <g key={b.id} className={b.added ? 'gv-box added' : 'gv-box'}>
          <rect x={b.x} y={b.y} width={bw} height={bh} rx={7} />
          <text x={b.x + bw / 2} y={b.y + bh / 2 + 3.8} textAnchor="middle">{b.label}</text>
        </g>
      ))}
    </svg>
  )
}

/** The same design at three points, with what was added (marked) and why. */
export function EvolveDiagram() {
  return (
    <div className="gv-evolve">
      {EVOLVE.map((s, i) => (
        <figure key={s.title} className="gv-stage">
          <figcaption><span className="guide-num">{i + 1}</span><b>{s.title}</b><p>{s.why}</p></figcaption>
          <Mini stage={s} n={i} />
        </figure>
      ))}
    </div>
  )
}

/** The four steps of a decision around a ring: need, options, pick, cost, and back again. */
export function LoopRing() {
  const CX = 150, CY = 110, R = 64
  const at = (deg: number, r = R) => ({ x: CX + r * Math.cos((deg * Math.PI) / 180), y: CY + r * Math.sin((deg * Math.PI) / 180) })
  const nodes = [
    { deg: -90, dx: 0, dy: -24, anchor: 'middle' as const }, { deg: 0, dx: 24, dy: 4, anchor: 'start' as const },
    { deg: 90, dx: 0, dy: 31, anchor: 'middle' as const }, { deg: 180, dx: -24, dy: 4, anchor: 'end' as const },
  ]
  return (
    <svg className="gv-ring" viewBox="0 0 300 220" role="img" aria-label={`Repeat for each choice: ${LOOP.map(l => l.step).join(', ')}`}>
      <circle cx={CX} cy={CY} r={R} className="gv-ring-line" />
      {nodes.map((n, i) => {
        const m = at(n.deg + 45)
        return <path key={`ar${i}`} d="M-5 -4 L4 0 L-5 4 z" className="gv-arrowhead" transform={`translate(${m.x} ${m.y}) rotate(${n.deg + 135})`} />
      })}
      {nodes.map((n, i) => {
        const p = at(n.deg)
        return (
          <g key={LOOP[i].step}>
            <circle cx={p.x} cy={p.y} r={14} className="gv-ring-node" />
            <text x={p.x} y={p.y + 4} textAnchor="middle" className="gv-ring-num">{i + 1}</text>
            <text x={p.x + n.dx} y={p.y + n.dy} textAnchor={n.anchor} className="gv-ring-label">{LOOP[i].step}</text>
          </g>
        )
      })}
      <text x={CX} y={CY - 2} textAnchor="middle" className="gv-ring-mid">every</text>
      <text x={CX} y={CY + 12} textAnchor="middle" className="gv-ring-mid">choice</text>
    </svg>
  )
}

/** Rough latencies as bars on a log scale: each step to the right is about ten times slower. */
export function LatencyScale() {
  const lo = 1, hi = 9   // log10 of nanoseconds: 10 ns to 1 second
  return (
    <div className="gv-lat" role="img" aria-label={`Latencies from ${LATENCIES[0].text} to ${LATENCIES[LATENCIES.length - 1].text}`}>
      {LATENCIES.map((l, i) => (
        <div key={l.label} className="gv-lat-row">
          <span>{l.label}</span>
          <div className="gv-lat-track"><i style={{ width: `${((Math.log10(l.ns) - lo) / (hi - lo)) * 100}%`, animationDelay: `${i * 90}ms` }} /></div>
          <b>{l.text}</b>
        </div>
      ))}
      <p className="muted small">Log scale: each tick to the right is about ten times slower. The point is the gaps. A network hop costs thousands of memory reads, and an ocean costs hundreds of data centre trips.</p>
    </div>
  )
}

/** The worked estimate as a chain: each number follows from the last. */
export function EstimateChain() {
  return (
    <ol className="gv-chain" aria-label="Worked estimate">
      {ESTIMATE_CHAIN.map(s => (
        <li key={s.label}>
          {s.op && <span className="gv-link" aria-hidden><em>{s.op}</em><i>→</i></span>}
          <span className="gv-num"><b>{s.value}</b><span>{s.label}</span></span>
        </li>
      ))}
    </ol>
  )
}

/** The tiers a request passes through, as coloured bands, each with the question to ask about it. */
export function TierWalk() {
  return (
    <div className="gv-tiers">
      <ol className="gv-tier-strip" aria-label="Tiers, in the order a request meets them">
        {TIER_ORDER.map(t => <li key={t} style={{ ['--tier' as string]: TIER_INFO[t].color }}>{TIER_INFO[t].title}</li>)}
      </ol>
      <div className="gv-tier-cards">
        {TIER_ORDER.map((t, i) => (
          <article key={t} className="gv-tier-card" style={{ ['--tier' as string]: TIER_INFO[t].color }}>
            <span className="gv-tier-tag"><i>{i + 1}</i>{TIER_INFO[t].title}</span>
            <b>{TIER_WALK[t].ask}</b>
            <p>{TIER_WALK[t].examples}</p>
          </article>
        ))}
      </div>
    </div>
  )
}
