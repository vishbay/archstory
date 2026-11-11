// A short guided tour: dims the page, rings one element, and explains it in a small card.
import { useEffect, useLayoutEffect, useRef, useState } from 'react'

import type { TourStep } from './tourSteps'

const PAD = 6

export function Tour({ steps, onDone }: { steps: TourStep[]; onDone: () => void }) {
  const [i, setI] = useState(0)
  const [rect, setRect] = useState<DOMRect | null>(null)
  const step = steps[i]

  useLayoutEffect(() => {
    const measure = () => setRect(document.querySelector(step.target)?.getBoundingClientRect() ?? null)
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [step])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      e.stopPropagation()
      if (e.key === 'Escape') onDone()
      if (e.key === 'ArrowRight' || e.key === 'Enter') { e.preventDefault(); if (i < steps.length - 1) setI(i + 1); else onDone() }
      if (e.key === 'ArrowLeft' && i > 0) { e.preventDefault(); setI(i - 1) }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  })

  // Card below the target when there is room, otherwise above, otherwise inside a target that fills the screen;
  // always kept on screen. Centred when the target is missing.
  const W = 320, vw = window.innerWidth, vh = window.innerHeight
  const card = useRef<HTMLDivElement>(null)
  const [h, setH] = useState(190)
  useLayoutEffect(() => { if (card.current) setH(card.current.offsetHeight) }, [i, rect])
  const top = !rect ? vh / 2 - h / 2
    : rect.bottom + 14 + h < vh - 12 ? rect.bottom + 14
    : rect.top - 14 - h > 12 ? rect.top - 14 - h
    : rect.bottom - h - 24
  const style = {
    left: rect ? Math.min(Math.max(12, rect.left + rect.width / 2 - W / 2), vw - W - 12) : vw / 2 - W / 2,
    top: Math.min(Math.max(12, top), vh - h - 12),
  }

  return (
    <div className="tour" role="dialog" aria-modal="true" aria-label="Tour">
      {rect
        ? <div className="tour-ring" style={{ left: rect.left - PAD, top: rect.top - PAD, width: rect.width + PAD * 2, height: rect.height + PAD * 2 }} />
        : <div className="tour-dim" />}
      <div ref={card} className="tour-card" style={{ ...style, width: W }}>
        <span className="muted small">{i + 1} of {steps.length}</span>
        <h3>{step.title}</h3>
        <p>{step.body}</p>
        <div className="row">
          <button className="link" onClick={onDone}>Skip tour</button>
          <span className="spacer" />
          {i > 0 && <button onClick={() => setI(i - 1)}>Back</button>}
          <button className="primary" onClick={() => (i < steps.length - 1 ? setI(i + 1) : onDone())} autoFocus>{i < steps.length - 1 ? 'Next' : 'Done'}</button>
        </div>
      </div>
    </div>
  )
}
