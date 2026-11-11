// Back-of-the-envelope capacity estimates, with the arithmetic shown, the way it is done in an interview.
// Decimal units throughout (1 KB = 1,000 bytes) and a 30-day month, which is what interviewers expect.

export interface EstimateInputs {
  /** Work out daily writes from users, or take a stated volume. */
  source: 'users' | 'volume'
  dau: number; writesPerUser: number
  volume: number; volumeUnit: 'second' | 'day' | 'month'
  readsPerWrite: number
  peakFactor: number
  writeBytes: number; readBytes: number
  years: number; replicas: number
  /** Percent of a day's read traffic worth keeping in cache (the 80/20 rule suggests 20). */
  cachePercent: number
  /** Requests per second one instance can serve. */
  perInstance: number
}

export const DEFAULT_INPUTS: EstimateInputs = {
  source: 'users', dau: 10_000_000, writesPerUser: 1, volume: 100_000_000, volumeUnit: 'month',
  readsPerWrite: 10, peakFactor: 3, writeBytes: 500, readBytes: 500, years: 5, replicas: 3, cachePercent: 20, perInstance: 1000,
}

export interface EstimateLine { id: string; label: string; value: string; formula: string }
const DAY = 86_400
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

/** Two significant figures, which is all an estimate deserves. */
const sig2 = (n: number) => (n === 0 ? 0 : Number(n.toPrecision(2)))
function scaled(n: number, units: [number, string][], sep: string, base: string): string {
  if (!Number.isFinite(n)) return '?'
  const r = sig2(n)                                     // round first, so 999 becomes 1K and not "1000"
  for (const [v, u] of units) if (Math.abs(r) >= v) return `${sig2(r / v)}${sep}${u}`
  return `${r}${base}`
}
/** 1.2K, 3.4M, 1.1B */
export const count = (n: number) => scaled(n, [[1e12, 'T'], [1e9, 'B'], [1e6, 'M'], [1e3, 'K']], '', '')
/** Decimal units: 1 KB = 1,000 bytes. */
export const bytes = (n: number) => scaled(n, [[1e18, 'EB'], [1e15, 'PB'], [1e12, 'TB'], [1e9, 'GB'], [1e6, 'MB'], [1e3, 'KB']], ' ', ' B')

/** The raw numbers behind the lines, for anything built on top of them (see cost.ts). */
export function capacity(i: EstimateInputs) {
  const perDay = i.source === 'users' ? i.dau * i.writesPerUser
    : i.volumeUnit === 'second' ? i.volume * DAY : i.volumeUnit === 'month' ? i.volume / 30 : i.volume
  const wQps = perDay / DAY, rQps = wQps * i.readsPerWrite
  const storeDay = perDay * i.writeBytes, storeYear = storeDay * 365, storeOne = storeYear * i.years, storeAll = storeOne * i.replicas
  const readsDay = perDay * i.readsPerWrite
  const cache = readsDay * i.readBytes * (i.cachePercent / 100)
  const peakTotal = (wQps + rQps) * i.peakFactor
  const instances = i.perInstance > 0 ? Math.ceil(peakTotal / i.perInstance) : NaN
  return { perDay, wQps, rQps, storeDay, storeYear, storeOne, storeAll, readsDay, cache, peakTotal, instances, egressMonth: readsDay * i.readBytes * 30 }
}

export function estimate(i: EstimateInputs): EstimateLine[] {
  const { perDay, wQps, rQps, storeDay, storeYear, storeAll, readsDay, cache, peakTotal, instances } = capacity(i)

  const source = i.source === 'users'
    ? `${count(i.dau)} daily users × ${plural(i.writesPerUser, 'write')} each`
    : i.volumeUnit === 'day' ? `${count(i.volume)} per day as given`
      : i.volumeUnit === 'month' ? `${count(i.volume)} per month ÷ 30 days` : `${count(i.volume)} per second × 86,400 s`
  return [
    { id: 'writes-day', label: 'Writes per day', value: count(perDay), formula: source },
    { id: 'write-qps', label: 'Write rate', value: `${count(wQps)}/s avg, ${count(wQps * i.peakFactor)}/s peak`, formula: `${count(perDay)} ÷ 86,400 s, peak × ${i.peakFactor}` },
    { id: 'read-qps', label: 'Read rate', value: `${count(rQps)}/s avg, ${count(rQps * i.peakFactor)}/s peak`, formula: `write rate × ${i.readsPerWrite} reads per write` },
    { id: 'storage-day', label: 'New data per day', value: bytes(storeDay), formula: `${count(perDay)} writes × ${bytes(i.writeBytes)}` },
    { id: 'storage-year', label: 'New data per year', value: bytes(storeYear), formula: `per day × 365` },
    { id: 'storage-total', label: `Storage after ${plural(i.years, 'year')}`, value: bytes(storeAll), formula: `per year × ${plural(i.years, 'year')} × ${plural(i.replicas, 'copy', 'copies')}` },
    { id: 'bw-in', label: 'Bandwidth in', value: `${bytes(wQps * i.writeBytes)}/s`, formula: `${count(wQps)} writes/s × ${bytes(i.writeBytes)}` },
    { id: 'bw-out', label: 'Bandwidth out', value: `${bytes(rQps * i.readBytes)}/s`, formula: `${count(rQps)} reads/s × ${bytes(i.readBytes)}` },
    { id: 'cache', label: 'Cache size', value: bytes(cache), formula: `${i.cachePercent}% of a day's reads (${count(readsDay)} × ${bytes(i.readBytes)})` },
    { id: 'instances', label: 'Service instances at peak', value: Number.isFinite(instances) ? String(instances) : '?', formula: `${count(peakTotal)} requests/s at peak ÷ ${count(i.perInstance)} per instance, before headroom` },
  ]
}

/** The working as plain text, for the learner's notes. */
export const estimateText = (lines: EstimateLine[]) => lines.map(l => `${l.label}: ${l.value} (${l.formula})`).join('\n')

/** Keep only sane numbers from stored or typed input. */
export function cleanInputs(raw: unknown): EstimateInputs {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const out = { ...DEFAULT_INPUTS }
  for (const k of Object.keys(DEFAULT_INPUTS) as (keyof EstimateInputs)[]) {
    const v = r[k], d = DEFAULT_INPUTS[k]
    if (typeof d === 'number' && typeof v === 'number' && Number.isFinite(v) && v >= 0) (out[k] as number) = v
  }
  if (r.source === 'users' || r.source === 'volume') out.source = r.source
  if (r.volumeUnit === 'second' || r.volumeUnit === 'day' || r.volumeUnit === 'month') out.volumeUnit = r.volumeUnit
  return out
}

/** Read "10M", "1.5B", "250k", "2 KB" or "1,000". For sizes a bare "B" means bytes; for counts it means billions. */
export function parseAmount(text: string, kind: 'count' | 'bytes'): number | null {
  const m = text.trim().replace(/,/g, '').match(/^(\d+(?:\.\d+)?|\.\d+)\s*([a-z]*)$/i)
  if (!m) return null
  const unit = m[2].toLowerCase()
  const table: Record<string, number> = kind === 'bytes'
    ? { '': 1, b: 1, k: 1e3, kb: 1e3, m: 1e6, mb: 1e6, g: 1e9, gb: 1e9, t: 1e12, tb: 1e12, p: 1e15, pb: 1e15 }
    : { '': 1, k: 1e3, m: 1e6, b: 1e9, bn: 1e9, t: 1e12 }
  return unit in table ? Number(m[1]) * table[unit] : null
}
