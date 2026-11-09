// Automatic feedback on a practice attempt, compared against the library's reference design.
// Kinds are grouped into families so equivalent choices (SQL vs NoSQL, queue vs stream) count the same.
import type { Design, DNode } from '../model/schema'
import { onRequestPath, resilience } from '../model/availability'
import { stepProblem } from './attempt'

export type Level = 'pass' | 'fail' | 'warn' | 'info'
export interface Check { id: string; level: Level; title: string; detail?: string; nodes?: string[] }

const FAMILY: Record<string, string> = {
  client: 'client', web_client: 'client', mobile_client: 'client',
  load_balancer: 'entry', network_load_balancer: 'entry', api_gateway: 'entry',
  sql_db: 'database', nosql_db: 'database',
  queue: 'queue', stream: 'queue',
  worker: 'worker', scheduler: 'worker',
  service: 'service', search: 'service',
}
const familyOf = (n: DNode) => FAMILY[n.kind] ?? n.kind

const FAMILY_NAME: Record<string, string> = {
  entry: 'a load balancer or API gateway', database: 'a database', queue: 'a queue or event stream', worker: 'background workers',
  cache: 'a cache', cdn: 'a CDN', dns: 'DNS', waf: 'a web application firewall', db_replica: 'read replicas',
  object_store: 'object storage', websocket_gateway: 'a WebSocket gateway', geo_index: 'a geo index', search_index: 'a search index',
  analytics: 'an analytics store', auth: 'an auth / identity service', key_gen: 'a key generator', rate_limiter: 'a rate limiter',
  payment_provider: 'a payment provider', notification_provider: 'a push / email provider', external_api: 'an external API',
}
const nameOfFamily = (f: string) => FAMILY_NAME[f] ?? `a ${f.replace(/_/g, ' ')}`
const UNCHECKED = new Set(['client', 'service'])
const TELEMETRY_KINDS = new Set(['telemetry_collector', 'metrics_store', 'log_store', 'trace_store', 'alerting', 'oncall'])
// Pieces interviewers usually treat as implied: worth saying out loud, but not a failure when missing.
const IMPLIED = new Set(['dns'])

export function runChecks(att: Design, ref: Design): { checks: Check[]; passed: number; total: number } {
  const checks: Check[] = []
  const add = (c: Check) => checks.push(c)
  const fams = (d: Design) => new Set(d.nodes.map(familyOf))
  const mine = fams(att), theirs = fams(ref)

  // 1. Something to evaluate
  if (att.nodes.length < 3) {
    add({ id: 'size', level: 'fail', title: 'Add more components', detail: 'Start with the request path: client, entry point, service and a datastore.' })
    return summarize(checks)
  }

  // 2. Wiring
  const linked = new Set(att.edges.flatMap(e => [e.from, e.to]))
  const orphans = att.nodes.filter(n => !linked.has(n.id))
  add(orphans.length
    ? { id: 'orphans', level: 'warn', title: `${orphans.length} component${orphans.length > 1 ? 's are' : ' is'} not connected`, detail: orphans.map(n => n.label).join(', '), nodes: orphans.map(n => n.id) }
    : { id: 'orphans', level: 'pass', title: 'Every component is connected' })

  // 3. Flows must actually run on the drawing ("play your own flow")
  const real = att.flows.filter(f => f.steps.length)
  if (!real.length) add({ id: 'flows', level: 'fail', title: 'Record at least one request flow', detail: 'Use Flows → New flow, then click components in the order a request travels.' })
  for (const f of real) {
    const problems = f.steps.map((s, i) => ({ i, p: stepProblem(att, s) })).filter(x => x.p)
    add(problems.length
      ? { id: `flow:${f.id}`, level: 'fail', title: `"${f.title}" cannot run`, detail: problems.map(x => `Step ${x.i + 1}: ${x.p}`).join('. '),
        nodes: [...new Set(problems.flatMap(x => [f.steps[x.i].from, f.steps[x.i].to]))] }
      : { id: `flow:${f.id}`, level: 'pass', title: `"${f.title}" runs end to end (${f.steps.length} steps)` })
  }
  if (real.length && real.length < ref.flows.length)
    add({ id: 'flow-count', level: 'info', title: `The reference walks through ${ref.flows.length} flows`, detail: ref.flows.map(f => f.title).join(', ') })

  // 4. Coverage against the reference
  for (const fam of [...theirs].filter(f => !UNCHECKED.has(f)).sort()) {
    const refNodes = ref.nodes.filter(n => familyOf(n) === fam)
    if (mine.has(fam)) { add({ id: `has:${fam}`, level: 'pass', title: `Uses ${nameOfFamily(fam)}` }); continue }
    const why = ref.notes.find(n => refNodes.some(r => r.id === n.target))?.text ?? refNodes[0].description
    // Components the reference only uses for background work are worth mentioning, not failing.
    const background = !refNodes.some(n => onRequestPath(ref, n.id))
    const implied = IMPLIED.has(fam)
    add({ id: `has:${fam}`, level: background || implied ? 'warn' : 'fail', title: `Missing ${nameOfFamily(fam)}${background ? ' (background work)' : implied ? ' (usually implied, but worth saying)' : ''}`,
      detail: `The reference uses ${refNodes.map(n => n.label).join(', ')}.${why ? ` ${why}` : ''}` })
  }

  // 5. Anti-patterns
  const byId = Object.fromEntries(att.nodes.map(n => [n.id, n]))
  const pairs = att.edges.map(e => [byId[e.from], byId[e.to]] as const).filter(([a, b]) => a && b)
  const between = (fa: string, fb: string) => pairs.filter(([a, b]) =>
    (familyOf(a) === fa && familyOf(b) === fb) || (familyOf(a) === fb && familyOf(b) === fa))
  const clientDb = [...between('client', 'database'), ...between('client', 'cache')]
  if (clientDb.length) add({ id: 'client-db', level: 'fail', title: 'Clients talk to a datastore directly',
    detail: 'Put a service in between: it enforces auth, validation and lets the schema change without breaking clients.', nodes: clientDb.flatMap(([a, b]) => [a.id, b.id]) })
  const clientSvc = between('client', 'service')
  if (clientSvc.length && theirs.has('entry')) add({ id: 'client-svc', level: 'warn', title: 'Clients reach services without a load balancer or gateway',
    detail: 'An entry point spreads load across instances, terminates TLS and removes any single server as the front door.', nodes: clientSvc.flatMap(([a, b]) => [a.id, b.id]) })

  // 6. Connections the reference has between families you also have
  const refById = Object.fromEntries(ref.nodes.map(n => [n.id, n]))
  const refPairs = new Set(ref.edges.map(e => [familyOf(refById[e.from]), familyOf(refById[e.to])].sort().join('|')))
  const missingLinks = [...refPairs].map(p => p.split('|')).filter(([a, b]) => a !== b && mine.has(a) && mine.has(b) && !between(a, b).length)
  for (const [a, b] of missingLinks.slice(0, 4))
    add({ id: `link:${a}|${b}`, level: 'warn', title: `Nothing connects ${nameOfFamily(a)} and ${nameOfFamily(b)}`, detail: 'The reference design connects these two. Is that path missing from yours?' })

  // 7. Resilience (needs the network section, which attempts inherit from the reference)
  if (att.network && att.network.zones > 1) {
    const r = resilience(att, 0, 'neutral')
    add(r && r.spofs.length
      ? { id: 'spof', level: 'fail', title: 'Single point of failure on the request path', detail: r.spofs.map(n => n.label).join(', '), nodes: r.spofs.map(n => n.id) }
      : { id: 'spof', level: 'pass', title: 'Survives losing one zone' })
  }

  // 7b. Monitoring: asked for when the reference has it. A telemetry component, written reasoning, or an
  // observability section all count as having said something.
  if (ref.observability) {
    const said = !!att.observability || att.nodes.some(n => TELEMETRY_KINDS.has(n.kind)) || !!att.reasoning?.monitoring?.trim()
    add(said
      ? { id: 'monitoring', level: 'pass', title: 'Says how it would be monitored' }
      : { id: 'monitoring', level: 'warn', title: 'No monitoring yet', detail: `Say how you would know it is healthy: SLIs and SLOs, what pages someone, how you would trace a slow request. The reference tracks: ${ref.observability.slos.map(s => s.name).join(', ')}. Add a monitoring component or write it under Reasoning.` })
  }

  // 8. Extras are fine, but worth defending
  for (const fam of [...mine].filter(f => !theirs.has(f) && !UNCHECKED.has(f) && !TELEMETRY_KINDS.has(f)))
    add({ id: `extra:${fam}`, level: 'info', title: `You added ${nameOfFamily(fam)}; the reference does not use one`, detail: 'Not wrong, but be ready to explain what it buys you.' })

  return summarize(checks)
}

function summarize(checks: Check[]) {
  const scored = checks.filter(c => c.level !== 'info')
  return { checks, passed: scored.filter(c => c.level === 'pass').length, total: scored.length }
}
