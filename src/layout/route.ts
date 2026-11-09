// Edge routing that never crosses a component. Most edges go between neighbouring rows and stay as the
// default curve. An edge that would pass through a node (it skips a row, or has a node between its ends in
// the same row) is routed instead along the empty channels between rows and the gaps between nodes.
export interface Rect { x: number; y: number; w: number; h: number }
export type Pt = [number, number]
export type Side = 'top' | 'right' | 'bottom' | 'left'
/** Which sides the edge leaves and enters, and the corners between them. Null means the default curve is clear. */
export interface Route { from: Side; to: Side; via: Pt[] }

const CHANNEL = 16   // how far beyond a row the horizontal runs travel
const PAD = 9        // clearance kept around nodes on vertical runs
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

export function routeEdges(rects: Record<string, Rect>, edges: { key: string; from: string; to: string }[]): Record<string, Route | null> {
  const all = Object.entries(rects)
  const minX = Math.min(...all.map(([, r]) => r.x)) - 24, maxX = Math.max(...all.map(([, r]) => r.x + r.w)) + 24
  const used = new Map<number, number>()   // how many edges already run down each channel, to nudge parallel ones apart
  const out: Record<string, Route | null> = {}

  for (const e of edges) {
    const A = rects[e.from], B = rects[e.to]
    out[e.key] = null
    if (!A || !B || e.from === e.to) continue
    const others = all.filter(([id]) => id !== e.from && id !== e.to).map(([, r]) => r)
    const sameRow = Math.abs(A.y - B.y) < Math.min(A.h, B.h) / 2

    if (sameRow) {
      const lo = Math.min(cx(A), cx(B)), hi = Math.max(cx(A), cx(B))
      const between = others.some(o => Math.abs(o.y - A.y) < A.h / 2 && cx(o) > lo && cx(o) < hi)
      if (!between) continue
      const y = Math.min(A.y, B.y) - CHANNEL
      out[e.key] = { from: 'top', to: 'top', via: simplify([[cx(A), y], [cx(B), y]]) }
      continue
    }

    const down = B.y > A.y
    const ys = down ? A.y + A.h : A.y, yt = down ? B.y : B.y + B.h
    const [top, bottom] = ys < yt ? [ys, yt] : [yt, ys]
    const blockers = others.filter(o => o.y < bottom && o.y + o.h > top)
    if (!blockers.length) continue                              // the default curve between neighbouring rows is clear

    const columns = freeColumns(blockers, [minX, maxX])
    if (!columns.length) continue
    let gx = columns.reduce((best, c) => (Math.abs(c - cx(A)) + Math.abs(c - cx(B)) < Math.abs(best - cx(A)) + Math.abs(best - cx(B)) ? c : best), columns[0])
    const k = used.get(Math.round(gx)) ?? 0
    used.set(Math.round(gx), k + 1)
    if (k > 0 && k < 3) gx += (k % 2 ? 1 : -1) * 6                 // parallel edges share a gap: fan them out a little

    const y1 = down ? ys + CHANNEL : ys - CHANNEL
    const y2 = down ? yt - CHANNEL : yt + CHANNEL
    out[e.key] = { from: down ? 'bottom' : 'top', to: down ? 'top' : 'bottom', via: simplify([[cx(A), y1], [gx, y1], [gx, y2], [cx(B), y2]]) }
  }
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
