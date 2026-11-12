// A searchable design picker (opened from the top bar or with ⌘K / Ctrl+K), replacing the long library list.
import { useEffect, useMemo, useRef, useState } from 'react'
import type { Design } from '../model/schema'

export function DesignPicker({ library, mine, currentId, onOpen, onDelete, onClose, kind = 'system' }: {
  library: Design[]; mine: Design[]; currentId: string
  /** Which designs this picker lists: system designs, or protocol timelines (Under the hood). Never both. */
  kind?: 'system' | 'protocol'
  onOpen: (id: string) => void; onDelete: (id: string) => void; onClose: () => void
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const list = useRef<HTMLUListElement>(null)
  const [q, setQ] = useState('')
  const [idx, setIdx] = useState(0)
  useEffect(() => { dialog.current?.showModal() }, [])

  const items = useMemo(() => {
    const s = q.trim().toLowerCase()
    const ofKind = (d: Design) => (d.meta.kind ?? 'system') === kind
    const hit = (d: Design) => !s || d.meta.title.toLowerCase().includes(s) || d.meta.tags.some(t => t.includes(s)) || (d.meta.summary ?? '').toLowerCase().includes(s)
    return [...library.filter(ofKind).filter(hit).map(d => ({ d, mine: false })), ...mine.filter(ofKind).filter(hit).map(d => ({ d, mine: true }))]
  }, [library, mine, q, kind])
  const noun = kind === 'protocol' ? 'protocols' : 'designs'
  const at = Math.min(idx, Math.max(0, items.length - 1))
  useEffect(() => { list.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' }) }, [at, items])

  const choose = (id: string) => { onOpen(id); dialog.current?.close() }
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setIdx(Math.min(at + 1, items.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setIdx(Math.max(at - 1, 0)) }
    else if (e.key === 'Enter' && items[at]) { e.preventDefault(); choose(items[at].d.id) }
  }

  return (
    <dialog ref={dialog} className="picker glass" onClose={onClose} onClick={e => { if (e.target === dialog.current) dialog.current?.close() }} aria-label={kind === 'protocol' ? 'Choose a protocol' : 'Choose a design'}>
      <input className="picker-input" autoFocus placeholder={`Search ${noun} or tags…`} value={q} aria-label={`Search ${noun}`}
        onChange={e => { setQ(e.target.value); setIdx(0) }} onKeyDown={onKey} role="combobox" aria-expanded aria-controls="picker-list" />
      <ul id="picker-list" ref={list} className="picker-list" role="listbox">
        {items.map(({ d, mine: m }, i) => (
          <li key={d.id} role="option" aria-selected={i === at} className={`${i === at ? 'sel' : ''}${d.id === currentId ? ' current' : ''}`}
            onMouseMove={() => setIdx(i)} onClick={() => choose(d.id)}>
            <div className="pick-main">
              <b>{d.meta.title}</b>
              {d.meta.difficulty && <span className={`diff diff-${d.meta.difficulty}`}>{d.meta.difficulty}</span>}
              {m && <span className="tag">mine</span>}
              {d.id === currentId && <span className="tag">open now</span>}
              <span className="pick-counts">{d.nodes.length} {kind === 'protocol' ? 'actors' : 'components'} · {d.flows.length} {kind === 'protocol' ? 'scenario' : 'flow'}{d.flows.length === 1 ? '' : 's'}</span>
            </div>
            <div className="pick-sub">{d.meta.summary}</div>
            <div className="design-tags">{d.meta.tags.slice(0, 4).map(t => <span key={t} className="tag">{t}</span>)}</div>
            {m && <button className="icon ghost pick-del" title="Remove from my designs" aria-label={`Remove ${d.meta.title}`}
              onClick={e => { e.stopPropagation(); onDelete(d.id) }}>×</button>}
          </li>
        ))}
        {!items.length && <li className="pick-empty muted">No {noun} match “{q}”.</li>}
      </ul>
      <div className="picker-foot muted"><span><kbd>↑</kbd> <kbd>↓</kbd> move</span><span><kbd>Enter</kbd> open</span><span><kbd>Esc</kbd> close</span></div>
    </dialog>
  )
}
