// A prompt that hands one design to an AI assistant so the learner can ask about it: the design as a readable walkthrough
// (every component, connection, flow step and note, with the same names and step numbers the app shows) and rules that keep
// the answers about THIS design, not a typical one. Pure text in, text out.
import { isOnPrem, type Design, type DNode } from '../model/schema'
import { KINDS } from '../model/kinds'

export interface DiscussOptions {
  /** The scenario being watched, flagged so "this step" questions make sense. */
  flowId?: string
  /** Include the model answers to the follow-up questions (off by default, so the AI can quiz without spoilers). */
  answers?: boolean
  /** Add the raw archstory/v1 JSON after the walkthrough, as the exact source of truth. */
  json?: boolean
}

const kindName = (n: DNode) => KINDS[n.kind]?.label ?? n.kind
const list = (xs: string[]) => xs.map(x => `- ${x}`).join('\n')

export function discussPrompt(d: Design, o: DiscussOptions = {}): string {
  const byId = new Map(d.nodes.map(n => [n.id, n]))
  const name = (id: string) => byId.get(id)?.label ?? id
  const out: string[] = []
  const section = (title: string, body: string | string[]) => { const t = Array.isArray(body) ? body.join('\n') : body; if (t.trim()) out.push(`## ${title}\n${t}`) }

  out.push(`I am studying a system design called "${d.meta.title}" and want to ask you questions about it. Below is the exact design I am looking at.

How to answer:
- Treat the design below as the source of truth. Answer about THIS design, with its components, connections and steps, not about a typical or textbook design. Where the two differ, say so and explain why the design might do it this way.
- Refer to components by their names here and to flow steps by number (for example "Cache miss, step 5"), so I can check your answer against the design.
- Keep what is in this design apart from what you are adding: label general knowledge as "in general" or "an alternative would be".
- If the design does not say something (a number, a technology choice, a failure behaviour), say "the design does not specify this" and then give your best reasoning, marked as an assumption. Do not present guesses as part of the design.
- Be concrete about trade-offs, failure behaviour and scale. Ask me a short clarifying question if mine is ambiguous.`)

  const head = [d.meta.summary, d.meta.difficulty && `Difficulty: ${d.meta.difficulty}.`].filter(Boolean).join(' ')
  section(`Design: ${d.meta.title}`, head)

  const r = d.requirements
  section('Requirements', [
    r.functional.length ? `Functional:\n${list(r.functional)}` : '',
    r.nonFunctional.length ? `Non-functional:\n${list(r.nonFunctional)}` : '',
    r.scale.length ? `Scale:\n${list(r.scale.map(s => `${s.label}: ${s.value}`))}` : '',
  ].filter(Boolean))

  if (d.network) {
    const n = d.network
    section('Network', list([
      `${n.zones} availability zone${n.zones === 1 ? '' : 's'}${n.cidr ? `, address range ${n.cidr}` : ''}, outbound internet access: ${n.egress === 'nat' ? 'through NAT' : 'none'}`,
      ...n.subnets.map(s => `${s.label}${s.public ? ' (public)' : ' (private)'}${s.cidr ? `, ${s.cidr}` : ''}, holds the ${s.tiers.join(', ') || 'unassigned'} tier`),
    ]))
  }
  if (d.regions) {
    const g = d.regions
    section('Regions and disaster recovery', list([
      `Regions: ${g.regions.map(x => `${x.name} (${x.role})`).join(', ')}`,
      `Strategy: ${g.strategy}. RTO ${g.rto}, RPO ${g.rpo}`,
      `Failover: ${g.failover}${g.dnsTtl ? ` (DNS TTL ${g.dnsTtl} s)` : ''}`,
    ]))
  }

  section('Components', list(d.nodes.map(n => {
    const bits = [
      `${n.label} (${kindName(n)}${n.tier ? `, ${n.tier} tier` : ''})`,
      n.description && (/[.!?]$/.test(n.description.trim()) ? n.description.trim() : `${n.description.trim()}.`),
      n.cloud && Object.keys(n.cloud).length ? `Managed product: ${Object.entries(n.cloud).map(([c, p]) => `${c.toUpperCase()} ${p}`).join(', ')}.` : '',
      isOnPrem(n) ? 'Runs on premises, in the customer data centre.' : '',
      n.ha ? `High availability: ${n.ha}.` : '', n.replicas ? `${n.replicas} replicas.` : '',
      n.regions ? `Across regions: ${n.regions}.` : '', n.replication ? `Cross-region replication: ${n.replication}.` : '',
    ]
    return bits.filter(Boolean).join(' ')
  })))

  section('Connections (caller to callee)', list(d.edges.map(e => `${name(e.from)} -> ${name(e.to)}${e.async ? ' (asynchronous)' : ''}${e.label ? `: ${e.label}` : ''}${e.protocol ? ` [${e.protocol}]` : ''}`)))

  for (const f of d.flows) {
    const here = f.id === o.flowId ? '  <- the scenario I am watching right now' : ''
    const steps: string[] = []
    let phase = ''
    f.steps.forEach((s, i) => {
      if (s.phase && s.phase !== phase) { phase = s.phase; steps.push(`${phase}:`) }
      const route = s.kind === 'local' ? name(s.from) : `${name(s.from)} -> ${name(s.to)}`
      steps.push(`${i + 1}. [${s.kind}] ${route}: ${s.label}${s.detail ? `. ${s.detail}` : ''}${s.payload ? `\n     Example message:\n${s.payload.trim().split('\n').map(l => `     ${l}`).join('\n')}` : ''}`)
    })
    section(`Request flow: ${f.title}${here}`, [f.summary ?? '', ...steps].filter(Boolean))
  }

  if (d.notes.length) section('Notes on trade-offs, scaling and failure', list(d.notes.map(n => `[${n.kind}] ${n.target ? `${name(n.target)}: ` : ''}${n.text}`)))

  const ob = d.observability
  if (ob) {
    section('Monitoring', [
      ob.slos.length ? `Service level objectives:\n${list(ob.slos.map(s => `${s.name}: ${s.target}% (${s.sli}${s.threshold ? `, good means ${s.threshold}` : ''})`))}` : '',
      ob.alerts.length ? `Alerts:\n${list(ob.alerts.map(a => `${a.severity}: ${a.when}. ${a.why}`))}` : '',
    ].filter(Boolean))
  }

  if (d.questions.length) {
    section(o.answers ? 'Follow-up questions an interviewer might ask, with model answers' : 'Follow-up questions an interviewer might ask (answers left out on purpose)',
      list(d.questions.map(q => o.answers ? `${q.q}\n  Model answer: ${q.a}` : q.q)))
  }

  if (o.json) out.push(`## The same design as JSON (archstory/v1)\nThis is the exact source the walkthrough above was written from.\n\`\`\`json\n${JSON.stringify(d, null, 2)}\n\`\`\``)

  out.push('## My question\n')
  return out.join('\n\n')
}
