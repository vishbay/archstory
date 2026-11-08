import { useEffect, useRef, useState } from 'react'
import { parseDesign, type Design } from '../model/schema'
import { copyText, extractJson } from './share'

export function ImportDialog({ onClose, onImport }: { onClose: () => void; onImport: (d: Design) => void }) {
  const [text, setText] = useState('')
  const [errors, setErrors] = useState<string[]>([])
  const [fixCopied, setFixCopied] = useState(false)
  const fixPrompt = () => `The design JSON you returned was rejected by the validator with these problems:\n${errors.map(e => `- ${e}`).join('\n')}\n\nFix them and return the complete corrected JSON in a single \`\`\`json code block, with no other text.`
  const dialog = useRef<HTMLDialogElement>(null)
  useEffect(() => { dialog.current?.showModal() }, [])

  const submit = (raw = text) => {
    let json: unknown
    try { json = JSON.parse(extractJson(raw)) } catch (e) { return setErrors([`Not valid JSON: ${(e as Error).message}`]) }
    const r = parseDesign(json)
    if (r.ok) onImport(r.design)
    else setErrors(r.errors)
  }
  const readFile = async (f: File | undefined) => {
    if (!f) return
    const raw = await f.text()
    setText(raw); submit(raw)
  }

  return (
    <dialog ref={dialog} className="dialog" onClose={onClose}
      onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); readFile(e.dataTransfer.files[0]) }}>
      <h3>Import a design</h3>
      <p className="muted small">
        Paste or drop a <code>archstory/v1</code> JSON file, or paste an AI's whole answer: code fences and
        surrounding text are ignored. Schema: <a href="/schema/archstory-v1.json" target="_blank">archstory-v1.json</a>.
      </p>
      <textarea value={text} onChange={e => { setText(e.target.value); setErrors([]); setFixCopied(false) }} spellCheck={false}
        placeholder={'{\n  "schema": "archstory/v1",\n  "id": "my-design",\n  "meta": { "title": "…" },\n  "nodes": [ … ]\n}'} />
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
        <button className="primary" onClick={() => submit()} disabled={!text.trim()}>Validate &amp; open</button>
      </div>
    </dialog>
  )
}
