import { useRef, useState } from 'react'
import type { Design } from '../model/schema'
import { nameOf, type Cloud } from '../model/kinds'
import type { Check } from '../practice/checks'
import { DIMENSIONS, parseReview, reviewPrompt, signature, type Review } from '../practice/review'
import { askForJson } from '../ai/ask'
import { hostOf, isConfigured, providerLabel } from '../ai/providers'
import { copyText, extractJson, fixRequest } from './prompts'
import { openAiSettings, useAiConfig } from './useAiConfig'

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
  const fixPrompt = () => fixRequest('review', errors)
  const [pasting, setPasting] = useState(!stored)
  const label = (id: string) => { const n = attempt.nodes.find(x => x.id === id); return n ? nameOf(n, cloud) : id }

  const ai = useAiConfig()
  const ready = isConfigured(ai)
  const [busy, setBusy] = useState(false)
  const [aiErrors, setAiErrors] = useState<string[]>([])
  const ctl = useRef<AbortController | null>(null)

  const checkReply = (reply: string) => {
    let json: unknown
    try { json = JSON.parse(extractJson(reply)) } catch (e) { return { ok: false as const, errors: [`Not valid JSON: ${(e as Error).message}`] } }
    const r = parseReview(json, attempt)
    return r.ok ? { ok: true as const, value: { review: r.review, warnings: r.warnings } } : { ok: false as const, errors: r.errors }
  }
  /** Send the review prompt with the user's own key; a reply that fails validation gets one automatic fix request. */
  const send = async () => {
    const sig = signature(attempt)
    setBusy(true); setErrors([]); setAiErrors([]); ctl.current = new AbortController()
    const r = await askForJson(ai, reviewPrompt(attempt, reference, checks, includeRef), checkReply, e => fixRequest('review', e), { signal: ctl.current.signal, maxTokens: 6000 })
    setBusy(false)
    if (r.ok) { onStore({ review: r.value.review, sig, warnings: r.value.warnings }); setText(''); setPasting(false); return }
    if (r.cancelled) return
    if (r.kind === 'error') { setAiErrors(r.errors); return }
    setText(r.text ?? ''); setErrors(r.errors)       // the reply is shown in the paste box so it can be fixed by hand
  }

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
          <p className="muted small">ArchStory has no AI of its own. It writes the prompt; either send it with your own API key, or paste it into the assistant you already use.</p>
          {ready ? (
            <div className="ai-send">
              <div className="row wrap">
                <button className="primary" onClick={send} disabled={busy}>{busy ? `Waiting for ${providerLabel(ai)}…` : `Send to ${providerLabel(ai)}`}</button>
                {busy && <button onClick={() => ctl.current?.abort()}>Cancel</button>}
              </div>
              <p className="muted small">Uses your key and sends your design to {hostOf(ai)}. Model: {ai.models[ai.provider]}. <button className="link" onClick={openAiSettings}>AI settings</button></p>
              {aiErrors.length > 0 && <div className="errors" role="alert">{aiErrors.map(e => <p key={e}>{e}</p>)}</div>}
            </div>
          ) : (
            <p className="muted small">Have an API key? <button className="link" onClick={openAiSettings}>Connect it</button> to send this without copying.</p>
          )}
          <h4 className="by-hand">{ready ? 'Or by hand' : 'By hand'}</h4>
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
