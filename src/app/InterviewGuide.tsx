// A page on how to approach a system design interview: the flow, what to clarify, how to think, and how to step through it.
// Its phases and minutes come from the timed practice mode, so the guide and the clock agree.
import { useState } from 'react'
import { EstimateChain, EvolveDiagram, LatencyScale, LoopRing, PhasePipeline, ProcessSteps, TierWalk } from './GuideVisuals'
import { AI_CAVEATS, CLARIFY, CROSS_CUTTING, FRAMEWORKS, GUIDE_PHASES, LEVELS, LOOP, MISTAKES, NUMBERS, PATTERNS, PRINCIPLES, TRICKS } from '../practice/guide'

const SECTIONS = [
  { id: 'g-shape', title: 'The shape of 45 minutes' },
  { id: 'g-frameworks', title: 'Frameworks you will meet' },
  { id: 'g-think', title: 'How to think' },
  { id: 'g-clarify', title: 'What to clarify' },
  { id: 'g-steps', title: 'Step through it' },
  { id: 'g-tiers', title: 'Walk the tiers' },
  { id: 'g-loop', title: 'Deciding well' },
  { id: 'g-numbers', title: 'Numbers to know' },
  { id: 'g-patterns', title: 'Patterns and their cost' },
  { id: 'g-tricks', title: 'Tricks that help' },
  { id: 'g-levels', title: 'What is expected by level' },
  { id: 'g-ai', title: 'How an AI approaches design' },
  { id: 'g-mistakes', title: 'Mistakes to avoid' },
  { id: 'g-practise', title: 'Practise it here' },
]
const go = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })

export function InterviewGuide({ onPractice, onExplore, onHome }: { onPractice: () => void; onExplore: () => void; onHome: () => void }) {
  const [at, setAt] = useState(0)
  const phase = GUIDE_PHASES[at]
  const total = GUIDE_PHASES.reduce((n, p) => n + p.minutes, 0)

  return (
    <div className="guide">
      <div className="guide-bg" aria-hidden><i /><i /><i /></div>
      <header className="guide-head">
        <button className="link guide-back" onClick={onHome}>← Back to home</button>
        <p className="eyebrow">Interview guide</p>
        <h1>How to approach a system design interview</h1>
        <p className="guide-lede">A system design interview is a conversation, not a quiz. You are shown how you think: how you narrow a vague problem, use numbers, weigh trade-offs and handle things going wrong. Here is a flow to follow, what to ask, and how to reason at each step.</p>
        <div className="row wrap">
          <button className="primary" onClick={onPractice}>Practise on the clock</button>
          <button onClick={onExplore}>Study a design first</button>
        </div>
      </header>

      <div className="guide-body">
        <nav className="guide-toc" aria-label="On this page">
          <b>On this page</b>
          {SECTIONS.map(s => <button key={s.id} className="link" onClick={() => go(s.id)}>{s.title}</button>)}
        </nav>

        <div className="guide-main">
          <section id="g-shape" className="guide-sec">
            <h2>The shape of 45 minutes</h2>
            <p>Most interviews follow the same arc. Spend time where the points are: agreeing the problem, and reasoning about the design. The minutes below are the ones the Practice timer uses.</p>
            <ol className="guide-bar" aria-label="Time per phase">
              {GUIDE_PHASES.map((p, i) => (
                <li key={p.id} style={{ flex: p.minutes, ['--i' as string]: i }}>
                  <button onClick={() => { setAt(i); go('g-steps') }} title={`${p.title}: ${p.goal}`}><b>{p.minutes}</b><span>{p.title}</span></button>
                </li>
              ))}
            </ol>
            <p className="muted small">{total} minutes in all. Click a phase to jump to what to do in it.</p>
            <h3 className="gv-sub">What each phase leaves you holding</h3>
            <PhasePipeline onPick={i => { setAt(i); go('g-steps') }} />
          </section>

          <section id="g-frameworks" className="guide-sec">
            <h2>Frameworks you will meet elsewhere</h2>
            <p>Most guides teach the same arc with different names. Here are two common ones lined up against the phases above. They are summaries from memory, and each source uses its own words.</p>
            <div className="guide-table gv-fw" role="table" aria-label="Frameworks compared">
              <div className="guide-tr head" role="row"><span role="columnheader">This guide</span><span role="columnheader">Four-step guides</span><span role="columnheader">Entities, API, design guides</span></div>
              {FRAMEWORKS.map(f => {
                const p = GUIDE_PHASES.find(x => x.id === f.phase)!
                return <div key={f.phase} className="guide-tr" role="row"><b role="cell">{p.title} <em>{p.minutes} min</em></b><span role="cell">{f.fourStep}</span><span role="cell">{f.entityFirst}</span></div>
              })}
            </div>
            <p className="muted small">Use whichever you find easiest to remember. Interviewers care that you have a clear order and say it, not which name it has.</p>
          </section>

          <section id="g-think" className="guide-sec">
            <h2>How to think</h2>
            <div className="guide-cards">
              {PRINCIPLES.map((p, i) => (
                <article key={p.title} className="guide-card">
                  <span className="guide-num">{i + 1}</span>
                  <h3>{p.title}</h3>
                  <p>{p.body}</p>
                </article>
              ))}
            </div>
            <h3 className="gv-sub">Start simple, then evolve</h3>
            <p>The same design at three points. Each addition has a reason you can say out loud, and none arrives before it is needed.</p>
            <EvolveDiagram />
          </section>

          <section id="g-clarify" className="guide-sec">
            <h2>What to clarify</h2>
            <p>Ask before you draw. Every answer should change something in the design, so use it. Ask in your own words, and write the answers where you can see them.</p>
            <div className="guide-groups">
              {CLARIFY.map(g => (
                <article key={g.title} className="guide-group">
                  <h3>{g.title}</h3>
                  <p className="muted small">{g.why}</p>
                  <ul>{g.questions.map(q => <li key={q.ask}><b>{q.ask}</b><span>{q.changes}</span></li>)}</ul>
                </article>
              ))}
            </div>
            <p className="guide-callout"><b>Say it back.</b> After the questions, summarise: "So we are building X for about Y users, reads outnumber writes, we need Z latency, and C is out of scope." If the interviewer nods, you have a contract to design against.</p>
          </section>

          <section id="g-steps" className="guide-sec">
            <h2>Step through it</h2>
            <p>One phase at a time. Each has a goal, what to do, an example of what to say, and the trap to avoid.</p>
            <div className="seg guide-tabs" role="tablist" aria-label="Interview phases">
              {GUIDE_PHASES.map((p, i) => (
                <button key={p.id} role="tab" aria-selected={i === at} className={i === at ? 'on' : ''} onClick={() => setAt(i)}>{i + 1}. {p.title}</button>
              ))}
            </div>
            <div className="guide-phase" key={phase.id} role="tabpanel">
              <div className="guide-phase-top"><h3>{phase.title}</h3><span className="pill">about {phase.minutes} min</span></div>
              <p className="guide-goal">{phase.goal}</p>
              <h4>Do</h4>
              <ul>{phase.do.map(x => <li key={x}>{x}</li>)}</ul>
              <h4>Say something like</h4>
              <p className="guide-say">{phase.say}</p>
              <h4>Avoid</h4>
              <p>{phase.avoid}</p>
              <div className="row">
                <button onClick={() => setAt(Math.max(0, at - 1))} disabled={at === 0}>← Previous</button>
                <span className="spacer" />
                <button className="primary" onClick={() => setAt(Math.min(GUIDE_PHASES.length - 1, at + 1))} disabled={at === GUIDE_PHASES.length - 1}>Next phase →</button>
              </div>
            </div>
          </section>

          <section id="g-tiers" className="guide-sec">
            <h2>Walk the tiers</h2>
            <p>A request passes through the same layers in almost every system. ArchStory draws them as bands, from clients on the left to external services. Use the same list as a checklist when you design: ask one question per tier, and you will rarely forget a layer.</p>
            <TierWalk />
            <h3 className="gv-sub">Three things that run through every tier</h3>
            <p>Some concerns do not sit in one box. They cut across all of them, which is why they are the easiest to leave out. Check them after you have walked the tiers.</p>
            <div className="guide-cards">
              {CROSS_CUTTING.map(c => (
                <article key={c.title} className="guide-card gv-cross">
                  <h3>{c.title}</h3>
                  <b>{c.ask}</b>
                  <ul>{c.points.map(p => <li key={p}>{p}</li>)}</ul>
                </article>
              ))}
            </div>
          </section>

          <section id="g-loop" className="guide-sec">
            <h2>Deciding well: the loop behind every choice</h2>
            <p>Each time you add something, run the same four steps out loud. It is what turns a list of components into a design someone can trust.</p>
            <div className="gv-loop-wrap">
              <LoopRing />
              <ol className="guide-loop">
                {LOOP.map(l => (
                  <li key={l.step}><b>{l.step}</b><span>{l.text}</span><em>{l.example}</em></li>
                ))}
              </ol>
            </div>
          </section>

          <section id="g-numbers" className="guide-sec">
            <h2>Numbers to know</h2>
            <p>Rough numbers are enough. Round, state your assumption, and carry on.</p>
            <dl className="guide-numbers">
              {NUMBERS.map(n => <div key={n.label}><dt>{n.label}</dt><dd>{n.value}</dd></div>)}
            </dl>
            <h3 className="gv-sub">How slow is each step?</h3>
            <LatencyScale />
            <h3 className="gv-sub">A worked estimate</h3>
            <EstimateChain />
            <p className="guide-callout"><b>Storage too.</b> If 1 million new items a day are written at 1 KB, that is about 1 GB a day, 365 GB a year, and about 1.1 TB with three copies.</p>
          </section>

          <section id="g-patterns" className="guide-sec">
            <h2>Patterns and what they cost</h2>
            <p>Reach for a pattern when a need appears, and always say its cost. That is the trade-off interviewers listen for.</p>
            <div className="guide-table" role="table" aria-label="Patterns">
              <div className="guide-tr head" role="row"><span role="columnheader">When</span><span role="columnheader">Reach for</span><span role="columnheader">It costs</span></div>
              {PATTERNS.map(p => (
                <div key={p.need} className="guide-tr" role="row"><b role="cell">{p.need}</b><span role="cell">{p.reach}</span><span role="cell">{p.cost}</span></div>
              ))}
            </div>
          </section>

          <section id="g-tricks" className="guide-sec">
            <h2>Tricks that help</h2>
            <p>Small habits that make an answer feel organised, and that interviewers notice.</p>
            <div className="guide-cards">
              {TRICKS.map((t, i) => (
                <article key={t.title} className="guide-card">
                  <span className="guide-num">{i + 1}</span>
                  <h3>{t.title}</h3>
                  <p>{t.body}</p>
                </article>
              ))}
            </div>
          </section>

          <section id="g-levels" className="guide-sec">
            <h2>What is expected by level</h2>
            <p>The same question is judged against a different bar depending on the role. These are rough bars, and titles and expectations differ between companies, so ask your recruiter what level the interview is for.</p>
            <div className="guide-table gv-levels" role="table" aria-label="Expectations by level">
              <div className="guide-tr head" role="row"><span role="columnheader">Level</span><span role="columnheader">What they look for</span><span role="columnheader">How you show it</span></div>
              {LEVELS.map(l => <div key={l.level} className="guide-tr" role="row"><b role="cell">{l.level}</b><span role="cell">{l.looksFor}</span><span role="cell">{l.show}</span></div>)}
            </div>
          </section>

          <section id="g-ai" className="guide-sec">
            <h2>How an AI approaches system design questions</h2>
            <p>This is the sequence an AI like Claude follows on a design problem, with the Ticket Booking design from the library as the example. It is a good process for a person too, because every step is something you can say out loud.</p>
            <ProcessSteps />
            <h3 className="gv-sub">What to take from it, and what to be careful of</h3>
            <div className="guide-cards">
              {AI_CAVEATS.map(c => <article key={c.title} className="guide-card"><h3>{c.title}</h3><p>{c.body}</p></article>)}
            </div>
          </section>

          <section id="g-mistakes" className="guide-sec">
            <h2>Mistakes to avoid</h2>
            <ul className="guide-mistakes">{MISTAKES.map(m => <li key={m}>{m}</li>)}</ul>
          </section>

          <section id="g-practise" className="guide-sec">
            <h2>Practise it here</h2>
            <div className="guide-cards">
              {[
                { t: 'Study how real designs work', b: 'Open a design and press play. Each request moves hop by hop with the reason for it, and the Questions tab asks what an interviewer would.' },
                { t: 'Rehearse the flow on a clock', b: 'Practice has a timer with the same phases as above and a checklist for each, so you learn to move on.' },
                { t: 'Think out loud', b: 'The AI interviewer asks one question at a time and you can answer by speaking. It pushes back on vague answers.' },
                { t: 'Write the reasoning down', b: 'Add your own requirements, outline components, and attach notes that explain choices a drawing cannot show.' },
                { t: 'Get feedback and keep it', b: 'An AI review scores the answer and says whether each gap needs a drawing, a setting or a sentence. Save the report to study from later.' },
              ].map(c => <article key={c.t} className="guide-card"><h3>{c.t}</h3><p>{c.b}</p></article>)}
            </div>
            <div className="row wrap">
              <button className="primary" onClick={onPractice}>Start a timed practice</button>
              <button onClick={onExplore}>Explore a design</button>
              <button className="link" onClick={onHome}>← Back to home</button>
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
