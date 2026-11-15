import type { Design, DNode } from '../model/schema'
import { addNote, NOTE_KIND_LABELS, removeNote, updateNote, type NoteKind } from '../practice/attempt'

const KINDS = Object.keys(NOTE_KIND_LABELS) as NoteKind[]

/** Written explanations on one component: what a drawing cannot show, like how isolation is enforced or why a choice was made. */
export function NodeNotes({ design, node, setAttempt }: { design: Design; node: DNode; setAttempt: (d: Design, key?: string) => void }) {
  const mine = design.notes.map((n, i) => ({ n, i })).filter(x => x.n.target === node.id)
  return (
    <div className="field node-notes">
      <span>Notes on this component</span>
      <span className="muted small">Write what the drawing cannot show: how it is protected, how it scales or fails, and why you chose it. The AI review reads these.</span>
      {mine.map(({ n, i }) => (
        <div key={i} className="node-note-edit">
          <div className="row">
            <select value={n.kind} onChange={e => setAttempt(updateNote(design, i, { kind: e.target.value as NoteKind }))} aria-label="Kind of note">
              {KINDS.map(k => <option key={k} value={k}>{NOTE_KIND_LABELS[k]}</option>)}
            </select>
            <span className="spacer" />
            <button className="link" onClick={() => setAttempt(removeNote(design, i))} aria-label="Remove this note" title="Remove">✕</button>
          </div>
          <textarea rows={3} value={n.text} placeholder="For example: row-level security is forced on every pooled table, and the app role cannot bypass it."
            onChange={e => setAttempt(updateNote(design, i, { text: e.target.value }), `note:${i}`)} />
        </div>
      ))}
      <button onClick={() => setAttempt(addNote(design, node.id))}>+ Add a note</button>
    </div>
  )
}
