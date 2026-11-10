// Landing page: what ArchStory does, then the library as cards with a tiny map of each design.
import { useMemo, useState } from 'react'
import type { Design } from '../model/schema'
import { colorOf } from '../model/kinds'
import { layoutBands, NODE_H, NODE_W } from '../layout/bands'
import { runChecks } from '../practice/checks'
import { percent, practised, progressOf, type Progress } from '../practice/progress'
import { storeKv } from './hooks'
import { openAiSettings } from './useAiConfig'
import { deckStats } from '../practice/cards'
import { openDrill, today, useDeck } from './useDeck'

/** A miniature of the tier-band canvas: bands, connections and coloured component blocks. */
function MiniMap({ design }: { design: Design }) {
  const L = useMemo(() => layoutBands(design), [design])
  const W = L.width, H = L.height
  const c = (id: string) => ({ x: L.pos[id].x + NODE_W / 2, y: L.pos[id].y + NODE_H / 2 })
  return (
    <svg className="minimap" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet" aria-hidden>
      {L.bands.map(b => <rect key={b.tier} x={b.x} y={b.y} width={b.w} height={b.h} rx={14} className="mm-band" />)}
      {design.edges.map(e => { const a = c(e.from), z = c(e.to); return <line key={`${e.from}-${e.to}`} x1={a.x} y1={a.y} x2={z.x} y2={z.y} className="mm-edge" /> })}
      {design.nodes.map(n => (
        <rect key={n.id} x={L.pos[n.id].x} y={L.pos[n.id].y} width={NODE_W} height={NODE_H} rx={12}
          className="mm-node" style={{ stroke: colorOf(n) }} />
      ))}
    </svg>
  )
}

/** Where the learner is with a problem: best pass rate, best review, and how many attempts are saved. */
function ProgressChip({ p }: { p: Progress }) {
  const parts = [
    p.best ? `Best ${p.best.passed}/${p.best.total} checks (${percent(p.best)}%)` : 'Started',
    p.review !== null ? `review ${p.review}/5` : '',
    p.attempts ? `${p.attempts} saved` : '',
  ].filter(Boolean)
  return (
    <p className="card-progress" title="Your best result on this problem, from this browser">
      {p.best && <span className="progress-bar" aria-hidden><i style={{ width: `${percent(p.best)}%` }} /></span>}
      <span>{parts.join(' · ')}</span>
    </p>
  )
}

function Card({ d, onExplore, onPractice, progress }: { d: Design; onExplore: () => void; onPractice?: () => void; progress?: Progress }) {
  return (
    <article className="design-card">
      <button className="card-map" onClick={onExplore} aria-label={`Explore ${d.meta.title}`}><MiniMap design={d} /></button>
      <div className="card-body">
        <h3>{d.meta.title}</h3>
        {d.meta.summary && <p className="card-summary">{d.meta.summary}</p>}
        <div className="design-tags">
          {d.meta.difficulty && <span className={`diff diff-${d.meta.difficulty}`}>{d.meta.difficulty}</span>}
          {d.meta.tags.slice(0, 3).map(t => <span key={t} className="tag">{t}</span>)}
        </div>
        <p className="card-meta">{d.nodes.length} components · {d.flows.length} flow{d.flows.length === 1 ? '' : 's'}{d.network ? ` · ${d.network.zones} zones` : ''}</p>
        {progress && practised(progress) && <ProgressChip p={progress} />}
        <div className="row">
          <button className="primary" onClick={onExplore}>Explore</button>
          {onPractice && <button onClick={onPractice}>{progress?.inProgress ? 'Continue' : 'Practice'}</button>}
        </div>
      </div>
    </article>
  )
}

export function Home({ library, mine, onExplore, onPractice, onImport, onGenerate, onTour }: {
  library: Design[]; mine: Design[]
  onExplore: (id: string) => void; onPractice: (id: string) => void
  onImport: () => void; onGenerate: () => void; onTour: () => void
}) {
  const [level, setLevel] = useState<'all' | 'easy' | 'medium' | 'hard'>('all')
  const [q, setQ] = useState('')
  const order = { easy: 0, medium: 1, hard: 2 }
  const shown = library
    .filter(d => level === 'all' || d.meta.difficulty === level)
    .filter(d => { const s = q.trim().toLowerCase(); return !s || d.meta.title.toLowerCase().includes(s) || d.meta.tags.some(t => t.includes(s)) })
    .sort((a, b) => order[a.meta.difficulty ?? 'medium'] - order[b.meta.difficulty ?? 'medium'] || a.meta.title.localeCompare(b.meta.title))
  const first = library.find(d => d.id === 'url-shortener') ?? library[0]
  // Read once when the page opens; Home remounts each time the learner comes back to it.
  const progress = useMemo(() => Object.fromEntries(library.map(d => [d.id, progressOf(storeKv, d, runChecks)])), [library])
  const done = library.filter(d => practised(progress[d.id])).length
  const deck = useDeck()
  const cards = deckStats(library, deck, today())

  return (
    <div className="home">
      <section className="hero">
        <h1>System design, one request at a time.</h1>
        <p>Explore real architectures and watch each request travel through them hop by hop, with an explanation at every step.
          Then build your own answer, check it against a reference, and get it reviewed.</p>
        <div className="row wrap">
          <button className="primary big" onClick={() => onExplore(first.id)}>Explore {first.meta.title}</button>
          <button className="big" onClick={() => onPractice(first.id)}>Start practising</button>
          <button className="link" onClick={onTour}>Take the 1-minute tour</button>
        </div>
      </section>

      <section className="how">
        {[
          { icon: '▶', title: 'Watch', body: 'Pick a design and press play. Each request moves hop by hop, with the real message and why it happens.' },
          { icon: '✎', title: 'Build', body: 'In Practice, add components, connect them and record how your requests flow.' },
          { icon: '✓', title: 'Check', body: 'Automatic checks against a reference design, then an optional review by your own AI assistant, with a score and follow-up questions.' },
        ].map(s => (
          <div key={s.title} className="how-step"><span className="how-icon">{s.icon}</span><b>{s.title}</b><p>{s.body}</p></div>
        ))}
      </section>

      {cards.total > 0 && (
        <section className="home-drill">
          <div>
            <b>Follow-up questions</b>
            <p className="muted small">{cards.seen === 0
              ? `${cards.total} questions interviewers ask next, with model answers. Ten new ones a day, and the ones you miss come back sooner.`
              : `${cards.due} due today · ${cards.learned} of ${cards.total} learned · ${cards.total - cards.seen} not seen yet`}</p>
          </div>
          <span className="spacer" />
          <button className="primary" onClick={() => openDrill()}>{cards.seen === 0 ? 'Start the daily drill' : 'Drill now'}</button>
        </section>
      )}

      <section>
        <div className="lib-head">
          <h2>Library</h2>
          {done > 0 && <span className="lib-progress">Practised {done} of {library.length}</span>}
          <div className="seg" role="group" aria-label="Difficulty">
            {(['all', 'easy', 'medium', 'hard'] as const).map(l => (
              <button key={l} className={level === l ? 'on' : ''} onClick={() => setLevel(l)}>{l === 'all' ? 'All' : l[0].toUpperCase() + l.slice(1)}</button>
            ))}
          </div>
          <input className="search" placeholder="Search designs or tags…" value={q} onChange={e => setQ(e.target.value)} />
        </div>
        <p className="lib-note muted">These are reference designs, not the only right answers. Interviewers accept other approaches when you can explain the trade-offs, so use them to compare with your own.</p>
        <div className="card-grid">
          {shown.map(d => <Card key={d.id} d={d} progress={progress[d.id]} onExplore={() => onExplore(d.id)} onPractice={() => onPractice(d.id)} />)}
          {!shown.length && <p className="muted">No designs match.</p>}
        </div>
      </section>

      {mine.length > 0 && (
        <section>
          <div className="lib-head"><h2>My designs</h2></div>
          <div className="card-grid">{mine.map(d => <Card key={d.id} d={d} onExplore={() => onExplore(d.id)} />)}</div>
        </section>
      )}

      <section className="home-foot">
        <p>Bring your own design: <button className="link" onClick={onImport}>import a JSON file</button> or <button className="link" onClick={onGenerate}>make one with your own AI assistant</button>. Optional: <button className="link" onClick={openAiSettings}>connect your own API key</button> to send reviews and prompts from here.</p>
        <p className="muted small">Open source under the MIT license. Not affiliated with Amazon or Google.</p>
      </section>
    </div>
  )
}
