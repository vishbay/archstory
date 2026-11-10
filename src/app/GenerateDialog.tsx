import { useEffect, useMemo, useRef, useState } from 'react'
import type { Design } from '../model/schema'
import { askForJson } from '../ai/ask'
import { hostOf, isConfigured, providerLabel } from '../ai/providers'
import { checkImport } from './importCheck'
import { copyText, fixRequest, generationPrompt } from './prompts'
import { openAiSettings, useAiConfig } from './useAiConfig'

export function GenerateDialog({ example, onClose, onPasteAnswer, onGenerated }: {
  example: Design; onClose: () => void
  /** Open the import box, with the AI's reply already in it when there is one to fix by hand. */
  onPasteAnswer: (reply?: string) => void
  onGenerated: (d: Design) => void
}) {
  const [task, setTask] = useState('Design Dropbox: file upload, sync across devices and sharing.')
  const [copied, setCopied] = useState<boolean | null>(null)
  const dialog = useRef<HTMLDialogElement>(null)
  const ai = useAiConfig()
  const ready = isConfigured(ai)
  const [busy, setBusy] = useState(false)
  const [aiErrors, setAiErrors] = useState<string[]>([])
  const ctl = useRef<AbortController | null>(null)
  const preview = useRef<HTMLTextAreaElement>(null)
  useEffect(() => { dialog.current?.showModal() }, [])
  const prompt = useMemo(() => generationPrompt(task, example), [task, example])

  const copy = async () => {
    const ok = await copyText(prompt)
    if (!ok) preview.current?.select()
    setCopied(ok)
  }

  /** Send the prompt with the user's own key. A valid design opens straight away; otherwise the reply goes to the import box. */
  const send = async () => {
    setBusy(true); setAiErrors([]); ctl.current = new AbortController()
    const r = await askForJson(ai, prompt, reply => { const c = checkImport(reply); return c.status === 'valid' ? { ok: true as const, value: c.design } : { ok: false as const, errors: c.status === 'invalid' ? c.errors : ['The reply was empty.'] } },
      e => fixRequest('design', e), { signal: ctl.current.signal, maxTokens: 16000 })
    setBusy(false)
    if (r.ok) { dialog.current?.close(); onGenerated(r.value); return }
    if (r.cancelled) return
    if (r.kind === 'error') { setAiErrors(r.errors); return }
    dialog.current?.close(); onPasteAnswer(r.text ?? '')   // let the person see what is wrong and fix it
  }

  return (
    <dialog ref={dialog} className="dialog" onClose={() => { ctl.current?.abort(); onClose() }}>
      <h3>Make a design with your own AI</h3>
      <p className="muted small">
        ArchStory has no AI of its own. Describe the system and it writes a prompt: send it with your own API key, or paste it into ChatGPT,
        Claude, Gemini or any assistant and paste the answer back. The prompt includes the JSON Schema, the rules the tool checks, and an example.
      </p>
      <label className="field">What should it design?
        <input type="text" value={task} onChange={e => { setTask(e.target.value); setCopied(null) }} />
      </label>
      <details className="prompt-preview">
        <summary>Preview prompt ({Math.round(prompt.length / 1000)}k characters)</summary>
        <textarea ref={preview} readOnly value={prompt} spellCheck={false} />
      </details>
      {copied === false && <p className="small errors-inline">Could not reach the clipboard. The prompt is selected above: copy it with ⌘C / Ctrl+C.</p>}
      {ready
        ? <p className="muted small ai-note">Your key is connected: sending uses {providerLabel(ai)} ({ai.models[ai.provider]}) and sends this prompt to {hostOf(ai)}. A reply that does not validate gets one automatic fix request. <button className="link" onClick={openAiSettings}>AI settings</button></p>
        : <p className="muted small ai-note">Have an API key? <button className="link" onClick={openAiSettings}>Connect it</button> to send this without copying.</p>}
      {aiErrors.map(e => <p key={e} className="small errors-inline" role="alert">{e}</p>)}
      <div className="row end">
        <button onClick={() => dialog.current?.close()}>Close</button>
        <span className="spacer" />
        {ready && (busy
          ? <button onClick={() => ctl.current?.abort()}>Cancel</button>
          : null)}
        {ready && <button className="primary" onClick={send} disabled={busy || !task.trim()}>{busy ? `Waiting for ${providerLabel(ai)}…` : `Send to ${providerLabel(ai)}`}</button>}
        <button onClick={copy}>{copied ? 'Copied ✓' : ready ? 'Copy prompt' : '1. Copy prompt'}</button>
        <button className={ready ? '' : 'primary'} onClick={() => onPasteAnswer()}>{ready ? 'Paste an answer' : '2. Paste the answer'}</button>
      </div>
    </dialog>
  )
}
