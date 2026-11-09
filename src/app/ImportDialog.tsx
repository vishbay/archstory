import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import type { Design } from '../model/schema'
import { copyText } from './share'
import { checkImport } from './importCheck'
import { STARTER_DESIGN } from './starterDesign'

export function ImportDialog({ onClose, onImport }: { onClose: () => void; onImport: (d: Design) => void }) {
  const [text, setText] = useState('')
  const [fixCopied, setFixCopied] = useState(false)
  const dialog = useRef<HTMLDialogElement>(null)
  useEffect(() => { dialog.current?.showModal() }, [])

  // Validate as you type; the deferred value keeps typing smooth on large pastes.
  const deferred = useDeferredValue(text)
  const check = useMemo(() => checkImport(deferred), [deferred])
  const ready = check.status === 'valid' && deferred === text
  const errors = check.status === 'invalid' ? check.errors : []
  const fixPrompt = () => `The design JSON you returned was rejected by the validator with these problems:\n${errors.map(e => `- ${e}`).join('\n')}\n\nFix them and return the complete corrected JSON in a single \`\`\`json code block, with no other text.`

  const useExample = () => {
    if (text.trim() && !confirm('Replace what you pasted with the example?')) return
    setText(JSON.stringify(STARTER_DESIGN, null, 2)); setFixCopied(false)
  }
  const readFile = async (f: File | undefined) => {
    if (!f) return
    const raw = await f.text()
    const c = checkImport(raw)
    if (c.status === 'valid') onImport(c.design)    // a valid file opens straight away
    else setText(raw)                                // otherwise show what is wrong with it
  }

  return (
    <dialog ref={dialog} className="dialog" onClose={onClose}
      onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); readFile(e.dataTransfer.files[0]) }}>
      <h3>Import a design</h3>
      <p className="muted small">
        Paste or drop an <code>archstory/v1</code> JSON file, or paste an AI's whole answer: code fences and
        surrounding text are ignored. Never written one? <button className="link" onClick={useExample}>Start from an example</button>,
        edit it, and it is checked as you type. Schema: <a href={`${import.meta.env.BASE_URL}schema/archstory-v1.json`} target="_blank">archstory-v1.json</a>.
      </p>
      <textarea value={text} onChange={e => { setText(e.target.value); setFixCopied(false) }} spellCheck={false}
        placeholder={'{\n  "schema": "archstory/v1",\n  "id": "my-design",\n  "meta": { "title": "…" },\n  "nodes": [ … ]\n}'} />
      {check.status === 'valid' && (
        <div className="valid-note" role="status">
          <b>✓ Valid</b> {check.summary}
          {check.warnings.map(w => <p key={w} className="warn-line">{w}</p>)}
        </div>
      )}
      {errors.length > 0 && (
        <div className="errors" role="alert">
          <b>{errors.length} problem{errors.length > 1 ? 's' : ''}:</b>
          <ul>{errors.slice(0, 20).map(e => <li key={e}>{e}</li>)}</ul>
          <button className="small-btn" onClick={async () => setFixCopied(await copyText(fixPrompt()))}>
            {fixCopied ? 'Copied ✓' : 'Copy a fix request for the AI'}
          </button>
        </div>
      )}
      <div className="row end">
        <label className="button">Choose file…<input type="file" accept=".json,application/json" hidden onChange={e => readFile(e.target.files?.[0])} /></label>
        <span className="spacer" />
        <button onClick={() => dialog.current?.close()}>Cancel</button>
        <button className="primary" disabled={!ready} onClick={() => check.status === 'valid' && onImport(check.design)}>Open design</button>
      </div>
    </dialog>
  )
}
