import { useRef, useState } from 'react'
import { MAX_SNAPSHOTS, trend, type Snapshot } from '../practice/snapshots'

const help = (n: number) => (n > 3 ? 'saw reference' : `${n} hint${n === 1 ? '' : 's'}`)
const when = (iso: string) => new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })

/** Practice sidebar: save named snapshots of the answer, reopen or delete them, and back everything up to a file. */
export function Attempts({ snaps, canSave, suggested, onSave, onOpen, onDelete, onBackup, onRestore, message }: {
  snaps: Snapshot[]; canSave: boolean; suggested: string
  onSave: (name: string) => void; onOpen: (s: Snapshot) => void; onDelete: (s: Snapshot) => void
  onBackup: () => void; onRestore: (file: File) => void; message: string
}) {
  const [name, setName] = useState('')
  const file = useRef<HTMLInputElement>(null)
  return (
    <>
      <p className="muted small">Your answer saves itself. Save an attempt to keep a copy you can come back to, then compare your progress.</p>
      <form className="attempt-save" onSubmit={e => { e.preventDefault(); onSave(name); setName('') }}>
        <input type="text" value={name} placeholder={suggested} aria-label="Attempt name" maxLength={60} onChange={e => setName(e.target.value)} />
        <button className="primary" type="submit" disabled={!canSave} title={canSave ? 'Keep a copy of the answer as it is now' : 'Add some components first'}>Save attempt</button>
      </form>
      {snaps.length > 0 && (
        <ul className="attempt-list">
          {snaps.map((s, i) => {
            const d = trend(snaps, i)
            return (
              <li key={s.id}>
                <div className="attempt-main">
                  <b>{s.name}</b>
                  <span className="attempt-meta">{when(s.at)}</span>
                </div>
                <div className="attempt-scores">
                  <span title="Checks passed">{s.passed}/{s.total} checks</span>
                  {d !== null && d !== 0 && <span className={`delta ${d > 0 ? 'up' : 'down'}`} title="Change in the share of checks passed, against the previous attempt">{d > 0 ? '+' : ''}{d}%</span>}
                  {s.overall !== null && <span title="Pasted AI review score">review {s.overall}/5</span>}
                  {!!s.hints && <span title="Help used before saving: hints taken, or the reference opened">{help(s.hints)}</span>}
                </div>
                <div className="attempt-actions">
                  <button className="link" onClick={() => onOpen(s)} title="Replace the working answer with this one (Undo brings yours back)">Open</button>
                  <button className="link" onClick={() => onDelete(s)} aria-label={`Delete ${s.name}`}>Delete</button>
                </div>
              </li>
            )
          })}
        </ul>
      )}
      {snaps.length >= MAX_SNAPSHOTS && <p className="muted small">The newest {MAX_SNAPSHOTS} attempts are kept; saving another drops the oldest.</p>}
      <div className="row wrap">
        <button onClick={onBackup} title="Download every answer, review, attempt and question schedule as one file">Back up</button>
        <button onClick={() => file.current?.click()} title="Load a backup file made by Back up">Restore</button>
        <input ref={file} type="file" accept="application/json,.json" hidden aria-label="Backup file"
          onChange={e => { const f = e.target.files?.[0]; if (f) onRestore(f); e.target.value = '' }} />
      </div>
      {message && <p className="small attempt-msg" role="status">{message}</p>}
    </>
  )
}
