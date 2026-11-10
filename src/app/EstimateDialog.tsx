import { useEffect, useMemo, useRef, useState } from 'react'
import type { Design } from '../model/schema'
import { bytes, cleanInputs, count, estimate, estimateText, parseAmount, type EstimateInputs } from '../practice/estimate'
import { store } from './hooks'
import { copyText } from './prompts'

type Field = { key: keyof EstimateInputs; label: string; kind: 'count' | 'bytes'; hint?: string }
const TRAFFIC_USERS: Field[] = [
  { key: 'dau', label: 'Daily active users', kind: 'count' },
  { key: 'writesPerUser', label: 'Writes per user per day', kind: 'count' },
]
const SHAPE: Field[] = [
  { key: 'readsPerWrite', label: 'Reads per write', kind: 'count', hint: 'read-heavy systems: 10 to 100' },
  { key: 'peakFactor', label: 'Peak over average', kind: 'count', hint: 'usually 2 to 5' },
  { key: 'writeBytes', label: 'Size stored per write', kind: 'bytes' },
  { key: 'readBytes', label: 'Size returned per read', kind: 'bytes' },
  { key: 'years', label: 'Keep data for (years)', kind: 'count' },
  { key: 'replicas', label: 'Copies of the data', kind: 'count', hint: 'replication, often 3' },
  { key: 'cachePercent', label: 'Cache share of daily reads (%)', kind: 'count', hint: '80/20 rule: 20' },
  { key: 'perInstance', label: 'Requests/s one instance serves', kind: 'count' },
]
const show = (f: Field, v: number) => (f.kind === 'bytes' ? bytes(v).replace(' ', '') : count(v))

/** Back-of-the-envelope numbers with the arithmetic shown. In Practice the working can go straight into your notes. */
export function EstimateDialog({ problem, onClose, onAddToNotes }: { problem: Design; onClose: () => void; onAddToNotes?: (text: string) => void }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const key = `archstory.estimate.${problem.id}`
  const [inputs, setInputs] = useState<EstimateInputs>(() => cleanInputs(store.get(key, null)))
  const [raw, setRaw] = useState<Partial<Record<keyof EstimateInputs, string>>>({})
  const [done, setDone] = useState('')
  useEffect(() => { dialog.current?.showModal() }, [])
  useEffect(() => { store.set(key, inputs) }, [key, inputs])
  const lines = useMemo(() => estimate(inputs), [inputs])

  const field = (f: Field) => {
    const text = raw[f.key] ?? show(f, inputs[f.key] as number)
    const bad = raw[f.key] !== undefined && parseAmount(raw[f.key]!, f.kind) === null
    return (
      <label key={f.key} className="field est-field">{f.label}
        <input type="text" inputMode="decimal" value={text} aria-invalid={bad} spellCheck={false}
          onChange={e => {
            const v = e.target.value
            setRaw(r => ({ ...r, [f.key]: v })); setDone('')
            const n = parseAmount(v, f.kind)
            if (n !== null) setInputs(i => ({ ...i, [f.key]: n }))
          }}
          onBlur={() => setRaw(r => { const { [f.key]: _, ...rest } = r; void _; return rest })} />
        {f.hint && <span className="muted small">{f.hint}</span>}
      </label>
    )
  }
  const text = `Estimates (from the calculator):\n${estimateText(lines)}`

  return (
    <dialog ref={dialog} className="dialog estimate-dialog" onClose={onClose} aria-label="Estimate calculator">
      <h3>Back-of-the-envelope numbers</h3>
      <p className="muted small">Type shorthand like 10M, 1.5B or 2KB. Decimal units and a 30-day month, as in an interview. Try it yourself first, then check here.</p>
      {problem.requirements.scale.length > 0 && (
        <div className="est-given"><b>Given for {problem.meta.title}:</b> {problem.requirements.scale.map(s => `${s.label}: ${s.value}`).join(' · ')}</div>
      )}
      <div className="est-grid">
        <div>
          <div className="seg" role="group" aria-label="Traffic from">
            <button className={inputs.source === 'users' ? 'on' : ''} aria-pressed={inputs.source === 'users'} onClick={() => setInputs(i => ({ ...i, source: 'users' }))}>From users</button>
            <button className={inputs.source === 'volume' ? 'on' : ''} aria-pressed={inputs.source === 'volume'} onClick={() => setInputs(i => ({ ...i, source: 'volume' }))}>From a volume</button>
          </div>
          {inputs.source === 'users' ? TRAFFIC_USERS.map(field) : (
            <div className="est-volume">
              {field({ key: 'volume', label: 'Writes', kind: 'count' })}
              <label className="field est-field">per
                <select value={inputs.volumeUnit} onChange={e => setInputs(i => ({ ...i, volumeUnit: e.target.value as EstimateInputs['volumeUnit'] }))}>
                  <option value="second">second</option><option value="day">day</option><option value="month">month</option>
                </select>
              </label>
            </div>
          )}
          <div className="est-fields">{SHAPE.map(field)}</div>
        </div>
        <table className="est-results">
          <tbody>
            {lines.map(l => <tr key={l.id}><th>{l.label}</th><td><b>{l.value}</b><span>{l.formula}</span></td></tr>)}
          </tbody>
        </table>
      </div>
      {done && <p className="small ai-test ok" role="status">{done}</p>}
      <div className="row end">
        <span className="spacer" />
        <button onClick={async () => setDone(await copyText(text) ? 'Copied.' : 'Could not reach the clipboard.')}>Copy working</button>
        {onAddToNotes && <button className="primary" onClick={() => { onAddToNotes(text); setDone('Added to your Estimates notes.') }}>Add to my notes</button>}
        <button onClick={() => dialog.current?.close()}>Close</button>
      </div>
    </dialog>
  )
}
