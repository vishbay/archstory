import { describe, expect, it } from 'vitest'
import { crossesNode, midpoint, roundedPolyline, routeEdges, routePoints, type Rect } from './route'

const box = (x: number, y: number): Rect => ({ x, y, w: 188, h: 58 })

describe('routeEdges', () => {
  // three rows of nodes; "mid" sits in the middle row directly between top and bottom
  const rects = { top: box(300, 0), mid: box(300, 118), bottom: box(300, 236), side: box(560, 118), low: box(40, 236) }
  const edges = (...e: [string, string][]) => e.map(([from, to]) => ({ key: `${from}->${to}`, from, to }))

  it('leaves a clear edge between neighbouring rows to the default curve', () => {
    expect(routeEdges(rects, edges(['top', 'mid']))['top->mid']).toBeNull()
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
    expect(routeEdges(row, edges(['a', 'b']))['a->b']).toBeNull()    // neighbours stay a straight line
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
