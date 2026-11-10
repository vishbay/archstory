// Faster drawing in Practice: find a component kind by typing, duplicate a component with its connections, and start
// from a common skeleton instead of an empty canvas.
import type { Design, DNode } from '../model/schema'
import { KINDS, TIER_INFO } from '../model/kinds'
import { addNode, connect } from './attempt'

/** Words people type for each kind, beyond its own name. */
const SYNONYMS: Record<string, string[]> = {
  client: ['user', 'browser', 'app'], web_client: ['browser', 'web'], mobile_client: ['phone', 'ios', 'android', 'app'],
  dns: ['route53', 'domain'], cdn: ['cloudfront', 'edge', 'static'], waf: ['firewall'],
  load_balancer: ['lb', 'alb', 'l7', 'balancer'], network_load_balancer: ['nlb', 'l4', 'tcp'], api_gateway: ['gateway', 'api'],
  rate_limiter: ['throttle', 'limit'], websocket_gateway: ['ws', 'websocket', 'socket', 'realtime', 'push'],
  service: ['server', 'backend', 'api', 'app server', 'microservice'], auth: ['login', 'identity', 'oauth', 'idp'],
  key_gen: ['id', 'snowflake', 'key'], search: ['query'],
  cache: ['redis', 'memcached', 'elasticache'], sql_db: ['database', 'db', 'postgres', 'mysql', 'aurora', 'rds', 'relational'],
  nosql_db: ['dynamo', 'cassandra', 'mongo', 'bigtable', 'kv', 'key value', 'database', 'db'], db_replica: ['replica', 'follower', 'read'],
  object_store: ['s3', 'blob', 'gcs', 'files', 'bucket', 'storage'], search_index: ['elasticsearch', 'opensearch', 'index'],
  geo_index: ['location', 'geohash', 'h3', 'map'],
  queue: ['sqs', 'rabbit', 'rabbitmq', 'job', 'tasks'], stream: ['kafka', 'kinesis', 'pubsub', 'events', 'log'],
  worker: ['consumer', 'job', 'background', 'processor'], scheduler: ['cron', 'timer'], analytics: ['warehouse', 'bigquery', 'olap'],
  payment_provider: ['stripe', 'psp', 'payments'], notification_provider: ['email', 'sms', 'push', 'apns', 'fcm'], external_api: ['third party', 'partner'],
}

/** Kinds that match what was typed, best first: name start, then name contains, then a synonym. */
export function searchKinds(query: string): string[] {
  const q = query.trim().toLowerCase()
  const all = Object.keys(KINDS)
  if (!q) return all
  const score = (k: string) => {
    const label = KINDS[k].label.toLowerCase(), id = k.replace(/_/g, ' ')
    if (label.startsWith(q) || id.startsWith(q)) return 0
    if (label.includes(q) || id.includes(q)) return 1
    if ((SYNONYMS[k] ?? []).some(s => s.startsWith(q))) return 2
    if (TIER_INFO[KINDS[k].tier].title.toLowerCase().startsWith(q)) return 3
    return -1
  }
  return all.map(k => [k, score(k)] as const).filter(([, s]) => s >= 0).sort((a, b) => a[1] - b[1]).map(([k]) => k)
}

/** A copy of a component next to the original, with the same settings and the same connections. */
export function duplicateNode(d: Design, id: string): { design: Design; id: string } | null {
  const src = d.nodes.find(n => n.id === id)
  if (!src) return null
  const added = addNode(d, src.kind)
  const { id: _old, label: _label, ...rest } = src
  void _old; void _label
  const copy: DNode = { ...rest, id: added.id, label: nextLabel(d, src.label) }
  let design: Design = { ...added.design, nodes: added.design.nodes.map(n => (n.id === added.id ? copy : n)) }
  for (const e of d.edges) {
    if (e.from === id) design = connect(design, added.id, e.to)
    if (e.to === id) design = connect(design, e.from, added.id)
  }
  // keep the copy's connection settings (async) the same as the original's
  design = { ...design, edges: design.edges.map(e => {
    const orig = d.edges.find(o => (e.from === added.id && o.from === id && o.to === e.to) || (e.to === added.id && o.to === id && o.from === e.from))
    return orig?.async ? { ...e, async: true } : e
  }) }
  return { design, id: added.id }
}

/** "Service" becomes "Service 2"; "Service 2" becomes "Service 3". */
function nextLabel(d: Design, label: string): string {
  const base = label.replace(/\s+\d+$/, '')
  const taken = new Set(d.nodes.map(n => n.label))
  for (let i = 2; ; i++) if (!taken.has(`${base} ${i}`)) return `${base} ${i}`
}

export interface Skeleton { id: string; title: string; blurb: string; kinds: string[]; edges: [number, number][] }
export const SKELETONS: Skeleton[] = [
  { id: 'web', title: 'Web app', blurb: 'Client, DNS, CDN, load balancer, service, cache and SQL database',
    kinds: ['client', 'dns', 'cdn', 'load_balancer', 'service', 'cache', 'sql_db'],
    edges: [[0, 1], [0, 2], [2, 3], [3, 4], [4, 5], [4, 6]] },
  { id: 'async', title: 'Background work', blurb: 'API in front, a queue, workers and storage',
    kinds: ['client', 'load_balancer', 'service', 'queue', 'worker', 'nosql_db', 'object_store'],
    edges: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [4, 6], [2, 5]] },
  { id: 'realtime', title: 'Real-time', blurb: 'Persistent connections through a WebSocket gateway',
    kinds: ['client', 'network_load_balancer', 'websocket_gateway', 'service', 'cache', 'nosql_db'],
    edges: [[0, 1], [1, 2], [2, 3], [3, 4], [3, 5]] },
]

export function applySkeleton(d: Design, s: Skeleton): Design {
  let design = d
  const ids: string[] = []
  for (const k of s.kinds) { const r = addNode(design, k); design = r.design; ids.push(r.id) }
  for (const [a, b] of s.edges) design = connect(design, ids[a], ids[b])
  return design
}
