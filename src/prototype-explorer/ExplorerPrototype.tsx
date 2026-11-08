// PROTOTYPE: throwaway. Question: how should the explorer canvas display a design + its request flows?
// Three variants of the URL-shortener explorer, switchable via ?variant=A|B|C and the floating bottom bar.
import { useEffect, useState } from 'react'
import { ReactFlowProvider } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import './explorer.css'
import { KIND_COLOR, urlShortenerDesign as design, type Cloud } from './data'
import { TieredCanvas } from './TieredCanvas'
import { SequenceView } from './SequenceView'
import { PrototypeSwitcher, useVariant } from './PrototypeSwitcher'

const VARIANTS = [
  { key: 'A', name: 'Tier columns (left → right)' },
  { key: 'B', name: 'Tier bands (top → bottom)' },
  { key: 'C', name: 'Sequence lifelines' },
]
const BASE_MS = 1700
const KIND_TEXT = { req: 'request', res: 'response', async: 'async', local: 'inside node' }

export function ExplorerPrototype() {
  const [variant, setVariant] = useVariant(VARIANTS.map(v => v.key))
  const [flowId, setFlowId] = useState(design.flows[1].id)
  const [step, setStep] = useState(-1)
  const [playing, setPlaying] = useState(false)
  const [speed, setSpeed] = useState(1)
  const [cloud, setCloud] = useState<Cloud>('neutral')
  const [nonce, setNonce] = useState(0)

  const flow = design.flows.find(f => f.id === flowId)!
  const last = flow.steps.length - 1
  const cur = flow.steps[step]
  const stepMs = BASE_MS / speed
  const packetMs = stepMs * 0.7
  const byId = Object.fromEntries(design.nodes.map(n => [n.id, n]))

  const go = (i: number) => { setStep(Math.max(-1, Math.min(last, i))); setNonce(n => n + 1) }
  const togglePlay = () => {
    if (playing) return setPlaying(false)
    if (step >= last) go(-1)
    setPlaying(true)
  }

  useEffect(() => {
    if (!playing) return
    if (step >= last) { setPlaying(false); return }
    const t = setTimeout(() => go(step + 1), step < 0 ? 150 : stepMs)
    return () => clearTimeout(t)
  }, [playing, step, last, stepMs])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest('input, textarea, [contenteditable]')) return
      if (e.key === ' ') { e.preventDefault(); togglePlay() }
      if (e.key === 'n') { setPlaying(false); go(step + 1) }
      if (e.key === 'p') { setPlaying(false); go(step - 1) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const pickFlow = (id: string) => { setFlowId(id); setPlaying(false); setStep(-1) }

  return (
    <div className="xp">
      <header className="xp-top">
        <div className="xp-title">
          <span className="xp-proto">PROTOTYPE</span>
          <b>{design.title}</b><span className="xp-muted">{design.prompt}</span>
        </div>
        <div className="xp-seg">
          {(['neutral', 'aws', 'gcp'] as Cloud[]).map(c => (
            <button key={c} className={cloud === c ? 'on' : ''} onClick={() => setCloud(c)}>
              {c === 'neutral' ? 'Cloud-neutral' : c.toUpperCase()}
            </button>
          ))}
        </div>
      </header>

      <main className="xp-stage">
        <div className="xp-player">
          <div className="xp-seg">
            {design.flows.map(f => <button key={f.id} className={f.id === flowId ? 'on' : ''} onClick={() => pickFlow(f.id)}>{f.title}</button>)}
          </div>
          <div className="xp-controls">
            <button title="Reset" onClick={() => { setPlaying(false); go(-1) }}>⏮</button>
            <button title="Previous (p)" onClick={() => { setPlaying(false); go(step - 1) }}>◀</button>
            <button className="xp-play" title="Play / pause (space)" onClick={togglePlay}>{playing ? '⏸' : '▶'}</button>
            <button title="Next (n)" onClick={() => { setPlaying(false); go(step + 1) }}>▶|</button>
            <span className="xp-count">{step + 1}/{flow.steps.length}</span>
            {[0.5, 1, 2].map(s => <button key={s} className={speed === s ? 'on' : ''} onClick={() => setSpeed(s)}>{s}×</button>)}
          </div>
        </div>
        <ReactFlowProvider>
          {variant === 'C'
            ? <SequenceView design={design} flow={flow} step={step} cloud={cloud} packetMs={packetMs} nonce={nonce} onJump={i => { setPlaying(false); go(i) }} />
            : <TieredCanvas key={variant} design={design} flow={flow} step={step} cloud={cloud} packetMs={packetMs} nonce={nonce}
                orientation={variant === 'B' ? 'rows' : 'cols'} />}
        </ReactFlowProvider>
      </main>

      <aside className="xp-panel">
        <h3>{flow.title}</h3>
        <p className="xp-muted">{flow.summary}</p>

        {cur ? (
          <div className="xp-card">
            <div className="xp-card-meta">
              <span>Step {step + 1}</span>
              <span className="xp-pill" style={{ color: KIND_COLOR[cur.kind], borderColor: KIND_COLOR[cur.kind] }}>{KIND_TEXT[cur.kind]}</span>
            </div>
            <div className="xp-card-hop">
              {byId[cur.from].icon} {byId[cur.from].names[cloud]}
              {cur.from !== cur.to && <> <span className="xp-muted">→</span> {byId[cur.to].icon} {byId[cur.to].names[cloud]}</>}
            </div>
            <div className="xp-card-label" style={{ color: KIND_COLOR[cur.kind] }}>{cur.label}</div>
            <p>{cur.detail}</p>
            {cur.payload && <pre>{cur.payload}</pre>}
          </div>
        ) : (
          <div className="xp-card xp-muted">Press ▶ (or space) to send a request through the system, or click any step below.</div>
        )}

        <ol className="xp-steps">
          {flow.steps.map((s, i) => (
            <li key={i} className={i === step ? 'cur' : i < step ? 'done' : ''} onClick={() => { setPlaying(false); go(i) }}>
              <span className="xp-dot" style={{ background: KIND_COLOR[s.kind] }} />
              <span className="xp-step-hop">{byId[s.from].names[cloud]}{s.from !== s.to && ` → ${byId[s.to].names[cloud]}`}</span>
              <span className="xp-step-label">{s.label}</span>
            </li>
          ))}
        </ol>
        <div className="xp-legend">
          {Object.entries(KIND_COLOR).map(([k, c]) => <span key={k}><i style={{ background: c }} />{KIND_TEXT[k as keyof typeof KIND_TEXT]}</span>)}
        </div>
      </aside>

      <PrototypeSwitcher variants={VARIANTS} current={variant} onChange={setVariant} />
    </div>
  )
}
