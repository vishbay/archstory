import { useEffect, useMemo, useRef, useState } from 'react'
import { KINDS, TIER_INFO } from '../model/kinds'
import { searchKinds } from '../practice/quick'

/** Type to add a component. With a component selected, the new one is connected from it. */
export function QuickAdd({ connectFrom, onPick, onClose }: { connectFrom: string | null; onPick: (kind: string) => void; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const list = useRef<HTMLUListElement>(null)
  const [q, setQ] = useState('')
  const [at, setAt] = useState(0)
  useEffect(() => { dialog.current?.showModal() }, [])
  const kinds = useMemo(() => searchKinds(q).slice(0, 8), [q])
  const i = Math.min(at, Math.max(0, kinds.length - 1))
  useEffect(() => { list.current?.children[i]?.scrollIntoView({ block: 'nearest' }) }, [i])
  const pick = (k: string) => { onPick(k); dialog.current?.close() }

  return (
    <dialog ref={dialog} className="picker glass quick-add" onClose={onClose} aria-label="Add a component"
      onClick={e => { if (e.target === dialog.current) dialog.current?.close() }}>
      <input className="picker-input" autoFocus value={q} placeholder="Add a component: try cache, postgres, kafka, lb…" aria-label="Component to add"
        onChange={e => { setQ(e.target.value); setAt(0) }}
        onKeyDown={e => {
          if (e.key === 'ArrowDown') { e.preventDefault(); setAt(Math.min(i + 1, kinds.length - 1)) }
          else if (e.key === 'ArrowUp') { e.preventDefault(); setAt(Math.max(i - 1, 0)) }
          else if (e.key === 'Enter' && kinds[i]) { e.preventDefault(); pick(kinds[i]) }
        }} />
      <ul ref={list} className="picker-list" role="listbox" aria-label="Component kinds">
        {kinds.map((k, n) => (
          <li key={k} role="option" aria-selected={n === i} className={n === i ? 'sel' : ''} onMouseMove={() => setAt(n)} onClick={() => pick(k)}>
            <div className="pick-main"><span aria-hidden>{KINDS[k].icon}</span> <b>{KINDS[k].label}</b><span className="pick-counts">{TIER_INFO[KINDS[k].tier].title}</span></div>
          </li>
        ))}
        {!kinds.length && <li className="pick-empty muted">No component matches "{q}".</li>}
      </ul>
      <div className="picker-foot muted">{connectFrom ? <span>Connects from <b>{connectFrom}</b></span> : <span>Select a component first to connect the new one from it</span>}<span><kbd>Enter</kbd> add</span><span><kbd>Esc</kbd> close</span></div>
    </dialog>
  )
}

const SHORTCUTS: [string, string][] = [
  ['/', 'Add a component by typing'], ['C', 'Connect mode: click a caller, then what it calls'],
  ['⌘D / Ctrl+D', 'Duplicate the selected component with its connections'], ['⌘C, ⌘V', 'Copy and paste a component'],
  ['Delete', 'Remove the selected component or connection'], ['⌘Z, ⇧⌘Z', 'Undo and redo'],
  ['Esc', 'Stop connecting or recording'], ['Space, ←, →', 'Play and step through a flow'], ['?', 'Show these shortcuts'],
]
export function Shortcuts({ onClose }: { onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null)
  useEffect(() => { dialog.current?.showModal() }, [])
  return (
    <dialog ref={dialog} className="dialog shortcuts" onClose={onClose} aria-label="Keyboard shortcuts"
      onClick={e => { if (e.target === dialog.current) dialog.current?.close() }}>
      <h3>Keyboard shortcuts</h3>
      <table className="kv"><tbody>{SHORTCUTS.map(([k, v]) => <tr key={k}><th><kbd>{k}</kbd></th><td>{v}</td></tr>)}</tbody></table>
      <div className="row end"><button onClick={() => dialog.current?.close()}>Close</button></div>
    </dialog>
  )
}
