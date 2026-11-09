import { useState } from 'react'
import type { Design } from '../model/schema'
import { nameOf, type Cloud } from '../model/kinds'
import type { Check } from '../practice/checks'
import { DIMENSIONS, parseReview, reviewPrompt, signature, type Review } from '../practice/review'
import { copyText, extractJson } from './share'

export interface StoredReview { review: Review; sig: string; warnings: string[] }

const SEV_LABEL = { critical: 'Critical', major: 'Major', minor: 'Minor', praise: 'Done well' } as const

export function ReviewPanel({ attempt, reference, checks, stored, onStore, onSelectNode, cloud }: {
  attempt: Design; reference: Design; checks: Check[]; stored: StoredReview | null
  onStore: (r: StoredReview | null) => void; onSelectNode: (id: string) => void; cloud: Cloud
}) {
  const [includeRef, setIncludeRef] = useState(true)
  const [copied, setCopied] = useState(false)
  const [text, setText] = useState('')
  const [errors, setErrors] = useState<string[]>([])
  const [fixCopied, setFixCopied] = useState(false)
  const fixPrompt = () => `The review JSON you returned was rejected by the validator with these problems:\n${errors.map(e => `- ${e}`).join('\n')}\n\nFix them and return the complete corrected JSON in a single \`\`\`json code block, with no other text.`
  const [pasting, setPasting] = useState(!stored)
  const label = (id: string) => { const n = attempt.nodes.find(x => x.id === id); return n ? nameOf(n, cloud) : id }

  const copyPrompt = async () => setCopied(await copyText(reviewPrompt(attempt, reference, checks, includeRef)))
  const load = () => {
    let json: unknown
    try { json = JSON.parse(extractJson(text)) } catch (e) { return setErrors([`Not valid JSON: ${(e as Error).message}`]) }
    const r = parseReview(json, attempt)
    if (!r.ok) return setErrors(r.errors)
    onStore({ review: r.review, sig: signature(attempt), warnings: r.warnings })
    setText(''); setErrors([]); setPasting(false)
  }

  if (!attempt.nodes.length) return <p className="muted">Build an answer first, then ask your own AI assistant to review it here.</p>

  const r = stored?.review
  const stale = stored && stored.sig !== signature(attempt)

  return (
    <>
      {(pasting || !r) && (
        <div className="review-start">
          <h3>Review with your own AI</h3>
          <p className="muted small">ArchStory has no built-in AI. It writes the prompt; the assistant you already use does the reviewing.</p>
          <ol className="howto">
            <li>Copy the review prompt. It contains the problem, your design, your written reasoning, the automatic checks and a grading rubric.</li>
            <li>Paste it into ChatGPT, Claude, Gemini or any assistant.</li>
            <li>Paste the whole reply below. Findings appear on your components.</li>
          </ol>
          <label className="check-row"><input type="checkbox" checked={includeRef} onChange={e => { setIncludeRef(e.target.checked); setCopied(false) }} />
            Include the reference design (more grounded; the AI is told not to penalize valid alternatives)</label>
          <div className="row wrap">
            <button className="primary" onClick={copyPrompt}>{copied ? 'Copied ✓' : '1. Copy review prompt'}</button>
            {r && <button onClick={() => setPasting(false)}>Back to review</button>}
          </div>
          <label className="field">2. Paste the AI's reply
            <textarea rows={6} value={text} spellCheck={false} placeholder="```json&#10;{ &quot;overall&quot;: 4, … }&#10;```"
              onChange={e => { setText(e.target.value); setErrors([]); setFixCopied(false) }} />
          </label>
          <button onClick={load} disabled={!text.trim()}>Load review</button>
          {errors.length > 0 && (
            <div className="errors" role="alert"><b>The reply does not match the review format:</b>
              <ul>{errors.slice(0, 10).map(e => <li key={e}>{e}</li>)}</ul>
              <button className="small-btn" onClick={async () => setFixCopied(await copyText(fixPrompt()))}>
                {fixCopied ? 'Copied ✓' : 'Copy a fix request for your AI'}
              </button></div>
          )}
        </div>
      )}

      {r && !pasting && (
        <>
          {stale && <p className="net-note">Your answer changed after this review. Copy the prompt again for a fresh one.</p>}
          <div className="score">
            <span><b>{r.overall}</b> / 5 overall</span>
            <span className="row">
              <button onClick={() => { setPasting(true); setCopied(false) }}>New review</button>
              <button className="icon ghost" title="Clear review" onClick={() => { if (confirm('Clear this review?')) { onStore(null); setPasting(true) } }}>×</button>
            </span>
          </div>
          <p>{r.summary}</p>
          {stored.warnings.map(w => <p key={w} className="muted small">{w}</p>)}
          <ul className="dims">
            {DIMENSIONS.map(d => {
              const s = r.scores.find(x => x.dimension === d.id)
              return s && (
                <li key={d.id}>
                  <span className="dim-name">{d.title}</span>
                  <span className="dim-bar"><i style={{ width: `${(s.score / 5) * 100}%` }} className={`s${Math.round(s.score)}`} /></span>
                  <span className="dim-score">{s.score}</span>
                  {s.comment && <p>{s.comment}</p>}
                </li>
              )
            })}
          </ul>
          <h4>Findings</h4>
          <ul className="findings">
            {r.findings.map((f, i) => (
              <li key={i} className={`sev-${f.severity}`}>
                <span className={`sev-pill sev-${f.severity}`}>{SEV_LABEL[f.severity]}</span>
                {f.target && <button className="link" onClick={() => onSelectNode(f.target!)}>{label(f.target)}</button>}
                <b>{f.title}</b>
                {f.detail && <p>{f.detail}</p>}
                {f.suggestion && <p className="suggestion">→ {f.suggestion}</p>}
              </li>
            ))}
          </ul>
          {r.followUps.length > 0 && (
            <>
              <h4>Follow-up questions to practise</h4>
              <ul className="reqs">{r.followUps.map(q => <li key={q}>{q}</li>)}</ul>
            </>
          )}
        </>
      )}
    </>
  )
}
