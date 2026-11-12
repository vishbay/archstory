import { useState } from 'react'
import type { Design } from '../model/schema'
import type { Check } from '../practice/checks'
import {
  budgets, checklistScore, clock, itemDone, itemKey, mmss, PHASES, PRESETS, report, status, type TimedSession,
} from '../practice/timed'
import { askConfirm } from './confirm'

export interface TimedControls {
  session: TimedSession | null; now: number
  start: (minutes: number) => void; pause: () => void; resume: () => void
  next: () => void; end: () => void; reset: () => void
  tick: (key: string) => void
  /** Open the estimate calculator. */
  calculator: () => void
  /** Drill this problem's follow-up questions. */
  drill: () => void
  /** Open the Reasoning section where this phase's notes belong. */
  notes: (section: string) => void
  /** Name of the attempt saved when the interview ended, if any. */
  savedAs: string | null
}

/** The clock over the canvas while a timed interview runs. */
export function TimerBanner({ t, onOpen }: { t: TimedControls; onOpen: () => void }) {
  const s = t.session
  if (!s || s.endedAt !== null) return null
  const st = status(s, t.now), phase = PHASES[st.index], nextTitle = PHASES[st.index + 1]?.title
  const left = st.budget - st.spent
  return (
    <div className={`timer-banner${st.over ? ' over' : ''}${s.pausedAt ? ' paused' : ''}`} role="timer" aria-live="off">
      <button className="timer-main" onClick={onOpen} title="Open the interview checklist">
        <span className="timer-phase">{st.index + 1}/{PHASES.length} {phase.title}</span>
        <span className="timer-time">{s.pausedAt ? 'Paused' : st.over ? `Over by ${mmss(st.over)}` : `${mmss(left)} left`}</span>
        <span className="timer-total muted">· {mmss(st.totalLeft)} total</span>
      </button>
      {st.over > 0 && !s.pausedAt && <span className="timer-nudge">{nextTitle ? `Move on to ${nextTitle}` : 'Time to wrap up'}</span>}
      <span className="timer-bar" aria-hidden><i style={{ width: `${Math.min(100, (st.spent / st.budget) * 100)}%` }} /></span>
      {s.pausedAt ? <button onClick={t.resume}>Resume</button> : <button onClick={t.pause}>Pause</button>}
      <button className="primary" onClick={t.next}>{nextTitle ? 'Next phase' : 'Finish'}</button>
    </div>
  )
}

/** The Interview tab: choose a length and start, follow the checklist, then see how the time went. */
export function TimedPanel({ t, attempt, checks }: { t: TimedControls; attempt: Design; checks: Check[] }) {
  const [minutes, setMinutes] = useState<number>(45)
  const s = t.session

  if (!s) {
    const plan = budgets(minutes)
    return (
      <>
        <h3>Timed interview</h3>
        <p className="muted small">Practise against the clock. A system design interview usually runs in these phases; each one has a short checklist,
          and some items tick themselves from your drawing and notes. Running over only gets you a nudge.</p>
        <div className="seg" role="group" aria-label="Length">
          {PRESETS.map(m => <button key={m} className={minutes === m ? 'on' : ''} aria-pressed={minutes === m} onClick={() => setMinutes(m)}>{m} min</button>)}
        </div>
        <ol className="timed-plan">
          {PHASES.map((p, i) => <li key={p.id}><b>{p.title}</b><span className="muted">{plan[i] / 60_000} min</span><p className="small muted">{p.goal}</p></li>)}
        </ol>
        <button className="primary" onClick={() => t.start(minutes)}>Start {minutes}-minute interview</button>
      </>
    )
  }

  const score = checklistScore(s, attempt, checks)
  const Items = ({ i }: { i: number }) => {
    const p = PHASES[i]
    return (
      <ul className="timed-items">
        {p.items.map(item => {
          const d = itemDone(s, p, item, attempt, checks)
          return (
            <li key={item.id}>
              <label className="check-row">
                <input type="checkbox" checked={d.done} disabled={d.auto} onChange={() => t.tick(itemKey(p, item))} />
                <span>{item.text}{d.auto && <span className="auto-tag" title="Ticked from your drawing or notes">from your answer</span>}</span>
              </label>
            </li>
          )
        })}
        {p.notes && <li><button className="link" onClick={() => t.notes(p.notes!)}>Write notes for this phase</button></li>}
        {p.id === 'estimates' && <li><button className="link" onClick={t.calculator}>Check your numbers with the calculator</button></li>}
      </ul>
    )
  }

  if (s.endedAt !== null) {
    const rows = report(s, t.now)
    const missed = PHASES.flatMap(p => p.items.filter(i => !itemDone(s, p, i, attempt, checks).done).map(i => `${p.title}: ${i.text}`))
    return (
      <>
        <h3>Interview finished</h3>
        <div className="score"><span><b>{mmss(clock(s, t.now))}</b> of {s.total}:00</span><span>{score.done}/{score.total} checklist items</span></div>
        {t.savedAs && <p className="muted small">Your answer was saved as the attempt "{t.savedAs}".</p>}
        <table className="kv timed-report">
          <thead><tr><th>Phase</th><td>Planned</td><td>Actual</td></tr></thead>
          <tbody>{rows.map(r => (
            <tr key={r.id}><th>{r.title}</th><td>{mmss(r.planned)}</td>
              <td className={r.actual === null ? 'muted' : r.actual > r.planned * 1.25 ? 'over' : r.actual < r.planned * 0.5 ? 'under' : ''}>{r.actual === null ? 'skipped' : mmss(r.actual)}</td></tr>
          ))}</tbody>
        </table>
        {missed.length > 0 && <><h4>To practise next time</h4><ul className="reqs">{missed.map(m => <li key={m}>{m}</li>)}</ul></>}
        <div className="row wrap"><button className="primary" onClick={t.reset}>Start another</button><button onClick={t.drill}>Practise the follow-up questions</button></div>
      </>
    )
  }

  const st = status(s, t.now)
  return (
    <>
      <div className="timed-head">
        <span className={`timed-clock${st.totalLeft < 0 ? ' over' : ''}`}>{mmss(st.totalLeft)}</span>
        <span className="muted small">{s.pausedAt ? 'paused' : 'left'} · {score.done}/{score.total} items</span>
      </div>
      <div className="row wrap">
        {s.pausedAt ? <button onClick={t.resume}>Resume</button> : <button onClick={t.pause}>Pause</button>}
        <button className="primary" onClick={t.next}>{st.index < PHASES.length - 1 ? `Next: ${PHASES[st.index + 1].title}` : 'Finish'}</button>
        <button onClick={async () => { if (await askConfirm({ title: 'End the interview now?', body: 'The clock stops here. If you have drawn anything, it is saved as an attempt.', confirm: 'End interview', cancel: 'Keep going' })) t.end() }}>End</button>
      </div>
      <ol className="timed-phases">
        {PHASES.map((p, i) => {
          const b = budgets(s.total)[i], cur = i === st.index, done = i < st.index
          const spent = done ? s.phaseStarts[i + 1] - s.phaseStarts[i] : cur ? st.spent : 0
          return (
            <li key={p.id} className={cur ? 'cur' : done ? 'done' : ''}>
              <details open={cur}>
                <summary>
                  <b>{p.title}</b>
                  <span className={`muted small${spent > b ? ' over' : ''}`}>{done || cur ? `${mmss(spent)} / ` : ''}{mmss(b)}</span>
                </summary>
                {cur && <p className="small muted">{p.goal}</p>}
                <Items i={i} />
              </details>
            </li>
          )
        })}
      </ol>
    </>
  )
}
