// Landing-page walkthrough of bringing your own question: describe it to an AI, paste the JSON into Import, explore, practise.
// Small mock-ups of the real dialogs, animated with CSS; each step remounts its mock so the animation replays.
import { useEffect, useState, type CSSProperties } from 'react'

const STEPS = [
  { title: 'Describe the question', body: 'Prompt for your AI writes a prompt with the format and rules. Paste it into ChatGPT, Claude or Gemini, or send it with your own key.' },
  { title: 'Paste the JSON into Import', body: 'Paste the whole answer or drop a .json file. It is checked as you type, and a fix request is one click away if something is off.' },
  { title: 'Explore it', body: 'It opens like any built-in design: press play and follow each request hop by hop.' },
  { title: 'Practise it', body: 'Build your own answer on a blank canvas, then check it against the design you imported and get it reviewed.' },
]
const STEP_MS = 4200
const delay = (s: number): CSSProperties => ({ animationDelay: `${s}s` })
const reducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches

export function HowToImport({ onImport, onGenerate }: { onImport: () => void; onGenerate: () => void }) {
  const [step, setStep] = useState(0)
  const [paused, setPaused] = useState(reducedMotion)
  useEffect(() => {
    if (paused) return
    const t = setTimeout(() => setStep(s => (s + 1) % STEPS.length), STEP_MS)
    return () => clearTimeout(t)
  }, [step, paused])

  const Mock = MOCKS[step]
  return (
    <section className="howto-import" aria-labelledby="howto-title"
      onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(reducedMotion())}>
      <div className="hti-text">
        <h2 id="howto-title">Practise any question</h2>
        <p className="muted">The library is a start. Any other system design question works the same way:</p>
        <ol className="hti-steps">
          {STEPS.map((s, i) => (
            <li key={s.title}>
              <button className={i === step ? 'on' : ''} aria-current={i === step ? 'step' : undefined} onClick={() => { setStep(i); setPaused(true) }}>
                <span className="hti-num">{i + 1}</span>
                <span><b>{s.title}</b>{i === step && <span className="hti-body">{s.body}</span>}</span>
              </button>
            </li>
          ))}
        </ol>
        <div className="row wrap">
          <button className="primary" onClick={onGenerate}>Prompt for your AI</button>
          <button onClick={onImport}>Import a design</button>
        </div>
      </div>
      <div className="hti-screen" aria-hidden>
        <div className="hti-bar"><i /><i /><i /><span>{STEPS[step].title}</span></div>
        <div key={step} className="hti-body-area"><Mock /></div>
        <div className="hti-progress"><i key={`${step}:${paused}`} className={paused ? 'still' : ''} style={{ animationDuration: `${STEP_MS}ms` }} /></div>
      </div>
    </section>
  )
}

const MOCKS = [Describe, Paste, Explore, Practise]

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

// A tiny tier diagram: client, entry, service, database and cache, shared by the last two steps.
const NODES = [
  { id: 'c', label: 'Client', x: 110, y: 18 }, { id: 'g', label: 'API gateway', x: 110, y: 70 },
  { id: 's', label: 'Booking service', x: 110, y: 122 }, { id: 'd', label: 'Bookings DB', x: 50, y: 174 }, { id: 'k', label: 'Cache', x: 170, y: 174 },
]
const EDGES = [['c', 'g'], ['g', 's'], ['s', 'd'], ['s', 'k']] as const
const at = (id: string) => NODES.find(n => n.id === id)!
function Diagram({ build }: { build?: boolean }) {
  return (
    <svg viewBox="0 0 220 196" className="hti-svg">
      {EDGES.map(([a, b], i) => <line key={i} x1={at(a).x} y1={at(a).y + 11} x2={at(b).x} y2={at(b).y - 11}
        className={build ? 'hti-in' : undefined} style={build ? delay(0.5 + i * 0.35) : undefined} />)}
      {NODES.map((n, i) => (
        <g key={n.id} className={build ? 'hti-pop' : undefined} style={build ? delay(i * 0.3) : undefined}>
          <rect x={n.x - 44} y={n.y - 11} width={88} height={22} rx={6} />
          <text x={n.x} y={n.y + 4}>{n.label}</text>
        </g>
      ))}
      {!build && <circle r={4.5} className="hti-packet"><animateMotion dur="2.6s" repeatCount="indefinite" path="M110,29 L110,59 L110,81 L110,111 L110,133 L50,163" /></circle>}
    </svg>
  )
}

function Explore() {
  return (
    <div className="hti-canvas">
      <Diagram />
      <div className="hti-caption hti-in" style={delay(0.6)}><b>Book a room</b> API gateway → Booking service: POST /bookings</div>
    </div>
  )
}

function Practise() {
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
