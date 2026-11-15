// "Ask AI about this design": copy a prompt that hands the design you are looking at to any assistant, ready for your question.
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
  const copy = async () => { const ok = await copyText(prompt); if (!ok) preview.current?.select(); setCopied(ok) }

  return (
    <dialog ref={dialog} className="dialog" onClose={onClose} aria-label={proto ? 'Ask AI about this protocol' : 'Ask AI about this design'}>
      <h3>Ask AI about {design.meta.title}</h3>
      <p className="muted small">
        {proto
          ? <>Copies the whole walkthrough (all {design.flows.length} scenario{design.flows.length === 1 ? '' : 's'}, every message with its fields on the wire, each actor's state and the time in round trips) with rules that keep the answers about these scenarios and exact about the protocol.
            Paste it into ChatGPT, Claude, Gemini or any assistant. It will confirm it has read the walkthrough and wait for your questions, which you send as normal messages.</>
          : <>Copies the whole design (all {design.flows.length} request flow{design.flows.length === 1 ? '' : 's'}, every component and note) as a readable walkthrough, with rules that keep the answers about this design and not a typical one.
            Paste it into ChatGPT, Claude, Gemini or any assistant. It will confirm it has read the design and wait for your questions, which you send as normal messages.</>}
      </p>
      <label className="field">Your first question <span className="muted small">(optional: include it to get an answer straight away)</span>
        <textarea rows={2} className="ask-first" value={question} disabled={started} placeholder={proto ? 'For example: why does the side that closes first wait in TIME_WAIT?' : 'For example: why does the rate limit sit at the gateway and not in the app service?'} onChange={e => { setQuestion(e.target.value); setCopied(null) }} />
      </label>
      <label className="check-row"><input type="checkbox" checked={answers} disabled={started} onChange={e => { setAnswers(e.target.checked); setCopied(null) }} /> Include the model answers to the {proto ? 'questions' : 'follow-up questions'} <span className="muted small">(off keeps them as spoilers-free topics)</span></label>
      <label className="check-row"><input type="checkbox" checked={json} disabled={started} onChange={e => { setJson(e.target.checked); setCopied(null) }} /> Also include the exact JSON <span className="muted small">(longer; the walkthrough already has everything)</span></label>
      <details className="prompt-preview">
        <summary>Preview prompt ({Math.round(prompt.length / 1000)}k characters, about {Math.round(prompt.length / 4000)}k tokens)</summary>
        <textarea ref={preview} readOnly value={prompt} spellCheck={false} />
      </details>
      {connected ? (
        <div className="interviewer">
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
            {started && !busy && <button onClick={() => { setTurns([]); setError(null); setFollowUp('') }}>New conversation</button>}
          </div>
          <p className="muted small">Sent to {providerLabel(ai)} ({modelFor(ai, 'review')}) with your own key. The whole design goes with the first question and the conversation is re-sent with each follow-up. It is not saved.</p>
        </div>
      ) : (
        <p className="muted small">Have an API key? <button className="link" onClick={openAiSettings}>Connect it</button> to get the answer here instead of pasting.</p>
      )}
      {copied === false && <p className="small errors-inline">Could not reach the clipboard. The prompt is selected above: copy it with ⌘C / Ctrl+C.</p>}
      <div className="row end">
        <button onClick={() => dialog.current?.close()}>Close</button>
        <span className="spacer" />
        <button className={connected ? '' : 'primary'} onClick={copy}>{copied ? 'Copied ✓ Now paste it into your assistant' : 'Copy prompt'}</button>
      </div>
    </dialog>
  )
}
