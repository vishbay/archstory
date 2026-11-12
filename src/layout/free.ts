// Free layout for protocol designs (meta.layout "free"): every node carries its own position `at` in percent of a square canvas,
// so a ring or a topology can be drawn exactly. No tier bands, no network box and no routed edges: connections are straight lines.
// The result has the same shape as `layoutBands`, so the canvas consumes it unchanged.
import type { Design } from '../model/schema'
import { NODE_H, NODE_W, type Layout, type Side } from './bands'

/** The free canvas is a square of this many pixels, so a circle in percent is a circle on screen. */
export const FREE_SIZE = 820
const MARGIN = 24
/** Pixels between 0 percent and 100 percent: the same on both axes (a whole node stays inside the margin at the extremes). */
export const FREE_SPAN = FREE_SIZE - 2 * MARGIN - NODE_W

/** Does the design ask for a free layout, and can it have one (every node placed)? Anything else uses the tier bands. */
export const isFreeLayout = (d: Pick<Design, 'meta' | 'nodes'>) => d.meta.layout === 'free' && d.nodes.every(n => !!n.at)

export function layoutFree(d: Pick<Design, 'nodes'>): Layout {
  const pos: Layout['pos'] = {}
  // `at` is where the centre of the node goes: 50, 50 is the middle of the canvas.
  for (const n of d.nodes) {
    const { x, y } = n.at ?? { x: 50, y: 50 }
    pos[n.id] = { x: FREE_SIZE / 2 + ((x - 50) / 100) * FREE_SPAN - NODE_W / 2, y: FREE_SIZE / 2 + ((y - 50) / 100) * FREE_SPAN - NODE_H / 2 }
  }
  const centre = (id: string) => ({ x: pos[id].x + NODE_W / 2, y: pos[id].y + NODE_H / 2 })
  // Leave a node on the side that faces the other end: sideways when the line is flatter than the node's own aspect, else up or down.
  const handles = (from: string, to: string): [Side, Side] => {
    const a = centre(from), b = centre(to)
    const dx = b.x - a.x, dy = b.y - a.y
    if (Math.abs(dx) * NODE_H >= Math.abs(dy) * NODE_W) return dx >= 0 ? ['right', 'left'] : ['left', 'right']
    return dy >= 0 ? ['bottom', 'top'] : ['top', 'bottom']
  }
  return { pos, bands: [], groups: [], vpc: null, subnets: [], obs: null, width: FREE_SIZE, height: FREE_SIZE, handles }
}
