import { useState } from 'react'
import type { Design } from '../model/schema'
import { Seg } from './CanvasToolbar'
import { addRequirement, customRequirements, removeRequirement, REQ_MAX, type ReqKind } from '../practice/attempt'

/** The learner's own requirements for their answer: listed with a remove button, and a small form to add one. */
export function CustomRequirements({ attempt, reference, onChange }: { attempt: Design; reference: Design; onChange: (d: Design) => void }) {
  const [kind, setKind] = useState<ReqKind>('functional')
  const [text, setText] = useState('')
  const mine = customRequirements(attempt, reference)
  const rows = [...mine.functional.map(t => ({ kind: 'functional' as const, t })), ...mine.nonFunctional.map(t => ({ kind: 'nonFunctional' as const, t }))]
  const add = () => { if (!text.trim()) return; onChange(addRequirement(attempt, kind, text)); setText('') }

  return (
    <div className="req-own">
      {rows.length > 0 && (
        <ul className="reqs">
          {rows.map(r => (
            <li key={`${r.kind}:${r.t}`} className="req-mine">
              <span className="req-tag">{r.kind === 'functional' ? 'Yours: functional' : 'Yours: non-functional'}</span> {r.t}
              <button className="link req-x" onClick={() => onChange(removeRequirement(attempt, r.kind, r.t))} aria-label={`Remove requirement: ${r.t}`} title="Remove">✕</button>
            </li>
          ))}
        </ul>
      )}
      <div className="req-add">
        <Seg label="Kind of requirement" value={kind} onChange={setKind}
          options={[{ key: 'functional', label: 'Functional' }, { key: 'nonFunctional', label: 'Non-functional' }]} />
        <textarea rows={3} value={text} maxLength={REQ_MAX} placeholder="Add your own requirement, for example: users can keep watching offline" aria-label="Your own requirement"
          onChange={e => setText(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); add() } }} />
        <div className="req-add-row">
          <span className="muted small">{text.length}/{REQ_MAX} · ⌘ Enter adds</span>
          <span className="spacer" />
          <button onClick={add} disabled={!text.trim()}>Add requirement</button>
        </div>
      </div>
      <p className="muted small">Your own requirements are part of your answer. The AI review and interviewer judge the design against them too.</p>
    </div>
  )
}
