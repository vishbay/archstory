// The one toolbar above the canvas, shared by Explore and Practice: view switches on the left,
// network and availability in the middle, editing actions on the right.
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useReactFlow, useStoreApi } from '@xyflow/react'
import type { Cloud } from '../model/kinds'
import { zoneName } from '../model/availability'
import { exportCanvasImage } from './exportImage'

export function Toolbar({ children, barRef }: { children: ReactNode; barRef?: (el: HTMLDivElement | null) => void }) {
  return <div ref={barRef} className="toolbar" role="toolbar" aria-label="Canvas">{children}</div>
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

/** A toolbar button that opens a small panel; closes on Escape or a click outside. */
function TbMenu({ label, on, alert, title, dialog, children }: { label: string; on: boolean; alert: boolean; title: string; dialog: string; children: ReactNode }) {
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const close = (e: PointerEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !box.current?.contains(e.target as Node)) setOpen(false)
    }
    // capture phase, so a click on the canvas (which stops pointer events bubbling) still closes the panel
    document.addEventListener('pointerdown', close, true); document.addEventListener('keydown', close)
    return () => { document.removeEventListener('pointerdown', close, true); document.removeEventListener('keydown', close) }
  }, [open])
  return (
    <div className="tb-menu" ref={box}>
      <button className={`tb-toggle${on || alert ? ' on' : ''}${alert ? ' alert' : ''}`} aria-expanded={open}
        aria-haspopup="dialog" onClick={() => setOpen(o => !o)} title={title}>{label} ▾</button>
      {open && <div className="tb-panel" role="dialog" aria-label={dialog}>{children}</div>}
    </div>
  )
}

/** Save the canvas as a PNG. Must sit inside the ReactFlowProvider of the canvas it saves. */
export function ExportImageButton({ title, disabled }: { title: string; disabled?: boolean }) {
  const rf = useReactFlow()
  const store = useStoreApi()
  const [busy, setBusy] = useState(false)
  const run = async () => {
    setBusy(true)
    try { await exportCanvasImage(rf.getNodes(), title, store.getState().domNode) } catch (e) { alert(`Could not save the image. ${e instanceof Error ? e.message : ''}`.trim()) }
    setBusy(false)
  }
  return <button className="tb-btn" disabled={disabled || busy} title="Save the canvas as a PNG to paste into notes or docs" onClick={run}>Export image</button>
}

/** Zone layout, zone failure and entry zone, folded into one small menu so the toolbar stays one row. */
export function AvailabilityMenu({ zoneCount, cloud, zonesView, onZonesView, failed, onFailed, home, onHome }: {
  zoneCount: number; cloud: Cloud
  zonesView: boolean; onZonesView: (v: boolean) => void
  failed: number | null; onFailed: (z: number | null) => void
  home: number; onHome: (z: number) => void
}) {
  const zones = Array.from({ length: zoneCount }, (_, i) => i)
  const summary = [zonesView ? 'Zones view' : 'Zones', failed !== null && `${zoneName(failed, cloud)} down`].filter(Boolean).join(' · ')
  return (
    <TbMenu label={summary} on={zonesView} alert={failed !== null} title="Availability zones: layout, failure, entry zone" dialog="Availability zones">
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
    </TbMenu>
  )
}

/** Regions layout and region failure, for designs with a regions section. */
export function RegionsMenu({ names, regionsView, onRegionsView, failed, onFailed }: {
  names: string[]
  regionsView: boolean; onRegionsView: (v: boolean) => void
  failed: number | null; onFailed: (r: number | null) => void
}) {
  const summary = [regionsView ? 'Regions view' : 'Regions', failed !== null && `${names[failed]} down`].filter(Boolean).join(' · ')
  return (
    <TbMenu label={summary} on={regionsView} alert={failed !== null} title="Regions: layout and region failure" dialog="Regions">
      <span className="tb-label">Layout</span>
      <Seg label="Layout" value={regionsView ? 'regions' : 'tiers'} onChange={k => onRegionsView(k === 'regions')}
        options={[{ key: 'tiers', label: 'Tiers', title: 'One box per component' }, { key: 'regions', label: 'Regions', title: 'One box per region, global services outside' }]} />
      <span className="tb-label">Fail a region</span>
      <Seg label="Fail a region" value={failed === null ? 'none' : String(failed)} onChange={k => onFailed(k === 'none' ? null : Number(k))}
        options={[{ key: 'none', label: 'Nothing' }, ...names.map((n, i) => ({ key: String(i), label: n }))]} />
    </TbMenu>
  )
}
