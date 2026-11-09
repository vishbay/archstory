import { useEffect, useMemo, useRef, useState } from 'react'
import type { Design } from '../model/schema'
import { copyText } from './share'

/** Read-only view of a design's archstory/v1 JSON, to learn the format, copy it for an AI, or save it. */
export function JsonDialog({ design, onClose, onDownload }: { design: Design; onClose: () => void; onDownload: () => void }) {
  const text = useMemo(() => JSON.stringify(design, null, 2), [design])
  const [copied, setCopied] = useState<boolean | null>(null)
  const dialog = useRef<HTMLDialogElement>(null)
  useEffect(() => { dialog.current?.showModal() }, [])
  const lines = text.split('\n').length

  return (
    <dialog ref={dialog} className="dialog wide" onClose={onClose}>
      <h3>{design.meta.title}: JSON</h3>
      <p className="muted small">
        The <code>archstory/v1</code> file behind this design ({lines} lines, {(text.length / 1000).toFixed(1)}k characters).
        Paste it into any assistant to ask for changes, or save it to share.
      </p>
      <pre className="json-view" tabIndex={0} aria-label="Design JSON">{text}</pre>
      {copied === false && <p className="small errors-inline">Could not reach the clipboard: select the text above and copy it.</p>}
      <div className="row end">
        <button onClick={() => dialog.current?.close()}>Close</button>
        <span className="spacer" />
        <button onClick={onDownload}>Download</button>
        <button className="primary" onClick={async () => setCopied(await copyText(text))}>{copied ? 'Copied ✓' : 'Copy'}</button>
      </div>
    </dialog>
  )
}
