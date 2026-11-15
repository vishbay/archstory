// A practice answer and its AI review as one readable Markdown file the learner can keep, share or study from later.
import type { Design } from '../model/schema'
import { customRequirements, writtenNotes, NOTE_KIND_LABELS, type NoteKind } from './attempt'
import { DIMENSIONS, FIX_LABEL, REASONING_TITLES, signature, type Review } from './review'

export interface ReportInput {
  attempt: Design; reference: Design
  review: { review: Review; sig: string } | null
  checks?: { passed: number; total: number }
  at: Date
}

const SEV = { critical: 'Critical', major: 'Major', minor: 'Minor', praise: 'Praise' } as const
const list = (xs: string[]) => xs.map(x => `- ${x}`).join('\n')

export function attemptReport({ attempt: a, reference: ref, review, checks, at }: ReportInput): string {
  const name = (id: string) => a.nodes.find(n => n.id === id)?.label ?? id
  const own = customRequirements(a, ref)
  const out: string[] = []
  const section = (title: string, body: string) => { if (body.trim()) out.push(`## ${title}\n\n${body.trim()}`) }

  out.push(`# ${ref.meta.title}: my practice answer`)
  out.push([
    `Saved ${at.toISOString().slice(0, 10)}`,
    checks ? `automatic checks passed ${checks.passed} of ${checks.total}` : '',
    review ? `AI review ${review.review.overall} out of 5` : 'no AI review yet',
  ].filter(Boolean).join(' · '))

  section('The problem', [ref.meta.summary ?? '',
    ref.requirements.functional.length ? `**Functional**\n${list(ref.requirements.functional)}` : '',
    ref.requirements.nonFunctional.length ? `**Non-functional**\n${list(ref.requirements.nonFunctional)}` : '',
    own.functional.length || own.nonFunctional.length ? `**Requirements I added**\n${list([...own.functional.map(x => `Functional: ${x}`), ...own.nonFunctional.map(x => `Non-functional: ${x}`)])}` : '',
  ].filter(Boolean).join('\n\n'))

  const outline = (id?: string) => (id ? a.groups.find(g => g.id === id)?.label : undefined)
  section('My components', list(a.nodes.map(n => `**${n.label}** (${n.kind})${outline(n.group) ? `, in "${outline(n.group)}"` : ''}${n.replicas && n.replicas > 1 ? `, ${n.replicas} instances` : ''}${n.description ? `: ${n.description}` : ''}`)))
  section('My connections', list(a.edges.map(e => `${name(e.from)} to ${name(e.to)}${e.async ? ' (asynchronous)' : ''}`)))
  section('My request flows', a.flows.map(f => `**${f.title}**\n${f.steps.map((s, i) => `${i + 1}. ${s.from === s.to ? name(s.from) : `${name(s.from)} to ${name(s.to)}`}: ${s.label}`).join('\n')}`).join('\n\n'))
  section('My notes', list(writtenNotes(a).map(n => `${n.target ? `**${name(n.target)}** ` : ''}(${NOTE_KIND_LABELS[n.kind as NoteKind] ?? n.kind}): ${n.text.trim()}`)))
  section('My written reasoning', Object.entries(a.reasoning ?? {}).filter(([, v]) => v.trim()).map(([k, v]) => `### ${REASONING_TITLES[k] ?? k}\n\n${v.trim()}`).join('\n\n'))

  if (review) {
    const r = review.review
    const stale = review.sig !== signature(a) ? '\n\n> This review was written for an earlier version of the answer. Review again for one that matches.' : ''
    out.push(`## AI review: ${r.overall} out of 5\n\n${r.summary}${stale}`)
    section('Scores', r.scores.map(s => {
      const d = DIMENSIONS.find(x => x.id === s.dimension)
      return `- **${d?.title ?? s.dimension}: ${s.score} of 5.** ${s.comment}`.trim()
    }).join('\n'))
    section('Findings', r.findings.map(f =>
      `- **${SEV[f.severity]}: ${f.title}**${f.target ? ` (${name(f.target)})` : ''}${f.fix ? ` [${FIX_LABEL[f.fix]}]` : ''}${f.detail ? `\n  ${f.detail}` : ''}${f.suggestion ? `\n  To fix: ${f.suggestion}` : ''}`).join('\n'))
    section('Questions to practise next', list(r.followUps))
  }

  out.push(`## The answer as JSON\n\nImport-ready archstory/v1.\n\n\`\`\`json\n${JSON.stringify(a, null, 2)}\n\`\`\``)
  return out.join('\n\n') + '\n'
}
