import { useEffect } from 'react'
import type { Flow } from '../model/schema'
import type { Player } from './hooks'
import { KIND_TEXT, KIND_VAR } from './stepKinds'
import { nextScenario } from './scenarios'
import { ScenarioPicker } from './ScenarioPicker'

export function PlayerBar({ flows, flow, onFlow, player, picker = false }: {
  flows: Flow[]; flow: Flow | undefined; onFlow: (id: string) => void; player: Player
  /** Show the scenario picker here (Practice); Explore puts it in the Flow panel next to the title. */
  picker?: boolean
}) {
  const { step, playing, speed, setSpeed, toggle, jump, length, last } = player
  const finished = length > 0 && step >= last
  const next = flow ? nextScenario(flows, flow.id) : null

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
      {picker && (
        <ScenarioPicker flows={flows} current={flow.id} onPick={onFlow} variant="bar" />
      )}
      <div className="player-buttons">
        <button className="icon" title="Restart" aria-label="Restart" disabled={step < 0} onClick={() => jump(-1)}>⏮</button>
        <button className="icon" title="Previous step (←)" aria-label="Previous step" disabled={step < 0} onClick={() => jump(step - 1)}>◀</button>
        <button className="icon primary" title="Play / pause (Space)" aria-label={playing ? 'Pause' : 'Play'} onClick={toggle}>{playing ? '⏸' : '▶'}</button>
        <button className="icon" title="Next step (→)" aria-label="Next step" disabled={step >= last} onClick={() => jump(step + 1)}>▶|</button>
      </div>
      <span className="kbd-hints" aria-hidden title="Keyboard shortcuts"><kbd>Space</kbd> play <kbd>←</kbd><kbd>→</kbd> step</span>
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
      {finished && next && (
        <button className="next-scenario primary" onClick={() => { onFlow(next.flow.id) }} title={`${next.wrapped ? 'Back to the first scenario' : 'Play the next scenario'}: ${next.flow.title}`}>
          <span className="next-label">{next.wrapped ? 'Start over' : 'Next'}<span className="next-title">: {next.flow.title}</span> →</span>
        </button>
      )}
      <select value={speed} onChange={e => setSpeed(Number(e.target.value))} aria-label="Speed">
        {[0.5, 1, 1.5, 2].map(s => <option key={s} value={s}>{s}×</option>)}
      </select>
    </div>
  )
}
