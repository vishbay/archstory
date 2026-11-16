import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { InterviewGuide } from '../app/InterviewGuide'
import { TIER_INFO } from '../model/kinds'
import { AI_CAVEATS, AI_STEPS, CLARIFY, ESTIMATE_CHAIN, FRAMEWORKS, LEVELS, EVOLVE, GUIDE_PHASES, LATENCIES, LOOP, MISTAKES, NUMBERS, PATTERNS, phaseGuide, PRINCIPLES, TIER_ORDER, TIER_WALK, TRICKS } from './guide'
import { MINI, miniGeometry } from './guideLayout'
import { PHASES } from './timed'

describe('interview guide content', () => {
  it('has guidance for every timed phase, with the same minutes as the clock', () => {
    expect(GUIDE_PHASES.map(p => p.id)).toEqual(PHASES.map(p => p.id))
    expect(GUIDE_PHASES.reduce((n, p) => n + p.minutes, 0)).toBe(45)
    for (const p of PHASES) { const g = phaseGuide(p.id); expect(g.do.length, p.id).toBeGreaterThanOrEqual(3); expect(g.say, p.id).toBeTruthy(); expect(g.avoid, p.id).toBeTruthy() }
  })
  it('uses no em dashes anywhere', () => {
    const all = JSON.stringify([PRINCIPLES, CLARIFY, GUIDE_PHASES, LOOP, NUMBERS, PATTERNS, MISTAKES, TIER_WALK, TRICKS, LEVELS, FRAMEWORKS, AI_STEPS, AI_CAVEATS])
    expect(all).not.toContain('—')
  })
  it('asks questions that each say how the answer changes the design', () => {
    for (const g of CLARIFY) for (const q of g.questions) { expect(q.ask.endsWith('?'), q.ask).toBe(true); expect(q.changes.length, q.ask).toBeGreaterThan(10) }
  })
})

describe('guide infographic data', () => {
  it('has an output per phase, a design that only grows, and a chain and scale in rising order', () => {
    for (const p of GUIDE_PHASES) expect(p.output, p.id).toBeTruthy()
    const ids = EVOLVE.map(s => s.boxes.map(b => b.id))
    ids.slice(1).forEach((now, i) => ids[i].forEach(id => expect(now, `stage ${i + 2} keeps ${id}`).toContain(id)))
    for (const s of EVOLVE) for (const [a, b] of s.edges) expect(s.boxes.map(x => x.id)).toEqual(expect.arrayContaining([a, b]))
    expect(ESTIMATE_CHAIN).toHaveLength(4)
    const ns = LATENCIES.map(l => l.ns)
    expect(ns).toEqual([...ns].sort((a, b) => a - b))
  })
})

describe('tiers and tricks', () => {
  it('has a question for every tier of the canvas, in the order the canvas draws them', () => {
    expect(TIER_ORDER.length).toBe(Object.keys(TIER_INFO).length)
    for (const t of TIER_ORDER) { expect(TIER_INFO[t], t).toBeTruthy(); expect(TIER_WALK[t].ask.endsWith('?'), t).toBe(true); expect(TIER_WALK[t].examples.length, t).toBeGreaterThan(20) }
  })
  it('has eight tricks with a title and an explanation each', () => {
    expect(TRICKS).toHaveLength(8)
    for (const t of TRICKS) { expect(t.title).toBeTruthy(); expect(t.body.length).toBeGreaterThan(40) }
  })
})

describe('levels, frameworks and the AI process', () => {
  it('lines the frameworks up with every timed phase, in order', () => {
    expect(FRAMEWORKS.map(f => f.phase)).toEqual(PHASES.map(p => p.id))
    for (const f of FRAMEWORKS) { expect(f.fourStep).toBeTruthy(); expect(f.entityFirst).toBeTruthy() }
  })
  it('has three levels and a seven step process, each step with an example', () => {
    expect(LEVELS).toHaveLength(3)
    expect(AI_STEPS).toHaveLength(7)
    for (const s of AI_STEPS) { expect(s.text.length, s.title).toBeGreaterThan(20); expect(s.example.length, s.title).toBeGreaterThan(20) }
    expect(AI_CAVEATS.length).toBeGreaterThanOrEqual(3)
  })
})

describe('interview guide page', () => {
  it('renders the sections, the phase steps and both practice buttons', () => {
    const html = renderToStaticMarkup(createElement(InterviewGuide, { onPractice: () => {}, onExplore: () => {}, onHome: () => {} }))
    for (const t of ['How to approach a system design interview', 'The shape of 45 minutes', 'What to clarify', 'Step through it', 'Numbers to know', 'Mistakes to avoid']) expect(html).toContain(t)
    expect(html.match(/role="tab"/g)).toHaveLength(PHASES.length)
    expect(html).toContain('Practise on the clock')
    expect(html.match(/class="gv-mini"/g)).toHaveLength(EVOLVE.length)
    expect(html).toContain('gv-ring')
    expect(html.match(/gv-lat-row/g)).toHaveLength(LATENCIES.length)
    expect(html.match(/<li style="animation-delay/g)).toHaveLength(GUIDE_PHASES.length)
    expect(html).toContain('1,700')
    expect(html.match(/Back to home/g)).toHaveLength(2)
    expect(html).toContain('Walk the tiers')
    expect(html).toContain('Tricks that help')
    for (const t of ['Frameworks you will meet elsewhere', 'What is expected by level', 'How an AI approaches system design questions']) expect(html).toContain(t)
    expect(html.match(/In Ticket Booking/g)).toHaveLength(AI_STEPS.length)
    expect(html.match(/class="gv-tier-card"/g)).toHaveLength(TIER_ORDER.length)
    expect(html).not.toContain('—')
  })
})

describe('guide diagram layout', () => {
  const inside = (x: number, y: number, b: { x: number; y: number }) => x > b.x + 1 && x < b.x + MINI.bw - 1 && y > b.y + 1 && y < b.y + MINI.bh - 1
  it('keeps every connector clear of the boxes it does not join, and attached to the boxes it does', () => {
    for (const stage of EVOLVE) {
      const g = miniGeometry(stage)
      for (const l of g.lines) {
        for (const b of g.boxes.filter(b => b.id !== l.from && b.id !== l.to)) {
          for (let t = 0; t <= 1; t += 0.02) expect(inside(l.x1 + (l.x2 - l.x1) * t, l.y1 + (l.y2 - l.y1) * t, b), `${stage.title}: ${l.key} crosses ${b.id}`).toBe(false)
        }
        const a = g.boxes.find(b => b.id === l.from)!, z = g.boxes.find(b => b.id === l.to)!
        const onEdge = (x: number, y: number, b: { x: number; y: number }) => x >= b.x - 0.1 && x <= b.x + MINI.bw + 0.1 && y >= b.y - 0.1 && y <= b.y + MINI.bh + 0.1
        expect(onEdge(l.x1, l.y1, a) && onEdge(l.x2, l.y2, z), `${stage.title}: ${l.key} is attached`).toBe(true)
      }
      expect(g.boxes.every(b => b.x >= 0 && b.x + MINI.bw <= g.width && b.y >= 0 && b.y + MINI.bh <= g.height)).toBe(true)
    }
  })
  it('draws every connector straight across or straight up and down, never at a slant', () => {
    for (const stage of EVOLVE) for (const l of miniGeometry(stage).lines) expect(l.x1 === l.x2 || l.y1 === l.y2, `${stage.title}: ${l.key}`).toBe(true)
  })
  it('leaves every component connected, with the same place each time it appears', () => {
    for (const s of EVOLVE) for (const b of s.boxes) expect(s.edges.some(([a, z]) => a === b.id || z === b.id), `${s.title}: ${b.id} is connected`).toBe(true)
    const place = new Map<string, string>()
    for (const s of EVOLVE) for (const b of s.boxes) { const at = `${b.x},${b.y}`; expect(place.get(b.id) ?? at, b.id).toBe(at); place.set(b.id, at) }
  })
})
