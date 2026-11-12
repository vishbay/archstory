// Landing page: what ArchStory does, then the library as cards with a tiny map of each design.
import { useMemo, useState } from 'react'
import type { Design } from '../model/schema'
import { colorOf } from '../model/kinds'
import { layoutBands, NODE_H, NODE_W } from '../layout/bands'
import { runChecks } from '../practice/checks'
import { percent, practised, practisedCount, progressOf, type Progress } from '../practice/progress'
import { storeKv } from './hooks'
import { openAiSettings } from './useAiConfig'
import { deckStats } from '../practice/cards'
import { HeroPreview, HowToImport, HowToInterview } from './HowTo'
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
  const progress = useMemo(() => Object.fromEntries([...library, ...mine].map(d => [d.id, progressOf(storeKv, d, runChecks)])), [library, mine])
  const everything = [...library, ...mine]
  const done = practisedCount(everything, progress)
  const deck = useDeck()
  const cards = deckStats(everything, deck, today())

  return (
    <div className="home-page">
      <div className="hero-band">
        <section className="hero">
          <div className="hero-copy">
            <a className="hero-pill" href="#library" onClick={e => { e.preventDefault(); document.getElementById('library')?.scrollIntoView({ behavior: 'smooth' }) }}>
              <span className="hero-pill-tag">New</span> Solutions architect scenarios, regions and DR <span aria-hidden>→</span>
            </a>
            <h1>System design, <span className="hero-grad">one request at a time.</span></h1>
            <p>Watch real architectures handle each request hop by hop, build your own answer, and get it checked and reviewed. Then rehearse it as a timed or AI mock interview.</p>
            <div className="row wrap hero-ctas">
              <button className="primary big" onClick={() => onPractice(first.id)}>Start practising</button>
              <button className="big" onClick={() => onExplore(first.id)}>Explore {first.meta.title}</button>
              <button className="link" onClick={onTour}>Take the 1-minute tour</button>
            </div>
            <p className="hero-trust"><span>✓ Free and open source</span><span>✓ No account</span><span>✓ Runs in your browser</span></p>
          </div>
          <HeroPreview />
        </section>
      </div>

      <div className="home">
        <section className="stats" aria-label="At a glance">
          {[
            [String(library.length), 'designs, from URL shortener to multi-region'],
            [String(library.reduce((n, d) => n + d.questions.length, 0)), 'follow-up questions with model answers'],
            ['3', 'clouds: neutral names, AWS or GCP'],
            ['Any', 'AI: paste into your assistant or use your key'],
          ].map(([n, label]) => <div key={label} className="stat"><b>{n}</b><span>{label}</span></div>)}
        </section>

        <section className="features">
          <p className="eyebrow">How it works</p>
          <h2 className="section-title">From watching to rehearsing</h2>
          <div className="how">
            {[
              { icon: <path d="M8 5v14l11-7z" />, title: 'Watch', body: 'Pick a design and press play. Each request moves hop by hop, with the real message and why it happens.' },
              { icon: <path d="M4 20h4L19 9l-4-4L4 16v4zM14 6l4 4" />, title: 'Build', body: 'In Practice, add components, connect them and record how your requests flow.' },
              { icon: <path d="M5 12l5 5L20 7" />, title: 'Check', body: 'Automatic checks against a reference design, then an optional review by your own AI assistant, with a score and follow-up questions.' },
              { icon: <><circle cx="12" cy="13" r="8" /><path d="M12 9v4l3 2M9 2h6" /></>, title: 'Rehearse', body: 'Timed mock interviews with a checklist for each phase, an AI interviewer you can talk to, and questions that come back until you know them.' },
            ].map(s => (
              <div key={s.title} className="how-step">
                <span className="how-icon"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{s.icon}</svg></span>
                <b>{s.title}</b><p>{s.body}</p>
              </div>
            ))}
          </div>
        </section>

        <p className="eyebrow">Bring your own question</p>
        <HowToImport onImport={onImport} onGenerate={onGenerate} />
        <p className="eyebrow">Mock interviews</p>
        <HowToInterview onPractice={() => onPractice(first.id)} onConnect={openAiSettings} />

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

        <section id="library">
          <p className="eyebrow">Library</p>
          <div className="lib-head">
            <h2>Designs to explore and practise</h2>
            {done > 0 && <span className="lib-progress">Practised {done} of {everything.length}</span>}
            <div className="seg" role="group" aria-label="Difficulty">
              {(['all', 'easy', 'medium', 'hard'] as const).map(l => (
                <button key={l} className={level === l ? 'on' : ''} onClick={() => setLevel(l)}>{l === 'all' ? 'All' : l[0].toUpperCase() + l.slice(1)}</button>
              ))}
            </div>
            <input className="search" placeholder="Search designs or tags…" value={q} onChange={e => setQ(e.target.value)} />
          </div>
          <p className="lib-note muted">These {library.length} are reference designs, not the only right answers, and you can add your own questions below. Interviewers accept other approaches when you can explain the trade-offs, so use them to compare with your own.</p>
          <div className="card-grid">
            {shown.map(d => <Card key={d.id} d={d} progress={progress[d.id]} onExplore={() => onExplore(d.id)} onPractice={() => onPractice(d.id)} />)}
            {!shown.length && <p className="muted">No designs match.</p>}
          </div>
        </section>

        <section>
          <div className="lib-head"><h2>My designs</h2></div>
          {mine.length > 0
            ? <div className="card-grid">{mine.map(d => <Card key={d.id} d={d} progress={progress[d.id]} onExplore={() => onExplore(d.id)} onPractice={() => onPractice(d.id)} />)}</div>
            : <p className="muted">The {library.length} designs above are just a start. Any other interview question works too: <button className="link" onClick={onImport}>import a design</button> or <button className="link" onClick={onGenerate}>make one with your own AI assistant</button>, and it appears here with the same Explore, Practice, checks and review as the library.</p>}
        </section>

        <section className="cta-band">
          <h2>Ready for your next system design round?</h2>
          <p>Start with a classic, or bring the question you are worried about.</p>
          <div className="row wrap">
            <button className="primary big" onClick={() => onPractice(first.id)}>Start practising</button>
            <button className="big" onClick={onGenerate}>Prompt for your AI</button>
            <button className="big" onClick={onImport}>Import a design</button>
          </div>
        </section>

        <footer className="home-foot">
          <span className="foot-brand">Arch<span>Story</span></span>
          <span className="muted small">Open source under the MIT license. Not affiliated with Amazon or Google.</span>
          <span className="spacer" />
          <button className="link small" onClick={openAiSettings}>AI settings</button>
          <a className="small" href="https://github.com/vishbay/archstory" target="_blank" rel="noreferrer">GitHub</a>
        </footer>
      </div>
    </div>
  )
}
