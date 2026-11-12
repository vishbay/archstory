// Zone-level availability: where each component's instances live, and what a zone outage does to them.
import { isOnPrem, type Design, type DNode, type HAMode } from './schema'
import { tierOf, type Cloud } from './kinds'
import { subnetFor } from './network'

export type Role = 'active' | 'primary' | 'standby' | 'single' | 'regional'
export interface Placement { zone: number; role: Role }

const KIND_HA: Record<string, HAMode> = { sql_db: 'primary-standby', cache: 'primary-standby' }
const OFF_NETWORK = new Set(['client', 'edge', 'external'])

export const zoneName = (i: number, cloud: Cloud) => {
  const l = 'abcdef'[i]
  return cloud === 'aws' ? `AZ-${l}` : cloud === 'gcp' ? `zone-${l}` : `Zone ${l.toUpperCase()}`
}

/** null when the node isn't zonal at all (clients, edge, third parties, your own data centre) or the design has no network. */
export function haOf(d: Design, n: DNode): HAMode | null {
  if (!d.network || OFF_NETWORK.has(tierOf(n)) || isOnPrem(n)) return null
  if (n.ha) return n.ha
  if (!subnetFor(d, n)) return 'regional'
  return KIND_HA[n.kind] ?? 'active-active'
}

/** Which zones run an instance of this node and in what role. Regional services get none: they span every zone. */
export function placementsOf(d: Design, n: DNode): Placement[] {
  const ha = haOf(d, n), z = d.network?.zones ?? 1
  switch (ha) {
    case null: case 'regional': return []
    case 'single': return [{ zone: 0, role: 'single' }]
    case 'primary-standby': return z > 1 ? [{ zone: 0, role: 'primary' }, { zone: 1, role: 'standby' }] : [{ zone: 0, role: 'primary' }]
    default: return Array.from({ length: Math.min(n.zones ?? z, z) }, (_, zone) => ({ zone, role: 'active' as const }))
  }
}

export const ON_PREM_TEXT = 'In your own data centre: not covered by cloud zones.'

export function zoneBadge(d: Design, n: DNode, cloud: Cloud): string | null {
  if (d.network && isOnPrem(n)) return 'on-prem'
  const ha = haOf(d, n)
  if (!ha) return null
  if (ha === 'regional') return 'regional'
  const k = placementsOf(d, n).length
  const unit = cloud === 'aws' ? (k === 1 ? 'AZ' : 'AZs') : k === 1 ? 'zone' : 'zones'
  return ha === 'primary-standby' && k > 1 ? `primary + standby` : ha === 'single' ? `1 ${unit} only` : `${k} ${unit}`
}

/** On the synchronous request path of any flow (as opposed to only async background work). */
export const onRequestPath = (d: Design, id: string) =>
  d.flows.some(f => f.steps.some(s => s.kind !== 'async' && (s.from === id || s.to === id)))

const failover = (n: DNode) => n.kind === 'cache'
  ? { rto: 'a few seconds', rpo: 'writes not yet replicated are lost (async replication)' }
  : { rto: '~30–60 s', rpo: 'no committed data lost (synchronous standby)' }

export type Level = 'ok' | 'warn' | 'down'
export interface Impact { level: Level; tag: string; text: string }

export function impactOf(d: Design, n: DNode, failed: number, cloud: Cloud): Impact | null {
  if (d.network && isOnPrem(n)) return { level: 'ok', tag: 'on-prem', text: `${ON_PREM_TEXT} Losing a cloud zone does not touch it.` }
  const ha = haOf(d, n)
  if (!ha) return null
  if (ha === 'regional') return { level: 'ok', tag: 'unaffected', text: 'Regional managed service: the provider already spreads it across zones.' }
  const ps = placementsOf(d, n), zone = zoneName(failed, cloud)
  const hit = ps.find(p => p.zone === failed)
  if (!hit) return { level: 'ok', tag: 'unaffected', text: `Has no instance in ${zone}.` }
  const background = !onRequestPath(d, n.id)
  const down = (text: string): Impact => background
    ? { level: 'warn', tag: 'down (background)', text: `${text} It is off the request path, so users are unaffected while work backs up.` }
    : { level: 'down', tag: 'DOWN', text }
  switch (ha) {
    case 'single': return down(`Runs only in ${zone}: unavailable until the zone recovers. Single point of failure.`)
    case 'active-active': {
      const left = ps.length - 1
      if (!left) return down(`Its only instance is in ${zone}.`)
      return { level: 'warn', tag: `−1/${ps.length} capacity`, text: `Loses 1 of ${ps.length} zones; the other ${left} absorb all traffic, so each must be sized for 1/${left} of peak.` }
    }
    case 'quorum': {
      const left = ps.length - 1, need = Math.floor(ps.length / 2) + 1
      return left >= need
        ? { level: 'ok', tag: 'keeps quorum', text: `Keeps a majority (${left} of ${ps.length}) and keeps accepting writes.` }
        : down(`Loses its majority (${left} of ${ps.length}) and stops accepting writes.`)
    }
    case 'primary-standby': {
      if (hit.role === 'standby') return { level: 'warn', tag: 'no standby', text: 'Standby lost: the primary keeps serving, but there is no failover target until a new standby is built.' }
      if (ps.length < 2) return down(`Primary in ${zone} has no standby.`)
      const { rto, rpo } = failover(n)
      return { level: 'warn', tag: `failover ${rto}`, text: `Primary lost. The standby in ${zoneName(1, cloud)} is promoted in ${rto}; ${rpo}.` }
    }
  }
}

export interface Resilience {
  zones: number
  perZoneShare: string
  spofs: DNode[]
  /** On-prem components on the request path: not cloud single points of failure, but the data centre is one site. */
  onPrem: DNode[]
  impacts: { node: DNode; impact: Impact }[]
  rto: string
  rpo: string
}

export function resilience(d: Design, failed: number, cloud: Cloud): Resilience | null {
  if (!d.network) return null
  const z = d.network.zones
  const impacts = d.nodes.flatMap(node => { const impact = impactOf(d, node, failed, cloud); return impact ? [{ node, impact }] : [] })
  const onPrem = d.nodes.filter(n => isOnPrem(n) && onRequestPath(d, n.id))
  const spofs = d.nodes.filter(n => onRequestPath(d, n.id) && !isOnPrem(n) && (haOf(d, n) === 'single' || (haOf(d, n) !== 'regional' && placementsOf(d, n).length === 1)))
  const failing = impacts.filter(i => i.impact.level === 'down')
  const failovers = impacts.filter(i => i.impact.tag.startsWith('failover') && onRequestPath(d, i.node.id))
  const rto = failing.length ? 'until the zone recovers (a single-zone component is on the request path)'
    : failovers.some(f => f.node.kind !== 'cache') ? '~30–60 s for writes that need the database primary; reads keep working'
    : failovers.length ? 'a few seconds' : 'none: traffic shifts to healthy zones'
  const rpo = failovers.some(f => f.node.kind === 'cache') ? 'cache may lose recent writes (it is rebuilt from the database)'
    : 'no committed data lost'
  const share = z > 1 ? `${Math.round(100 / (z - 1))}% of peak per zone (${Math.round(100 * z / (z - 1))}% total)` : 'n/a with one zone'
  return { zones: z, perZoneShare: share, spofs, onPrem, impacts, rto, rpo }
}
