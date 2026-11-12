import { useEffect, useRef, useState } from 'react'
import type { Design } from '../model/schema'
import { nameOf, type Cloud } from '../model/kinds'
import type { Check } from '../practice/checks'
import { AiError, isConfigured, providerLabel, sendChat, forFeature, modelFor } from '../ai/providers'
import {
  addUsage, apiMessages, candidateTurns, emptyInterview, estimateCost, formatTokens, interviewSystem, MAX_TURNS, mentionParts, nextTurn, plainText,
  type InterviewState,
} from '../practice/interview'
import { store } from './hooks'
import { openAiSettings, useAiConfig } from './useAiConfig'
import { askConfirm } from './confirm'

// Browser speech: recognition (speech to text) where the browser has it, and speech synthesis to read questions aloud.
interface SpeechResultEvent { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }
interface Recognition {
  lang: string; continuous: boolean; interimResults: boolean; start(): void; stop(): void
  onresult: ((e: SpeechResultEvent) => void) | null; onend: (() => void) | null; onerror: ((e: { error?: string }) => void) | null
}
const speechGlobals = globalThis as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition }
const SpeechRec = speechGlobals.SpeechRecognition ?? speechGlobals.webkitSpeechRecognition
const canSpeak = typeof speechSynthesis !== 'undefined'

/** A mock interview with the learner's own AI key. The AI asks, the learner answers by typing or speaking, and can keep drawing meanwhile. */
export function AiInterviewer({ attempt, reference, checks, cloud, onSelectNode }: {
  attempt: Design; reference: Design; checks: Check[]; cloud: Cloud; onSelectNode: (id: string) => void
}) {
  const ai = useAiConfig()
  const key = `archstory.interviewer.${reference.id}`
  const [st, setSt] = useState<InterviewState | null>(() => store.get(key, null))
  const [includeRef, setIncludeRef] = useState(true)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [aloud, setAloud] = useState(() => store.get('archstory.interviewer.aloud', false))
  const [listening, setListening] = useState(false)
  const ctl = useRef<AbortController | null>(null)
  const log = useRef<HTMLDivElement>(null)
  const rec = useRef<Recognition | null>(null)
  const ids = new Set(attempt.nodes.map(n => n.id))
  const label = (id: string) => { const n = attempt.nodes.find(x => x.id === id); return n ? nameOf(n, cloud) : id }

  const save = (s: InterviewState | null) => { setSt(s); store.set(key, s) }
  useEffect(() => { store.set('archstory.interviewer.aloud', aloud); if (!aloud && canSpeak) speechSynthesis.cancel() }, [aloud])
  // Keep the newest message in view by scrolling the transcript itself, never the page (which would jump on phones).
  useEffect(() => { const el = log.current; if (el) el.scrollTop = el.scrollHeight }, [st?.turns.length, busy])
  useEffect(() => () => { ctl.current?.abort(); rec.current?.stop(); if (canSpeak) speechSynthesis.cancel() }, [])

  const speak = (msg: string) => {
    if (!aloud || !canSpeak) return
    speechSynthesis.cancel()
    speechSynthesis.speak(Object.assign(new SpeechSynthesisUtterance(plainText(msg, label)), { lang: navigator.language }))
  }

  /** Send the conversation as it stands and append the reply. */
  const ask = async (s: InterviewState, finishing = false) => {
    setBusy(true); setError(null); ctl.current = new AbortController()
    try {
      const r = await sendChat(forFeature(ai, 'interview'), apiMessages(s.turns), { system: s.system, cache: true, maxTokens: finishing ? 900 : 600, signal: ctl.current.signal, timeoutMs: 120_000 })
      const next = { ...s, turns: [...s.turns, { role: 'assistant' as const, text: r.text.trim() || '(no reply)' }], usage: addUsage(s.usage, r.usage), finished: s.finished || finishing }
      save(next); speak(r.text)
    } catch (e) {
      const err = e instanceof AiError ? e : new AiError('Something went wrong while contacting the provider.', 'http')
      if (err.kind === 'cancelled') { undoLast(s); return }
      setError(err.message)
    } finally { setBusy(false) }
  }
  /** Take back the last message (after a cancel or an error) and put its text back in the box. */
  const undoLast = (s: InterviewState) => {
    const last = s.turns.at(-1)
    if (last?.role !== 'user') return
    save({ ...s, turns: s.turns.slice(0, -1) }); if (!last.hidden && last.text) setText(last.text); setError(null)
  }
  const start = () => {
    const base = emptyInterview(interviewSystem(reference, includeRef, checks))
    const { turn, sentSig } = nextTurn(base, 'start', '', attempt)
    const s = { ...base, turns: [turn], sentSig }
    save(s); ask(s)
  }
  const send = (kind: 'answer' | 'finish') => {
    if (!st || busy || (kind === 'answer' && !text.trim())) return
    rec.current?.stop(); if (canSpeak) speechSynthesis.cancel()
    const { turn, sentSig } = nextTurn(st, kind, text, attempt)
    const s = { ...st, turns: [...st.turns, turn], sentSig }
    save(s); setText(''); ask(s, kind === 'finish')
  }
  const listen = () => {
    if (!SpeechRec) return
    if (listening) { rec.current?.stop(); return }
    if (canSpeak) speechSynthesis.cancel()
    const r = new SpeechRec()
    r.lang = navigator.language; r.continuous = true; r.interimResults = false
    const before = text ? `${text.trimEnd()} ` : ''
    let heard = ''
    r.onresult = e => { for (let i = e.resultIndex; i < e.results.length; i++) if (e.results[i].isFinal) heard += e.results[i][0].transcript; setText(before + heard.trim()) }
    r.onend = () => setListening(false)
    r.onerror = e => { setListening(false); if (e?.error === 'not-allowed') setError('The browser blocked the microphone. Allow it for this site to speak your answers.') }
    rec.current = r; r.start(); setListening(true)
  }

  if (!isConfigured(ai)) {
    return (
      <>
        <h3>AI interviewer</h3>
        <p className="muted small">A mock interview: the AI asks one question at a time about your design and pushes back on vague answers, and you answer by typing or speaking while you keep drawing. It runs on your own API key.</p>
        <button className="primary" onClick={openAiSettings}>Connect an API key</button>
      </>
    )
  }

  const turns = candidateTurns(st ?? emptyInterview(''))
  const cost = st ? estimateCost(st.usage, ai.prices) : null
  const usage = st ? st.usage : null

  if (!st) {
    return (
      <>
        <h3>AI interviewer</h3>
        <p className="muted small">{providerLabel(ai)} ({modelFor(ai, 'interview')}) plays the interviewer for {reference.meta.title}. It sees your design every time you change it, asks one question at a time, and ends with feedback. Keep drawing while you talk: the canvas stays live.</p>
        <label className="check-row"><input type="checkbox" checked={includeRef} onChange={e => setIncludeRef(e.target.checked)} /> Let the interviewer see the reference answer (it is told not to reveal it)</label>
        {(SpeechRec || canSpeak) && <label className="check-row"><input type="checkbox" checked={aloud} onChange={e => setAloud(e.target.checked)} disabled={!canSpeak} /> Read questions aloud</label>}
        <p className="muted small">Cost: each reply re-sends the conversation. A full {MAX_TURNS}-question interview is usually 100k to 200k input tokens; Anthropic's prompt caching, which this uses, makes most of that much cheaper.</p>
        <button className="primary" onClick={start}>Start the interview</button>
      </>
    )
  }

  return (
    <div className="interviewer">
      <div className="iv-log" ref={log} role="log" aria-live="polite" aria-label="Interview transcript">
        {st.turns.filter(t => !t.hidden).map((t, i) => (
          <div key={i} className={`iv-msg ${t.role}`}>
            {t.role === 'assistant'
              ? <p>{mentionParts(t.text, ids).map((p, j) => ('id' in p ? <button key={j} className="link" onClick={() => onSelectNode(p.id)}>{label(p.id)}</button> : <span key={j}>{p.text}</span>))}</p>
              : <p>{t.text}</p>}
            {t.role === 'user' && t.attachment && <span className="iv-note">sent your updated design</span>}
          </div>
        ))}
        {busy && <div className="iv-msg assistant pending"><p>…</p></div>}
      </div>

      {error && (
        <div className="errors" role="alert"><p>{error}</p>
          <div className="row"><button onClick={() => ask(st)}>Try again</button><button onClick={() => undoLast(st)}>Edit my message</button></div></div>
      )}

      {st.finished ? (
        <div className="row wrap"><button className="primary" onClick={async () => { if (await askConfirm({ title: 'Start a new interview?', body: 'This transcript will be cleared.', confirm: 'Start new interview', danger: true })) save(null) }}>New interview</button></div>
      ) : (
        <>
          <textarea className="iv-input" rows={3} value={text} placeholder={listening ? 'Listening…' : 'Your answer. Enter sends, Shift+Enter for a new line.'}
            disabled={turns >= MAX_TURNS} aria-label="Your answer"
            onChange={e => setText(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send('answer') } }} />
          <div className="row wrap">
            {busy ? <button onClick={() => ctl.current?.abort()}>Stop</button>
              : <button className="primary" onClick={() => send('answer')} disabled={!text.trim() || turns >= MAX_TURNS}>Send</button>}
            {SpeechRec && <button onClick={listen} disabled={busy} aria-pressed={listening} className={listening ? 'listening' : ''} title="Speak your answer; your browser turns it into text">{listening ? '■ Stop listening' : '🎤 Speak'}</button>}
            {canSpeak && <label className="check-row small"><input type="checkbox" checked={aloud} onChange={e => setAloud(e.target.checked)} /> Read aloud</label>}
            <span className="spacer" />
            <button onClick={() => send('finish')} disabled={busy}>Finish and get feedback</button>
          </div>
          {turns >= MAX_TURNS && <p className="muted small">That is {MAX_TURNS} answers, the length of a real interview. Finish to get your feedback.</p>}
        </>
      )}
      <p className="muted small iv-usage">
        Answer {turns} of {MAX_TURNS} · {usage && `${formatTokens(usage.input + usage.cacheRead + usage.cacheWrite)} tokens in (${formatTokens(usage.cacheRead)} cached), ${formatTokens(usage.output)} out`}
        {cost !== null ? ` · about ${cost < 0.01 ? '<0.01' : cost.toFixed(2)} at your prices` : <> · <button className="link" onClick={openAiSettings}>add your prices</button> to see the cost</>}
        {SpeechRec && ' · Speech is turned into text by your browser (Chrome sends the audio to Google for this).'}
      </p>
    </div>
  )
}
