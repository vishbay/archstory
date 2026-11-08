// Known component kinds: icon, accent colour, and the tier a node lands in when the JSON omits one.
// Unknown kinds still render (generic icon, services tier), so LLM-invented kinds never break a design.
import type { DNode, Tier } from './schema'

interface KindInfo { icon: string; color: string; tier: Tier; label: string }

export const KINDS: Record<string, KindInfo> = {
  client:        { label: 'Client',          icon: '📱', color: '#64748b', tier: 'client' },
  web_client:    { label: 'Web client',      icon: '💻', color: '#64748b', tier: 'client' },
  mobile_client: { label: 'Mobile client',   icon: '📱', color: '#64748b', tier: 'client' },
  dns:           { label: 'DNS',             icon: '🧭', color: '#0ea5e9', tier: 'edge' },
  cdn:           { label: 'CDN',             icon: '🌐', color: '#0ea5e9', tier: 'edge' },
  waf:           { label: 'WAF',             icon: '🛡️', color: '#0ea5e9', tier: 'edge' },
  load_balancer: { label: 'Load balancer (L7)', icon: '⚖️', color: '#8b5cf6', tier: 'entry' },
  network_load_balancer: { label: 'Network load balancer (L4)', icon: '🔀', color: '#8b5cf6', tier: 'entry' },
  api_gateway:   { label: 'API gateway',     icon: '🚪', color: '#8b5cf6', tier: 'entry' },
  rate_limiter:  { label: 'Rate limiter',    icon: '🚦', color: '#f97316', tier: 'entry' },
  websocket_gateway: { label: 'WebSocket gateway', icon: '🔌', color: '#8b5cf6', tier: 'entry' },
  service:       { label: 'Service',         icon: '🖥️', color: '#10b981', tier: 'services' },
  auth:          { label: 'Auth service',    icon: '🔐', color: '#10b981', tier: 'services' },
  key_gen:       { label: 'Key generator',   icon: '🔑', color: '#a855f7', tier: 'services' },
  search:        { label: 'Search',          icon: '🔎', color: '#10b981', tier: 'services' },
  cache:         { label: 'Cache',           icon: '⚡', color: '#f59e0b', tier: 'data' },
  sql_db:        { label: 'SQL database',    icon: '🗄️', color: '#ef4444', tier: 'data' },
  nosql_db:      { label: 'NoSQL database',  icon: '🗂️', color: '#ef4444', tier: 'data' },
  db_replica:    { label: 'Read replica',    icon: '🗃️', color: '#f87171', tier: 'data' },
  object_store:  { label: 'Object storage',  icon: '🪣', color: '#6366f1', tier: 'data' },
  search_index:  { label: 'Search index',    icon: '📇', color: '#6366f1', tier: 'data' },
  geo_index:     { label: 'Geo index',       icon: '📍', color: '#6366f1', tier: 'data' },
  queue:         { label: 'Queue',           icon: '📨', color: '#ec4899', tier: 'async' },
  stream:        { label: 'Event stream',    icon: '🌊', color: '#ec4899', tier: 'async' },
  worker:        { label: 'Worker',          icon: '⚙️', color: '#14b8a6', tier: 'async' },
  scheduler:     { label: 'Scheduler',       icon: '⏰', color: '#14b8a6', tier: 'async' },
  analytics:     { label: 'Analytics store', icon: '📊', color: '#6366f1', tier: 'async' },
  external_api:  { label: 'External API',    icon: '🔗', color: '#94a3b8', tier: 'external' },
  payment_provider: { label: 'Payment provider', icon: '💳', color: '#94a3b8', tier: 'external' },
  notification_provider: { label: 'Push / SMS / email', icon: '📣', color: '#94a3b8', tier: 'external' },
}

const FALLBACK: KindInfo = { label: 'Component', icon: '🧩', color: '#94a3b8', tier: 'services' }

export const kindInfo = (kind: string) => KINDS[kind] ?? FALLBACK
export const tierOf = (n: DNode): Tier => n.tier ?? kindInfo(n.kind).tier
export const iconOf = (n: DNode) => n.icon ?? kindInfo(n.kind).icon
export const colorOf = (n: DNode) => kindInfo(n.kind).color

export const TIER_INFO: Record<Tier, { title: string; blurb: string }> = {
  client:   { title: 'Clients',  blurb: 'Who makes the request' },
  edge:     { title: 'Edge',     blurb: 'Near the user: DNS, TLS, caching' },
  entry:    { title: 'Entry',    blurb: 'Front door: routing, auth, limits' },
  services: { title: 'Services', blurb: 'Stateless business logic' },
  data:     { title: 'Data',     blurb: 'State: caches, databases, blobs' },
  async:    { title: 'Async',    blurb: 'Off the request path' },
  external: { title: 'External', blurb: 'Third-party systems' },
}

export type Cloud = 'neutral' | 'aws' | 'gcp' | 'azure'
export const nameOf = (n: DNode, cloud: Cloud) => (cloud === 'neutral' ? n.label : n.cloud?.[cloud]) ?? n.label
