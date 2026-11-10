import { useEffect, useMemo, useRef, useState } from 'react'
import type { Design, Question } from '../model/schema'
import { nameOf, type Cloud } from '../model/kinds'
import { cardKey, dueCards, INTERVALS, type DrillCard, type Rating } from '../practice/cards'
import { openDrill, rateCard, today, useDeck } from './useDeck'

const RATINGS: { r: Rating; label: string; key: string }[] = [
  { r: 'missed', label: 'Missed it', key: '1' }, { r: 'partly', label: 'Partly', key: '2' }, { r: 'got', label: 'Got it', key: '3' },
]
const TOPIC: Record<string, string> = {
  requirements: 'Requirements', scale: 'Scale', data: 'Data', consistency: 'Consistency', reliability: 'Reliability',
  performance: 'Performance', security: 'Security', operations: 'Operations', tradeoffs: 'Trade-offs',
}
const when = (due: number) => { const d = due - today(); return d <= 0 ? 'due now' : d === 1 ? 'again tomorrow' : `again in ${d} days` }

/** The Questions tab in Explore: every follow-up for this design. Answer it in your head, then reveal and rate yourself. */
export function QuestionsPanel({ design, cloud, onSelect }: { design: Design; cloud: Cloud; onSelect: (id: string) => void }) {
  const deck = useDeck()
  const [open, setOpen] = useState<Set<string>>(new Set())
  const label = (id: string) => { const n = design.nodes.find(x => x.id === id); return n ? nameOf(n, cloud) : id }
  return (
    <>
      <div className="q-head">
        <h3>Follow-up questions</h3>
        <button className="primary" onClick={() => openDrill(design.id)}>Drill these</button>
      </div>
      <p className="muted small">What an interviewer asks next about this design. Answer out loud first, then reveal the model answer and rate yourself; questions you miss come back sooner.</p>
      <ol className="q-list">
        {design.questions.map(q => {
          const k = cardKey(design.id, q), st = deck[k], shown = open.has(q.id)
          return (
            <li key={q.id}>
              <div className="q-meta">{q.topic && <span className="tag">{TOPIC[q.topic]}</span>}{st && <span className="muted small">{st.last === 'got' ? '✓' : st.last === 'partly' ? '~' : '✕'} {when(st.due)}</span>}</div>
              <p className="q-text">{q.q}</p>
              {q.targets.length > 0 && <div className="q-targets">{q.targets.map(t => <button key={t} className="link" onClick={() => onSelect(t)}>{label(t)}</button>)}</div>}
              {shown ? (
                <>
                  <p className="q-answer">{q.a}</p>
                  <div className="q-rate">{RATINGS.map(r => <button key={r.r} className={st?.last === r.r ? 'on' : ''} onClick={() => rateCard(k, r.r)}>{r.label}</button>)}</div>
                </>
              ) : <button className="small-btn" onClick={() => setOpen(s => new Set(s).add(q.id))}>Show model answer</button>}
            </li>
          )
        })}
      </ol>
    </>
  )
}

/** One question at a time: think, reveal, rate. Covers one design, or everything due across the library. */
export function DrillDialog({ designs, onlyId, onClose }: { designs: Design[]; onlyId: string | null; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const deck = useDeck()
  // The session's cards are fixed when it opens, so rating one does not reshuffle the rest.
  const [cards] = useState<DrillCard[]>(() => {
    const pool = onlyId ? designs.filter(d => d.id === onlyId) : designs
    const due = dueCards(pool, deck, today(), onlyId ? 100 : 10)
    return onlyId && !due.length ? pool.flatMap(d => d.questions.map((q: Question) => ({ design: d, question: q, key: cardKey(d.id, q) }))) : due
  })
  const [i, setI] = useState(0)
  const [shown, setShown] = useState(false)
  const [tally, setTally] = useState<Record<Rating, number>>({ missed: 0, partly: 0, got: 0 })
  useEffect(() => { dialog.current?.showModal() }, [])
  const card = cards[i]
  const doneAll = i >= cards.length
  const title = useMemo(() => (onlyId ? designs.find(d => d.id === onlyId)?.meta.title : 'Daily drill'), [designs, onlyId])

  const rateIt = (r: Rating) => { if (!card) return; rateCard(card.key, r); setTally(t => ({ ...t, [r]: t[r] + 1 })); setShown(false); setI(n => n + 1) }
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (doneAll || (e.target as HTMLElement).closest('input, textarea, select')) return
      if (!shown && (e.key === ' ' || e.key === 'Enter')) { e.preventDefault(); setShown(true) }
      else if (shown) { const r = RATINGS.find(x => x.key === e.key); if (r) rateIt(r.r) }
    }
    window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey)
  })

  return (
    <dialog ref={dialog} className="dialog drill-dialog" onClose={onClose} aria-label="Question drill">
      <div className="drill-top"><h3>{title}</h3>{!doneAll && <span className="muted small">{i + 1} of {cards.length}</span>}</div>
      {!cards.length && <p className="muted">Nothing is due today. Come back tomorrow, or open a design's Questions tab to go through its questions again.</p>}
      {card && (
        <div className="drill-card">
          {!onlyId && <span className="muted small">{card.design.meta.title}</span>}
          <p className="drill-q">{card.question.q}</p>
          {shown ? (
            <>
              <p className="q-answer">{card.question.a}</p>
              <p className="muted small">How close was your answer?</p>
              <div className="q-rate">{RATINGS.map(r => <button key={r.r} onClick={() => rateIt(r.r)}>{r.label} <kbd>{r.key}</kbd></button>)}</div>
              <p className="muted small">Missed comes back tomorrow; right answers wait {INTERVALS[1]}, then {INTERVALS[2]}, then {INTERVALS[3]} days and longer.</p>
            </>
          ) : (
            <>
              <p className="muted small">Answer out loud, the way you would in the interview, then reveal.</p>
              <button className="primary" onClick={() => setShown(true)}>Show model answer <kbd>Space</kbd></button>
            </>
          )}
        </div>
      )}
      {doneAll && cards.length > 0 && (
        <div className="drill-card">
          <p className="drill-q">Done: {cards.length} question{cards.length === 1 ? '' : 's'}.</p>
          <p>Got it {tally.got} · Partly {tally.partly} · Missed {tally.missed}</p>
          <p className="muted small">Missed questions come back tomorrow.</p>
        </div>
      )}
      <div className="row end"><span className="spacer" /><button onClick={() => dialog.current?.close()}>{doneAll ? 'Close' : 'Stop for now'}</button></div>
    </dialog>
  )
}
