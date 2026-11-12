// The Numbers pill on the canvas: a short slide-out panel with the design's scale and its headline estimates,
// so the requirements panel can stay about requirements. The full calculator is one click away.
import { useEffect, useState } from 'react'
import type { Cloud } from '../model/kinds'
import type { Design } from '../model/schema'
import { cost, designShape, money } from '../practice/cost'
import { estimate } from '../practice/estimate'
import { loadCost, loadInputs } from './estimateState'
import { onOpenNumbers } from './numbersBus'
import { store } from './hooks'

type Tab = 'scale' | 'estimate'
const HEADLINES = ['write-qps', 'read-qps', 'storage-total', 'bw-out', 'cache', 'instances']

export function Numbers({ design, cloud, onCalculator }: { design: Design; cloud: Cloud; onCalculator: () => void }) {
  const [open, setOpen] = useState(() => store.get('archstory.numbers.open', false))
  const [tab, setTab] = useState<Tab>(() => store.get<Tab>('archstory.numbers.tab', 'scale'))
  useEffect(() => { store.set('archstory.numbers.open', open) }, [open])
  useEffect(() => { store.set('archstory.numbers.tab', tab) }, [tab])
  useEffect(() => onOpenNumbers(t => { setOpen(true); if (t) setTab(t) }), [])

  const scale = design.requirements.scale
  // read on every render, so edits made in the calculator show as soon as it closes
  const inputs = loadInputs(design), lines = estimate(inputs).filter(l => HEADLINES.includes(l.id))
  const bill = cost(inputs, loadCost(design), cloud, designShape(design))

  return (
    <div className="numbers">
      <button className={`numbers-btn${open ? ' on' : ''}`} aria-expanded={open} aria-controls="numbers-panel" onClick={() => setOpen(o => !o)}
        title="The design's scale and back-of-the-envelope estimates">
        <span aria-hidden>#</span> Numbers <span className="chev-down" aria-hidden>{open ? '▴' : '▾'}</span>
      </button>
      {open && (
        <section id="numbers-panel" className="numbers-panel" aria-label="Scale and estimates">
          <div className="numbers-head">
            <div className="seg" role="tablist" aria-label="Numbers">
              {(['scale', 'estimate'] as const).map(t => (
                <button key={t} role="tab" aria-selected={tab === t} className={tab === t ? 'on' : ''} onClick={() => setTab(t)}>{t === 'scale' ? 'Scale' : 'Estimate'}</button>
              ))}
            </div>
            <button className="icon ghost" aria-label="Close numbers" onClick={() => setOpen(false)}>×</button>
          </div>
          {tab === 'scale' ? (
            scale.length
              ? <table className="kv"><tbody>{scale.map(s => <tr key={s.label}><th>{s.label}</th><td>{s.value}</td></tr>)}</tbody></table>
              : <p className="muted small">This design lists no scale numbers.</p>
          ) : (
            <>
              {!design.requirements.estimate && <p className="muted small">Generic starting numbers: this design has none of its own. Set them in the calculator.</p>}
              <table className="kv numbers-est"><tbody>
                {lines.map(l => <tr key={l.id} title={l.formula}><th>{l.label}</th><td>{l.value}</td></tr>)}
                <tr title="Approximate list prices; the calculator shows each line"><th>Monthly cost</th><td>about {money(bill.total)}, {money(bill.grand)} with often-missed items</td></tr>
              </tbody></table>
            </>
          )}
          <button className="small-btn" onClick={onCalculator}>Open the calculator</button>
        </section>
      )}
    </div>
  )
}
