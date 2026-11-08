import type { Problem } from '../engine/types'

export const urlShortener: Problem = {
  id: 'url-shortener',
  title: 'Design a URL Shortener',
  prompt:
    'Users submit a long URL and get back a short one (e.g. sho.rt/aZ3k9Q). ' +
    'Visiting the short URL redirects to the original. Design the system.',
  requirements: [
    { label: 'Scale', detail: '100M new URLs/month, 100:1 read-to-write ratio (~4,000 redirects/sec avg)' },
    { label: 'Latency', detail: 'Redirects should feel instant (< 100 ms p99)' },
    { label: 'Availability', detail: '99.99%: a redirect outage breaks every link ever shared' },
    { label: 'Uniqueness', detail: 'No two long URLs may collide on the same short code' },
  ],
  palette: [
    'client', 'cdn', 'load_balancer', 'api_server', 'cache', 'database',
    'db_replica', 'queue', 'worker', 'key_gen', 'object_store', 'rate_limiter',
  ],
  rules: [
    {
      id: 'entry', type: 'chain', kinds: ['client', 'load_balancer', 'api_server'], severity: 'required',
      title: 'Clients reach the app through a load balancer',
      why: 'The LB spreads traffic across stateless servers and removes any single server as the front door.',
      hint: 'Something should sit between clients and your servers to distribute traffic.',
    },
    {
      id: 'scale-out', type: 'has', kind: 'api_server', min: 2, severity: 'required',
      title: 'At least two API servers',
      why: 'Stateless servers scale horizontally and survive one crashing. One server is a single point of failure.',
      hint: 'What happens to availability if your only API server dies?',
    },
    {
      id: 'store', type: 'edge', a: 'api_server', b: 'database', severity: 'required',
      title: 'API servers persist mappings in a database',
      why: 'Short-code → long-URL mappings must be durable. Simple key-value access suits a NoSQL or SQL store.',
      hint: 'Where do the mappings live permanently?',
    },
    {
      id: 'cache', type: 'edge', a: 'api_server', b: 'cache', severity: 'required',
      title: 'A cache serves hot redirects',
      why: 'Reads outnumber writes 100:1 and popular links are hit repeatedly, so a cache absorbs most of the load and meets the latency target.',
      hint: 'The workload is overwhelmingly reads. How can you avoid hitting the DB every time?',
    },
    {
      id: 'replica', type: 'edge', a: 'database', b: 'db_replica', severity: 'required',
      title: 'The database has a replica',
      why: 'A replica gives failover (availability) and extra read capacity. Without one, a DB failure takes redirects down.',
      hint: '99.99% availability. What if the database host fails?',
    },
    {
      id: 'keygen', type: 'edge', a: 'api_server', b: 'key_gen', severity: 'required',
      title: 'A key generator produces unique short codes',
      why: 'Pre-generating unique codes (counter + base62, or a key service) avoids collisions and DB round trips on each write.',
      hint: 'How do you guarantee two servers never hand out the same code?',
    },
    {
      id: 'no-direct-db', type: 'forbid_edge', a: 'client', b: 'database', severity: 'required',
      title: 'Clients never touch the database directly',
      why: 'Clients must go through the app tier for auth, validation and rate limiting.',
      hint: 'Check for a connection that skips the application layer.',
    },
    {
      id: 'orphans', type: 'no_orphans', severity: 'required',
      title: 'Every component is connected',
      why: 'A component with no connections does nothing. Remove it or wire it in.',
      hint: 'Look for a floating box.',
    },
    {
      id: 'analytics', type: 'chain', kinds: ['api_server', 'queue', 'worker'], severity: 'bonus',
      title: 'Click analytics are processed asynchronously',
      why: 'Counting clicks off the hot path keeps redirects fast. Queue the event and let a worker aggregate it.',
      hint: 'Bonus: how would you count clicks without slowing the redirect?',
    },
    {
      id: 'ratelimit', type: 'has', kind: 'rate_limiter', min: 1, severity: 'bonus',
      title: 'Abuse protection with a rate limiter',
      why: 'Open creation endpoints get spammed. Limit writes per client or API key.',
      hint: 'Bonus: what stops one client creating millions of links?',
    },
  ],
  reference: {
    diagram: {
      nodes: [
        { id: 'c', kind: 'client' }, { id: 'lb', kind: 'load_balancer' },
        { id: 'rl', kind: 'rate_limiter' },
        { id: 'a1', kind: 'api_server' }, { id: 'a2', kind: 'api_server' },
        { id: 'ca', kind: 'cache' }, { id: 'db', kind: 'database' },
        { id: 'rep', kind: 'db_replica' }, { id: 'kg', kind: 'key_gen' },
        { id: 'q', kind: 'queue' }, { id: 'w', kind: 'worker' },
      ],
      edges: [
        ['c', 'lb'], ['lb', 'rl'], ['rl', 'a1'], ['rl', 'a2'],
        ['a1', 'ca'], ['a2', 'ca'], ['a1', 'db'], ['a2', 'db'], ['db', 'rep'],
        ['a1', 'kg'], ['a2', 'kg'], ['a1', 'q'], ['a2', 'q'], ['q', 'w'],
      ].map(([s, t], i) => ({ id: `e${i}`, source: s, target: t })),
    },
    notes: [
      { kind: 'load_balancer', note: 'Round-robin across stateless API servers; health checks remove dead ones.' },
      { kind: 'cache', note: 'Cache-aside on short code → URL (LRU). ~20% of links serve ~80% of traffic.' },
      { kind: 'database', note: 'Key-value access pattern, so a NoSQL store (DynamoDB/Cassandra) scales easily; SQL works at this size too.' },
      { kind: 'key_gen', note: 'Pre-allocate ranges of a counter, base62-encode: 7 chars gives 62^7 ≈ 3.5T codes.' },
      { kind: 'queue', note: 'Click events go to a queue; workers aggregate counts off the hot path.' },
    ],
  },
}
