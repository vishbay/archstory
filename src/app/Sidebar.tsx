import { useState, type ReactNode } from 'react'
import type { Design } from '../model/schema'
import { store } from './hooks'

/** A collapsible sidebar section whose open/closed state survives reloads. */
export function Section({ id, title, count, forceOpen, children }: { id: string; title: string; count?: number; forceOpen?: boolean; children: ReactNode }) {
  const [open, setOpen] = useState(() => store.get(`archstory.section.${id}`, true))
  const toggle = () => setOpen(o => { store.set(`archstory.section.${id}`, !o); return !o })
  const shown = open || forceOpen
  return (
    <section className="section">
      <button className="section-head" aria-expanded={shown} onClick={toggle}>
        <span className={`chev${shown ? ' open' : ''}`}>›</span>{title}{count !== undefined && <span className="count-pill">{count}</span>}
      </button>
      {shown && <div className="section-body">{children}</div>}
    </section>
  )
}

/** The Explore sidebar: the requirements stay in view; designs are chosen from the picker (⌘K). */
export function Sidebar({ current, onBrowse, onImport, onExport, onGenerate, onViewJson, onEstimate }: {
  current: Design
  onEstimate: () => void
  onBrowse: () => void; onImport: () => void; onExport: () => void; onGenerate: () => void; onViewJson: () => void
}) {
  const r = current.requirements
  const has = !!current.meta.summary || r.functional.length + r.nonFunctional.length + r.scale.length > 0
  return (
    <>
      <div className="panel-body req-body">
        <h4 className="req-title">Requirements</h4>
        {current.meta.summary && <p className="small req-summary">{current.meta.summary}</p>}
        {r.functional.length > 0 && <><h5>Functional</h5><ul className="reqs">{r.functional.map(x => <li key={x}>{x}</li>)}</ul></>}
        {r.nonFunctional.length > 0 && <><h5>Non-functional</h5><ul className="reqs">{r.nonFunctional.map(x => <li key={x}>{x}</li>)}</ul></>}
        {r.scale.length > 0 && <><h5>Scale</h5><table className="kv"><tbody>{r.scale.map(s => <tr key={s.label}><th>{s.label}</th><td>{s.value}</td></tr>)}</tbody></table>
          <button className="small-btn" onClick={onEstimate} title="Requests per second, storage, bandwidth and cache size, with the arithmetic">Work out the numbers</button></>}
        {!has && <p className="muted small">This design has no requirements listed.</p>}
      </div>
      <div className="panel-foot side-actions">
        <button className="browse" onClick={onBrowse} title="Search all designs (⌘K / Ctrl+K)">Browse designs<kbd>⌘K</kbd></button>
        <div className="row wrap">
          <button onClick={onImport}>Import</button>
          <button onClick={onViewJson} title="See the JSON behind the design you are viewing">View JSON</button>
          <button onClick={onExport}>Export</button>
          <button onClick={onGenerate} title="ArchStory has no built-in AI: this writes a prompt for ChatGPT, Claude, Gemini or any assistant">Prompt for your AI</button>
        </div>
      </div>
    </>
  )
}
