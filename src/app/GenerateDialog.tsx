import { useEffect, useMemo, useRef, useState } from 'react'
import type { Design } from '../model/schema'
import { copyText, generationPrompt } from './share'

export function GenerateDialog({ example, onClose, onPasteAnswer }: { example: Design; onClose: () => void; onPasteAnswer: () => void }) {
  const [task, setTask] = useState('Design Dropbox: file upload, sync across devices and sharing.')
  const [copied, setCopied] = useState<boolean | null>(null)
  const dialog = useRef<HTMLDialogElement>(null)
  const preview = useRef<HTMLTextAreaElement>(null)
  useEffect(() => { dialog.current?.showModal() }, [])
  const prompt = useMemo(() => generationPrompt(task, example), [task, example])

  const copy = async () => {
    const ok = await copyText(prompt)
    if (!ok) preview.current?.select()
    setCopied(ok)
  }

  return (
    <dialog ref={dialog} className="dialog" onClose={onClose}>
      <h3>Generate a design with AI</h3>
      <p className="muted small">
        Describe the system, copy the prompt into ChatGPT, Claude, Gemini or any assistant, then paste its answer back here.
        The prompt includes the JSON Schema, the rules the tool checks, and an example.
      </p>
      <label className="field">What should it design?
        <input type="text" value={task} onChange={e => { setTask(e.target.value); setCopied(null) }} />
      </label>
      <details className="prompt-preview">
        <summary>Preview prompt ({Math.round(prompt.length / 1000)}k characters)</summary>
        <textarea ref={preview} readOnly value={prompt} spellCheck={false} />
      </details>
      {copied === false && <p className="small errors-inline">Could not reach the clipboard. The prompt is selected above: copy it with ⌘C / Ctrl+C.</p>}
      <div className="row end">
        <button onClick={() => dialog.current?.close()}>Close</button>
        <span className="spacer" />
        <button onClick={copy}>{copied ? 'Copied ✓' : '1. Copy prompt'}</button>
        <button className="primary" onClick={onPasteAnswer}>2. Paste the answer</button>
      </div>
    </dialog>
  )
}
