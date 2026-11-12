import { useEffect, useMemo, useRef, useState } from 'react'
import type { Cloud } from '../model/kinds'
import type { Design } from '../model/schema'
import { cleanCost, cost, costText, DEFAULT_COST, designShape, money, type CostInputs } from '../practice/cost'
import { bytes, cleanInputs, count, DEFAULT_INPUTS, estimate, estimateText, parseAmount, type EstimateInputs } from '../practice/estimate'
import { store } from './hooks'
import { copyText } from './prompts'

type Field = { key: keyof EstimateInputs | keyof CostInputs; label: string; kind: 'count' | 'bytes'; hint?: string }
const TRAFFIC_USERS: Field[] = [
  { key: 'dau', label: 'Daily active users', kind: 'count' },
  { key: 'writesPerUser', label: 'Writes per user per day', kind: 'count' },
]
const SHAPE: Field[] = [
  { key: 'readsPerWrite', label: 'Reads per write', kind: 'count', hint: 'read-heavy systems: 10 to 100' },
  { key: 'peakFactor', label: 'Peak over average', kind: 'count', hint: 'usually 2 to 5' },
  { key: 'writeBytes', label: 'Size stored per write', kind: 'bytes' },
  { key: 'readBytes', label: 'Size returned per read', kind: 'bytes' },
  { key: 'years', label: 'Keep data for (years)', kind: 'count' },
  { key: 'replicas', label: 'Copies of the data', kind: 'count', hint: 'replication, often 3' },
  { key: 'cachePercent', label: 'Cache share of daily reads (%)', kind: 'count', hint: '80/20 rule: 20' },
  { key: 'perInstance', label: 'Requests/s one instance serves', kind: 'count' },
]
const COST_PRICES: Field[] = [
  { key: 'computePrice', label: 'Instance $/hour', kind: 'count', hint: '2 vCPU, 8 GB' },
  { key: 'dbPrice', label: 'Database node $/hour', kind: 'count', hint: '4 vCPU, 32 GB' },
  { key: 'dbStoragePrice', label: 'Database storage $/GB-month', kind: 'count' },
  { key: 'objectPrice', label: 'Object storage $/GB-month', kind: 'count' },
  { key: 'cachePrice', label: 'Cache $/GB-hour', kind: 'count' },
  { key: 'egressPrice', label: 'Internet egress $/GB', kind: 'count' },
  { key: 'cdnPrice', label: 'CDN egress $/GB', kind: 'count' },
  { key: 'tierPrice', label: 'Infrequent access $/GB-month', kind: 'count' },
]
const COST_MISSED: Field[] = [
  { key: 'crossZonePrice', label: 'Cross-zone $/GB', kind: 'count', hint: 'about $0.01 each way' },
  { key: 'crossRegionPrice', label: 'Cross-region $/GB', kind: 'count' },
  { key: 'lbHourPrice', label: 'Load balancer $/hour', kind: 'count' },
  { key: 'lbGbPrice', label: 'Load balancer $/GB processed', kind: 'count' },
  { key: 'natGb', label: 'Outbound GB through NAT per month', kind: 'count', hint: 'calls to third parties; a rough guess, 5% of egress when the design has any' },
  { key: 'natHourPrice', label: 'NAT gateway $/hour', kind: 'count' },
  { key: 'natGbPrice', label: 'NAT $/GB', kind: 'count' },
  { key: 'logBytes', label: 'Logged per request', kind: 'bytes' },
  { key: 'logPrice', label: 'Logs $/GB ingested', kind: 'count' },
]
const COST_CHOICES: Field[] = [
  { key: 'objectPercent', label: 'Data in object storage (%)', kind: 'count', hint: 'bulk blobs, not rows' },
  { key: 'cdnPercent', label: 'Egress served by a CDN (%)', kind: 'count' },
  { key: 'cdnPotential', label: 'Egress a CDN could serve (%)', kind: 'count', hint: 'cacheable content' },
  { key: 'commitDiscount', label: 'Commitment discount (%)', kind: 'count', hint: 'about 30 to 40' },
  { key: 'spotPercent', label: 'Compute that is spot-safe workers (%)', kind: 'count' },
  { key: 'spotDiscount', label: 'Spot discount (%)', kind: 'count' },
  { key: 'tierDays', label: 'Tier data older than (days)', kind: 'count' },
]
const show = (f: Field, v: number) => (f.kind === 'bytes' ? bytes(v).replace(' ', '') : count(v))

/** Back-of-the-envelope numbers with the arithmetic shown. In Practice the working can go straight into your notes. */
// Cost choices that describe a design's shape (how much is object storage, how much a CDN could serve), not prices.
const COST_SHAPE = ['objectPercent', 'cdnPercent', 'cdnPotential', 'spotPercent'] as const
const pick = (o: Record<string, unknown>, keys: readonly string[]) => Object.fromEntries(keys.filter(k => o[k] !== undefined).map(k => [k, o[k]]))
const same = (a: object, b: object) => JSON.stringify(a) === JSON.stringify(b)
/** The saved value, unless nothing was saved or it is just the old generic defaults; then this design's own numbers. */
function savedOr<T extends object>(saved: unknown, clean: (raw: unknown) => T, generic: T, design: () => T): T {
  if (!saved) return design()
  const v = clean(saved)
  return same(v, generic) ? design() : v
}

export function EstimateDialog({ problem, cloud = 'neutral', onClose, onAddToNotes }: { problem: Design; cloud?: Cloud; onClose: () => void; onAddToNotes?: (text: string) => void }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const key = `archstory.estimate.${problem.id}`
  // Start from this design's own numbers; a saved edit wins, but an untouched copy of the old generic defaults does not.
  const own = problem.requirements.estimate ?? {}
  const designInputs = () => cleanInputs({ ...DEFAULT_INPUTS, ...own })
  const designCost = (base: CostInputs = DEFAULT_COST) => cleanCost({ ...base, ...pick(own, COST_SHAPE) })
  const [inputs, setInputs] = useState<EstimateInputs>(() => savedOr(store.get(key, null), cleanInputs, DEFAULT_INPUTS, designInputs))
  const costKey = `archstory.cost.${problem.id}`
  const [prices, setPrices] = useState<CostInputs>(() => savedOr(store.get(costKey, null), cleanCost, DEFAULT_COST, () => designCost()))
  const resetToDesign = () => { setInputs(designInputs()); setPrices(p => designCost({ ...p, natGb: undefined })); setRaw({}); setDone('') }
  const [raw, setRaw] = useState<Partial<Record<string, string>>>({})
  const [done, setDone] = useState('')
  useEffect(() => { dialog.current?.showModal() }, [])
  useEffect(() => { store.set(key, inputs) }, [key, inputs])
  useEffect(() => { store.set(costKey, prices) }, [costKey, prices])
  const lines = useMemo(() => estimate(inputs), [inputs])
  const shape = useMemo(() => designShape(problem), [problem])
  const bill = useMemo(() => cost(inputs, prices, cloud, shape), [inputs, prices, cloud, shape])

  const fieldOf = (f: Field, isCost: boolean) => {
    const current = (isCost ? { ...prices, natGb: bill.natGb } : inputs) as unknown as Record<string, number>
    const text = raw[f.key] ?? show(f, current[f.key])
    const bad = raw[f.key] !== undefined && parseAmount(raw[f.key]!, f.kind) === null
    return (
      <label key={f.key} className="field est-field">{f.label}
        <input type="text" inputMode="decimal" value={text} aria-invalid={bad} spellCheck={false}
          onChange={e => {
            const v = e.target.value
            setRaw(r => ({ ...r, [f.key]: v })); setDone('')
            const n = parseAmount(v, f.kind)
            if (n !== null) { if (isCost) setPrices(i => ({ ...i, [f.key]: n })); else setInputs(i => ({ ...i, [f.key]: n })) }
          }}
          onBlur={() => setRaw(r => { const { [f.key]: _, ...rest } = r; void _; return rest })} />
        {f.hint && <span className="muted small">{f.hint}</span>}
      </label>
    )
  }
  const field = (f: Field) => fieldOf(f, false), costField = (f: Field) => fieldOf(f, true)
  const text = `Estimates (from the calculator):\n${estimateText(lines)}\n\nMonthly cost (approximate list prices):\n${costText(bill)}`

  return (
    <dialog ref={dialog} className="dialog estimate-dialog" onClose={onClose} aria-label="Estimate calculator">
      <h3>Back-of-the-envelope numbers</h3>
      <p className="muted small">Type shorthand like 10M, 1.5B or 2KB. Decimal units and a 30-day month, as in an interview. Try it yourself first, then check here.</p>
      {problem.requirements.scale.length > 0 && (
        <div className="est-given"><b>Given for {problem.meta.title}:</b> {problem.requirements.scale.map(s => `${s.label}: ${s.value}`).join(' · ')}</div>
      )}
      <p className="muted small est-start">Starting numbers come from this design's requirements. Change any of them{problem.requirements.estimate ? <>, or <button className="link" onClick={resetToDesign}>go back to this design's numbers</button></> : null}.</p>
      <div className="est-grid">
        <div>
          <div className="seg" role="group" aria-label="Traffic from">
            <button className={inputs.source === 'users' ? 'on' : ''} aria-pressed={inputs.source === 'users'} onClick={() => setInputs(i => ({ ...i, source: 'users' }))}>From users</button>
            <button className={inputs.source === 'volume' ? 'on' : ''} aria-pressed={inputs.source === 'volume'} onClick={() => setInputs(i => ({ ...i, source: 'volume' }))}>From a volume</button>
          </div>
          {inputs.source === 'users' ? TRAFFIC_USERS.map(field) : (
            <div className="est-volume">
              {field({ key: 'volume', label: 'Writes', kind: 'count' })}
              <label className="field est-field">per
                <select value={inputs.volumeUnit} onChange={e => setInputs(i => ({ ...i, volumeUnit: e.target.value as EstimateInputs['volumeUnit'] }))}>
                  <option value="second">second</option><option value="day">day</option><option value="month">month</option>
                </select>
              </label>
            </div>
          )}
          <div className="est-fields">{SHAPE.map(field)}</div>
        </div>
        <table className="est-results">
          <tbody>
            {lines.map(l => <tr key={l.id}><th>{l.label}</th><td><b>{l.value}</b><span>{l.formula}</span></td></tr>)}
          </tbody>
        </table>
      </div>
      <details className="est-cost">
        <summary>Monthly cost: about {money(bill.total)}, {money(bill.grand)} with often-missed items</summary>
        <p className="muted small">Approximate on-demand list prices, US regions, late 2026. Check your provider's pricing page. Every price is editable.</p>
        <div className="est-grid">
          <div>
            <div className="est-fields">{COST_PRICES.map(costField)}</div>
            <div className="est-fields">{COST_CHOICES.map(costField)}</div>
            <div className="est-fields">{COST_MISSED.map(costField)}</div>
          </div>
          <div>
            <table className="est-results">
              <tbody>
                {bill.lines.map(l => <tr key={l.id}><th>{l.label}</th><td><b>{l.value}</b><span>{l.formula}</span></td></tr>)}
              </tbody>
            </table>
            <h4>Often missed</h4>
            <table className="est-results">
              <tbody>
                {bill.missed.map(l => <tr key={l.id}><th>{l.label}</th><td><b>{l.value}</b><span>{l.formula}</span></td></tr>)}
                <tr><th>Subtotal</th><td><b>{money(bill.missedTotal)}</b><span>not in the monthly total above; with these: {money(bill.grand)}</span></td></tr>
              </tbody>
            </table>
            <h4>Ways to cut it</h4>
            <table className="est-results">
              <tbody>
                {bill.levers.map(l => <tr key={l.id}><th>{l.label}</th><td><b>saves {money(l.saving)}/month</b><span>{l.why}</span></td></tr>)}
              </tbody>
            </table>
            <p className="muted small">Savings overlap, so do not add them up.</p>
          </div>
        </div>
      </details>
      {done && <p className="small ai-test ok" role="status">{done}</p>}
      <div className="row end">
        <span className="spacer" />
        <button onClick={async () => setDone(await copyText(text) ? 'Copied.' : 'Could not reach the clipboard.')}>Copy working</button>
        {onAddToNotes && <button className="primary" onClick={() => { onAddToNotes(text); setDone('Added to your Estimates notes.') }}>Add to my notes</button>}
        <button onClick={() => dialog.current?.close()}>Close</button>
      </div>
    </dialog>
  )
}
