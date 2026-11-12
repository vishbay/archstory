import { useState } from 'react'
import { store } from './hooks'
import { KIND_GLYPH, KIND_INK, KIND_LEGEND, KIND_SHORT } from './stepKinds'

/** What the markers on the canvas and in the step list mean. Pinned under the Flow tab. */
export function Legend({ monitoring }: { monitoring: boolean }) {
  const [open, setOpen] = useState(() => store.get('archstory.legend', true))
  const toggle = () => setOpen(o => { store.set('archstory.legend', !o); return !o })
  return (
    <div className="panel-foot" aria-label="Legend">
      <div className="legend-row">
        {(['req', 'res', 'async', 'local'] as const).map(k => (
          <span key={k} className="legend-chip" title={KIND_LEGEND[k]}><i className="step-glyph" style={{ color: KIND_INK[k] }} aria-hidden>{KIND_GLYPH[k]}</i>{KIND_SHORT[k]}</span>
        ))}
        <button className="link legend-toggle" aria-expanded={open} onClick={toggle}>{open ? 'Hide key ▴' : 'Show key ▾'}</button>
      </div>
      {open && (
        <div className="legend-more">
          <div className="legend-row"><b>Nodes</b>
            <span className="legend-chip"><i className="swatch active" />this step</span>
            <span className="legend-chip"><i className="swatch visited" />used</span>
            <span className="legend-chip"><i className="swatch flow" />later</span>
            <span className="legend-chip"><i className="swatch off" />not in flow</span>
          </div>
          <div className="legend-row"><b>Lines</b>
            <span className="legend-chip"><i className="line solid" />request / response</span>
            <span className="legend-chip"><i className="line dashed" />async</span>
          </div>
          {monitoring && (
            <div className="legend-row"><b>Badges</b>
              <span className="legend-chip"><i className="badge-chip">M</i>emits metrics</span>
              <span className="legend-chip"><i className="badge-chip">L</i>emits logs</span>
              <span className="legend-chip"><i className="badge-chip">T</i>emits traces</span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
