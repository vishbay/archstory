// Where the boxes and connectors of the guide's small architecture diagrams go. Pure, so the layout can be tested.
import type { MiniStage } from './guide'

export const MINI = { bw: 82, bh: 28, gx: 102, gy: 46, pad: 8 }
export interface MiniGeometry {
  width: number; height: number
  boxes: { id: string; label: string; added: boolean; x: number; y: number }[]
  lines: { key: string; from: string; to: string; x1: number; y1: number; x2: number; y2: number }[]
}
/** Where each box and connector goes. A connector leaves the side that faces its target, so it never runs through its own box. */
export function miniGeometry(stage: MiniStage): MiniGeometry {
  const { bw, bh, gx, gy, pad } = MINI
  const boxes = stage.boxes.map(b => ({ id: b.id, label: b.label, added: !!b.added, x: pad + b.x * gx, y: pad + b.y * gy }))
  const at = (id: string) => boxes.find(b => b.id === id)!
  const lines = stage.edges.map(([from, to]) => {
    const p = at(from), q = at(to)
    let x1: number, y1: number, x2: number, y2: number
    if (q.x > p.x) { x1 = p.x + bw; y1 = p.y + bh / 2; x2 = q.x; y2 = q.y + bh / 2 }
    else if (q.x < p.x) { x1 = p.x; y1 = p.y + bh / 2; x2 = q.x + bw; y2 = q.y + bh / 2 }
    else { x1 = p.x + bw / 2; x2 = q.x + bw / 2; y1 = q.y > p.y ? p.y + bh : p.y; y2 = q.y > p.y ? q.y : q.y + bh }
    return { key: from + to, from, to, x1, y1, x2, y2 }
  })
  return { width: pad * 2 + 3 * gx + bw, height: pad * 2 + 2 * gy + bh, boxes, lines }
}
