// Deterministic band layout: one horizontal band per tier (top → bottom), no coordinates needed in the JSON.
// Nodes are split into column "segments" so boxed things (groups, the VPC) each draw as one clean rectangle:
//   plain view:   [ungrouped] [group A] [group B] …
//   network view: [VPC ungrouped] [group A] [group B] … [outside the VPC]
import { subnetOf, TIERS, type Design, type DNode, type Tier } from '../model/schema'
import { tierOf } from '../model/kinds'

export const NODE_W = 188, NODE_H = 58
export const CELL = 228, ROW_H = 118, BAND_GAP = 14, LABEL_W = 46   // lane names run vertically in a narrow column
// Monitoring layer: a collector fanning out to three stores, then alerts, then on-call.
export const OBS_NODE_W = 166, OBS_COL = 198, OBS_ROW = 68, OBS_H = 222, OBS_COLLAPSED_H = 46

export type Side = 'top' | 'right' | 'bottom' | 'left'
export interface Box { x: number; y: number; w: number; h: number }
export interface Layout {
  pos: Record<string, { x: number; y: number }>
  bands: (Box & { tier: Tier })[]
  groups: (Box & { id: string; label: string; kind: string })[]
  vpc: Box | null
  subnets: (Box & { id: string; label: string; public: boolean; cidr?: string })[]
  /** The monitoring layer's band and node positions, when asked for. */
  obs: { band: Box; pos: Record<string, { x: number; y: number }>; open: boolean } | null
  width: number; height: number
  handles: (from: string, to: string) => [Side, Side]
}

const OUT = '\u0000out', VPC = '\u0000vpc'

export function layoutBands(d: Design, opts: { network?: boolean; observability?: boolean; obsOpen?: boolean } = {}): Layout {
  const net = opts.network && d.network ? d.network : null
  const subnet = (n: DNode) => (net ? subnetOf(d, n, tierOf(n)) : null)
  const segOf = (n: DNode) => n.group ?? (subnet(n) ? VPC : OUT)
  const segs = (net ? [VPC, ...d.groups.map(g => g.id), OUT] : [OUT, ...d.groups.map(g => g.id)])
    .filter(s => d.nodes.some(n => segOf(n) === s))
  const boxed = (s: string) => s !== OUT

  const tiers = TIERS.filter(t => d.nodes.some(n => tierOf(n) === t))
  const bandIdx = Object.fromEntries(tiers.map((t, i) => [t, i])) as Record<Tier, number>
  const cell = (t: Tier, s: string) => d.nodes.filter(n => tierOf(n) === t && segOf(n) === s)
  const present = (t: Tier) => segs.filter(s => cell(t, s).length)
  // A band holding only un-boxed nodes is centred across the full width and doesn't reserve columns.
  const lone = (t: Tier) => { const p = present(t); return p.length === 1 && !boxed(p[0]) }

  const segW: Record<string, number> = {}, segStart: Record<string, number> = {}
  let total = 0
  for (const s of segs) {
    segW[s] = Math.max(0, ...tiers.filter(t => !lone(t)).map(t => cell(t, s).length))
    segStart[s] = total; total += segW[s]
  }
  total = Math.max(total, ...tiers.filter(lone).map(t => cell(t, present(t)[0]).length))

  const neighbours = (id: string) => d.edges.flatMap(e => (e.from === id ? [e.to] : e.to === id ? [e.from] : []))
  const pos: Layout['pos'] = {}
  const bands: Layout['bands'] = []

  tiers.forEach((t, bi) => {
    const y = bi * ROW_H
    bands.push({ tier: t, x: 0, y, w: 0, h: ROW_H - BAND_GAP })
    for (const s of present(t)) {
      // Barycentre ordering against nodes already placed in earlier bands reduces edge crossings.
      const list = cell(t, s).map((n, i) => {
        const placed = neighbours(n.id).filter(id => pos[id])
        const bary = placed.length ? placed.reduce((a, id) => a + pos[id].x, 0) / placed.length : Infinity
        return { n, i, bary }
      }).sort((a, b) => a.bary - b.bary || a.i - b.i)
      const offset = lone(t) ? (total - list.length) / 2 : segStart[s] + (segW[s] - list.length) / 2
      list.forEach(({ n }, i) => {
        pos[n.id] = { x: LABEL_W + (offset + i) * CELL + (CELL - NODE_W) / 2, y: y + (ROW_H - BAND_GAP - NODE_H) / 2 }
      })
    }
  })

  const width = LABEL_W + total * CELL + 12
  bands.forEach(b => { b.w = width })
  const colX = (s: string) => LABEL_W + segStart[s] * CELL
  const span = (idx: number[]) => ({ top: bands[Math.min(...idx)], bottom: bands[Math.max(...idx)] })

  const groups: Layout['groups'] = d.groups.filter(g => segs.includes(g.id)).map(g => {
    const { top, bottom } = span(d.nodes.filter(n => n.group === g.id).map(n => bandIdx[tierOf(n)]))
    return { id: g.id, label: g.label, kind: g.kind, x: colX(g.id) + 6, w: segW[g.id] * CELL - 12, y: top.y + 4, h: bottom.y + bottom.h - top.y - 8 }
  })

  let vpc: Box | null = null
  const subnets: Layout['subnets'] = []
  const inVpc = d.nodes.filter(n => subnet(n))
  if (net && inVpc.length) {
    const vpcSegs = segs.filter(s => s !== OUT)
    const x0 = colX(vpcSegs[0]), x1 = colX(vpcSegs.at(-1)!) + segW[vpcSegs.at(-1)!] * CELL
    const { top, bottom } = span(inVpc.map(n => bandIdx[tierOf(n)]))
    vpc = { x: x0 - 2, y: top.y - 6, w: x1 - x0 + 4, h: bottom.y + bottom.h - top.y + 12 }
    for (const s of net.subnets) {
      const idx = [...new Set(inVpc.filter(n => subnet(n)!.id === s.id).map(n => bandIdx[tierOf(n)]))].sort((a, b) => a - b)
      // one strip per run of consecutive bands, so a subnet never visually swallows a band it isn't in
      for (let i = 0; i < idx.length;) {
        let j = i
        while (j + 1 < idx.length && idx[j + 1] === idx[j] + 1) j++
        const a = bands[idx[i]], b = bands[idx[j]]
        subnets.push({ id: s.id, label: s.label, public: s.public, cidr: s.cidr, x: x0 + 4, w: x1 - x0 - 8, y: a.y + 2, h: b.y + b.h - a.y - 4 })
        i = j + 1
      }
    }
  }

  const bandOf = (id: string) => bandIdx[tierOf(d.nodes.find(n => n.id === id)!)]
  const handles = (from: string, to: string): [Side, Side] => {
    const dt = bandOf(to) - bandOf(from)
    if (dt !== 0) return dt > 0 ? ['bottom', 'top'] : ['top', 'bottom']
    return pos[to].x > pos[from].x ? ['right', 'left'] : ['left', 'right']
  }
  let obs: Layout['obs'] = null, outWidth = width
  if (opts.observability && !opts.obsOpen) {
    // collapsed: a one-line summary strip under the last tier
    obs = { band: { x: 0, y: tiers.length * ROW_H, w: width, h: OBS_COLLAPSED_H }, pos: {}, open: false }
  } else if (opts.observability) {
    const span = 3 * OBS_COL + OBS_NODE_W
    outWidth = Math.max(width, LABEL_W + span + 12)
    const dx = (outWidth - width) / 2          // keep the design centred when the canvas has to widen
    if (dx > 0) {
      for (const id of Object.keys(pos)) pos[id] = { ...pos[id], x: pos[id].x + dx }
      for (const g of groups) g.x += dx
      if (vpc) vpc.x += dx
      for (const s of subnets) s.x += dx
    }
    bands.forEach(b => { b.w = outWidth })
    const top = tiers.length * ROW_H, x0 = LABEL_W + (outWidth - LABEL_W - 12 - span) / 2, r0 = top + 14
    const at = (col: number, row: number) => ({ x: x0 + col * OBS_COL, y: r0 + row * OBS_ROW })
    obs = {
      open: true,
      band: { x: 0, y: top, w: outWidth, h: OBS_H },
      pos: { 'obs:collector': at(0, 1), 'obs:metrics': at(1, 0), 'obs:logs': at(1, 1), 'obs:traces': at(1, 2), 'obs:alerts': at(2, 0), 'obs:oncall': at(3, 0) },
    }
  }
  return { pos, bands, groups, vpc, subnets, obs, width: outWidth, height: tiers.length * ROW_H + (obs ? obs.band.h + BAND_GAP : 0), handles }
}
