// "Ask AI about this design": copy a prompt that hands the design you are looking at to any assistant, ready for your question.
import { useEffect, useMemo, useRef, useState } from 'react'
import { isProtocol, type Design } from '../model/schema'
import { discussPrompt } from '../practice/discuss'
import { copyText } from './prompts'

export function DiscussDialog({ design, flowId, onClose }: { design: Design; flowId?: string; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const preview = useRef<HTMLTextAreaElement>(null)
  const [answers, setAnswers] = useState(false)
  const [json, setJson] = useState(false)
  const [question, setQuestion] = useState('')
  const [copied, setCopied] = useState<boolean | null>(null)
  useEffect(() => { dialog.current?.showModal() }, [])
  const prompt = useMemo(() => discussPrompt(design, { flowId, answers, json, question }), [design, flowId, answers, json, question])
  const proto = isProtocol(design)
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
        <textarea rows={2} className="ask-first" value={question} placeholder={proto ? 'For example: why does the side that closes first wait in TIME_WAIT?' : 'For example: why does the rate limit sit at the gateway and not in the app service?'} onChange={e => { setQuestion(e.target.value); setCopied(null) }} />
      </label>
      <label className="check-row"><input type="checkbox" checked={answers} onChange={e => { setAnswers(e.target.checked); setCopied(null) }} /> Include the model answers to the {proto ? 'questions' : 'follow-up questions'} <span className="muted small">(off keeps them as spoilers-free topics)</span></label>
      <label className="check-row"><input type="checkbox" checked={json} onChange={e => { setJson(e.target.checked); setCopied(null) }} /> Also include the exact JSON <span className="muted small">(longer; the walkthrough already has everything)</span></label>
      <details className="prompt-preview">
        <summary>Preview prompt ({Math.round(prompt.length / 1000)}k characters, about {Math.round(prompt.length / 4000)}k tokens)</summary>
        <textarea ref={preview} readOnly value={prompt} spellCheck={false} />
      </details>
      {copied === false && <p className="small errors-inline">Could not reach the clipboard. The prompt is selected above: copy it with ⌘C / Ctrl+C.</p>}
      <div className="row end">
        <button onClick={() => dialog.current?.close()}>Close</button>
        <span className="spacer" />
        <button className="primary" onClick={copy}>{copied ? 'Copied ✓ Now paste it into your assistant' : 'Copy prompt'}</button>
      </div>
    </dialog>
  )
}
