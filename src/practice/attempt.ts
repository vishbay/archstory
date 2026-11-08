// A practice attempt is an ordinary archstory/v1 design that the learner builds up step by step.
// These are pure edit operations so the UI stays thin and the rules are testable.
import { findEdge, type Design, type DNode, type Flow, type Step, type StepKind } from '../model/schema'
import { kindInfo } from '../model/kinds'

export const attemptId = (ref: Design) => `attempt-${ref.id}`

export function blankAttempt(ref: Design): Design {
  return {
    schema: 'archstory/v1', id: attemptId(ref),
    meta: { title: `My answer: ${ref.meta.title}`, summary: ref.meta.summary, tags: [] },
    requirements: ref.requirements, network: ref.network,
    nodes: [], groups: [], edges: [], flows: [], notes: [], reasoning: {},
  }
}

const uniqueId = (taken: string[], base: string) => {
  let id = base, i = 2
  while (taken.includes(id)) id = `${base}_${i++}`
  return id
}

export function addNode(d: Design, kind: string): { design: Design; id: string } {
  const id = uniqueId(d.nodes.map(n => n.id), kind)
  const same = d.nodes.filter(n => n.kind === kind).length
  const label = same ? `${kindInfo(kind).label} ${same + 1}` : kindInfo(kind).label
  return { design: { ...d, nodes: [...d.nodes, { id, label, kind }] }, id }
}

export const updateNode = (d: Design, id: string, patch: Partial<DNode>): Design =>
  ({ ...d, nodes: d.nodes.map(n => (n.id === id ? { ...n, ...patch } : n)) })

export function removeNode(d: Design, id: string): Design {
  return {
    ...d,
    nodes: d.nodes.filter(n => n.id !== id),
    edges: d.edges.filter(e => e.from !== id && e.to !== id),
    flows: d.flows.map(f => ({ ...f, steps: f.steps.filter(s => s.from !== id && s.to !== id) })),
    notes: d.notes.filter(n => n.target !== id),
  }
}

/** Adds a connection unless it would be a self-loop or duplicates an existing one (in either direction). */
export function connect(d: Design, from: string, to: string): Design {
  if (from === to || findEdge(d, from, to)) return d
  return { ...d, edges: [...d.edges, { from, to }] }
}

const sameEdge = (from: string, to: string) => (e: { from: string; to: string }) => e.from === from && e.to === to
export const removeEdge = (d: Design, from: string, to: string): Design => ({ ...d, edges: d.edges.filter(e => !sameEdge(from, to)(e)) })
export const flipEdge = (d: Design, from: string, to: string): Design =>
  ({ ...d, edges: d.edges.map(e => (sameEdge(from, to)(e) ? { ...e, from: to, to: from } : e)) })
export const setEdgeAsync = (d: Design, from: string, to: string, async: boolean): Design =>
  ({ ...d, edges: d.edges.map(e => (sameEdge(from, to)(e) ? { ...e, async: async || undefined } : e)) })

export function addFlow(d: Design): { design: Design; id: string } {
  const id = uniqueId(d.flows.map(f => f.id), `flow-${d.flows.length + 1}`)
  const flow: Flow = { id, title: `Flow ${d.flows.length + 1}`, steps: [] }
  return { design: { ...d, flows: [...d.flows, flow] }, id }
}
const mapFlow = (d: Design, id: string, fn: (f: Flow) => Flow): Design => ({ ...d, flows: d.flows.map(f => (f.id === id ? fn(f) : f)) })
export const renameFlow = (d: Design, id: string, title: string) => mapFlow(d, id, f => ({ ...f, title }))
export const removeFlow = (d: Design, id: string): Design => ({ ...d, flows: d.flows.filter(f => f.id !== id) })

/** The kind a recorded hop gets from the drawing: along an edge = request, against it = response. */
export function stepKindFor(d: Design, from: string, to: string): StepKind {
  if (from === to) return 'local'
  const e = findEdge(d, from, to)
  if (!e) return 'req'
  if (e.reverse) return 'res'
  return e.edge.async ? 'async' : 'req'
}

const DEFAULT_LABEL: Record<StepKind, string> = { req: 'request', res: 'response', async: 'event', local: 'process' }

export function appendStep(d: Design, flowId: string, from: string, to: string): Design {
  const kind = stepKindFor(d, from, to)
  return mapFlow(d, flowId, f => ({ ...f, steps: [...f.steps, { from, to, kind, label: DEFAULT_LABEL[kind] }] }))
}
export const updateStep = (d: Design, flowId: string, i: number, patch: Partial<Step>) =>
  mapFlow(d, flowId, f => ({ ...f, steps: f.steps.map((s, j) => (j === i ? { ...s, ...patch } : s)) }))
export const removeStep = (d: Design, flowId: string, i: number) =>
  mapFlow(d, flowId, f => ({ ...f, steps: f.steps.filter((_, j) => j !== i) }))

/** Why a recorded step cannot actually run on the drawn system, or null when it can. */
export function stepProblem(d: Design, s: Step): string | null {
  if (s.from === s.to) return null
  if (findEdge(d, s.from, s.to)) return null
  const name = (id: string) => d.nodes.find(n => n.id === id)?.label ?? id
  return `No connection between ${name(s.from)} and ${name(s.to)}`
}
