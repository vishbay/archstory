// The Flow tab's step list: grouped into collapsible phases when the flow names them, flat otherwise.
import { useEffect, useMemo, useRef, useState } from 'react'
import type { Flow, Step } from '../model/schema'
import { phaseGroups } from '../model/phases'
import { KIND_GLYPH, KIND_TEXT, KIND_VAR } from './stepKinds'
import { reducedMotion } from './hooks'

export function StepList({ flow, step, jump, name }: { flow: Flow; step: number; jump: (i: number) => void; name: (id: string) => string }) {
  const groups = useMemo(() => phaseGroups(flow.steps), [flow])
  const [collapsed, setCollapsed] = useState<Set<number>>(new Set())   // by the group's first step
  const [forFlow, setForFlow] = useState(flow.id)
  if (forFlow !== flow.id) { setForFlow(flow.id); setCollapsed(new Set()) }
  const root = useRef<HTMLDivElement>(null)

  const curStart = groups?.find(g => step >= g.start && step <= g.end)?.start
  // Entering a phase during playback opens it, so the current step is never hidden.
  const [seenStart, setSeenStart] = useState(curStart)
  if (seenStart !== curStart) {
    setSeenStart(curStart)
    if (curStart !== undefined && collapsed.has(curStart)) { const n = new Set(collapsed); n.delete(curStart); setCollapsed(n) }
  }
  // Keep the current step in view while the flow plays.
  useEffect(() => {
    root.current?.querySelector('li.cur')?.scrollIntoView({ block: 'nearest', behavior: reducedMotion() ? 'auto' : 'smooth' })
  }, [step, flow.id])

  const row = (s: Step, i: number) => (
    <li key={i} className={i === step ? 'cur' : i < step ? 'done' : ''} onClick={() => jump(i)}
      role="button" tabIndex={0} aria-current={i === step ? 'step' : undefined}
      aria-label={`Step ${i + 1}, ${KIND_TEXT[s.kind]}: ${name(s.from)}${s.from !== s.to ? ` to ${name(s.to)}` : ''}, ${s.label}`}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); jump(i) } }}>
      <span className="step-glyph" style={{ color: KIND_VAR[s.kind] }} title={KIND_TEXT[s.kind]} aria-hidden>{KIND_GLYPH[s.kind]}</span>
      <span className="step-hop"><span className="step-no">{i + 1}</span>{name(s.from)}{s.from !== s.to && ` → ${name(s.to)}`}</span>
      <span className="mono muted step-label">{s.label}</span>
    </li>
  )

  if (!groups) return <div ref={root}><ol className="steps">{flow.steps.map(row)}</ol></div>

  const toggle = (start: number) => setCollapsed(c => { const n = new Set(c); if (n.has(start)) n.delete(start); else n.add(start); return n })
  return (
    <div ref={root}>
      <div className="steps-tools">
        <span className="muted small">{groups.length} phases</span>
        <span className="spacer" />
        <button className="link" onClick={() => setCollapsed(new Set(groups.filter(g => g.start !== curStart).map(g => g.start)))}>Collapse all</button>
        <button className="link" onClick={() => setCollapsed(new Set())}>Expand all</button>
      </div>
      {groups.map(g => {
        const open = !collapsed.has(g.start), n = g.end - g.start + 1
        const status = step > g.end ? 'done' : step >= g.start ? 'now' : 'next'
        return (
          <section key={g.start} className={`phase phase-${status}`}>
            <button className="phase-head" aria-expanded={open} onClick={() => toggle(g.start)}>
              <span className={`chev${open ? ' open' : ''}`}>›</span>
              <b>{g.name || 'Steps'}</b>
              <span className="phase-meta">{n} step{n === 1 ? '' : 's'}</span>
              {status === 'done' && <span className="phase-state" title="Finished">✓ done</span>}
              {status === 'now' && <span className="phase-state now">now</span>}
            </button>
            {open && <ol className="steps">{flow.steps.slice(g.start, g.end + 1).map((s, k) => row(s, g.start + k))}</ol>}
          </section>
        )
      })}
    </div>
  )
}
