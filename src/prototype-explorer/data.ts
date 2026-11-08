// PROTOTYPE: throwaway. Explorer data model: a design is static topology (directed edges)
// plus named request flows that walk that topology one hop at a time.

export type Tier = 'client' | 'edge' | 'entry' | 'services' | 'data' | 'async'
export type Cloud = 'neutral' | 'aws' | 'gcp'
export type StepKind = 'req' | 'res' | 'async' | 'local'

export const TIERS: { id: Tier; title: string; blurb: string }[] = [
  { id: 'client', title: 'Clients', blurb: 'Who makes the request' },
  { id: 'edge', title: 'Edge', blurb: 'Near the user: TLS, caching' },
  { id: 'entry', title: 'Entry', blurb: 'Front door: routing, health' },
  { id: 'services', title: 'Services', blurb: 'Stateless business logic' },
  { id: 'data', title: 'Data', blurb: 'State: caches, databases' },
  { id: 'async', title: 'Async', blurb: 'Off the request path' },
]

export const KIND_COLOR: Record<StepKind, string> = {
  req: '#38bdf8', res: '#4ade80', async: '#c084fc', local: '#fbbf24',
}

export interface XNode {
  id: string; tier: Tier; icon: string; color: string
  names: Record<Cloud, string>; role: string; replicas?: number
}
export interface XEdge { id: string; source: string; target: string }
export interface Step { from: string; to: string; kind: StepKind; label: string; detail: string; payload?: string }
export interface Flow { id: string; title: string; summary: string; steps: Step[] }
export interface Design { id: string; title: string; prompt: string; nodes: XNode[]; edges: XEdge[]; flows: Flow[] }

const e = (source: string, target: string): XEdge => ({ id: `${source}->${target}`, source, target })

const ingress: Step[] = [
  { from: 'client', to: 'cdn', kind: 'req', label: 'GET /aZ3k9Q', detail: 'Someone clicks the short link. DNS points sho.rt at the nearest CDN edge, which terminates TLS.',
    payload: 'GET /aZ3k9Q HTTP/2\nHost: sho.rt\nUser-Agent: Mozilla/5.0 …\nReferer: https://twitter.com/' },
  { from: 'cdn', to: 'cdn', kind: 'local', label: 'MISS: 302s not cached', detail: 'Trade-off: a 301 cached at the CDN and in browsers is fastest, but then the origin never sees the click. We return 302 + no-store so every click is counted. Use 301 if analytics don\'t matter.' },
  { from: 'cdn', to: 'lb', kind: 'req', label: 'forward to origin', detail: 'The CDN forwards over a pooled, already-warm connection to the origin, saving a TLS handshake per request.' },
  { from: 'lb', to: 'api', kind: 'req', label: 'route → api-2', detail: 'Least-outstanding-requests routing. API servers are stateless, so any healthy instance can serve any request.',
    payload: 'GET /aZ3k9Q\nX-Forwarded-For: 203.0.113.7\nX-Request-Id: 7f3c…' },
]

const egress = (detail: string): Step[] => [
  { from: 'api', to: 'lb', kind: 'res', label: '302 Found', detail: 'The API answers with a redirect. Total time inside the origin is a couple of milliseconds.',
    payload: 'HTTP/2 302\nLocation: https://example.com/some/very/long/path?utm_source=…\nCache-Control: private, no-store' },
  { from: 'lb', to: 'cdn', kind: 'res', label: '302 Found', detail: 'Response travels back through the load balancer.' },
  { from: 'cdn', to: 'client', kind: 'res', label: '302 → long URL', detail },
]

export const urlShortenerDesign: Design = {
  id: 'url-shortener',
  title: 'URL Shortener',
  prompt: '100M new links/month, 100:1 reads to writes, redirects < 100 ms p99, 99.99% available.',
  nodes: [
    { id: 'client', tier: 'client', icon: '📱', color: '#64748b', role: 'Browser / app', names: { neutral: 'Client', aws: 'Client', gcp: 'Client' } },
    { id: 'cdn', tier: 'edge', icon: '🌐', color: '#0ea5e9', role: 'Edge cache + TLS', names: { neutral: 'CDN', aws: 'CloudFront', gcp: 'Cloud CDN' } },
    { id: 'lb', tier: 'entry', icon: '⚖️', color: '#8b5cf6', role: 'L7 load balancer', names: { neutral: 'Load Balancer', aws: 'ALB', gcp: 'Cloud Load Balancing' } },
    { id: 'api', tier: 'services', icon: '🖥️', color: '#10b981', role: 'Stateless API', replicas: 3, names: { neutral: 'API Service', aws: 'ECS Fargate', gcp: 'Cloud Run' } },
    { id: 'kgs', tier: 'services', icon: '🔑', color: '#a855f7', role: 'Pre-generated keys', names: { neutral: 'Key Gen Service', aws: 'ECS service', gcp: 'Cloud Run service' } },
    { id: 'cache', tier: 'data', icon: '⚡', color: '#f59e0b', role: 'Hot links', names: { neutral: 'Cache', aws: 'ElastiCache Redis', gcp: 'Memorystore Redis' } },
    { id: 'db', tier: 'data', icon: '🗄️', color: '#ef4444', role: 'Source of truth', names: { neutral: 'Primary DB', aws: 'Aurora PostgreSQL', gcp: 'Cloud SQL Postgres' } },
    { id: 'replica', tier: 'data', icon: '🗃️', color: '#f87171', role: 'Serves reads', replicas: 2, names: { neutral: 'Read Replica', aws: 'Aurora Replica', gcp: 'Cloud SQL Replica' } },
    { id: 'queue', tier: 'async', icon: '📨', color: '#ec4899', role: 'Click events', names: { neutral: 'Event Queue', aws: 'SQS', gcp: 'Pub/Sub' } },
    { id: 'worker', tier: 'async', icon: '⚙️', color: '#14b8a6', role: 'Batch consumer', names: { neutral: 'Analytics Worker', aws: 'Lambda', gcp: 'Cloud Run Job' } },
    { id: 'analytics', tier: 'async', icon: '📊', color: '#6366f1', role: 'Columnar store', names: { neutral: 'Analytics Store', aws: 'Redshift', gcp: 'BigQuery' } },
  ],
  edges: [
    e('client', 'cdn'), e('cdn', 'lb'), e('lb', 'api'), e('api', 'kgs'), e('api', 'cache'),
    e('api', 'db'), e('api', 'replica'), e('db', 'replica'), e('api', 'queue'),
    e('queue', 'worker'), e('worker', 'analytics'),
  ],
  flows: [
    {
      id: 'create', title: 'Create link', summary: 'Write path: the client submits a long URL and gets back a short code.',
      steps: [
        { from: 'client', to: 'cdn', kind: 'req', label: 'POST /api/links', detail: 'The browser sends the long URL. Every request enters through the nearest CDN edge, which terminates TLS.',
          payload: 'POST /api/links HTTP/2\nHost: sho.rt\nContent-Type: application/json\n\n{ "url": "https://example.com/some/very/long/path?utm_source=…" }' },
        { from: 'cdn', to: 'cdn', kind: 'local', label: 'POST: never cached', detail: 'Writes bypass the cache entirely. The CDN still adds value: TLS close to the user and DDoS absorption.' },
        { from: 'cdn', to: 'lb', kind: 'req', label: 'forward to origin', detail: 'The load balancer is the single public origin. It health-checks API instances and routes only to healthy ones.' },
        { from: 'lb', to: 'api', kind: 'req', label: 'route → api-1', detail: 'Any instance can take the request. Stateless servers are what let us scale out horizontally.' },
        { from: 'api', to: 'kgs', kind: 'req', label: 'next key', detail: 'Rather than hash the URL and check for collisions, take a pre-generated unique key. KGS hands each API instance a batch of keys, so this is usually an in-memory pop.' },
        { from: 'kgs', to: 'api', kind: 'res', label: '"aZ3k9Q"', detail: '6 base62 chars → 62⁶ ≈ 56.8B codes. A key batch is marked used atomically when issued, so two servers never get the same key.',
          payload: '{ "key": "aZ3k9Q" }' },
        { from: 'api', to: 'db', kind: 'req', label: 'INSERT link', detail: 'The primary is the source of truth. The short code is the primary key, so every later lookup is a single index seek.',
          payload: "INSERT INTO links (code, long_url, created_at)\nVALUES ('aZ3k9Q', 'https://example.com/…', now());" },
        { from: 'db', to: 'api', kind: 'res', label: 'COMMIT ok', detail: 'Durable once committed to the primary.' },
        { from: 'db', to: 'replica', kind: 'async', label: 'replicate (WAL)', detail: 'Replication is asynchronous: the write was acknowledged before replicas have it. A read hitting a replica in the next few ms could miss, which is why we warm the cache next.' },
        { from: 'api', to: 'cache', kind: 'req', label: 'SET aZ3k9Q ttl=24h', detail: 'Write-through warm-up: freshly created links are clicked almost immediately (the creator tests it), and this hides replica lag.' },
        { from: 'api', to: 'lb', kind: 'res', label: '201 Created', detail: 'Return the short URL.', payload: 'HTTP/2 201\nContent-Type: application/json\n\n{ "short": "https://sho.rt/aZ3k9Q" }' },
        { from: 'lb', to: 'cdn', kind: 'res', label: '201 Created', detail: 'Back out through the load balancer.' },
        { from: 'cdn', to: 'client', kind: 'res', label: '201 Created', detail: 'Done. Server-side cost is dominated by the DB commit (~5–10 ms); the user sees roughly one network round trip on top.' },
      ],
    },
    {
      id: 'hit', title: 'Redirect (cache hit)', summary: 'The hot path, ~99% of traffic: resolve a code from cache and redirect.',
      steps: [
        ...ingress,
        { from: 'api', to: 'cache', kind: 'req', label: 'GET aZ3k9Q', detail: 'Check the cache first (cache-aside).' },
        { from: 'cache', to: 'api', kind: 'res', label: 'HIT → long URL', detail: 'Link popularity is heavily skewed, so a cache holding the hot set answers most redirects in under a millisecond without touching the database.' },
        { from: 'api', to: 'queue', kind: 'async', label: 'publish click', detail: 'Fire-and-forget: the API publishes and does not wait. A slow analytics pipeline can never slow down a redirect.',
          payload: '{ "code": "aZ3k9Q", "ts": 1762600000, "ref": "twitter.com", "country": "US" }' },
        ...egress('Browser follows Location. The user is gone; everything after this is background work.'),
        { from: 'queue', to: 'worker', kind: 'async', label: 'deliver batch (500)', detail: 'Workers pull events in batches. If they fall behind, the queue absorbs the backlog instead of the API.' },
        { from: 'worker', to: 'analytics', kind: 'async', label: 'INSERT batch', detail: 'Aggregated into a columnar store for dashboards: clicks per link per hour, referrers, countries.' },
      ],
    },
    {
      id: 'miss', title: 'Redirect (cache miss)', summary: 'A cold link: fall back to a read replica, then populate the cache.',
      steps: [
        ...ingress,
        { from: 'api', to: 'cache', kind: 'req', label: 'GET aZ3k9Q', detail: 'Check the cache first.' },
        { from: 'cache', to: 'api', kind: 'res', label: 'MISS', detail: 'Cold or evicted link.' },
        { from: 'api', to: 'replica', kind: 'req', label: 'SELECT long_url', detail: 'Reads go to replicas so the primary only handles writes. At 100:1 read:write this is where read capacity scales.',
          payload: "SELECT long_url FROM links WHERE code = 'aZ3k9Q';" },
        { from: 'replica', to: 'api', kind: 'res', label: 'row', detail: 'Single primary-key lookup, ~1–2 ms.' },
        { from: 'api', to: 'cache', kind: 'req', label: 'SET ttl=24h', detail: 'Populate on miss so the next click is a hit. The TTL bounds staleness if a link is edited or deleted.' },
        ...egress('Slightly slower than a hit (extra DB round trip), still well within the 100 ms budget.'),
      ],
    },
  ],
}

export function resolveEdge(d: Design, s: Step): { edge: XEdge; reverse: boolean } | null {
  const fwd = d.edges.find(x => x.source === s.from && x.target === s.to)
  if (fwd) return { edge: fwd, reverse: false }
  const rev = d.edges.find(x => x.source === s.to && x.target === s.from)
  return rev ? { edge: rev, reverse: true } : null
}
