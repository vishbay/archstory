// Which estimate numbers a design starts from, shared by the calculator dialog and the Numbers panel on the canvas.
// A saved edit wins; nothing saved, or an untouched copy of the old generic defaults, means the design's own numbers.
import type { Design } from '../model/schema'
import { cleanCost, DEFAULT_COST, type CostInputs } from '../practice/cost'
import { cleanInputs, DEFAULT_INPUTS, type EstimateInputs } from '../practice/estimate'
import { store } from './hooks'

// Cost choices that describe a design's shape (how much is object storage, how much a CDN could serve), not prices.
const COST_SHAPE = ['objectPercent', 'cdnPercent', 'cdnPotential', 'spotPercent'] as const
const pick = (o: Record<string, unknown>, keys: readonly string[]) => Object.fromEntries(keys.filter(k => o[k] !== undefined).map(k => [k, o[k]]))
const same = (a: object, b: object) => JSON.stringify(a) === JSON.stringify(b)
function savedOr<T extends object>(saved: unknown, clean: (raw: unknown) => T, generic: T, design: () => T): T {
  if (!saved) return design()
  const v = clean(saved)
  return same(v, generic) ? design() : v
}

export const estimateKey = (d: Design) => `archstory.estimate.${d.id}`
export const costKey = (d: Design) => `archstory.cost.${d.id}`
export const designInputs = (d: Design): EstimateInputs => cleanInputs({ ...DEFAULT_INPUTS, ...d.requirements.estimate })
export const designCost = (d: Design, base: CostInputs = DEFAULT_COST): CostInputs => cleanCost({ ...base, ...pick(d.requirements.estimate ?? {}, COST_SHAPE) })
export const loadInputs = (d: Design) => savedOr(store.get(estimateKey(d), null), cleanInputs, DEFAULT_INPUTS, () => designInputs(d))
export const loadCost = (d: Design) => savedOr(store.get(costKey(d), null), cleanCost, DEFAULT_COST, () => designCost(d))
