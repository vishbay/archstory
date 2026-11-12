// Zones view: the VPC split into availability-zone columns with one box per instance.
// Edges and flows are resolved to concrete instances, so cross-zone hops and failover paths become visible.
// The regions view (layout/regions.ts) uses the same columns with one column group per region.
import { isOnPrem, type Design, type DNode, type Flow } from '../model/schema'
import { tierOf } from '../model/kinds'
import { placementsOf, type Level, type Role } from '../model/availability'
import { layoutBands, LABEL_W, NODE_W, type Box, type Layout, type Side } from './bands'

// Instances are drawn compact (icon + name) so three zones of components still fit on screen.
export const ZNODE_W = 136
const CELL = 150
// On-prem components sit in their own box right of everything else, full width, after a gap.
const PREM_CELL = NODE_W + 40, PREM_GAP = 60

export type InstTag = { text: string; level?: Level | 'role' }
export interface Inst { id: string; node: string; zone: number | null; role: Role | 'promoted' | 'outside'; failed: boolean; tag?: InstTag }
export interface ZEdge { id: string; from: string; to: string; cross: boolean; replication?: boolean; async?: boolean; note?: string }
export interface ZoneLayout {
  /** What a column group is: an availability zone or a whole region. */
  unit: 'zone' | 'region'
  pos: Record<string, { x: number; y: number }>
  bands: Layout['bands']; subnets: Layout['subnets']; vpc: Box | null
  zoneBoxes: (Box & { zone: number; label?: string })[]
  /** The box around on-prem components, outside every zone or region. */
  onprem: Box | null
  insts: Inst[]; edges: ZEdge[]
  width: number; height: number
  handles: (from: string, to: string) => [Side, Side]
}

const SERVES = new Set(['active', 'primary', 'promoted', 'single', 'regional', 'outside'])

export type Placed = { zone: number; role: Inst['role']; tag?: InstTag }
export type Replica = { from: string; to: string; async: boolean; note?: string }

export function layoutZones(d: Design, failed: number | null): ZoneLayout {
  const place = (n: DNode): Placed[] => {
    const ps = placementsOf(d, n)
    const primaryFailed = ps.some(p => p.role === 'primary' && p.zone === failed)
    return ps.map(p => ({ zone: p.zone, role: p.role === 'standby' && primaryFailed ? 'promoted' : p.role }))
  }
  const replicas = (n: DNode, insts: Inst[]): Replica[] => {
    const primary = insts.find(i => i.role === 'primary' && !i.failed), standby = insts.find(i => i.role === 'standby')
    return primary && standby ? [{ from: primary.id, to: standby.id, async: n.kind === 'cache' }] : []
  }
  return layoutColumns(d, layoutBands(d, { network: true }), { unit: 'zone', count: d.network?.zones ?? 1, place, replicas, failed, vpc: true })
}

/** Columns of instances, one group of columns per zone (or region), with edges resolved between instances. */
export function layoutColumns(d: Design, base: Layout, o: {
  unit: ZoneLayout['unit']; count: number; failed: number | null; vpc: boolean
  place: (n: DNode) => Placed[]; replicas: (n: DNode, insts: Inst[]) => Replica[]; label?: (zone: number) => string
}): ZoneLayout {
  const { failed } = o, z = o.count
  const placed = new Map(d.nodes.map(n => [n.id, o.place(n)]))
  const zonal = (n: DNode) => !isOnPrem(n) && placed.get(n.id)!.length > 0
  const bandIdx = Object.fromEntries(base.bands.map((b, i) => [b.tier, i]))
  const byBand = base.bands.map(b => d.nodes.filter(n => tierOf(n) === b.tier).sort((a, c) => base.pos[a.id].x - base.pos[c.id].x))
  const W = Math.max(1, ...byBand.map(l => l.filter(zonal).length))
  const cloudOut = (l: DNode[]) => l.filter(n => !zonal(n) && !isOnPrem(n))
  const outIn = (l: DNode[]) => (l.some(zonal) ? cloudOut(l) : [])
  const OUTW = Math.max(0, ...byBand.map(l => outIn(l).length))
  const total = Math.max(z * W + OUTW, ...byBand.map(l => (l.some(zonal) ? 0 : cloudOut(l).length)))
  const cx = (col: number) => LABEL_W + col * CELL + (CELL - ZNODE_W) / 2
  const PREMW = Math.max(0, ...byBand.map(l => l.filter(isOnPrem).length))
  const premX = LABEL_W + total * CELL + PREM_GAP
  const px = (col: number) => premX + 10 + col * PREM_CELL + (PREM_CELL - NODE_W) / 2

  const insts: Inst[] = []
  const pos: ZoneLayout['pos'] = {}
  byBand.forEach(list => {
    const y = base.pos[list[0].id].y
    const inZones = list.filter(zonal), out = cloudOut(list), prem = list.filter(isOnPrem)
    inZones.forEach((n, slot) => {
      for (const p of placed.get(n.id)!) {
        const id = `${n.id}@${p.zone}`
        insts.push({ id, node: n.id, zone: p.zone, role: p.role, failed: p.zone === failed, ...(p.tag && { tag: p.tag }) })
        pos[id] = { x: cx(p.zone * W + (W - inZones.length) / 2 + slot), y }
      }
    })
    const lone = inZones.length === 0
    out.forEach((n, i) => {
      insts.push({ id: n.id, node: n.id, zone: null, role: 'outside', failed: false })
      pos[n.id] = { x: cx(lone ? (total - out.length) / 2 + i : z * W + (OUTW - out.length) / 2 + i), y: base.pos[n.id].y }
    })
    prem.forEach((n, i) => {
      insts.push({ id: n.id, node: n.id, zone: null, role: 'outside', failed: false, tag: { text: 'on-prem', level: 'role' } })
      pos[n.id] = { x: px((PREMW - prem.length) / 2 + i), y: base.pos[n.id].y }
    })
  })

  const instsOf = (node: string) => insts.filter(i => i.node === node && !i.failed && SERVES.has(i.role))
  const serving = (node: string, zone: number | null) => {
    const c = instsOf(node)
    return c.find(i => i.zone === zone) ?? c.sort((a, b) => (a.zone ?? 0) - (b.zone ?? 0))[0] ?? null
  }
  const zoneOf = (id: string) => insts.find(i => i.id === id)?.zone ?? null

  const edges = new Map<string, ZEdge>()
  const add = (from: string, to: string, extra: Partial<ZEdge> = {}) => {
    const a = zoneOf(from), b = zoneOf(to)
    edges.set(`${from}->${to}`, { id: `${from}->${to}`, from, to, cross: a !== null && b !== null && a !== b, ...extra })
  }
  for (const e of d.edges) {
    const fromOut = !d.nodes.some(n => n.id === e.from && zonal(n))
    if (fromOut) for (const b of instsOf(e.to)) add(e.from, b.id, { async: e.async })
    else for (const a of instsOf(e.from)) { const b = serving(e.to, a.zone); if (b) add(a.id, b.id, { async: e.async }) }
  }
  for (const n of d.nodes)
    for (const r of o.replicas(n, insts.filter(i => i.node === n.id))) add(r.from, r.to, { replication: true, async: r.async, ...(r.note && { note: r.note }) })

  const inVpcBands = byBand.map((l, i) => (l.some(zonal) ? i : -1)).filter(i => i >= 0)
  const x0 = LABEL_W, x1 = LABEL_W + z * W * CELL
  let vpc: Box | null = null
  const zoneBoxes: ZoneLayout['zoneBoxes'] = []
  if (inVpcBands.length) {
    const top = base.bands[inVpcBands[0]], bottom = base.bands[inVpcBands.at(-1)!]
    if (o.vpc) vpc = { x: x0 - 2, y: top.y - 6, w: x1 - x0 + 4, h: bottom.y + bottom.h - top.y + 12 }
    for (let k = 0; k < z; k++) zoneBoxes.push({ zone: k, x: x0 + k * W * CELL + 4, w: W * CELL - 8, y: top.y - 2, h: bottom.y + bottom.h - top.y + 4,
      ...(o.label && { label: o.label(k) }) })
  }
  let onprem: Box | null = null
  const premBands = byBand.map((l, i) => (l.some(isOnPrem) ? i : -1)).filter(i => i >= 0)
  if (premBands.length) {
    const top = base.bands[premBands[0]], bottom = base.bands[premBands.at(-1)!]
    onprem = { x: premX, y: top.y + 4, w: PREMW * PREM_CELL + 20, h: bottom.y + bottom.h - top.y - 8 }
  }
  const width = onprem ? onprem.x + onprem.w + 12 : LABEL_W + total * CELL + 12
  const bands = base.bands.map(b => ({ ...b, w: width }))
  const subnets = base.subnets.map(s => ({ ...s, x: x0 + 4, w: x1 - x0 - 8 }))

  const nodeOf = (id: string) => d.nodes.find(n => n.id === insts.find(i => i.id === id)!.node)!
  const handles = (from: string, to: string): [Side, Side] => {
    const dt = bandIdx[tierOf(nodeOf(to))] - bandIdx[tierOf(nodeOf(from))]
    if (dt !== 0) return dt > 0 ? ['bottom', 'top'] : ['top', 'bottom']
    return pos[to].x > pos[from].x ? ['right', 'left'] : ['left', 'right']
  }
  return { unit: o.unit, pos, bands, subnets, vpc, zoneBoxes, onprem, insts, edges: [...edges.values()], width, height: base.height, handles }
}

export interface Hop { from: string | null; to: string | null; edge: ZEdge | null; reverse: boolean; cross: boolean }

/**
 * Pin each step of a flow to concrete instances. A request enters in `home` (or the next healthy zone),
 * and a node keeps the instance it first used, so responses retrace the request's path.
 */
export function resolveFlow(L: ZoneLayout, flow: Flow, home: number, failed: number | null): Hop[] {
  const zones = L.zoneBoxes.length
  const start = home === failed ? [...Array(zones).keys()].find(k => k !== failed) ?? home : home
  const serving = (node: string, zone: number | null) => {
    const c = L.insts.filter(i => i.node === node && !i.failed && SERVES.has(i.role))
    return c.find(i => i.zone === zone) ?? c.sort((a, b) => (a.zone ?? 0) - (b.zone ?? 0))[0] ?? null
  }
  const used = new Map<string, string | null>()
  const pick = (node: string, zone: number | null) => {
    if (!used.has(node)) used.set(node, serving(node, zone)?.id ?? null)
    return used.get(node)!
  }
  const zoneOf = (id: string | null) => (id ? L.insts.find(i => i.id === id)?.zone ?? null : null)
  return flow.steps.map(s => {
    const from = pick(s.from, start)
    const to = s.from === s.to ? from : pick(s.to, zoneOf(from) ?? start)
    const fwd = L.edges.find(e => e.from === from && e.to === to)
    const rev = L.edges.find(e => e.from === to && e.to === from)
    const edge = fwd ?? rev ?? null
    return { from, to, edge, reverse: !fwd && !!rev, cross: !!edge?.cross }
  })
}
