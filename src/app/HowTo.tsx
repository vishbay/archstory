// Landing-page walkthroughs: small mock-ups of the real screens, animated with CSS, one step at a time.
// Each step remounts its mock so the animation replays; clicking a step or hovering pauses the loop.
import { useEffect, useState, type CSSProperties, type ReactNode } from 'react'

interface Step { title: string; body: string; Mock: () => ReactNode }
const STEP_MS = 4200
const delay = (s: number): CSSProperties => ({ animationDelay: `${s}s` })
const reducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches

function Walkthrough({ id, title, intro, steps, actions }: { id: string; title: string; intro: string; steps: Step[]; actions: ReactNode }) {
  const [step, setStep] = useState(0)
  const [paused, setPaused] = useState(reducedMotion)
  useEffect(() => {
    if (paused) return
    const t = setTimeout(() => setStep(s => (s + 1) % steps.length), STEP_MS)
    return () => clearTimeout(t)
  }, [step, paused, steps.length])
  const Mock = steps[step].Mock

  return (
    <section className="howto-import" aria-labelledby={id}
      onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(reducedMotion())}>
      <div className="hti-text">
        <h2 id={id}>{title}</h2>
        <p className="muted">{intro}</p>
        <ol className="hti-steps">
          {steps.map((s, i) => (
            <li key={s.title}>
              <button className={i === step ? 'on' : ''} aria-current={i === step ? 'step' : undefined} onClick={() => { setStep(i); setPaused(true) }}>
                <span className="hti-num">{i + 1}</span>
                <span><b>{s.title}</b>{i === step && <span className="hti-body">{s.body}</span>}</span>
              </button>
            </li>
          ))}
        </ol>
        <div className="row wrap">{actions}</div>
      </div>
      <div className="hti-screen" aria-hidden>
        <div className="hti-bar"><i /><i /><i /><span>{steps[step].title}</span></div>
        <div key={step} className="hti-body-area"><Mock /></div>
        <div className="hti-progress"><i key={`${step}:${paused}`} className={paused ? 'still' : ''} style={{ animationDuration: `${STEP_MS}ms` }} /></div>
      </div>
    </section>
  )
}

const PRACTICE_STEPS: Step[] = [
  { title: 'Describe the question', body: 'Prompt for your AI writes a prompt with the format and rules. Paste it into ChatGPT, Claude or Gemini, or send it with your own key.', Mock: Describe },
  { title: 'Paste the JSON into Import', body: 'Paste the whole answer or drop a .json file. It is checked as you type, and a fix request is one click away if something is off.', Mock: Paste },
  { title: 'Explore it', body: 'It opens like any built-in design: press play and follow each request hop by hop.', Mock: Explore },
  { title: 'Build and check your answer', body: 'In Practice, build your own answer, record its flows, and run the checks against the design. Hints and side by side help when you are stuck.', Mock: Build },
  { title: 'Write your reasoning', body: 'Tick Written reasoning to get sections for requirements, estimates, API, data model, monitoring, security, trade-offs and key decisions.', Mock: Reason },
  { title: 'Get it reviewed by your AI', body: 'Copy review prompt bundles the problem, your design, your reasoning and the checks. Paste the reply back for scores, with findings marked on your components.', Mock: Review },
]

export function HowToImport({ onImport, onGenerate }: { onImport: () => void; onGenerate: () => void }) {
  return <Walkthrough id="howto-practise" title="Practise any question" intro="The library is a start. Any other system design question works the same way:"
    steps={PRACTICE_STEPS} actions={<>
      <button className="primary" onClick={onGenerate}>Prompt for your AI</button>
      <button onClick={onImport}>Import a design</button>
    </>} />
}

const INTERVIEW_STEPS: Step[] = [
  { title: 'Pick a clock', body: 'In Practice, open the Interview tab and choose 30, 45 or 60 minutes. Written reasoning turns on by itself.', Mock: Clock },
  { title: 'Work through the phases', body: 'Requirements, estimates, API and data, high-level design, deep dive and wrap-up, each with its own time and checklist.', Mock: Phases },
  { title: 'Face the AI interviewer', body: 'With your own API key, the interviewer asks one question at a time about the design you are drawing, and keeps probing.', Mock: Interviewer },
  { title: 'Answer out loud', body: 'Press Speak and talk: your browser turns it into text. Tick Read aloud to hear each question. Neither adds any AI cost.', Mock: Voice },
  { title: 'Get feedback and track it', body: 'Finish and get feedback: what went well, what was weak and three things to study. The attempt is saved so you can see progress.', Mock: Feedback },
]

export function HowToInterview({ onPractice, onConnect }: { onPractice: () => void; onConnect: () => void }) {
  return <Walkthrough id="howto-interview" title="Rehearse a mock interview" intro="Practise under interview conditions, with a clock or an AI interviewer you can talk to:"
    steps={INTERVIEW_STEPS} actions={<>
      <button className="primary" onClick={onPractice}>Start practising</button>
      <button onClick={onConnect}>Connect an API key</button>
    </>} />
}

/* ---------- practice mocks ---------- */

function Describe() {
  return (
    <div className="hti-dialog">
      <b>Make a design with your own AI</b>
      <span className="hti-label">What should it design?</span>
      <div className="hti-input"><span className="hti-type">Design a hotel booking system</span></div>
      <div className="hti-row"><span className="hti-btn hti-press" style={delay(2.4)}>Copy prompt</span><span className="hti-btn">Paste the answer</span></div>
      <span className="hti-toast hti-in" style={delay(2.9)}>Copied ✓ Paste it into your assistant</span>
    </div>
  )
}

const JSON_LINES = ['{', '  "schema": "archstory/v1",', '  "id": "hotel-booking",', '  "meta": { "title": "Hotel Booking" },', '  "nodes": [ … ],', '  "flows": [ … ]', '}']
function Paste() {
  return (
    <div className="hti-dialog">
      <b>Import a design</b>
      <pre className="hti-code">{JSON_LINES.map((l, i) => <span key={i} className="hti-in" style={delay(0.2 + i * 0.25)}>{l}{'\n'}</span>)}</pre>
      <span className="hti-valid hti-in" style={delay(2.2)}>✓ Valid: 11 components, 3 flows</span>
      <div className="hti-row end"><span className="hti-btn primary hti-press" style={delay(3)}>Open design</span></div>
    </div>
  )
}

// A tiny tier diagram: client, entry, service, database and cache, shared by several steps.
const NODES = [
  { id: 'c', label: 'Client', x: 110, y: 18 }, { id: 'g', label: 'API gateway', x: 110, y: 70 },
  { id: 's', label: 'Booking service', x: 110, y: 122 }, { id: 'd', label: 'Bookings DB', x: 50, y: 174 }, { id: 'k', label: 'Cache', x: 170, y: 174 },
]
const EDGES = [['c', 'g'], ['g', 's'], ['s', 'd'], ['s', 'k']] as const
const at = (id: string) => NODES.find(n => n.id === id)!
function Diagram({ build, packet, flag }: { build?: boolean; packet?: boolean; flag?: { node: string; text: string; delay: number } }) {
  return (
    <svg viewBox="0 0 220 196" className="hti-svg">
      {EDGES.map(([a, b], i) => <line key={i} x1={at(a).x} y1={at(a).y + 11} x2={at(b).x} y2={at(b).y - 11}
        className={build ? 'hti-in' : undefined} style={build ? delay(0.5 + i * 0.35) : undefined} />)}
      {NODES.map((n, i) => (
        <g key={n.id} className={build ? 'hti-pop' : undefined} style={build ? delay(i * 0.3) : undefined}>
          <rect x={n.x - 44} y={n.y - 11} width={88} height={22} rx={6} className={flag?.node === n.id ? 'hti-flagged' : undefined} style={flag?.node === n.id ? delay(flag.delay) : undefined} />
          <text x={n.x} y={n.y + 4}>{n.label}</text>
        </g>
      ))}
      {flag && <g className="hti-pop" style={delay(flag.delay)}>
        <rect x={at(flag.node).x - 30} y={at(flag.node).y - 27} width={60} height={13} rx={6.5} className="hti-badge" />
        <text x={at(flag.node).x} y={at(flag.node).y - 17.5} className="hti-badge-text">{flag.text}</text>
      </g>}
      {packet && <circle r={4.5} className="hti-packet"><animateMotion dur="2.6s" repeatCount="indefinite" path="M110,29 L110,59 L110,81 L110,111 L110,133 L50,163" /></circle>}
    </svg>
  )
}

function Explore() {
  return (
    <div className="hti-canvas">
      <Diagram packet />
      <div className="hti-caption hti-in" style={delay(0.6)}><b>Book a room</b> API gateway → Booking service: POST /bookings</div>
    </div>
  )
}

function Build() {
  return (
    <div className="hti-canvas">
      <Diagram build />
      <ul className="hti-checks">
        <li className="hti-in" style={delay(2)}><span className="ok">✓</span> Every component is connected</li>
        <li className="hti-in" style={delay(2.5)}><span className="ok">✓</span> "Book a room" runs end to end</li>
        <li className="hti-in" style={delay(3)}><span className="warn">!</span> The reference also uses a queue</li>
      </ul>
    </div>
  )
}

function Reason() {
  return (
    <div className="hti-dialog">
      <div className="hti-tabs"><span>Build</span><span>Flows</span><span>Check 7/9</span><span className="on">Reasoning</span><span>Review</span></div>
      <span className="hti-label">Security and compliance</span>
      <div className="hti-area hti-faint">OAuth for guests, card data stays with the payment provider (PCI)…</div>
      <span className="hti-label">Key decisions</span>
      <div className="hti-area"><span className="hti-lines">
        <span className="hti-in" style={delay(0.4)}>Lock the room row or hold it with a TTL?</span>
        <span className="hti-in" style={delay(1.4)}>Picked a 10 minute hold: no double booking,</span>
        <span className="hti-in" style={delay(2.2)}>and guests can finish paying.</span>
        <span className="hti-in" style={delay(3)}>Gives up: rooms look taken while held.</span>
      </span></div>
    </div>
  )
}

const SCORES = [['Requirements', 4], ['Scalability', 3], ['Reliability', 4], ['Security', 3], ['Decision quality', 4]] as const
function Review() {
  return (
    <div className="hti-canvas">
      <Diagram flag={{ node: 'd', text: 'major', delay: 3 }} />
      <div className="hti-review">
        <div className="hti-row"><span className="hti-btn primary hti-press" style={delay(0.3)}>1. Copy review prompt</span></div>
        <span className="hti-label hti-in" style={delay(1)}>2. Reply pasted ✓</span>
        {SCORES.map(([name, s], i) => (
          <div key={name} className="hti-score hti-in" style={delay(1.4 + i * 0.25)}>
            <span>{name}</span><i><b style={{ width: `${s * 20}%`, ...delay(1.5 + i * 0.25) }} /></i><em>{s}</em>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ---------- interview mocks ---------- */

function Clock() {
  return (
    <div className="hti-dialog">
      <div className="hti-tabs"><span>Check</span><span>Reasoning</span><span>Review</span><span className="on">Interview</span></div>
      <div className="hti-seg"><span>Timed</span><span className="hti-dim">AI interviewer</span></div>
      <span className="hti-label">How long?</span>
      <div className="hti-row"><span className="hti-btn">30 min</span><span className="hti-btn primary hti-press" style={delay(1)}>45 min</span><span className="hti-btn">60 min</span></div>
      <div className="hti-timer hti-in" style={delay(1.6)}><b>Requirements</b><span>4:59 left in phase</span><span className="hti-dim">44:59 total</span></div>
    </div>
  )
}

const PHASES = [['Requirements', 5], ['Estimates', 5], ['API and data', 5], ['High-level design', 15], ['Deep dive', 10], ['Wrap-up', 5]] as const
function Phases() {
  return (
    <div className="hti-dialog">
      <div className="hti-phases">{PHASES.map(([p, m], i) => <span key={p} className={i < 3 ? 'done' : i === 3 ? 'now' : ''} style={{ flexGrow: m }} title={p} />)}</div>
      <div className="hti-timer"><b>High-level design</b><span>11:42 left in phase</span><span className="hti-dim">26:42 total</span></div>
      <span className="hti-label">Checklist</span>
      <ul className="hti-checks wide">
        <li className="hti-in" style={delay(0.5)}><span className="ok">✓</span> Draw the main components on the request path</li>
        <li className="hti-in" style={delay(1.3)}><span className="ok">✓</span> Walk one read and one write through it</li>
        <li className="hti-in" style={delay(2.1)}><span className="ok">✓</span> Say where data lives and how it scales</li>
        <li className="hti-in" style={delay(2.9)}><span className="hti-dim">○</span> Name the single points of failure</li>
      </ul>
    </div>
  )
}

function Interviewer() {
  return (
    <div className="hti-dialog hti-chat">
      <p className="hti-msg ai hti-in" style={delay(0.2)}>Walk me through booking a room. Where is the room reserved?</p>
      <p className="hti-msg me hti-in" style={delay(1.2)}>The <u>Booking service</u> holds the room in <u>Bookings DB</u>, then calls the payment provider.</p>
      <p className="hti-msg ai hti-in" style={delay(2.4)}>Two guests book the last room in the same second. What stops a double booking?</p>
      <span className="hti-typing hti-in" style={delay(3.2)}><i /><i /><i /></span>
    </div>
  )
}

function Voice() {
  return (
    <div className="hti-dialog hti-chat">
      <p className="hti-msg ai"><span className="hti-speaker">🔊</span> Two guests book the last room in the same second. What stops a double booking?</p>
      <div className="hti-input hti-voice"><span className="hti-type slow">A conditional update on the room row, so only one hold wins</span></div>
      <div className="hti-row"><span className="hti-btn hti-mic">■ Stop listening</span><span className="hti-wave"><i /><i /><i /><i /><i /></span><span className="hti-label">☑ Read aloud</span></div>
    </div>
  )
}

function Feedback() {
  return (
    <div className="hti-dialog">
      <b>Feedback</b>
      <p className="hti-fb hti-in" style={delay(0.3)}><span className="ok">Went well</span> Clear requirements and capacity numbers; the hold with a TTL was well argued.</p>
      <p className="hti-fb hti-in" style={delay(1.1)}><span className="warn">Weak</span> No plan for the payment provider timing out mid-booking.</p>
      <p className="hti-fb hti-in" style={delay(1.9)}><span className="hti-accent">Study next</span> Idempotency keys, sagas, cache invalidation.</p>
      <span className="hti-toast hti-in" style={delay(2.8)}>Saved: Timed interview, 45 min · 8/9 checks</span>
    </div>
  )
}
