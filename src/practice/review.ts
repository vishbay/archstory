// AI review by copy and paste: a prompt that asks any assistant for a structured review, and a parser for its answer.
// The same prompt and format will back an optional API integration later.
import { z } from 'zod'
import type { Design } from '../model/schema'
import type { Check } from './checks'

export const DIMENSIONS = [
  { id: 'requirements', title: 'Requirements', rubric: 'covers the functional and non-functional requirements and the stated scale' },
  { id: 'architecture', title: 'Architecture', rubric: 'sensible components and connections; the recorded request flows make sense' },
  { id: 'data', title: 'Data', rubric: 'storage choices, data model, caching and consistency' },
  { id: 'scale', title: 'Scalability', rubric: 'handles the stated load; names bottlenecks; partitioning and replication' },
  { id: 'reliability', title: 'Reliability', rubric: 'no single points of failure; failure handling; meets availability targets' },
  { id: 'operations', title: 'Monitoring', rubric: 'how it would be run: SLIs and SLOs tied to the requirements, alerts on symptoms users feel, tracing and logging to find a cause (from the written reasoning or monitoring components if present, otherwise say it was not addressed)' },
  { id: 'tradeoffs', title: 'Trade-offs', rubric: 'explains choices and alternatives (from the written reasoning if present, otherwise judged from the design)' },
] as const
export const SEVERITIES = ['critical', 'major', 'minor', 'praise'] as const

const Score = z.coerce.number().min(1).max(5)
export const ReviewSchema = z.object({
  schema: z.enum(['archstory-review/v1', 'sysdesign-review/v1']).optional(),   // second id: before the rename
  overall: Score,
  summary: z.string(),
  scores: z.array(z.object({ dimension: z.enum(DIMENSIONS.map(d => d.id) as [string, ...string[]]), score: Score, comment: z.string().default('') })).default([]),
  // A finding with no headline is still useful: derive one from its text instead of rejecting the whole review.
  findings: z.array(z.object({
    target: z.string().nullable().default(null),
    severity: z.enum(SEVERITIES),
    title: z.string().optional(),
    detail: z.string().default(''),
    suggestion: z.string().optional(),
  }).transform(f => ({ ...f, title: f.title?.trim() || f.detail.split(/(?<=[.!?])\s/)[0].slice(0, 90) || 'Finding' }))).default([]),
  followUps: z.array(z.string()).default([]),
})
export type Review = z.infer<typeof ReviewSchema>
export type Finding = Review['findings'][number]

export type ReviewParse = { ok: true; review: Review; warnings: string[] } | { ok: false; errors: string[] }

/** Validates an AI review. Findings that point at components that don't exist become design-wide instead of failing. */
export function parseReview(json: unknown, attempt: Design): ReviewParse {
  const r = ReviewSchema.safeParse(json)
  if (!r.success) return { ok: false, errors: r.error.issues.map(i => `${i.path.join('.') || '(root)'}: ${i.message}`) }
  const ids = new Set(attempt.nodes.map(n => n.id))
  const warnings: string[] = []
  const findings = r.data.findings.map(f => {
    if (f.target && !ids.has(f.target)) { warnings.push(`Finding "${f.title}" pointed at unknown component "${f.target}"; shown as design-wide.`); return { ...f, target: null } }
    return f
  })
  const order = { critical: 0, major: 1, minor: 2, praise: 3 }
  return { ok: true, review: { ...r.data, findings: findings.sort((a, b) => order[a.severity] - order[b.severity]) }, warnings }
}

/** Cheap fingerprint of an answer, to tell when a stored review no longer matches it. */
export function signature(d: Design): string {
  const s = JSON.stringify([d.nodes, d.edges, d.flows, d.reasoning])
  let h = 5381
  for (let i = 0; i < s.length; i++) h = (h * 33) ^ s.charCodeAt(i)
  return (h >>> 0).toString(36)
}

const REASONING_TITLES: Record<string, string> = {
  requirements: 'Requirements and assumptions', estimates: 'Capacity estimates', api: 'API design',
  data_model: 'Data model', monitoring: 'Monitoring and alerting', tradeoffs: 'Trade-offs and bottlenecks',
}

const EXAMPLE: Review = {
  schema: 'archstory-review/v1',
  overall: 3,
  summary: 'Two or three sentences on the overall quality and the single most important improvement.',
  scores: DIMENSIONS.map(d => ({ dimension: d.id, score: 3, comment: `One sentence on ${d.title.toLowerCase()}.` })),
  findings: [
    { target: '<component id>', severity: 'major', title: 'Short headline', detail: 'What is wrong and why it matters at this scale.', suggestion: 'Concretely what to change.' },
    { target: null, severity: 'praise', title: 'Short headline', detail: 'What is done well.' },
  ],
  followUps: ['A question the interviewer would ask next'],
}

export function reviewPrompt(attempt: Design, ref: Design, checks: Check[], includeReference: boolean): string {
  const r = ref.requirements
  const list = (xs: string[]) => xs.map(x => `- ${x}`).join('\n')
  const answer = { nodes: attempt.nodes, edges: attempt.edges, flows: attempt.flows, notes: attempt.notes }
  const reasoning = Object.entries(attempt.reasoning ?? {}).filter(([, v]) => v.trim())
  const found = checks.filter(c => c.level === 'fail' || c.level === 'warn')
  const refShort = {
    nodes: ref.nodes.map(({ id, label, kind, description }) => ({ id, label, kind, description })),
    edges: ref.edges,
    flows: ref.flows.map(f => ({ title: f.title, steps: f.steps.map(s => `${s.from} → ${s.to}: ${s.label}`) })),
    notes: ref.notes.map(n => n.text),
    monitoring: ref.observability && {
      slos: ref.observability.slos.map(s => `${s.name}: ${s.target}%${s.threshold ? ` ${s.threshold}` : ''}`),
      pages: ref.observability.alerts.filter(a => a.severity === 'page').map(a => a.when),
      tickets: ref.observability.alerts.filter(a => a.severity === 'ticket').map(a => a.when),
    },
  }
  const ids = attempt.nodes.map(n => `"${n.id}"`).join(', ') || '(none)'

  return `You are a senior engineer running a system design interview. Review the candidate's answer below and grade it.

# Problem: ${ref.meta.title}
${ref.meta.summary ?? ''}

Functional requirements:
${list(r.functional)}

Non-functional requirements:
${list(r.nonFunctional)}

Scale:
${list(r.scale.map(s => `${s.label}: ${s.value}`))}

# The candidate's design
JSON in the archstory/v1 format: nodes are components, edges point from caller to callee, and flows are request paths the candidate walked through step by step.
\`\`\`json
${JSON.stringify(answer)}
\`\`\`
${reasoning.length ? `
# The candidate's written reasoning
${reasoning.map(([k, v]) => `## ${REASONING_TITLES[k] ?? k}\n${v.trim()}`).join('\n\n')}
` : `
The candidate did not write any reasoning; judge trade-offs from the design alone and say so.
`}${found.length ? `
# Automatic checks already flagged (hints only, verify them yourself)
${list(found.map(c => `${c.title}${c.detail ? `: ${c.detail}` : ''}`))}
` : ''}${includeReference ? `
# A reference answer for comparison
This is one good answer, not the only one. Do not penalize valid alternatives; do point out important ideas the candidate missed.
\`\`\`json
${JSON.stringify(refShort)}
\`\`\`
` : ''}
# How to grade
Score each dimension from 1 (poor) to 5 (excellent):
${DIMENSIONS.map(d => `- ${d.id}: ${d.rubric}`).join('\n')}

Respond with only a JSON object in a single \`\`\`json code block, in exactly this shape:
\`\`\`json
${JSON.stringify(EXAMPLE, null, 2)}
\`\`\`

Rules:
- "target" in each finding is one of these component ids, or null for a design-wide finding: ${ids}.
- "severity" is one of "critical", "major", "minor" or "praise". Include 2 to 4 "praise" findings for what is done well.
- Give 4 to 10 findings, most important first. Each non-praise finding has a concrete "suggestion".
- "followUps" has 3 to 5 questions an interviewer would ask next.
- Be specific to this design and this problem. Do not use em dashes.
`
}
