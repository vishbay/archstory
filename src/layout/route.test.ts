import { describe, expect, it } from 'vitest'
import { crossesNode, midpoint, roundedPolyline, routeEdges, routePoints, type Rect } from './route'

const box = (x: number, y: number): Rect => ({ x, y, w: 188, h: 58 })

describe('routeEdges', () => {
  // three rows of nodes; "mid" sits in the middle row directly between top and bottom
  const rects = { top: box(300, 0), mid: box(300, 118), bottom: box(300, 236), side: box(560, 118), low: box(40, 236) }
  const edges = (...e: [string, string][]) => e.map(([from, to]) => ({ key: `${from}->${to}`, from, to }))

  it('turns an edge between neighbouring rows at right angles inside the gap, with a straight run into the arrowhead', () => {
    const near = { a: box(100, 0), b: box(400, 118) }
    const route = routeEdges(near, edges(['a', 'b']))['a->b']!
    expect([route.from, route.to]).toEqual(['bottom', 'top'])
    const pts = routePoints(near.a, near.b, route)
    expect(pts).toHaveLength(4)
    expect(pts.every((p, i) => i === 0 || p[0] === pts[i - 1][0] || p[1] === pts[i - 1][1])).toBe(true)
    const [p1, p2] = [pts.at(-2)!, pts.at(-1)!]
    expect(p1[0]).toBe(p2[0]); expect(p2[1] - p1[1]).toBeGreaterThanOrEqual(14)      // last run is vertical and long enough for the head
  })
  it('draws aligned nodes in neighbouring rows, and neighbours in a row, as straight lines', () => {
    const r = routeEdges({ a: box(100, 0), b: box(100, 118), c: box(328, 118) }, edges(['a', 'b'], ['b', 'c']))
    expect(r['a->b']!.via).toEqual([]); expect(r['b->c']!.via).toEqual([])
    expect([r['b->c']!.from, r['b->c']!.to]).toEqual(['right', 'left'])
  })
  it('puts overlapping edges in the same gap on separate lanes, and lets edges that share an end share one', () => {
    const n = { a: box(0, 0), b: box(228, 0), c: box(456, 118), d: box(684, 118), e: box(228, 118) }
    const r = routeEdges(n, edges(['a', 'c'], ['b', 'd'], ['a', 'e']))
    const laneY = (k: string) => r[k]!.via[0][1]
    expect(laneY('a->c')).not.toBe(laneY('b->d'))     // their horizontal runs overlap, so they cannot share a lane
    expect(laneY('a->c')).toBe(laneY('a->e'))         // same source, same direction: one shared lane
  })
  it('keeps lanes inside the gap, leaving room for the arrowhead', () => {
    const wide = Object.fromEntries(Array.from({ length: 6 }, (_, i) => [`s${i}`, box(i * 228, 0)]).concat(Array.from({ length: 6 }, (_, i) => [`t${i}`, box(i * 228 + 114, 118)])))
    const r = routeEdges(wide, edges(...Array.from({ length: 6 }, (_, i) => [`s${i}`, `t${i}`] as [string, string])))
    for (const x of Object.values(r)) for (const p of x!.via) { expect(p[1]).toBeGreaterThanOrEqual(58 + 10); expect(p[1]).toBeLessThanOrEqual(118 - 14) }
  })
  it('routes an edge that would pass through a node along a free gap', () => {
    const r = routeEdges(rects, edges(['top', 'bottom']))['top->bottom']!
    expect(r.from).toBe('bottom'); expect(r.to).toBe('top')
    const pts = routePoints(rects.top, rects.bottom, r)
    expect(crossesNode(pts, [rects.mid, rects.side, rects.low])).toBe(false)
    expect(pts.every((p, i) => i === 0 || p[0] === pts[i - 1][0] || p[1] === pts[i - 1][1])).toBe(true)   // only horizontal and vertical pieces
  })
  it('routes upward edges too, mirrored', () => {
    const r = routeEdges(rects, edges(['bottom', 'top']))['bottom->top']!
    expect([r.from, r.to]).toEqual(['top', 'bottom'])
    expect(crossesNode(routePoints(rects.bottom, rects.top, r), [rects.mid, rects.side])).toBe(false)
  })
  it('goes over a node that sits between two nodes of the same row', () => {
    const row = { a: box(0, 0), b: box(228, 0), c: box(456, 0) }
    const r = routeEdges(row, edges(['a', 'c']))['a->c']!
    expect([r.from, r.to]).toEqual(['top', 'top'])
    expect(crossesNode(routePoints(row.a, row.c, r), [row.b])).toBe(false)
    expect(routeEdges(row, edges(['a', 'b']))['a->b']!.via).toEqual([])    // neighbours stay a straight line
  })
  it('fans out parallel edges that share a gap', () => {
    const many = { ...rects, bottom2: box(300 + 228, 236) }
    const r = routeEdges(many, edges(['top', 'bottom'], ['top', 'bottom2']))
    const xs = Object.values(r).map(x => x!.via.find(p => p[0] !== 394)?.[0])
    expect(new Set(xs).size).toBeGreaterThan(0)
  })
})

describe('path helpers', () => {
  it('rounds corners without leaving the polyline', () => {
    const d = roundedPolyline([[0, 0], [0, 50], [100, 50], [100, 100]])
    expect(d.startsWith('M 0 0')).toBe(true); expect(d).toContain('Q 0 50'); expect(d.endsWith('L 100 100')).toBe(true)
  })
  it('survives repeated points', () => {
    expect(roundedPolyline([[0, 0], [0, 0], [10, 0]])).toBe('M 0 0 L 10 0')
  })
  it('finds the middle of a polyline', () => {
    expect(midpoint([[0, 0], [0, 100]])).toEqual([0, 50])
    expect(midpoint([[0, 0], [100, 0], [100, 100]])).toEqual([100, 0])
  })
})
