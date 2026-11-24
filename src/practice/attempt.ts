// A practice attempt is an ordinary archstory/v1 design that the learner builds up step by step.
// These are pure edit operations so the UI stays thin and the rules are testable.
import { findEdge, NOTE_KINDS, type Alert, type Design, type Observability, type Slo, type Group, type DNode, type Flow, type Step, type StepKind } from '../model/schema'
import { kindInfo } from '../model/kinds'

export const attemptId = (ref: Design) => `attempt-${ref.id}`

export function blankAttempt(ref: Design): Design {
  return {
    schema: 'archstory/v1', id: attemptId(ref),
    meta: { title: `My answer: ${ref.meta.title}`, summary: ref.meta.summary, tags: [] },
    requirements: ref.requirements, network: ref.network,
    nodes: [], groups: [], edges: [], flows: [], notes: [], questions: [], reasoning: {},
  }
}

export type ReqKind = 'functional' | 'nonFunctional'
export const REQ_MAX = 200

/** Add a requirement of the learner's own to their answer. Blank or repeated text changes nothing. */
export function addRequirement(d: Design, kind: ReqKind, text: string): Design {
  const t = text.trim().replace(/\s+/g, ' ').slice(0, REQ_MAX)
  if (!t || d.requirements[kind].includes(t)) return d
  return { ...d, requirements: { ...d.requirements, [kind]: [...d.requirements[kind], t] } }
}
export const removeRequirement = (d: Design, kind: ReqKind, text: string): Design =>
  ({ ...d, requirements: { ...d.requirements, [kind]: d.requirements[kind].filter(x => x !== text) } })

/** The requirements the learner added: in their answer but not in the problem. */
export const customRequirements = (d: Design, ref: Design): Record<ReqKind, string[]> => ({
  functional: d.requirements.functional.filter(x => !ref.requirements.functional.includes(x)),
  nonFunctional: d.requirements.nonFunctional.filter(x => !ref.requirements.nonFunctional.includes(x)),
})

/** A prompt block listing the learner's own requirements, or nothing when they added none. */
export function extraRequirementsText(d: Design, ref: Design): string {
  const c = customRequirements(d, ref)
  const lines = [...c.functional.map(x => `- Functional: ${x}`), ...c.nonFunctional.map(x => `- Non-functional: ${x}`)]
  return lines.length ? `Requirements the candidate added themselves (the problem does not state them): judge the design against them too, and say so if one is unreasonable or conflicts with the stated ones:\n${lines.join('\n')}\n\n` : ''
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

export type NoteKind = (typeof NOTE_KINDS)[number]
export const NOTE_KIND_LABELS: Record<NoteKind, string> = { tradeoff: 'Trade-off', scaling: 'Scaling', failure: 'Failure', security: 'Security', note: 'Note' }

/** A written explanation attached to a component: the part of an answer a drawing cannot show. */
export const addNote = (d: Design, target: string, text = '', kind: NoteKind = 'note'): Design =>
  ({ ...d, notes: [...d.notes, { target, kind, text }] })
export const updateNote = (d: Design, index: number, patch: { kind?: NoteKind; text?: string }): Design =>
  ({ ...d, notes: d.notes.map((n, i) => (i === index ? { ...n, ...patch } : n)) })
export const removeNote = (d: Design, index: number): Design => ({ ...d, notes: d.notes.filter((_, i) => i !== index) })
/** The notes that say something (a note left blank is not part of the answer). */
export const writtenNotes = (d: Design) => d.notes.filter(n => n.text.trim())

export const emptyObservability = (): Observability => ({ slos: [], alerts: [], signals: [], debug: [] })
const keepObs = (d: Design, o: Observability): Design =>
  ({ ...d, observability: o.slos.length || o.alerts.length || o.signals.length || o.debug.length ? o : undefined })
const nextId = (taken: string[], base: string) => { let i = 1; while (taken.includes(`${base}_${i}`)) i++; return `${base}_${i}` }

/** The learner's monitoring plan: service level objectives and the alerts that protect them. */
export function addSlo(d: Design): Design {
  const o = d.observability ?? emptyObservability()
  const slo: Slo = { id: nextId(o.slos.map(x => x.id), 'slo'), name: '', kind: 'availability', sli: '', target: 99.9, window: 30 }
  return keepObs(d, { ...o, slos: [...o.slos, slo] })
}
export function updateSlo(d: Design, id: string, patch: Partial<Omit<Slo, 'id'>>): Design {
  const o = d.observability ?? emptyObservability()
  return keepObs(d, { ...o, slos: o.slos.map(x => (x.id === id ? { ...x, ...patch } : x)) })
}
export function removeSlo(d: Design, id: string): Design {
  const o = d.observability ?? emptyObservability()
  return keepObs(d, { ...o, slos: o.slos.filter(x => x.id !== id), alerts: o.alerts.map(a => (a.slo === id ? { ...a, slo: undefined } : a)) })
}
export function addAlert(d: Design): Design {
  const o = d.observability ?? emptyObservability()
  const alert: Alert = { id: nextId(o.alerts.map(x => x.id), 'alert'), severity: 'page', when: '', why: '' }
  return keepObs(d, { ...o, alerts: [...o.alerts, alert] })
}
export function updateAlert(d: Design, id: string, patch: Partial<Omit<Alert, 'id'>>): Design {
  const o = d.observability ?? emptyObservability()
  return keepObs(d, { ...o, alerts: o.alerts.map(x => (x.id === id ? { ...x, ...patch } : x)) })
}
export const removeAlert = (d: Design, id: string): Design => {
  const o = d.observability ?? emptyObservability()
  return keepObs(d, { ...o, alerts: o.alerts.filter(x => x.id !== id) })
}
/** The SLOs and alerts that say something (blank forms are not part of the answer). */
export function writtenMonitoring(d: Design): { slos: Slo[]; alerts: Alert[] } {
  const o = d.observability
  return { slos: (o?.slos ?? []).filter(x => x.name.trim() || x.sli.trim()), alerts: (o?.alerts ?? []).filter(x => x.when.trim()) }
}

/** Outlines (groups) are only drawn around components, so one with no components left is dropped. */
export const pruneGroups = (d: Design): Design => {
  const used = new Set(d.nodes.map(n => n.group))
  return d.groups.every(g => used.has(g.id)) ? d : { ...d, groups: d.groups.filter(g => used.has(g.id)) }
}

/** The kinds of outline, tenant first because that is the one a design most often needs to draw. */
export const OUTLINE_KINDS: { kind: Group['kind']; label: string }[] = [
  { kind: 'tenant', label: 'Tenant (for example an enterprise silo)' }, { kind: 'region', label: 'Region' }, { kind: 'zone', label: 'Availability zone' },
  { kind: 'network', label: 'Network' }, { kind: 'cluster', label: 'Cluster' }, { kind: 'boundary', label: 'Boundary (trust, team or other)' },
]

/** Add an outline and put one component in it. Further components join it with setNodeGroup. */
export function addOutline(d: Design, nodeId: string, label: string, kind: Group['kind']): { design: Design; id: string } {
  const name = label.trim().replace(/\s+/g, ' ') || 'Outline'
  const id = uniqueId(d.groups.map(g => g.id), name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'outline')
  return { design: pruneGroups({ ...d, groups: [...d.groups, { id, label: name, kind }], nodes: d.nodes.map(n => (n.id === nodeId ? { ...n, group: id } : n)) }), id }
}

/** Put a component inside an outline, or take it out (undefined). An outline left empty disappears. */
export const setNodeGroup = (d: Design, nodeId: string, group: string | undefined): Design =>
  pruneGroups({ ...d, nodes: d.nodes.map(n => (n.id === nodeId ? { ...n, group } : n)) })

export const updateGroup = (d: Design, id: string, patch: Partial<Pick<Group, 'label' | 'kind'>>): Design =>
  ({ ...d, groups: d.groups.map(g => (g.id === id ? { ...g, ...patch } : g)) })

export function removeNode(d: Design, id: string): Design {
  return pruneGroups({
    ...d,
    nodes: d.nodes.filter(n => n.id !== id),
    edges: d.edges.filter(e => e.from !== id && e.to !== id),
    flows: d.flows.map(f => ({ ...f, steps: f.steps.filter(s => s.from !== id && s.to !== id) })),
    notes: d.notes.filter(n => n.target !== id),
    observability: d.observability && { ...d.observability, alerts: d.observability.alerts.map(a => (a.target === id ? { ...a, target: undefined } : a)), signals: d.observability.signals.filter(x => x.target !== id) },
  })
}

/** Adds a connection unless it would be a self-loop or duplicates an existing one (in either direction). */
export function connect(d: Design, from: string, to: string): Design {
  if (from === to || findEdge(d, from, to) || !d.nodes.some(n => n.id === from) || !d.nodes.some(n => n.id === to)) return d
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
