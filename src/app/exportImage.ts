// Save the canvas as a PNG. The canvas is HTML nodes plus SVG edges, so it is rendered with html-to-image.
import { toPng } from 'html-to-image'
import { getNodesBounds, getViewportForBounds, type Node } from '@xyflow/react'

const PAD = 40
const MAX = 4096

/** File name for the image: the title as a lowercase slug, "canvas" when nothing usable is left. */
export function imageFileName(title: string): string {
  const slug = title.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
  return `${slug || 'canvas'}.png`
}

/** Render every node (whatever the current pan and zoom) at 2x on the theme's canvas colour, and download it. */
export async function exportCanvasImage(nodes: Node[], title: string) {
  const el = document.querySelector<HTMLElement>('.react-flow__viewport')
  if (!el || !nodes.length) throw new Error('Nothing on the canvas to export.')
  const b = getNodesBounds(nodes)
  const w = Math.min(MAX, Math.ceil(b.width + PAD * 2)), h = Math.min(MAX, Math.ceil(b.height + PAD * 2))
  const vp = getViewportForBounds(b, w, h, 0.1, 2, PAD / Math.max(w, h))
  const url = await toPng(el, {
    width: w, height: h, pixelRatio: 2,
    backgroundColor: getComputedStyle(document.documentElement).getPropertyValue('--canvas').trim() || '#ffffff',
    style: { width: `${w}px`, height: `${h}px`, transform: `translate(${vp.x}px, ${vp.y}px) scale(${vp.zoom})` },
    filter: n => !(n instanceof Element && n.closest('.react-flow__controls, .react-flow__minimap, .react-flow__panel')),
  })
  Object.assign(document.createElement('a'), { href: url, download: imageFileName(title) }).click()
}
