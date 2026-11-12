import { describe, expect, it } from 'vitest'
import { PROTOCOLS } from '../protocols'
import { NODE_H, NODE_W } from './bands'
import { FREE_SIZE, FREE_SPAN, isFreeLayout, layoutFree } from './free'

const meta = (layout?: 'free' | 'lifelines') => ({ title: 'x', tags: [], layout })
const node = (id: string, x?: number, y?: number) => ({ id, label: id, kind: 'service', at: x === undefined ? undefined : { x, y: y! } })

describe('free layout', () => {
  it('applies only when the design asks for it and every node is placed', () => {
    expect(isFreeLayout({ meta: meta('free'), nodes: [node('a', 1, 2), node('b', 3, 4)] })).toBe(true)
    expect(isFreeLayout({ meta: meta('free'), nodes: [node('a', 1, 2), node('b')] })).toBe(false)
    expect(isFreeLayout({ meta: meta(), nodes: [node('a', 1, 2)] })).toBe(false)
    expect(isFreeLayout({ meta: meta('lifelines'), nodes: [node('a', 1, 2)] })).toBe(false)
  })

  it('puts the centre of a node at its percent position, 50 50 in the middle of a square canvas', () => {
    const L = layoutFree({ nodes: [node('mid', 50, 50), node('tl', 0, 0), node('br', 100, 100)] })
    const centre = (id: string) => ({ x: L.pos[id].x + NODE_W / 2, y: L.pos[id].y + NODE_H / 2 })
    expect(L.width).toBe(FREE_SIZE)
    expect(L.height).toBe(FREE_SIZE)
    expect(centre('mid')).toEqual({ x: FREE_SIZE / 2, y: FREE_SIZE / 2 })
    expect(centre('br').x - centre('tl').x).toBe(FREE_SPAN)
    expect(centre('br').y - centre('tl').y).toBe(FREE_SPAN)   // one scale on both axes, so a circle stays a circle
    for (const id of ['tl', 'br']) {
      expect(L.pos[id].x).toBeGreaterThanOrEqual(0)
      expect(L.pos[id].y).toBeGreaterThanOrEqual(0)
      expect(L.pos[id].x + NODE_W).toBeLessThanOrEqual(FREE_SIZE)
      expect(L.pos[id].y + NODE_H).toBeLessThanOrEqual(FREE_SIZE)
    }
  })

  it('has no bands, groups, network box or monitoring lane, so the canvas draws only nodes and edges', () => {
    const L = layoutFree({ nodes: [node('a', 10, 10)] })
    expect(L.bands).toEqual([])
    expect(L.groups).toEqual([])
    expect(L.subnets).toEqual([])
    expect(L.vpc).toBeNull()
    expect(L.obs).toBeNull()
  })

  it('leaves a node on the side that faces the other end', () => {
    const L = layoutFree({ nodes: [node('c', 50, 50), node('r', 90, 50), node('l', 10, 50), node('t', 50, 10), node('b', 50, 90)] })
    expect(L.handles('c', 'r')).toEqual(['right', 'left'])
    expect(L.handles('c', 'l')).toEqual(['left', 'right'])
    expect(L.handles('c', 't')).toEqual(['top', 'bottom'])
    expect(L.handles('c', 'b')).toEqual(['bottom', 'top'])
    expect(L.handles('r', 'c')).toEqual(['left', 'right'])
  })
})

describe('the hash ring module in the free layout', () => {
  const ring = PROTOCOLS.find(p => p.id === 'hashring')!
  const L = layoutFree(ring)
  const centre = (id: string) => ({ x: L.pos[id].x + NODE_W / 2, y: L.pos[id].y + NODE_H / 2 })

  it('asks for the free layout and every node is placed', () => {
    expect(ring.meta.layout).toBe('free')
    expect(isFreeLayout(ring)).toBe(true)
  })

  it('places the machines on one circle around the client, at the angle of their token', () => {
    const mid = centre('client')
    expect(mid).toEqual({ x: FREE_SIZE / 2, y: FREE_SIZE / 2 })
    const radii = ['a', 'b', 'c', 'd', 'e'].map(id => Math.hypot(centre(id).x - mid.x, centre(id).y - mid.y))
    for (const r of radii) expect(r).toBeCloseTo(radii[0], 0)           // percent rounding to one decimal leaves under a pixel of spread
    const tokens: Record<string, number> = { a: 8, b: 33, c: 60, d: 85, e: 45 }
    for (const [id, t] of Object.entries(tokens)) {
      const angle = (Math.atan2(centre(id).x - mid.x, -(centre(id).y - mid.y)) * 180 / Math.PI + 360) % 360   // clockwise from the top
      expect(angle, id).toBeCloseTo(t * 3.6, 0)
    }
  })

  it('does not draw any two nodes on top of each other', () => {
    const ids = ring.nodes.map(n => n.id)
    for (const a of ids) for (const b of ids) if (a < b) {
      const apart = Math.abs(L.pos[a].x - L.pos[b].x) >= NODE_W || Math.abs(L.pos[a].y - L.pos[b].y) >= NODE_H
      expect(apart, `${a} and ${b} overlap`).toBe(true)
    }
  })
})
