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

  if (!flow) return <div className="player"><div className="dock muted">This design has no request flows yet.</div></div>
  return (
    <div className="player">
      <div className="dock">
        {picker && (
          <ScenarioPicker flows={flows} current={flow.id} onPick={onFlow} variant="bar" />
        )}
        <div className="player-buttons">
          <button className="icon" title="Restart" aria-label="Restart" disabled={step < 0} onClick={() => jump(-1)}>{ICON.restart}</button>
          <button className="icon" title="Previous step (←)" aria-label="Previous step" disabled={step < 0} onClick={() => jump(step - 1)}>{ICON.prev}</button>
          <button className="icon primary" title="Play / pause (Space)" aria-label={playing ? 'Pause' : 'Play'} onClick={toggle}>{playing ? ICON.pause : ICON.play}</button>
          <button className="icon" title="Next step (→)" aria-label="Next step" disabled={step >= last} onClick={() => jump(step + 1)}>{ICON.next}</button>
        </div>
        <span className="kbd-hints" aria-hidden title="Keyboard shortcuts"><kbd>Space</kbd> play <kbd>←</kbd><kbd>→</kbd> step</span>
        <div className="scrub-wrap" style={{ ['--p' as string]: `${(length ? (step + 1) / length : 0) * 100}%` }}>
          <input className="scrub" type="range" min={0} max={length} value={step + 1} aria-label="Step"
            onChange={e => jump(Number(e.target.value) - 1)} />
          {flow.steps.map((s, i) => (
            <button key={i} type="button" tabIndex={-1} className={`tick${i <= step ? ' done' : ''}${i === step ? ' cur' : ''}`}
              style={{ left: `calc(9px + (100% - 18px) * ${(i + 1) / length})`, background: KIND_VAR[s.kind] }}
              title={`${i + 1}. ${KIND_TEXT[s.kind]}: ${s.label}`} aria-label={`Go to step ${i + 1}`} onClick={() => jump(i)} />
          ))}
        </div>
        <span className="count">{step + 1} / {length}</span>
        {finished && next && (
          <button className="next-scenario primary" onClick={() => { onFlow(next.flow.id) }} title={`${next.wrapped ? 'Back to the first scenario' : 'Play the next scenario'}: ${next.flow.title}`}>
            <span className="next-label">{next.wrapped ? 'Start over' : 'Next'}<span className="next-title">: {next.flow.title}</span> →</span>
          </button>
        )}
        <button className="speed-cycle" title="Playback speed (click to change)" aria-label={`Speed ${speed}×. Click to change`}
          onClick={() => setSpeed(SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length])}>{speed}×</button>
        <div className="seg speed" role="group" aria-label="Speed">
          {SPEEDS.map(v => (
            <button key={v} className={speed === v ? 'on' : ''} aria-pressed={speed === v} onClick={() => setSpeed(v)}>{v}×</button>
          ))}
        </div>
      </div>
    </div>
  )
}

const SPEEDS = [0.5, 1, 1.5, 2]
const svg = (d: React.ReactNode) => <svg viewBox="0 0 16 16" width="15" height="15" fill="currentColor" aria-hidden>{d}</svg>
/** Crisp icons in place of text glyphs, so the controls look the same on every platform. */
const ICON = {
  restart: svg(<><rect x="2.5" y="3" width="2" height="10" rx="1" /><path d="M14 3.2v9.6a.8.8 0 0 1-1.25.66L6.5 8.66a.8.8 0 0 1 0-1.32l6.25-4.8A.8.8 0 0 1 14 3.2z" /></>),
  prev: svg(<path d="M11.5 3.2v9.6a.8.8 0 0 1-1.25.66L4 8.66a.8.8 0 0 1 0-1.32l6.25-4.8a.8.8 0 0 1 1.25.66z" />),
  next: svg(<path d="M4.5 3.2v9.6a.8.8 0 0 0 1.25.66L12 8.66a.8.8 0 0 0 0-1.32L5.75 2.54A.8.8 0 0 0 4.5 3.2z" />),
  play: <svg viewBox="0 0 16 16" width="18" height="18" fill="currentColor" aria-hidden><path d="M5 2.9v10.2a.8.8 0 0 0 1.22.68l8-5.1a.8.8 0 0 0 0-1.36l-8-5.1A.8.8 0 0 0 5 2.9z" /></svg>,
  pause: <svg viewBox="0 0 16 16" width="18" height="18" fill="currentColor" aria-hidden><rect x="3.5" y="2.5" width="3.2" height="11" rx="1.1" /><rect x="9.3" y="2.5" width="3.2" height="11" rx="1.1" /></svg>,
}
