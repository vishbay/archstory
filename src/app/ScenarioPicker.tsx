// Scenario picker in the app's own popover style, replacing the native select: the Flow panel heading in Explore
// and the player bar in Practice. Arrow keys move, Enter picks, Escape or a click outside closes.
import { useEffect, useRef, useState } from 'react'
import type { Flow } from '../model/schema'

export function ScenarioPicker({ flows, current, onPick, variant }: {
  flows: Flow[]; current: string; onPick: (id: string) => void
  /** heading: the Flow panel title with "Scenario n of m" above it; bar: a compact button in the player bar that opens upwards */
  variant: 'heading' | 'bar'
}) {
  const [open, setOpen] = useState(false)
  const idx = Math.max(0, flows.findIndex(f => f.id === current))
  const [at, setAt] = useState(idx)
  const box = useRef<HTMLDivElement>(null)
  const list = useRef<HTMLUListElement>(null)

  useEffect(() => {
    if (!open) return
    // capture phase: the canvas stops pointer events from bubbling, and a click there should still close the list
    const close = (e: PointerEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('pointerdown', close, true)
    return () => document.removeEventListener('pointerdown', close, true)
  }, [open])
  useEffect(() => { if (open) list.current?.querySelector<HTMLElement>('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' }) }, [open, at])

  const pick = (i: number) => { onPick(flows[i].id); setOpen(false) }
  const onKey = (e: React.KeyboardEvent) => {
    if (!open) { if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); setAt(idx); setOpen(true) } return }
    if (e.key === 'Escape') { e.preventDefault(); setOpen(false) }
    else if (e.key === 'ArrowDown') { e.preventDefault(); setAt(Math.min(at + 1, flows.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setAt(Math.max(at - 1, 0)) }
    else if (e.key === 'Enter') { e.preventDefault(); pick(at) }
  }
  const cur = flows[idx]

  return (
    <div className={`scn scn-${variant}`} ref={box} onKeyDown={onKey}>
      {variant === 'heading' && <span className="scenario-label">Scenario {idx + 1} of {flows.length}</span>}
      <button className="scn-btn" aria-haspopup="listbox" aria-expanded={open} title="Choose which scenario to watch"
        onClick={() => { setAt(idx); setOpen(o => !o) }}>
        <span className="scn-title">{cur?.title ?? 'Choose a scenario'}</span><span className="chev-down" aria-hidden>▾</span>
      </button>
      {open && (
        <ul className="scn-panel" role="listbox" aria-label="Scenarios" ref={list}>
          {flows.map((f, i) => (
            <li key={f.id} role="option" aria-selected={i === idx} className={`${i === at ? 'hl' : ''}${i === idx ? ' on' : ''}`}
              onMouseEnter={() => setAt(i)} onMouseDown={e => e.preventDefault()} onClick={() => pick(i)}>
              <span className="scn-num">{i + 1}</span>
              <span className="scn-text"><b>{f.title}</b><span>{f.steps.length} steps{f.summary ? ` · ${f.summary}` : ''}</span></span>
              {i === idx && <span className="scn-check" aria-hidden>✓</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
