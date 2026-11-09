// Right-angled edge routing that never crosses a component. Every edge leaves and enters a node side head-on, with a
// straight run into the arrowhead. Edges between neighbouring rows turn in the empty gap between the rows, each on its
// own lane when they would otherwise overlap. An edge that would pass through a node (it skips a row, or has a node
// between its ends in the same row) is routed along the channels between rows and the gaps between nodes.
export interface Rect { x: number; y: number; w: number; h: number }
export type Pt = [number, number]
export type Side = 'top' | 'right' | 'bottom' | 'left'
/** Which sides the edge leaves and enters, and the corners between them (empty for a straight line). Null only when an end is unknown. */
export interface Route { from: Side; to: Side; via: Pt[] }

const PAD = 9        // clearance kept around nodes on vertical runs
const LEAD_OUT = 12  // straight run kept after leaving a node before the first turn
const LEAD_IN = 14   // straight run kept before the arrowhead, so the head sits on a straight line
const LANE_GAP = 6   // horizontal clearance between edges sharing a lane
const EDGE_GAP = 60  // height assumed for the free space above the top row
const ROW_TOL = 20   // nodes whose tops are this close belong to the same row
const SLOTS = [0, 6, -6, 12, -12, 18, -18]   // sideways offsets tried for a long vertical run, nearest first
const cx = (r: Rect) => r.x + r.w / 2

function simplify(pts: Pt[]): Pt[] {
  const out: Pt[] = []
  for (const p of pts) { const q = out.at(-1); if (!q || q[0] !== p[0] || q[1] !== p[1]) out.push(p) }
  return out.filter((p, i) => {   // drop points in the middle of a straight run
    const a = out[i - 1], b = out[i + 1]
    return !(a && b && ((a[0] === p[0] && p[0] === b[0]) || (a[1] === p[1] && p[1] === b[1])))
  })
}

/** x positions free of every obstacle on the way down or up: midpoints of the gaps between them. */
function freeColumns(obstacles: Rect[], bounds: [number, number]): number[] {
  const spans = obstacles.map(o => [o.x - PAD, o.x + o.w + PAD] as const).sort((a, b) => a[0] - b[0])
  const merged: [number, number][] = []
  for (const s of spans) { const l = merged.at(-1); if (l && s[0] <= l[1]) l[1] = Math.max(l[1], s[1]); else merged.push([s[0], s[1]]) }
  const gaps: number[] = []
  let at = bounds[0]
  for (const [a, b] of merged) { if (a - at >= 8) gaps.push((at + a) / 2); at = Math.max(at, b) }
  if (bounds[1] - at >= 8) gaps.push((at + bounds[1]) / 2)
  return gaps
}

interface Gap { top: number; bottom: number }
/** One horizontal piece of an edge, which needs a lane (a height) inside the free space between two rows. */
interface Run { gap: Gap; lo: number; hi: number; src: string; dst: string; y: number
  /** Where the vertical pieces at each end attach: to the top of the gap (they run up from the lane) or the bottom (they run down). */
  ends: { x: number; side: 'top' | 'bottom' }[] }
/** An edge whose corner heights are decided once every edge sharing a gap has been seen. */
interface Plan { key: string; from: Side; to: Side; runs: Run[]; build: (y: number[]) => Pt[] }

/**
 * Orders lanes top to bottom. A line that runs up from a lane to the top of the gap must sit above any lane whose line
 * runs down at the same x, otherwise the two overlap and read as one connection between the nodes above and below.
 */
function orderLanes(lanes: Run[][]): Run[][] {
  const before = lanes.map(() => new Set<number>())     // before[j] holds the lanes that must come above lane j
  lanes.forEach((li, i) => lanes.forEach((lj, j) => {
    if (i !== j && li.some(a => lj.some(b => a.ends.some(x => x.side === 'top' && b.ends.some(y => y.side === 'bottom' && Math.abs(x.x - y.x) < 1))))) before[j].add(i)
  }))
  const placed: number[] = []
  while (placed.length < lanes.length) {
    const next = lanes.findIndex((_, j) => !placed.includes(j) && [...before[j]].every(i => placed.includes(i)))
    placed.push(next === -1 ? lanes.findIndex((_, j) => !placed.includes(j)) : next)    // a cycle cannot be satisfied: keep the original order
  }
  return placed.map(i => lanes[i])
}

export function routeEdges(rects: Record<string, Rect>, edges: { key: string; from: string; to: string }[]): Record<string, Route | null> {
  const all = Object.entries(rects)
  const out: Record<string, Route | null> = {}
  if (!all.length) return out
  const minX = Math.min(...all.map(([, r]) => r.x)) - 24, maxX = Math.max(...all.map(([, r]) => r.x + r.w)) + 24
  const verticals: { x: number; lo: number; hi: number; src: string; dst: string }[] = []   // long vertical runs placed so far

  // rows of nodes, and the free space between them
  const rows: { top: number; bottom: number }[] = []
  for (const [, r] of [...all].sort((a, b) => a[1].y - b[1].y)) {
    const last = rows.at(-1)
    if (last && r.y - last.top < ROW_TOL) last.bottom = Math.max(last.bottom, r.y + r.h); else rows.push({ top: r.y, bottom: r.y + r.h })
  }
  const rowOf = (r: Rect) => rows.findIndex(w => Math.abs(w.top - r.y) < ROW_TOL)
  const below = (i: number): Gap => (i + 1 < rows.length ? { top: rows[i].bottom, bottom: rows[i + 1].top } : { top: rows[i].bottom, bottom: rows[i].bottom + EDGE_GAP })
  const above = (i: number): Gap => (i > 0 ? below(i - 1) : { top: rows[0].top - EDGE_GAP, bottom: rows[0].top })
  const run = (gap: Gap, a: number, b: number, src: string, dst: string, sa: 'top' | 'bottom', sb: 'top' | 'bottom'): Run =>
    ({ gap, lo: Math.min(a, b), hi: Math.max(a, b), src, dst, y: 0, ends: [{ x: a, side: sa }, { x: b, side: sb }] })
  const plans: Plan[] = []

  for (const e of edges) {
    const A = rects[e.from], B = rects[e.to]
    out[e.key] = null
    if (!A || !B || e.from === e.to) continue
    const others = all.filter(([id]) => id !== e.from && id !== e.to).map(([, r]) => r)
    const sameRow = Math.abs(A.y - B.y) < Math.min(A.h, B.h) / 2

    if (sameRow) {
      const lo = Math.min(cx(A), cx(B)), hi = Math.max(cx(A), cx(B))
      const between = others.some(o => Math.abs(o.y - A.y) < A.h / 2 && cx(o) > lo && cx(o) < hi)
      if (!between) {
        const right = cx(B) > cx(A), ya = A.y + A.h / 2, yb = B.y + B.h / 2
        const mx = right ? (A.x + A.w + B.x) / 2 : (B.x + B.w + A.x) / 2
        out[e.key] = { from: right ? 'right' : 'left', to: right ? 'left' : 'right', via: Math.abs(ya - yb) < 0.5 ? [] : [[mx, ya], [mx, yb]] }
        continue
      }
      const r = run(above(rowOf(A)), cx(A), cx(B), e.from, e.to, 'bottom', 'bottom')    // over the top of the row
      plans.push({ key: e.key, from: 'top', to: 'top', runs: [r], build: ([y]) => [[cx(A), y], [cx(B), y]] })
      continue
    }

    const down = B.y > A.y
    const ys = down ? A.y + A.h : A.y, yt = down ? B.y : B.y + B.h
    const [top, bottom] = ys < yt ? [ys, yt] : [yt, ys]
    const blockers = others.filter(o => o.y < bottom && o.y + o.h > top)
    const [from, to] = down ? ['bottom', 'top'] as const : ['top', 'bottom'] as const

    if (!blockers.length) {                                      // neighbouring rows: turn once, inside the gap between them
      if (Math.abs(cx(A) - cx(B)) < 0.5) { out[e.key] = { from, to, via: [] }; continue }
      plans.push({ key: e.key, from, to, runs: [run(down ? below(rowOf(A)) : above(rowOf(A)), cx(A), cx(B), e.from, e.to, down ? 'top' : 'bottom', down ? 'bottom' : 'top')], build: ([y]) => [[cx(A), y], [cx(B), y]] })
      continue
    }

    const columns = freeColumns(blockers, [minX, maxX])
    if (!columns.length) continue
    const base = columns.reduce((best, c) => (Math.abs(c - cx(A)) + Math.abs(c - cx(B)) < Math.abs(best - cx(A)) + Math.abs(best - cx(B)) ? c : best), columns[0])
    // parallel detours share a free column: fan them out, reusing a spot only where their vertical runs cannot meet
    const gx = SLOTS.map(o => base + o).find(x => !verticals.some(v => Math.abs(v.x - x) < 3 && v.lo < bottom && top < v.hi && v.src !== e.from && v.dst !== e.to)) ?? base
    verticals.push({ x: gx, lo: top, hi: bottom, src: e.from, dst: e.to })
    const ra = rowOf(A), rb = rowOf(B)
    const r1 = run(down ? below(ra) : above(ra), cx(A), gx, e.from, e.to, down ? 'top' : 'bottom', down ? 'bottom' : 'top')
    const r2 = run(down ? above(rb) : below(rb), gx, cx(B), e.from, e.to, down ? 'top' : 'bottom', down ? 'bottom' : 'top')
    plans.push({ key: e.key, from, to, runs: [r1, r2], build: ([y1, y2]) => [[cx(A), y1], [gx, y1], [gx, y2], [cx(B), y2]] })
  }

  // Every horizontal piece that turns inside the same gap gets a lane. Pieces that overlap sideways need different lanes,
  // unless they share an end (a fan-out or a fan-in reads as one line splitting).
  const gaps = new Map<string, Run[]>()
  for (const r of plans.flatMap(p => p.runs)) { const k = `${r.gap.top}|${r.gap.bottom}`; gaps.set(k, [...(gaps.get(k) ?? []), r]) }
  for (const list of gaps.values()) {
    const lanes: Run[][] = []
    for (const r of [...list].sort((a, b) => a.lo - b.lo || a.hi - b.hi)) {
      const lane = lanes.find(l => l.every(o => o.src === r.src || o.dst === r.dst || o.hi + LANE_GAP <= r.lo || r.hi + LANE_GAP <= o.lo))
      if (lane) lane.push(r); else lanes.push([r])
    }
    const { top, bottom } = list[0].gap
    const a = top + LEAD_OUT, z = Math.max(a, bottom - LEAD_IN)    // keep room to leave a node and for the arrowhead to sit on a straight run
    orderLanes(lanes).forEach((lane, i) => { for (const r of lane) r.y = a + (z - a) * (i + 1) / (lanes.length + 1) })
  }
  for (const p of plans) out[p.key] = { from: p.from, to: p.to, via: simplify(p.build(p.runs.map(r => r.y))) }
  return out
}

/** Where an edge starts or ends on a node: the middle of the chosen side. */
export function anchor(r: Rect, side: Side): Pt {
  return side === 'top' ? [cx(r), r.y] : side === 'bottom' ? [cx(r), r.y + r.h] : side === 'left' ? [r.x, r.y + r.h / 2] : [r.x + r.w, r.y + r.h / 2]
}

/** A path through the points with rounded corners. */
export function roundedPolyline(points: Pt[], radius = 10): string {
  const pts = points.filter((p, i) => i === 0 || p[0] !== points[i - 1][0] || p[1] !== points[i - 1][1])
  let d = `M ${pts[0][0]} ${pts[0][1]}`
  for (let i = 1; i < pts.length - 1; i++) {
    const [px, py] = pts[i - 1], [x, y] = pts[i], [nx, ny] = pts[i + 1]
    const l1 = Math.hypot(x - px, y - py), l2 = Math.hypot(nx - x, ny - y), r = Math.min(radius, l1 / 2, l2 / 2)
    d += ` L ${x - ((x - px) / l1) * r} ${y - ((y - py) / l1) * r} Q ${x} ${y} ${x + ((nx - x) / l2) * r} ${y + ((ny - y) / l2) * r}`
  }
  const last = pts.at(-1)!
  return `${d} L ${last[0]} ${last[1]}`
}

/** The point halfway along the polyline, for placing a label. */
export function midpoint(points: Pt[]): Pt {
  const len = (a: Pt, b: Pt) => Math.hypot(b[0] - a[0], b[1] - a[1])
  const total = points.slice(1).reduce((s, p, i) => s + len(points[i], p), 0)
  let left = total / 2
  for (let i = 1; i < points.length; i++) {
    const l = len(points[i - 1], points[i])
    if (left <= l) { const t = l ? left / l : 0; return [points[i - 1][0] + (points[i][0] - points[i - 1][0]) * t, points[i - 1][1] + (points[i][1] - points[i - 1][1]) * t] }
    left -= l
  }
  return points.at(-1)!
}

/** The corner points of a route, including both ends. */
export const routePoints = (A: Rect, B: Rect, r: Route): Pt[] => simplify([anchor(A, r.from), ...r.via, anchor(B, r.to)])

/** Whether any straight piece of the route passes through a node other than its two ends (for tests). */
export function crossesNode(points: Pt[], rects: Rect[], clearance = 2): boolean {
  for (let i = 1; i < points.length; i++) {
    const [x1, y1] = points[i - 1], [x2, y2] = points[i]
    const x0 = Math.min(x1, x2), x3 = Math.max(x1, x2), y0 = Math.min(y1, y2), y3 = Math.max(y1, y2)
    for (const r of rects) if (x3 > r.x + clearance && x0 < r.x + r.w - clearance && y3 > r.y + clearance && y0 < r.y + r.h - clearance) return true
  }
  return false
}
