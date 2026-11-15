import { useState } from 'react'
import type { Design, DNode, Group } from '../model/schema'
import { addOutline, OUTLINE_KINDS, setNodeGroup, updateGroup } from '../practice/attempt'

/** Draw a box around components: pick an outline for the selected component, or make a new one (an enterprise tenant silo, a region...). */
export function OutlineField({ design, node, setAttempt }: { design: Design; node: DNode; setAttempt: (d: Design, key?: string) => void }) {
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const [kind, setKind] = useState<Group['kind']>('tenant')
  const group = design.groups.find(g => g.id === node.group)
  const create = () => { setAttempt(addOutline(design, node.id, name, kind).design); setCreating(false); setName('') }

  return (
    <div className="field outline-field">
      <label>Outline
        <select value={creating ? '__new' : node.group ?? ''} onChange={e => {
          if (e.target.value === '__new') { setCreating(true); return }
          setCreating(false); setAttempt(setNodeGroup(design, node.id, e.target.value || undefined))
        }}>
          <option value="">None</option>
          {design.groups.map(g => <option key={g.id} value={g.id}>{g.label}</option>)}
          <option value="__new">New outline…</option>
        </select>
      </label>
      {creating && (
        <div className="outline-new">
          <input type="text" value={name} autoFocus placeholder="Name, for example Enterprise silo: Acme" aria-label="Outline name" maxLength={60}
            onChange={e => setName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); create() } }} />
          <select value={kind} onChange={e => setKind(e.target.value as Group['kind'])} aria-label="Kind of outline">
            {OUTLINE_KINDS.map(k => <option key={k.kind} value={k.kind}>{k.label}</option>)}
          </select>
          <div className="row">
            <button className="primary" onClick={create}>Create outline</button>
            <button onClick={() => setCreating(false)}>Cancel</button>
          </div>
        </div>
      )}
      {!creating && group && (
        <div className="outline-new">
          <input type="text" value={group.label} aria-label="Outline name" maxLength={60} onChange={e => setAttempt(updateGroup(design, group.id, { label: e.target.value }), `group:${group.id}`)} />
          <select value={group.kind} onChange={e => setAttempt(updateGroup(design, group.id, { kind: e.target.value as Group['kind'] }))} aria-label="Kind of outline">
            {OUTLINE_KINDS.map(k => <option key={k.kind} value={k.kind}>{k.label}</option>)}
          </select>
          <span className="muted small">Select other components and choose this outline for them to draw it around them all. Renaming changes it for every component inside.</span>
        </div>
      )}
    </div>
  )
}
