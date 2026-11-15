// Scenario picker in the app's own popover style, replacing the native select: the Flow panel heading in Explore
// and the player bar in Practice. Arrow keys move, Enter picks, Escape or a click outside closes. The list is drawn on the page
// itself (a portal) at the button's position, so the panel's sticky step card and scrolling can never cover or clip it.
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
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
  const [place, setPlace] = useState<CSSProperties>({})

  useEffect(() => {
    if (!open) return
    // capture phase: the canvas stops pointer events from bubbling, and a click there should still close the list
    const close = (e: PointerEvent) => { const t = e.target as Node; if (!box.current?.contains(t) && !list.current?.contains(t)) setOpen(false) }
    // the list is placed once, so scrolling or resizing anywhere else closes it (scrolling inside the list does not)
    const move = (e: Event) => { if (!list.current?.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('pointerdown', close, true)
    window.addEventListener('scroll', move, true); window.addEventListener('resize', move)
    return () => { document.removeEventListener('pointerdown', close, true); window.removeEventListener('scroll', move, true); window.removeEventListener('resize', move) }
  }, [open])
  useLayoutEffect(() => {
    if (!open || !box.current) return
    const r = box.current.getBoundingClientRect(), vh = window.innerHeight, vw = window.innerWidth
    if (variant === 'bar') {   // opens upwards from the player bar
      const width = Math.min(360, vw * 0.9)
      setPlace({ left: Math.max(8, Math.min(r.left, vw - width - 8)), width, bottom: vh - r.top + 8, maxHeight: Math.min(360, r.top - 16) })
    } else {                   // opens downwards from the panel heading
      setPlace({ left: r.left - 10, width: r.width + 20, top: r.bottom + 6, maxHeight: Math.min(360, vh - r.bottom - 16) })
    }
  }, [open, variant])
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
      {open && createPortal(
        <ul className="scn-panel" role="listbox" aria-label="Scenarios" ref={list} style={place}>
          {flows.map((f, i) => (
            <li key={f.id} role="option" aria-selected={i === idx} className={`${i === at ? 'hl' : ''}${i === idx ? ' on' : ''}`}
              onMouseEnter={() => setAt(i)} onMouseDown={e => e.preventDefault()} onClick={() => pick(i)}>
              <span className="scn-num">{i + 1}</span>
              <span className="scn-text"><b>{f.title}</b><span>{f.steps.length} steps{f.summary ? ` · ${f.summary}` : ''}</span></span>
              {i === idx && <span className="scn-check" aria-hidden>✓</span>}
            </li>
          ))}
        </ul>,
        document.body,
      )}
    </div>
  )
}
