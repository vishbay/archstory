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

export function Sidebar({ library, mine, current, onOpen, onDelete, onImport, onExport, onGenerate, onViewJson }: {
  library: Design[]; mine: Design[]; current: Design
  onOpen: (id: string) => void; onDelete: (id: string) => void; onImport: () => void; onExport: () => void; onGenerate: () => void; onViewJson: () => void
}) {
  const [q, setQ] = useState('')
  const searching = q.trim().length > 0
  const match = (d: Design) => {
    const s = q.trim().toLowerCase()
    return !s || d.meta.title.toLowerCase().includes(s) || d.meta.tags.some(t => t.includes(s))
  }
  const item = (d: Design, deletable: boolean) => (
    <li key={d.id} className={d.id === current.id ? 'cur' : ''}>
      <button className="design-item" onClick={() => onOpen(d.id)}>
        <span className="design-title">{d.meta.title}</span>
        {d.meta.difficulty && <span className="design-tags"><span className={`diff diff-${d.meta.difficulty}`}>{d.meta.difficulty}</span></span>}
        {d.meta.tags.length > 0 && <span className="design-tags">{d.meta.tags.slice(0, 3).map(t => <span key={t} className="tag">{t}</span>)}</span>}
      </button>
      {deletable && <button className="icon ghost" title="Remove from my designs" onClick={() => onDelete(d.id)}>×</button>}
    </li>
  )
  const r = current.requirements

  return (
    <div className="panel-body">
      <input className="search" placeholder="Search designs or tags…" value={q} onChange={e => setQ(e.target.value)} />
      <Section id="library" title="Library" count={library.length} forceOpen={searching}>
        <ul className="designs">{library.filter(match).map(d => item(d, false))}</ul>
      </Section>
      <Section id="mine" title="My designs" count={mine.length} forceOpen={searching}>
        {mine.length ? <ul className="designs">{mine.filter(match).map(d => item(d, true))}</ul>
          : <p className="muted small">Import a JSON design, or generate one with an AI, and it will appear here.</p>}
        <div className="row wrap">
          <button onClick={onImport}>Import</button>
          <button onClick={onViewJson} title="See the JSON behind the design you are viewing">View JSON</button>
          <button onClick={onExport}>Export</button>
          <button onClick={onGenerate}>Generate with AI</button>
        </div>
      </Section>

      {(current.meta.summary || r.functional.length + r.nonFunctional.length + r.scale.length > 0) && (
        <Section id="requirements" title="Requirements">
          {current.meta.summary && <p className="small">{current.meta.summary}</p>}
          {r.functional.length > 0 && <details open><summary>Functional</summary><ul className="reqs">{r.functional.map(x => <li key={x}>{x}</li>)}</ul></details>}
          {r.nonFunctional.length > 0 && <details open><summary>Non-functional</summary><ul className="reqs">{r.nonFunctional.map(x => <li key={x}>{x}</li>)}</ul></details>}
          {r.scale.length > 0 && (
            <details open><summary>Scale</summary>
              <table className="kv"><tbody>{r.scale.map(s => <tr key={s.label}><th>{s.label}</th><td>{s.value}</td></tr>)}</tbody></table>
            </details>
          )}
        </Section>
      )}
    </div>
  )
}
