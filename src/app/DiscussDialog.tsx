// "Ask AI about this design": first choose how (a quick question answered here with your own key, or a longer conversation in
// an assistant app by copying a prompt), then do it. Both hand the assistant the whole design you are looking at.
import { useEffect, useMemo, useRef, useState } from 'react'
import { isProtocol, type Design } from '../model/schema'
import { discussPrompt } from '../practice/discuss'
import { AiError, forFeature, isConfigured, modelFor, providerLabel, sendChat, type Message } from '../ai/providers'
import { copyText } from './prompts'
import { Markdown } from './Markdown'
import { openAiSettings, useAiConfig } from './useAiConfig'

interface Turn { role: 'user' | 'assistant'; text: string }

export function DiscussDialog({ design, flowId, onClose }: { design: Design; flowId?: string; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const preview = useRef<HTMLTextAreaElement>(null)
  const [answers, setAnswers] = useState(false)
  const [json, setJson] = useState(false)
  const [question, setQuestion] = useState('')
  const [copied, setCopied] = useState<boolean | null>(null)
  const [mode, setMode] = useState<'quick' | 'long' | null>(null)
  const ai = useAiConfig()
  const [turns, setTurns] = useState<Turn[]>([])
  const [followUp, setFollowUp] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const ctl = useRef<AbortController | null>(null)
  const first = useRef('')   // the full prompt sent as the first message, kept so later options changes do not alter the thread
  const log = useRef<HTMLDivElement>(null)
  useEffect(() => { dialog.current?.showModal() }, [])
  useEffect(() => () => ctl.current?.abort(), [])
  useEffect(() => { const el = log.current; if (el) el.scrollTop = el.scrollHeight }, [turns.length, busy])
  const prompt = useMemo(() => discussPrompt(design, { flowId, answers, json, question }), [design, flowId, answers, json, question])
  const proto = isProtocol(design)
  const connected = isConfigured(ai)
  const started = turns.length > 0

  /** Send the thread so far (the design prompt first, then each question and answer) and append the reply. */
  const send = async (thread: Turn[]) => {
    setBusy(true); setError(null); ctl.current = new AbortController()
    const wire: Message[] = thread.map((t, i) => ({ role: t.role, content: i === 0 ? first.current : t.text }))
    try {
      const r = await sendChat(forFeature(ai, 'review'), wire, { cache: true, maxTokens: 2000, signal: ctl.current.signal, timeoutMs: 120_000 })
      setTurns([...thread, { role: 'assistant', text: r.text.trim() || '(no reply)' }])
    } catch (e) {
      const err = e instanceof AiError ? e : new AiError('Something went wrong while contacting the provider.', 'http')
      if (err.kind === 'cancelled') { setTurns(thread.slice(0, -1)); setFollowUp(thread.length > 1 ? thread.at(-1)!.text : ''); return }
      setError(err.message)
    } finally { setBusy(false) }
  }
  const ask = () => {
    if (busy) return
    if (!started) {
      if (!question.trim()) return
      first.current = prompt
      send([{ role: 'user', text: question.trim() }])
    } else if (followUp.trim()) {
      const thread: Turn[] = [...turns, { role: 'user', text: followUp.trim() }]
      setTurns(thread); setFollowUp(''); send(thread)
    }
  }
  const retry = () => { if (turns.length && turns.at(-1)!.role === 'user') send(turns) }
  const thing = proto ? 'protocol' : 'design'
  const copy = async () => { const ok = await copyText(prompt); if (!ok) preview.current?.select(); setCopied(ok) }

  const options = (
    <>
      <label className="check-row"><input type="checkbox" checked={answers} disabled={started} onChange={e => { setAnswers(e.target.checked); setCopied(null) }} /> Include the model answers <span className="muted small">(leave off if you want to be quizzed first)</span></label>
      <label className="check-row"><input type="checkbox" checked={json} disabled={started} onChange={e => { setJson(e.target.checked); setCopied(null) }} /> Also include the exact JSON <span className="muted small">(longer; the walkthrough already has everything)</span></label>
      <details className="prompt-preview">
        <summary>Preview prompt ({Math.round(prompt.length / 1000)}k characters, about {Math.round(prompt.length / 4000)}k tokens)</summary>
        <textarea ref={preview} readOnly value={prompt} spellCheck={false} />
      </details>
    </>
  )
  const placeholder = proto ? 'For example: why does the side that closes first wait in TIME_WAIT?' : 'For example: why does the rate limit sit at the gateway and not in the app service?'
  const changeWay = mode && (
    <button className="link ask-back" onClick={() => { setMode(null); setCopied(null) }}>← Choose another way</button>
  )

  return (
    <dialog ref={dialog} className="dialog" onClose={onClose} aria-label={`Ask AI about this ${thing}`}>
      <h3>Ask AI about {design.meta.title}</h3>

      {mode === null && (
        <div className="ask-step" key="choose">
          <p className="muted small">How do you want to ask? Either way the assistant is given the whole {thing}, so its answers are about this one and not a typical one.</p>
          <div className="ask-choices">
            <button className="ask-card" style={{ animationDelay: '40ms' }} onClick={() => setMode('quick')}>
              <span className="ask-card-title">Quick question</span>
              <span className="ask-card-sub">The answer appears here</span>
              <ul>
                <li>One focused question about what you are looking at</li>
                <li>Uses your own API key; a free Gemini key works</li>
                <li>Not saved when you close this window</li>
              </ul>
              <span className="ask-card-go">{connected ? `Ask ${providerLabel(ai)} →` : 'Needs an API key →'}</span>
            </button>
            <button className="ask-card" style={{ animationDelay: '110ms' }} onClick={() => setMode('long')}>
              <span className="ask-card-title">Longer conversation</span>
              <span className="ask-card-sub">Continue in ChatGPT, Claude or Gemini</span>
              <ul>
                <li>Exploring, comparing options, many follow-ups</li>
                <li>Covered by your chat subscription, no per-message cost</li>
                <li>Kept in that app's history, so you can come back</li>
              </ul>
              <span className="ask-card-go">Copy the prompt →</span>
            </button>
          </div>
        </div>
      )}

      {mode === 'quick' && !connected && (
        <div className="ask-step" key="quick-nokey">
          {changeWay}
          <div className="ask-notice">
            <b>Quick questions need your own API key.</b>
            <p className="muted small">Connect one (a free Gemini key is enough) to get answers here. Or skip the key: copy the prompt and continue in a ChatGPT, Claude or Gemini app. A paid plan there gives longer chats and keeps your history.</p>
            <div className="row wrap">
              <button className="primary" onClick={openAiSettings}>Connect an API key</button>
              <button onClick={() => setMode('long')}>Copy the prompt instead</button>
            </div>
          </div>
        </div>
      )}

      {mode === 'quick' && connected && (
        <div className="ask-step" key="quick">
          {!started && changeWay}
          {!started && (
            <label className="field">Your question
              <textarea rows={2} className="ask-first" value={question} autoFocus placeholder={placeholder}
                onChange={e => setQuestion(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ask() } }} />
            </label>
          )}
          <div className="interviewer ask-thread">
            {started && (
              <div className="iv-log" ref={log} role="log" aria-live="polite" aria-label="Conversation">
                {turns.map((t, i) => <div key={i} className={`iv-msg ${t.role}`}>{t.role === 'assistant' ? <Markdown text={t.text} /> : <p>{t.text}</p>}</div>)}
                {busy && <div className="iv-msg assistant pending"><p>…</p></div>}
              </div>
            )}
            {error && <div className="errors" role="alert"><p>{error}</p><div className="row"><button onClick={retry}>Try again</button></div></div>}
            {started && (
              <textarea className="iv-input" rows={2} value={followUp} placeholder="A follow-up question. Enter sends, Shift+Enter for a new line." aria-label="Follow-up question"
                onChange={e => setFollowUp(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ask() } }} />
            )}
            <div className="row wrap">
              {busy ? <button onClick={() => ctl.current?.abort()}>Stop</button>
                : <button className="primary" onClick={ask} disabled={started ? !followUp.trim() : !question.trim()}>{started ? 'Send' : `Ask ${providerLabel(ai)}`}</button>}
              {started && !busy && <button onClick={() => { setTurns([]); setError(null); setFollowUp('') }}>New question</button>}
              <span className="spacer" />
              {started && <button className="link" onClick={() => setMode('long')}>Need to go deeper? Continue in an app</button>}
            </div>
            {!started && <details className="ask-more"><summary>What gets sent</summary>{options}</details>}
            <p className="muted small">Sent to {providerLabel(ai)} ({modelFor(ai, 'review')}) with your own key. The whole {thing} goes with the first question, and each follow-up re-sends the thread. Nothing is saved.</p>
          </div>
        </div>
      )}

      {mode === 'long' && (
        <div className="ask-step" key="long">
          {changeWay}
          <p className="muted small">
            {proto
              ? <>Copies the whole walkthrough (all {design.flows.length} scenario{design.flows.length === 1 ? '' : 's'}, every message with its fields on the wire, each actor's state and the time in round trips) with rules that keep the answers exact about the protocol.</>
              : <>Copies the whole design (all {design.flows.length} request flow{design.flows.length === 1 ? '' : 's'}, every component and note) as a readable walkthrough, with rules that keep the answers about this design.</>}
            {' '}Paste it into a new chat in ChatGPT, Claude or Gemini. It confirms it has read the {thing} and waits for your questions, which you send as normal messages. A free account works; a paid plan gives longer chats.
          </p>
          <label className="field">Your first question <span className="muted small">(optional: include it to get an answer straight away)</span>
            <textarea rows={2} className="ask-first" value={question} placeholder={placeholder} onChange={e => { setQuestion(e.target.value); setCopied(null) }} />
          </label>
          {options}
          {copied === false && <p className="small errors-inline">Could not reach the clipboard. The prompt is selected above: copy it with ⌘C / Ctrl+C.</p>}
          <div className="row end">
            <span className="spacer" />
            <button className="primary" onClick={copy}>{copied ? 'Copied ✓ Now paste it into your assistant' : 'Copy prompt'}</button>
          </div>
        </div>
      )}

      <div className="row end ask-close"><button onClick={() => dialog.current?.close()}>Close</button></div>
    </dialog>
  )
}
