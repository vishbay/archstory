// The one toolbar above the canvas, shared by Explore and Practice: view switches on the left,
// network and availability in the middle, editing actions on the right.
import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { Cloud } from '../model/kinds'
import { zoneName } from '../model/availability'

export function Toolbar({ children }: { children: ReactNode }) {
  return <div className="toolbar" role="toolbar" aria-label="Canvas">{children}</div>
}
export const ToolbarSep = () => <span className="tb-sep" aria-hidden />
export const ToolbarLabel = ({ children }: { children: ReactNode }) => <span className="tb-group-label">{children}</span>
export const ToolbarSpacer = () => <span className="spacer" />

export function Seg<K extends string>({ label, value, onChange, options }: {
  label: string; value: K; onChange: (k: K) => void
  options: { key: K; label: string; disabled?: boolean; title?: string }[]
}) {
  return (
    <div className="seg" role="group" aria-label={label}>
      {options.map(o => (
        <button key={o.key} className={value === o.key ? 'on' : ''} aria-pressed={value === o.key} disabled={o.disabled} title={o.title}
          onClick={() => onChange(o.key)}>{o.label}</button>
      ))}
    </div>
  )
}

export function Toggle({ on, onClick, disabled, title, children }: { on: boolean; onClick: () => void; disabled?: boolean; title?: string; children: ReactNode }) {
  return (
    <button className={`tb-switch${on ? ' on' : ''}`} role="switch" aria-checked={on} disabled={disabled} title={title} onClick={onClick}>
      <span className="sw" aria-hidden><i /></span>{children}
    </button>
  )
}

/** Zone layout, zone failure and entry zone, folded into one small menu so the toolbar stays one row. */
export function AvailabilityMenu({ zoneCount, cloud, zonesView, onZonesView, failed, onFailed, home, onHome }: {
  zoneCount: number; cloud: Cloud
  zonesView: boolean; onZonesView: (v: boolean) => void
  failed: number | null; onFailed: (z: number | null) => void
  home: number; onHome: (z: number) => void
}) {
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !box.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', close); document.addEventListener('keydown', close)
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', close) }
  }, [open])
  const zones = Array.from({ length: zoneCount }, (_, i) => i)
  const summary = [zonesView ? 'Zones view' : 'Zones', failed !== null && `${zoneName(failed, cloud)} down`].filter(Boolean).join(' · ')

  return (
    <div className="tb-menu" ref={box}>
      <button className={`tb-toggle${zonesView || failed !== null ? ' on' : ''}${failed !== null ? ' alert' : ''}`} aria-expanded={open}
        aria-haspopup="dialog" onClick={() => setOpen(o => !o)} title="Availability zones: layout, failure, entry zone">{summary} ▾</button>
      {open && (
        <div className="tb-panel" role="dialog" aria-label="Availability zones">
          <span className="tb-label">Layout</span>
          <Seg label="Layout" value={zonesView ? 'zones' : 'tiers'} onChange={k => onZonesView(k === 'zones')}
            options={[{ key: 'tiers', label: 'Tiers', title: 'One box per component' }, { key: 'zones', label: 'Zones', title: 'One column per availability zone' }]} />
          <span className="tb-label">Fail a zone</span>
          <Seg label="Fail a zone" value={failed === null ? 'none' : String(failed)} onChange={k => onFailed(k === 'none' ? null : Number(k))}
            options={[{ key: 'none', label: 'Nothing' }, ...zones.map(z => ({ key: String(z), label: zoneName(z, cloud) }))]} />
          {zonesView && (
            <>
              <span className="tb-label">Request enters</span>
              <Seg label="Request enters" value={String(home)} onChange={k => onHome(Number(k))}
                options={zones.map(z => ({ key: String(z), label: zoneName(z, cloud) }))} />
            </>
          )}
        </div>
      )}
    </div>
  )
}
