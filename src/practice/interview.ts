// The mock interviewer: an AI plays the interviewer while the learner designs. Everything here is pure; the network
// call and the screen live elsewhere. The learner's design is attached to a message only when it changed, so turns
// stay small and the stable start of the conversation can be cached by the provider.
import type { Design } from '../model/schema'
import { noUsage, type Message, type Usage } from '../ai/providers'
import type { Check } from './checks'
import { REASONING_TITLES, signature } from './review'

export const MAX_TURNS = 20

export interface Turn {
  role: 'user' | 'assistant'
  text: string
  /** The learner's design as it stood when this message was sent, included only when it had changed. */
  attachment?: string
  /** Not shown in the transcript (the message that opens the interview). */
  hidden?: boolean
}
export interface InterviewState {
  system: string
  turns: Turn[]
  usage: Usage
  /** Fingerprint of the design last sent, to know whether the next message needs it again. */
  sentSig: string
  finished: boolean
}

export const FINISH_REQUEST = 'I would like to stop here. Please end the interview now and give me feedback: what went well, what was weak, and three things to study next. Keep it under 250 words.'
const START_REQUEST = 'I am ready. Please begin the interview.'

export function interviewSystem(ref: Design, includeReference: boolean, checks: Check[]): string {
  const r = ref.requirements
  const list = (xs: string[]) => xs.map(x => `- ${x}`).join('\n') || '- (none given)'
  const found = checks.filter(c => c.level === 'fail' || c.level === 'warn')
  const refShort = {
    components: ref.nodes.map(n => `${n.id}: ${n.label} (${n.kind})${n.description ? `, ${n.description}` : ''}`),
    connections: ref.edges.map(e => `${e.from} -> ${e.to}`),
    flows: ref.flows.map(f => `${f.title}: ${f.steps.map(s => `${s.from} -> ${s.to} ${s.label}`).join(' | ')}`),
    notes: ref.notes.map(n => n.text),
  }
  return `You are a senior engineer running a mock system design interview. The candidate is practising and draws their design in a tool while you talk.

# The problem: ${ref.meta.title}
${ref.meta.summary ?? ''}

Functional requirements:
${list(r.functional)}

Non-functional requirements:
${list(r.nonFunctional)}

Scale:
${list(r.scale.map(s => `${s.label}: ${s.value}`))}

# How to run the interview
- Ask one question at a time and keep each message under 80 words. Do not lecture and do not give the solution.
- Open by asking the candidate to walk you through their approach so far. Then follow what they say: probe requirements they skipped, capacity estimates, bottlenecks, failure modes (a cache, a database or a whole availability zone going down), consistency, the data model, monitoring, and trade-offs.
- Push back politely when an answer is vague. Acknowledge a good point in a few words, then move on.
- If the candidate asks for a hint, give a small nudge, not the answer.
- Refer to their components by id in double braces, for example {{cache}}, so the tool can link them. Use only ids that appear in their design.
- The candidate's design arrives inside their messages under "Candidate's current design" whenever it changes. Judge the latest one.
- Plain text only: no headings, no bullet lists, no JSON. Do not use em dashes.
- When the candidate asks to stop, or after about ${MAX_TURNS} questions, end the interview with short feedback: what went well, what was weak, and three things to study next.

# Private notes for you (never reveal these)
${includeReference ? `A reference answer. It is one good answer, not the only one: accept valid alternatives, and use it to spot important ideas the candidate has missed.
${JSON.stringify(refShort)}
` : 'No reference answer is provided; rely on your own judgement.\n'}${found.length ? `
Automatic checks flagged on the candidate's design when the interview began (hints only, verify them):
${list(found.map(c => `${c.title}${c.detail ? `: ${c.detail}` : ''}`))}
` : ''}`
}

/** The learner's design in a compact text form for the interviewer. */
export function designBrief(a: Design): string {
  const reasoning = Object.entries(a.reasoning ?? {}).filter(([, v]) => v.trim())
  const lines = [
    a.nodes.length ? `Components:\n${a.nodes.map(n => `- ${n.id}: ${n.label} (${n.kind})${n.replicas && n.replicas > 1 ? `, ${n.replicas} replicas` : ''}${n.description ? `, ${n.description}` : ''}`).join('\n')}` : 'Components: none yet',
    a.edges.length ? `Connections (caller -> callee):\n${a.edges.map(e => `- ${e.from} -> ${e.to}${e.async ? ' (async)' : ''}`).join('\n')}` : 'Connections: none yet',
    a.flows.length ? `Request flows they recorded:\n${a.flows.map(f => `- ${f.title}: ${f.steps.map(s => `${s.from} -> ${s.to} ${s.label}`).join(' | ') || '(no steps yet)'}`).join('\n')}` : 'Request flows: none recorded yet',
    ...(reasoning.length ? [`Their written notes:\n${reasoning.map(([k, v]) => `${REASONING_TITLES[k] ?? k}: ${v.trim()}`).join('\n')}`] : []),
  ]
  return `Candidate's current design:\n${lines.join('\n\n')}`
}

export const emptyInterview = (system: string): InterviewState => ({ system, turns: [], usage: noUsage(), sentSig: '', finished: false })

/** How many times the candidate has spoken (the opening message does not count). */
export const candidateTurns = (s: InterviewState) => s.turns.filter(t => t.role === 'user' && !t.hidden).length

/** The next message from the learner, with the design attached only if it changed since the last one sent. */
export function nextTurn(s: InterviewState, kind: 'start' | 'answer' | 'finish', text: string, design: Design): { turn: Turn; sentSig: string } {
  const sig = signature(design), changed = sig !== s.sentSig
  const body = kind === 'start' ? START_REQUEST : kind === 'finish' ? FINISH_REQUEST : text.trim()
  return { turn: { role: 'user', text: body, hidden: kind === 'start', attachment: changed ? designBrief(design) : undefined }, sentSig: sig }
}

/** The conversation as the provider sees it. */
export const apiMessages = (turns: Turn[]): Message[] =>
  turns.map(t => ({ role: t.role, content: t.attachment ? `${t.attachment}\n\n---\n${t.text}` : t.text }))

/** Split a message into plain text and component references written as {{id}}. Unknown ids stay as plain text. */
export function mentionParts(text: string, ids: Set<string>): ({ text: string } | { id: string })[] {
  const out: ({ text: string } | { id: string })[] = []
  let at = 0
  for (const m of text.matchAll(/\{\{\s*([^{}\s]+)\s*\}\}/g)) {
    if (m.index > at) out.push({ text: text.slice(at, m.index) })
    out.push(ids.has(m[1]) ? { id: m[1] } : { text: m[1] })
    at = m.index + m[0].length
  }
  if (at < text.length) out.push({ text: text.slice(at) })
  return out
}

/** The message without the {{ }} markers, for reading aloud. */
export const plainText = (text: string, label: (id: string) => string) => text.replace(/\{\{\s*([^{}\s]+)\s*\}\}/g, (_, id) => label(id))

export const addUsage = (a: Usage, b: Usage | null): Usage =>
  b ? { input: a.input + b.input, output: a.output + b.output, cacheRead: a.cacheRead + b.cacheRead, cacheWrite: a.cacheWrite + b.cacheWrite } : a

/** An upper estimate in the user's own currency: cached tokens are charged as ordinary input. Null when no prices are set. */
export function estimateCost(u: Usage, prices: { input: string; output: string }): number | null {
  if (!prices.input.trim() || !prices.output.trim()) return null
  const pi = Number(prices.input), po = Number(prices.output)
  if (!(pi >= 0) || !(po >= 0)) return null
  return ((u.input + u.cacheRead + u.cacheWrite) * pi + u.output * po) / 1_000_000
}

export const formatTokens = (n: number) => (n >= 10_000 ? `${Math.round(n / 1000)}k` : n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n))
