// Region-level disaster recovery: where each component runs across regions, and what losing a whole region does.
// The zone drill (availability.ts) asks "can we survive a data centre"; this one asks "can we survive a region".
import { isOnPrem, type Design, type DNode, type Footprint, type Region, type Replication } from './schema'
import { tierOf } from './kinds'
import { onRequestPath, type Impact, type Role } from './availability'

const NOT_OURS = new Set(['client', 'external'])
const STORE_KINDS = new Set(['queue', 'stream', 'analytics'])
// Rebuilt from a database, so losing one loses no data, only warmth.
const DERIVED = new Set(['cache', 'db_replica'])

export const STRATEGY_TEXT = {
  'backup-restore': 'Backup and restore', 'pilot-light': 'Pilot light', 'warm-standby': 'Warm standby', 'active-active': 'Active-active',
} as const
// How long each strategy usually takes to recover, and the shortest it can realistically manage (seconds).
const TYPICAL = {
  'backup-restore': { text: 'hours: restore the data from backups, then deploy and scale the whole stack', words: 'hours', min: 3600 },
  'pilot-light': { text: 'tens of minutes: promote the replicated databases, then start and scale the compute', words: 'tens of minutes', min: 600 },
  'warm-standby': { text: 'minutes: promote the databases and scale the running standby to full size', words: 'minutes', min: 60 },
  'active-active': { text: 'near zero: health checks stop routing users to the region and only requests in flight fail', words: 'near zero', min: 0 },
} as const

export const isStore = (n: DNode) => n.replication !== undefined || tierOf(n) === 'data' || STORE_KINDS.has(n.kind)
const derived = (n: DNode) => DERIVED.has(n.kind)
/** A data store whose contents would be lost (not a cache or read replica rebuilt from one). */
export const holdsData = (n: DNode) => isStore(n) && !derived(n)

/** null when the design has no regions section, for clients and third parties (not ours to place), and for on-prem components. */
export function footprintOf(d: Design, n: DNode): Footprint | null {
  if (!d.regions || NOT_OURS.has(tierOf(n)) || isOnPrem(n)) return null
  return n.regions ?? (tierOf(n) === 'edge' ? 'global' : 'all')
}

/** How a data store's contents reach other regions; null for anything that is not a data store. */
export function replicationOf(d: Design, n: DNode): Replication | null {
  if (!d.regions || !isStore(n) || isOnPrem(n)) return null
  return n.replication ?? (derived(n) ? 'none' : d.regions.strategy === 'backup-restore' ? 'backup' : 'async')
}

/** The region that normally serves: the primary, or the first one in active-active. */
export const homeRegion = (d: Design) => Math.max(0, d.regions?.regions.findIndex(r => r.role === 'primary') ?? 0)
const activeActive = (d: Design) => d.regions?.strategy === 'active-active'
/** Does losing this region take serving capacity away (rather than only the DR copy)? */
export const serves = (d: Design, i: number) => activeActive(d) || i === homeRegion(d)
/** The region promoted when the primary is lost: the first other region. */
export const takeoverRegion = (d: Design, failed: number) =>
  activeActive(d) || failed !== homeRegion(d) ? null : d.regions!.regions.findIndex((_, i) => i !== failed)

/** Seconds in "15 min", "30 s", "4 h", "0" or "near zero"; null when it cannot be read. */
export function parseDuration(text: string): number | null {
  const t = text.trim().toLowerCase().replace(/^(<|~|under|about|up to)\s*/, '')
  if (/^(0|zero|near zero|none)$/.test(t)) return 0
  const m = t.match(/^(\d+(?:\.\d+)?)\s*(ms|s|secs?|seconds?|m|mins?|minutes?|h|hrs?|hours?|d|days?)$/)
  if (!m) return null
  const unit = m[2][0] === 'm' && m[2] !== 'ms' ? 60 : m[2] === 'ms' ? 0.001 : m[2][0] === 'h' ? 3600 : m[2][0] === 'd' ? 86400 : 1
  return Number(m[1]) * unit
}

type Tag = { text: string; level?: Impact['level'] | 'role' }
export interface RegionPlacement { zone: number; role: Role | 'promoted'; tag?: Tag }

const STANDBY_TAG = { 'warm-standby': 'scaled down', 'pilot-light': 'off (pilot light)', 'backup-restore': 'not deployed' } as const
const REPLICA_TAG: Record<Replication, string> = { sync: 'sync replica', async: 'async replica', backup: 'backups only', none: 'no copy' }

/** Which regions run a copy of this node and in what role; empty for global services. */
export function regionPlacements(d: Design, n: DNode, failed: number | null): RegionPlacement[] {
  const fp = footprintOf(d, n), h = homeRegion(d)
  if (!fp || fp === 'global') return []
  if (fp === 'primary') return [{ zone: h, role: 'single', tag: { text: 'primary region only', level: 'down' } }]
  const store = isStore(n), rep = replicationOf(d, n)
  const impact = failed === null ? null : regionImpactOf(d, n, failed)
  const t = failed === null ? null : takeoverRegion(d, failed)
  return d.regions!.regions.map((_, zone): RegionPlacement => {
    if (activeActive(d)) return { zone, role: 'active', ...(impact && zone !== failed && { tag: { text: impact.tag, level: impact.level } }) }
    if (zone === h) return { zone, role: store ? 'primary' : 'active' }
    if (zone === t) return { zone, role: 'promoted', tag: { text: impact!.tag, level: impact!.level } }
    const strategy = d.regions!.strategy as keyof typeof STANDBY_TAG
    return { zone, role: 'standby', tag: { text: store ? (derived(n) && rep === 'none' ? 'starts cold' : REPLICA_TAG[rep!]) : STANDBY_TAG[strategy], level: 'role' } }
  })
}

/** What losing region `failed` does to one component. null for clients and third parties. */
export function regionImpactOf(d: Design, n: DNode, failed: number): Impact | null {
  if (d.regions && isOnPrem(n)) return { level: 'ok', tag: 'on-prem', text: 'In your own data centre: not in any cloud region, so losing one does not touch it. It is reached over the hybrid link.' }
  const fp = footprintOf(d, n)
  if (!fp) return null
  const R = d.regions!, lost = R.regions[failed].name, h = homeRegion(d), home = R.regions[h].name
  const store = isStore(n), rep = replicationOf(d, n), keeps = store && !derived(n)
  const noCopy = `Has no copy outside ${lost}: its data is unavailable until the region returns, and lost for good if the region's storage is.`
  const background = !onRequestPath(d, n.id)
  const down = (tag: string, text: string): Impact => background && !keeps
    ? { level: 'warn', tag: `${tag} (background)`, text: `${text} It is off the request path, so users are unaffected while work backs up.` }
    : { level: 'down', tag, text }

  if (fp === 'global') {
    if (store && rep === 'async') return { level: 'warn', tag: 'may lose last writes', text: `Globally replicated store: other regions keep serving, but writes ${lost} accepted that had not replicated yet are lost or held until it returns.` }
    if (store) return { level: 'ok', tag: 'global', text: 'Globally replicated store: keeps serving from the other regions.' }
    return { level: 'ok', tag: 'global', text: n.kind === 'dns'
      ? 'Global DNS: keeps answering and, with health checks, points users at the surviving region.'
      : 'Global service outside any one region: keeps serving and sends traffic to the surviving regions.' }
  }
  if (fp === 'primary') {
    if (failed !== h) return { level: 'ok', tag: 'unaffected', text: `Runs only in ${home}, which is still up.` }
    return keeps ? { level: 'down', tag: 'data lost', text: noCopy } : down('DOWN', `Runs only in ${home}: nothing can take its place until it is deployed in another region.`)
  }

  if (activeActive(d)) {
    const k = R.regions.length - 1, others = k === 1 ? 'other region' : `other ${k} regions`
    if (!store) return { level: 'warn', tag: 'takes over', text: `${lost}'s users move to the ${others}, so each needs headroom for ${k === 1 ? 'all' : `1/${k} more`} of that traffic, or must scale out fast.` }
    if (derived(n)) return { level: 'ok', tag: 'unaffected', text: 'Each region has its own copy, rebuilt from the database.' }
    switch (rep!) {
      case 'sync': return { level: 'ok', tag: 'no data lost', text: 'Every write committed in at least two regions, so the survivors have all of it. The price: each write waited for a cross-region round trip.' }
      case 'async': return { level: 'warn', tag: 'loses the lag', text: `Writes ${lost} accepted that had not replicated yet (the replication lag, usually under a second to a few seconds) are lost, or must be reconciled when it returns.` }
      case 'backup': return { level: 'warn', tag: 'loses since backup', text: `The other regions only have ${lost}'s writes up to its last cross-region backup.` }
      case 'none': return { level: 'down', tag: 'data lost', text: noCopy }
    }
  }

  if (failed !== h) return store && rep !== 'none' && !derived(n)
    ? { level: 'warn', tag: 'no DR copy', text: `Its copy in ${lost} is gone: the primary keeps serving, but there is nowhere to fail over until it is rebuilt.` }
    : { level: 'ok', tag: 'unaffected', text: `Keeps serving from ${home}; ${keeps ? `it had no copy in ${lost}` : `only its standby in ${lost} is lost`}.` }
  const to = R.regions[takeoverRegion(d, failed)!].name
  if (!store) switch (R.strategy) {
    case 'warm-standby': return { level: 'warn', tag: 'scale up', text: `Already running at reduced size in ${to}: scale it out to full capacity (minutes).` }
    case 'pilot-light': return { level: 'warn', tag: 'start up', text: `Not running in ${to}: its image and configuration are ready, so start it and scale it out (tens of minutes).` }
    default: return down('redeploy', `Nothing runs in ${to}: deploy it from infrastructure as code once the data is restored (hours).`)
  }
  if (derived(n)) return rep === 'none'
    ? { level: 'warn', tag: 'starts cold', text: `Starts empty in ${to} and fills from the database, so expect extra database load and slower reads at first.` }
    : { level: 'warn', tag: 'promoted', text: `Its replica in ${to} is promoted, already warm.` }
  switch (rep!) {
    case 'sync': return { level: 'warn', tag: 'promoted', text: `Its synchronous replica in ${to} is promoted: no committed write is lost. The price was a cross-region round trip on every write.` }
    case 'async': return { level: 'warn', tag: 'promoted', text: `Its asynchronous replica in ${to} is promoted. Writes not yet replicated (the replication lag, usually seconds) are lost; alert on lag so it stays inside the ${R.rpo} RPO.` }
    case 'backup': return { level: 'down', tag: 'restore', text: `Restored in ${to} from the last cross-region backup: everything written since then is lost, and the restore takes longer the more data there is.` }
    case 'none': return { level: 'down', tag: 'data lost', text: noCopy }
  }
}

/** Gaps in the multi-region plan, true whichever region fails, phrased as teaching text. */
export function regionWarnings(d: Design): string[] {
  const R = d.regions
  if (!R) return []
  const out: string[] = []
  const home = R.regions[homeRegion(d)].name, aa = activeActive(d)
  const rto = parseDuration(R.rto), rpo = parseDuration(R.rpo)
  const where = aa ? 'losing a region loses the data that lived only there' : `losing ${home} loses its data`
  for (const n of d.nodes) {
    const fp = footprintOf(d, n), rep = replicationOf(d, n)
    if (isOnPrem(n) && onRequestPath(d, n.id)) out.push(`${n.label} runs in your own data centre, a single site: no cloud region takes over if the data centre or the hybrid link goes down.`)
    if (!fp) continue
    if (isStore(n) && !derived(n)) {
      if (fp === 'primary' || rep === 'none') out.push(`${n.label} has no cross-region replication, so ${where}.`)
      else if (rep === 'async' && rpo === 0) out.push(`${n.label} replicates asynchronously, so a region loss can lose its latest writes, but the RPO is ${R.rpo}. Zero data loss needs synchronous replication, which adds a cross-region round trip to every write.`)
      else if (rep === 'backup' && rpo !== null && rpo < 3600) out.push(`${n.label} only reaches other regions as backups, so a region loss loses everything since the last one, usually more than the ${R.rpo} RPO. Replicate it continuously, or back it up at least that often.`)
      if (aa && rep === 'async' && fp === 'all') out.push(`${n.label} takes writes in every region with asynchronous replication, so two regions can change the same record at once. Give each record one home region for writes, or resolve conflicts (last writer wins silently drops one of the writes).`)
    } else if (!isStore(n) && fp === 'primary' && onRequestPath(d, n.id))
      out.push(`${n.label} runs only in ${home}, so no other region can serve requests until it is deployed there.`)
  }
  const typical = TYPICAL[R.strategy]
  if (rto !== null && typical.min > rto)
    out.push(`${STRATEGY_TEXT[R.strategy]} usually recovers in ${typical.words}, longer than the ${R.rto} RTO. A tighter RTO needs ${R.strategy === 'warm-standby' ? 'active-active' : 'warm standby or active-active'}.`)
  if (R.dnsTtl && rto !== null && R.dnsTtl > rto)
    out.push(`Failover relies on DNS with a ${R.dnsTtl} s TTL, longer than the ${R.rto} RTO: resolvers keep sending users to the failed region until their cached answer expires. Lower the TTL, or use a global load balancer with anycast IPs that fails over without a DNS change.`)
  return out
}

export interface RegionDrill {
  region: Region
  /** Regions serving once it is gone, and the one promoted (null when nothing needs promoting). */
  survivors: Region[]; promoted: Region | null
  rto: string; rpo: string; capacity: string
  impacts: { node: DNode; impact: Impact }[]
  warnings: string[]
}

export function regionDrill(d: Design, failed: number): RegionDrill | null {
  const R = d.regions
  if (!R) return null
  const t = takeoverRegion(d, failed), aa = activeActive(d)
  const impacts = d.nodes.flatMap(node => { const impact = regionImpactOf(d, node, failed); return impact ? [{ node, impact }] : [] })
  const survivors = R.regions.filter((_, i) => i !== failed && (aa || i === (t ?? homeRegion(d))))
  const ttl = R.dnsTtl ? `, plus up to ${R.dnsTtl} s for cached DNS answers to expire` : ''
  const rto = serves(d, failed) ? `${TYPICAL[R.strategy].text}${ttl} (target ${R.rto})`
    : 'none: the primary keeps serving. Disaster recovery is lost until the region is back.'
  // Worst data loss across the stores that held data in the lost region.
  const stores = d.nodes.filter(n => {
    const fp = footprintOf(d, n)
    return isStore(n) && !derived(n) && !!fp && (fp !== 'global' || replicationOf(d, n) === 'async')
  })
  const lostOnly = stores.filter(n => footprintOf(d, n) === 'primary' ? failed === homeRegion(d) : replicationOf(d, n) === 'none')
  const has = (m: Replication) => stores.some(n => footprintOf(d, n) !== 'primary' && replicationOf(d, n) === m)
  const rpo = !serves(d, failed) && !aa ? 'none: no data lives only in the standby region'
    : `${lostOnly.length ? `everything in ${lostOnly.map(n => n.label).join(', ')}, which ${lostOnly.length > 1 ? 'have' : 'has'} no copy in another region`
      : has('backup') ? 'everything written since the last cross-region backup (typically hours)'
      : has('async') ? 'the replication lag: usually the last seconds of writes'
      : 'none: every committed write is already in another region'} (target ${R.rpo})`
  const n = R.regions.length
  const capacity = aa
    ? `${Math.round(100 / (n - 1))}% of peak per region (${Math.round(100 * n / (n - 1))}% total): the surviving regions must carry peak on their own.`
    : t === null ? `Unchanged: ${R.regions[homeRegion(d)].name} keeps carrying all traffic.`
    : `${R.regions[t].name} must reach 100% of peak: reserve capacity or quota there ahead of time, since all traffic arrives at once.`
  return { region: R.regions[failed], survivors, promoted: t === null ? null : R.regions[t], rto, rpo, capacity, impacts, warnings: regionWarnings(d) }
}
