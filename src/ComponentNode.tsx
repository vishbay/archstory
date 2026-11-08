import { Handle, Position, type NodeProps } from '@xyflow/react'
import { CATALOG } from './engine/catalog'
import type { Kind } from './engine/types'

export type CompData = { kind: Kind; status?: 'fail' | 'ok' | null }

export function ComponentNode({ data, selected }: NodeProps) {
  const d = data as CompData
  const c = CATALOG[d.kind]
  const ring = d.status === 'fail' ? '#ef4444' : d.status === 'ok' ? '#22c55e' : selected ? '#e2e8f0' : 'transparent'
  return (
    <div className="comp" style={{ borderColor: c.color, boxShadow: `0 0 0 3px ${ring}` }}>
      <span className="comp-icon">{c.icon}</span>
      <span className="comp-label">{c.label}</span>
      {[Position.Top, Position.Right, Position.Bottom, Position.Left].map(p => (
        <Handle key={p} id={p} type="source" position={p} />
      ))}
    </div>
  )
}
