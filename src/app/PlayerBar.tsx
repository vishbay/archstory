import { useEffect } from 'react'
import type { Flow } from '../model/schema'
import type { Player } from './hooks'
import { KIND_TEXT, KIND_VAR } from './stepKinds'

export function PlayerBar({ flows, flow, onFlow, player }: {
  flows: Flow[]; flow: Flow | undefined; onFlow: (id: string) => void; player: Player
}) {
  const { step, playing, speed, setSpeed, toggle, jump, length } = player

  useEffect(() => {
    if (!flow) return
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest('input, textarea, select, [contenteditable]')) return
      if (e.key === ' ') { e.preventDefault(); toggle() }
      else if (e.key === 'ArrowRight') jump(step + 1)
      else if (e.key === 'ArrowLeft') jump(step - 1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  if (!flow) return <div className="player muted">This design has no request flows yet.</div>
  return (
    <div className="player">
      <select value={flow.id} onChange={e => onFlow(e.target.value)} aria-label="Request flow">
        {flows.map(f => <option key={f.id} value={f.id}>{f.title}</option>)}
      </select>
      <div className="player-buttons">
        <button className="icon" title="Restart" onClick={() => jump(-1)}>⏮</button>
        <button className="icon" title="Previous step (←)" onClick={() => jump(step - 1)}>◀</button>
        <button className="icon primary" title="Play / pause (space)" onClick={toggle}>{playing ? '⏸' : '▶'}</button>
        <button className="icon" title="Next step (→)" onClick={() => jump(step + 1)}>▶|</button>
      </div>
      <div className="scrub-wrap" style={{ ['--p' as string]: `${(length ? (step + 1) / length : 0) * 100}%` }}>
        <input className="scrub" type="range" min={0} max={length} value={step + 1} aria-label="Step"
          onChange={e => jump(Number(e.target.value) - 1)} />
        {flow.steps.map((s, i) => (
          <button key={i} type="button" tabIndex={-1} className={`tick${i <= step ? ' done' : ''}${i === step ? ' cur' : ''}`}
            style={{ left: `calc(8px + (100% - 16px) * ${(i + 1) / length})`, background: KIND_VAR[s.kind] }}
            title={`${i + 1}. ${KIND_TEXT[s.kind]}: ${s.label}`} aria-label={`Go to step ${i + 1}`} onClick={() => jump(i)} />
        ))}
      </div>
      <span className="count">{step + 1} / {length}</span>
      <select value={speed} onChange={e => setSpeed(Number(e.target.value))} aria-label="Speed">
        {[0.5, 1, 1.5, 2].map(s => <option key={s} value={s}>{s}×</option>)}
      </select>
    </div>
  )
}
