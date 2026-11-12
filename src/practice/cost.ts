// A rough monthly cloud bill from the capacity estimate, with the arithmetic shown, and the usual ways to cut it.
// Unit prices are round, typical on-demand list prices for US regions, as of late 2026. They are approximations, not
// quotes: the point is the shape of the bill, so every price is an editable input.
import type { Cloud } from '../model/kinds'
import { bytes, capacity, count, type EstimateInputs, type EstimateLine } from './estimate'

export interface CostInputs {
  /** $ per instance-hour, general purpose 2 vCPU / 8 GB. */
  computePrice: number
  /** $ per instance-hour, database node (about 4 vCPU / 32 GB, managed). */
  dbPrice: number
  /** $ per GB-month, managed database storage. */
  dbStoragePrice: number
  /** Percent of the stored data that lives in object storage rather than the database. */
  objectPercent: number
  /** $ per GB-month, object storage standard tier. */
  objectPrice: number
  /** $ per GB-hour, managed Redis memory. */
  cachePrice: number
  /** $ per GB, internet egress, first tier. */
  egressPrice: number
  /** Percent of egress served from a CDN. */
  cdnPercent: number
  /** $ per GB, CDN egress. */
  cdnPrice: number
  /** Percent of egress a CDN could serve (cacheable content), for the offload lever. */
  cdnPotential: number
  /** Percent off compute for a one to three year commitment. */
  commitDiscount: number
  /** Percent of compute that is stateless, interruptible workers. */
  spotPercent: number
  /** Percent off for spot or preemptible instances. */
  spotDiscount: number
  /** Move object data older than this many days to a cheaper tier. */
  tierDays: number
  /** $ per GB-month, infrequent access tier. */
  tierPrice: number
  /** $ per GB, traffic between availability zones (about $0.01 each way). */
  crossZonePrice: number
  /** $ per GB, traffic between regions. */
  crossRegionPrice: number
  /** $ per hour, one load balancer or API gateway. */
  lbHourPrice: number
  /** $ per GB processed by a load balancer. */
  lbGbPrice: number
  /** $ per hour, one NAT gateway. */
  natHourPrice: number
  /** $ per GB through a NAT gateway. */
  natGbPrice: number
  /** Bytes logged per request. */
  logBytes: number
  /** $ per GB of logs ingested. */
  logPrice: number
  /** GB per month leaving private subnets through NAT. Unset means the design's own guess (see DesignShape). */
  natGb?: number
}

export const DEFAULT_COST: CostInputs = {
  computePrice: 0.09, dbPrice: 0.35, dbStoragePrice: 0.12, objectPercent: 50, objectPrice: 0.023, cachePrice: 0.02,
  egressPrice: 0.09, cdnPercent: 0, cdnPrice: 0.03, cdnPotential: 60, commitDiscount: 35, spotPercent: 30, spotDiscount: 65,
  tierDays: 90, tierPrice: 0.0125,
  crossZonePrice: 0.02, crossRegionPrice: 0.02, lbHourPrice: 0.025, lbGbPrice: 0.008, natHourPrice: 0.045, natGbPrice: 0.045,
  logBytes: 500, logPrice: 0.5,
}

/** What the cost needs to know about the design itself, apart from the capacity numbers. */
export interface DesignShape { regions: number; balancers: number; zones: number; thirdParty: boolean }
const BALANCERS = ['load_balancer', 'network_load_balancer', 'api_gateway']
const THIRD_PARTY = ['external_api', 'payment_provider', 'notification_provider', 'llm']
export const NO_SHAPE: DesignShape = { regions: 1, balancers: 0, zones: 1, thirdParty: false }
export function designShape(d: { nodes: { kind: string }[]; network?: { zones: number }; regions?: { regions: unknown[] } }): DesignShape {
  return {
    regions: d.regions?.regions.length ?? 1, zones: d.network?.zones ?? 1,
    balancers: d.nodes.filter(n => BALANCERS.includes(n.kind)).length, thirdParty: d.nodes.some(n => THIRD_PARTY.includes(n.kind)),
  }
}

export interface Lever { id: string; label: string; saving: number; why: string }

const HOURS = 730
const GB = 1e9
const pct = (n: number) => Math.min(100, n)
/** Dollars to two significant figures: $3.4K, $120, $0.5. */
export const money = (n: number) => (Number.isFinite(n) ? `$${count(n)}` : '?')
const price = (n: number) => `$${n}`

/** Product names for the levers, per cloud. Neutral wording for anything else. */
const WORDS = {
  commit: { neutral: 'Commit to the steady baseline', aws: 'Savings Plans or Reserved Instances for the baseline', gcp: 'Committed use discounts for the baseline' },
  spot: { neutral: 'Spot or preemptible capacity for workers', aws: 'Spot Instances for workers', gcp: 'Spot VMs for workers' },
  tier: { aws: 'S3 Intelligent-Tiering or Standard-IA', gcp: 'Autoclass or Nearline' },
  cdn: { neutral: 'a CDN', aws: 'CloudFront (a CDN)', gcp: 'Cloud CDN' },
  size: { neutral: '', aws: 'EC2 Auto Scaling or ECS service auto scaling', gcp: 'managed instance group autoscaling or Cloud Run' },
  replica: { neutral: 'read replica', aws: 'Aurora or RDS read replica', gcp: 'Cloud SQL read replica' },
}
const word = <K extends keyof typeof WORDS>(k: K, cloud: Cloud): string => {
  const w = WORDS[k] as Record<string, string>
  return cloud === 'aws' || cloud === 'gcp' ? w[cloud] : w.neutral
}

export function cost(e: EstimateInputs, c: CostInputs, cloud: Cloud = 'neutral', shape: DesignShape = NO_SHAPE) {
  const k = capacity(e)
  const nodes = Math.max(1, e.replicas), replicas = nodes - 1
  const objShare = pct(c.objectPercent) / 100, cdnShare = pct(c.cdnPercent) / 100
  const objGb = k.storeOne * objShare / GB                  // object stores keep their own copies, so one logical copy
  const dbGb = k.storeOne * (1 - objShare) * e.replicas / GB
  const cacheGb = k.cache / GB, egressGb = k.egressMonth / GB
  const instances = Number.isFinite(k.instances) ? k.instances : 0
  const baseline = Math.min(instances, Math.max(1, Math.ceil(instances / e.peakFactor)))

  const compute = instances * HOURS * c.computePrice
  const db = nodes * HOURS * c.dbPrice
  const dbStore = dbGb * c.dbStoragePrice
  const object = objGb * c.objectPrice
  const cache = cacheGb * HOURS * c.cachePrice
  const cdnGb = egressGb * cdnShare, directGb = egressGb - cdnGb
  const egress = directGb * c.egressPrice + cdnGb * c.cdnPrice

  const lines: EstimateLine[] = [
    { id: 'compute', label: 'Compute', value: money(compute), formula: `${instances} instances × ${HOURS} h × ${price(c.computePrice)}/h` },
    { id: 'db', label: 'Database nodes', value: money(db), formula: `1 primary + ${replicas} ${replicas === 1 ? 'replica' : 'replicas'} = ${nodes} × ${HOURS} h × ${price(c.dbPrice)}/h` },
    { id: 'db-storage', label: 'Database storage', value: money(dbStore), formula: `${count(dbGb)} GB (${100 - pct(c.objectPercent)}% of the data, ${e.replicas} copies) × ${price(c.dbStoragePrice)}/GB-month` },
    { id: 'object', label: 'Object storage', value: money(object), formula: `${count(objGb)} GB (${pct(c.objectPercent)}% of the data, one copy) × ${price(c.objectPrice)}/GB-month` },
    { id: 'cache', label: 'Cache', value: money(cache), formula: `${count(cacheGb)} GB × ${HOURS} h × ${price(c.cachePrice)}/GB-hour` },
    { id: 'egress', label: 'Data transfer out', value: money(egress), formula: `${count(directGb)} GB × ${price(c.egressPrice)}/GB` + (cdnGb > 0 ? ` + ${count(cdnGb)} GB via CDN × ${price(c.cdnPrice)}/GB` : '') },
  ]
  const total = compute + db + dbStore + object + cache + egress
  lines.push({ id: 'total', label: 'Monthly total', value: money(total), formula: 'sum of the lines above' })

  // Often missed: charges that rarely make it into a first estimate.
  const writeGb = k.storeDay * 30 / GB, ingressGb = writeGb
  const natGb = c.natGb ?? (shape.thirdParty ? egressGb * 0.05 : 0)
  const zones = Math.max(1, shape.zones)
  const lbs = k.perDay > 0 ? Math.max(1, shape.balancers) : shape.balancers
  const lbGb = ingressGb + egressGb * (1 - c.cdnPercent / 100)   // traffic the CDN serves never reaches the load balancer
  const requestsDay = k.perDay * (1 + e.readsPerWrite)
  const logGb = requestsDay * c.logBytes * 30 / GB
  const parts = {
    crossZone: replicas > 0 ? writeGb * replicas * c.crossZonePrice : 0,
    crossRegion: shape.regions > 1 ? writeGb * (shape.regions - 1) * c.crossRegionPrice : 0,
    lb: lbs * HOURS * c.lbHourPrice + lbGb * c.lbGbPrice,
    nat: zones * HOURS * c.natHourPrice + natGb * c.natGbPrice,
    logs: logGb * c.logPrice,
  }
  const missed: EstimateLine[] = []
  if (replicas > 0) missed.push({ id: 'cross-zone', label: 'Cross-zone traffic', value: money(parts.crossZone),
    formula: `${count(writeGb / 30)} GB a day of new data × ${replicas} extra ${replicas === 1 ? 'copy' : 'copies'} × 30 days × ${price(c.crossZonePrice)}/GB` })
  if (shape.regions > 1) missed.push({ id: 'cross-region', label: 'Cross-region replication', value: money(parts.crossRegion),
    formula: `${count(writeGb)} GB a month of new data × ${shape.regions - 1} other ${shape.regions === 2 ? 'region' : 'regions'} × ${price(c.crossRegionPrice)}/GB` })
  missed.push({ id: 'lb', label: 'Load balancers', value: money(parts.lb),
    formula: `${lbs} × ${HOURS} h × ${price(c.lbHourPrice)}/h + ${count(lbGb)} GB in and out${c.cdnPercent ? ` (not the ${c.cdnPercent}% the CDN serves)` : ''} × ${price(c.lbGbPrice)}/GB` })
  missed.push({ id: 'nat', label: 'NAT gateway', value: money(parts.nat),
    formula: `${zones} × ${HOURS} h × ${price(c.natHourPrice)}/h + ${count(natGb)} GB × ${price(c.natGbPrice)}/GB` })
  missed.push({ id: 'logs', label: 'Logs', value: money(parts.logs),
    formula: `${count(requestsDay)} requests a day × ${bytes(c.logBytes)} × 30 days = ${count(logGb)} GB × ${price(c.logPrice)}/GB ingested` })
  const missedTotal = parts.crossZone + parts.crossRegion + parts.lb + parts.nat + parts.logs
  const grand = total + missedTotal

  // Levers overlap (a smaller fleet shrinks the commitment), so the savings are not meant to be added up.
  const levers: Lever[] = []
  if (instances > 0) {
    levers.push({ id: 'commit', label: word('commit', cloud), saving: baseline * HOURS * c.computePrice * c.commitDiscount / 100,
      why: `${baseline} instances run all month (peak ÷ ${e.peakFactor}), so ${c.commitDiscount}% off for a one to three year term.` })
    levers.push({ id: 'spot', label: word('spot', cloud), saving: compute * c.spotPercent / 100 * c.spotDiscount / 100,
      why: `${c.spotPercent}% of compute as stateless workers at ${c.spotDiscount}% off. Suits interruptible work that can retry, not the database or request path.` })
    const sized = Math.min(instances, Math.ceil(baseline * 1.3))
    levers.push({ id: 'rightsize', label: 'Right-size with autoscaling', saving: (instances - sized) * HOURS * c.computePrice,
      why: `A fixed fleet for peak is ${instances} instances; scaling to average plus 30% headroom is about ${sized}. Peak factor ${e.peakFactor} is what idle capacity costs. ${cloud === 'aws' || cloud === 'gcp' ? `Use ${word('size', cloud)}.` : ''}`.trim() })
  }
  const old = Math.max(0, 1 - c.tierDays / (e.years * 365))
  levers.push({ id: 'tier', label: cloud === 'aws' || cloud === 'gcp' ? `${word('tier', cloud)} after ${c.tierDays} days` : `Tier data older than ${c.tierDays} days`, saving: objGb * old * (c.objectPrice - c.tierPrice),
    why: `At steady growth ${Math.round(old * 100)}% of object data is that old. Infrequent access is ${price(c.tierPrice)}/GB-month, and archive tiers go lower with slower retrieval.` })
  const offload = Math.max(0, pct(c.cdnPotential) / 100 - cdnShare)
  levers.push({ id: 'cdn', label: `Serve cacheable egress from ${word('cdn', cloud)}`, saving: egressGb * offload * (c.egressPrice - c.cdnPrice),
    why: `Moves ${Math.round(offload * 100)}% of egress to ${price(c.cdnPrice)}/GB from ${price(c.egressPrice)}/GB, and cache hits stop reaching your servers.` })
  if (replicas > 0) levers.push({ id: 'replica', label: `One fewer ${word('replica', cloud)}`, saving: HOURS * c.dbPrice,
    why: `Drops one of ${replicas}. Only if the cache absorbs reads and the rest still cover peak reads and failover.` })
  return { lines, total, missed, missedTotal, grand, natGb, levers }
}

/** The working as plain text, for the learner's notes. */
export const costText = (r: ReturnType<typeof cost>) =>
  [...r.lines.map(l => `${l.label}: ${l.value} (${l.formula})`), `Often missed (${money(r.missedTotal)}, not in the total above; with them: ${money(r.grand)}):`,
    ...r.missed.map(l => `${l.label}: ${l.value} (${l.formula})`), 'Ways to cut it:', ...r.levers.map(l => `${l.label}: saves ${money(l.saving)}/month (${l.why})`)].join('\n')

/** Keep only sane numbers from stored or typed input. */
export function cleanCost(raw: unknown): CostInputs {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const out: CostInputs = { ...DEFAULT_COST }
  for (const k of Object.keys(DEFAULT_COST) as Exclude<keyof CostInputs, 'natGb'>[]) {
    const v = r[k]
    if (typeof v === 'number' && Number.isFinite(v) && v >= 0) out[k] = v
  }
  if (typeof r.natGb === 'number' && Number.isFinite(r.natGb) && r.natGb >= 0) out.natGb = r.natGb
  return out
}
