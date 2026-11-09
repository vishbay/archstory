// Monitoring knowledge that does not depend on one design: the standard signals to watch on each kind of
// component, which telemetry each emits, the telemetry stack per cloud, and error-budget arithmetic.
import type { DNode, Slo } from './schema'
import type { Cloud } from './kinds'

export type SignalKind = 'latency' | 'traffic' | 'errors' | 'saturation'
export interface Golden { signal: SignalKind; what: string; metric: string }

const g = (signal: SignalKind, what: string, metric: string): Golden => ({ signal, what, metric })

// The four golden signals for each kind. Metric names are generic (Prometheus / OpenTelemetry style); every
// cloud exposes the same ideas under its own names.
const SERVICE: Golden[] = [
  g('latency', 'Request duration, p50 / p95 / p99 (by route)', 'http_server_duration_seconds'),
  g('traffic', 'Requests per second', 'http_server_requests_total'),
  g('errors', 'Share of requests that fail (5xx and timeouts)', 'http_server_errors_total / requests_total'),
  g('saturation', 'CPU, memory and in-flight requests against their limits', 'process_cpu_seconds, inflight_requests'),
]
const GOLDEN: Record<string, Golden[]> = {
  service: SERVICE,
  auth: SERVICE,
  search: SERVICE,
  key_gen: [
    g('latency', 'Time to hand out a key', 'keys_issue_duration_seconds'),
    g('traffic', 'Keys issued per second', 'keys_issued_total'),
    g('errors', 'Failed or duplicate key issues', 'keys_issue_errors_total'),
    g('saturation', 'Unissued keys remaining in the pool', 'keys_available'),
  ],
  load_balancer: [
    g('latency', 'Time for targets to respond, p99', 'target_response_time_seconds'),
    g('traffic', 'Requests per second', 'requests_total'),
    g('errors', '5xx from targets, and 5xx from the balancer itself', 'responses_5xx_total{source}'),
    g('saturation', 'Healthy targets and active connections', 'healthy_targets, active_connections'),
  ],
  network_load_balancer: [
    g('latency', 'Time to establish a connection', 'tcp_connect_seconds'),
    g('traffic', 'New and active flows', 'flows_active, flows_new_total'),
    g('errors', 'Connection resets and failed health checks', 'tcp_resets_total, unhealthy_targets'),
    g('saturation', 'Healthy targets and connection limits', 'healthy_targets'),
  ],
  api_gateway: [
    g('latency', 'End-to-end and backend latency, p99', 'gateway_latency_seconds'),
    g('traffic', 'Requests per second, by client or plan', 'gateway_requests_total'),
    g('errors', '4xx (client mistakes) and 5xx (ours), kept separate', 'gateway_responses_total{class}'),
    g('saturation', 'Throttled requests', 'gateway_throttled_total'),
  ],
  rate_limiter: [
    g('latency', 'Time the limiter adds to a request', 'ratelimit_decision_seconds'),
    g('traffic', 'Decisions per second: allowed vs rejected', 'ratelimit_decisions_total{result}'),
    g('errors', 'Limiter failures where requests were let through (fail open)', 'ratelimit_failopen_total'),
    g('saturation', 'Counter store latency and memory', 'redis_latency_seconds, redis_used_memory_bytes'),
  ],
  websocket_gateway: [
    g('latency', 'Message delivery latency through the gateway', 'ws_message_latency_seconds'),
    g('traffic', 'Open connections and messages per second', 'ws_connections, ws_messages_total'),
    g('errors', 'Disconnects per minute, by reason', 'ws_disconnects_total{reason}'),
    g('saturation', 'Connections per node against its limit, memory per connection', 'ws_connections_per_node'),
  ],
  cache: [
    g('latency', 'Get and set latency, p99', 'cache_command_duration_seconds'),
    g('traffic', 'Operations per second', 'cache_commands_total'),
    g('errors', 'Timeouts and connection errors', 'cache_errors_total'),
    g('saturation', 'Memory used vs max, evictions per second, hit ratio', 'cache_used_memory_bytes, cache_evictions_total, cache_hit_ratio'),
  ],
  sql_db: [
    g('latency', 'Query time p99 and slow queries', 'db_query_duration_seconds'),
    g('traffic', 'Queries per second, open connections', 'db_queries_total, db_connections'),
    g('errors', 'Failed commits, deadlocks, connection errors', 'db_errors_total, db_deadlocks_total'),
    g('saturation', 'CPU, connections vs max, storage, replication lag', 'db_cpu, db_connections_max, db_replication_lag_seconds'),
  ],
  db_replica: [
    g('latency', 'Read query time p99', 'db_query_duration_seconds'),
    g('traffic', 'Reads per second', 'db_queries_total'),
    g('errors', 'Failed reads and replication errors', 'db_errors_total'),
    g('saturation', 'Replication lag behind the primary', 'db_replication_lag_seconds'),
  ],
  nosql_db: [
    g('latency', 'Read and write latency p99', 'store_request_duration_seconds'),
    g('traffic', 'Read and write capacity consumed', 'store_consumed_capacity'),
    g('errors', 'Throttled requests and failed conditional writes', 'store_throttled_total'),
    g('saturation', 'Hot partitions and capacity utilisation', 'store_partition_utilisation'),
  ],
  object_store: [
    g('latency', 'First-byte latency', 'object_first_byte_seconds'),
    g('traffic', 'Requests per second and bytes transferred', 'object_requests_total, object_bytes_total'),
    g('errors', '5xx and slow-down (503) responses', 'object_errors_total{code}'),
    g('saturation', 'Request rate per key prefix', 'object_requests_per_prefix'),
  ],
  queue: [
    g('latency', 'Age of the oldest message', 'queue_oldest_message_age_seconds'),
    g('traffic', 'Messages sent and received per second', 'queue_messages_total{direction}'),
    g('errors', 'Messages moved to the dead-letter queue', 'queue_dead_letter_total'),
    g('saturation', 'Backlog: messages waiting', 'queue_depth'),
  ],
  stream: [
    g('latency', 'Consumer lag: how far behind the newest event', 'stream_consumer_lag_seconds'),
    g('traffic', 'Events written and read per second', 'stream_events_total{direction}'),
    g('errors', 'Failed writes and throttled producers', 'stream_write_errors_total'),
    g('saturation', 'Partition throughput against its limit', 'stream_partition_throughput_ratio'),
  ],
  worker: [
    g('latency', 'Job duration and time waiting in the queue', 'job_duration_seconds, job_wait_seconds'),
    g('traffic', 'Jobs processed per second', 'jobs_processed_total'),
    g('errors', 'Failures and retries per job type', 'jobs_failed_total, jobs_retried_total'),
    g('saturation', 'Concurrency used vs available', 'workers_busy_ratio'),
  ],
  scheduler: [
    g('latency', 'Delay between scheduled and actual start', 'schedule_start_delay_seconds'),
    g('traffic', 'Runs per schedule', 'schedule_runs_total'),
    g('errors', 'Missed or failed runs', 'schedule_failures_total'),
    g('saturation', 'Runs overlapping their next slot', 'schedule_overlap_total'),
  ],
  cdn: [
    g('latency', 'Time to first byte at the edge', 'edge_ttfb_seconds'),
    g('traffic', 'Requests and bytes served', 'edge_requests_total, edge_bytes_total'),
    g('errors', '5xx from the edge and from the origin', 'edge_5xx_total, origin_5xx_total'),
    g('saturation', 'Cache hit ratio and origin request rate', 'edge_cache_hit_ratio, origin_requests_total'),
  ],
  dns: [
    g('latency', 'Query response time from the resolver side', 'dns_query_duration_seconds'),
    g('traffic', 'Queries per second', 'dns_queries_total'),
    g('errors', 'SERVFAIL and failed health checks', 'dns_servfail_total, health_check_failures_total'),
    g('saturation', 'Record count and change propagation time', 'dns_propagation_seconds'),
  ],
  geo_index: [
    g('latency', 'Nearby-search latency, p99', 'geo_search_duration_seconds'),
    g('traffic', 'Position updates and searches per second', 'geo_updates_total, geo_searches_total'),
    g('errors', 'Failed updates and searches', 'geo_errors_total'),
    g('saturation', 'Memory used and the busiest shard', 'geo_used_memory_bytes, geo_shard_load'),
  ],
  search_index: [
    g('latency', 'Query latency p99', 'search_query_duration_seconds'),
    g('traffic', 'Queries and indexing operations per second', 'search_queries_total'),
    g('errors', 'Rejected queries and indexing failures', 'search_rejections_total'),
    g('saturation', 'Heap, disk and indexing queue', 'search_heap_ratio, search_queue_depth'),
  ],
  analytics: [
    g('latency', 'Ingestion delay: event time to queryable', 'ingest_delay_seconds'),
    g('traffic', 'Rows ingested per second', 'ingest_rows_total'),
    g('errors', 'Failed loads and rejected rows', 'ingest_errors_total'),
    g('saturation', 'Slot or compute utilisation', 'compute_utilisation_ratio'),
  ],
  payment_provider: external('payment provider'),
  notification_provider: external('push or email provider'),
  external_api: external('external API'),
  client: client(), web_client: client(), mobile_client: client(),
  telemetry_collector: [
    g('latency', 'Delay from emit to stored', 'collector_export_delay_seconds'),
    g('traffic', 'Spans, metrics and log lines received per second', 'collector_received_total'),
    g('errors', 'Dropped or refused telemetry', 'collector_dropped_total'),
    g('saturation', 'Queue and memory use', 'collector_queue_size'),
  ],
}

/** Dependencies we cannot instrument: measure the calls we make to them. */
function external(what: string): Golden[] {
  return [
    g('latency', `Latency of our calls to the ${what}`, 'client_request_duration_seconds{peer}'),
    g('traffic', 'Calls per second', 'client_requests_total{peer}'),
    g('errors', 'Errors and timeouts by response code', 'client_errors_total{peer,code}'),
    g('saturation', 'Rate-limit responses and circuit breaker state', 'client_throttled_total, circuit_open'),
  ]
}
/** Real-user monitoring: what the person using the app actually experiences. */
function client(): Golden[] {
  return [
    g('latency', 'Time to first screen and to complete a key action', 'app_load_seconds, action_duration_seconds'),
    g('traffic', 'Active sessions', 'sessions_active'),
    g('errors', 'Failed requests as the app sees them, and crash-free sessions', 'app_request_errors_total, crash_free_sessions_ratio'),
    g('saturation', 'Retries and offline time', 'app_retries_total'),
  ]
}

export const signalsFor = (kind: string): Golden[] => GOLDEN[kind] ?? SERVICE

/** Which kinds of telemetry a component emits. Third parties and clients are measured from our side. */
export function emits(kind: string): { metrics: boolean; logs: boolean; traces: boolean } {
  const none = { metrics: false, logs: false, traces: false }
  if (['client', 'web_client', 'mobile_client', 'payment_provider', 'notification_provider', 'external_api'].includes(kind)) return none
  if (kind === 'dns') return { metrics: true, logs: false, traces: false }
  const traces = ['service', 'auth', 'key_gen', 'search', 'websocket_gateway', 'api_gateway', 'load_balancer', 'worker', 'rate_limiter'].includes(kind)
  return { metrics: true, logs: true, traces }
}

// ---------------------------------------------------------------- telemetry stack
export interface TelemetryPart { id: string; kind: string; label: string; cloud: { aws: string; gcp: string }; description: string }
export const TELEMETRY: TelemetryPart[] = [
  { id: 'obs:collector', kind: 'telemetry_collector', label: 'Telemetry collector', cloud: { aws: 'AWS Distro for OpenTelemetry', gcp: 'OpenTelemetry Collector' },
    description: 'Receives metrics, logs and traces from every component and forwards them. Instrumenting with OpenTelemetry keeps you portable across vendors.' },
  { id: 'obs:metrics', kind: 'metrics_store', label: 'Metrics store', cloud: { aws: 'CloudWatch Metrics', gcp: 'Cloud Monitoring' },
    description: 'Numbers over time: cheap to keep, fast to chart and alert on. Watch label cardinality: per-user labels explode cost.' },
  { id: 'obs:logs', kind: 'log_store', label: 'Log store', cloud: { aws: 'CloudWatch Logs', gcp: 'Cloud Logging' },
    description: 'Structured (JSON) events with a trace id on every line, so one request can be pulled out of millions.' },
  { id: 'obs:traces', kind: 'trace_store', label: 'Trace store', cloud: { aws: 'X-Ray', gcp: 'Cloud Trace' },
    description: 'One trace per request, one span per hop. Sample (keep all errors and slow requests) because storing every trace is expensive.' },
  { id: 'obs:alerts', kind: 'alerting', label: 'Dashboards and alerts', cloud: { aws: 'CloudWatch Alarms', gcp: 'Cloud Monitoring alerts' },
    description: 'Alerts fire on symptoms users feel (SLO burn rate); dashboards help find the cause.' },
  { id: 'obs:oncall', kind: 'oncall', label: 'On-call', cloud: { aws: 'PagerDuty or Opsgenie', gcp: 'PagerDuty or Opsgenie' },
    description: 'Pages go to a person with a runbook. Tickets go to a queue and wait for working hours.' },
]
export const TELEMETRY_EDGES: [string, string][] = [
  ['obs:collector', 'obs:metrics'], ['obs:collector', 'obs:logs'], ['obs:collector', 'obs:traces'],
  ['obs:metrics', 'obs:alerts'], ['obs:alerts', 'obs:oncall'],
]
export const isTelemetry = (id: string) => id.startsWith('obs:')
export const telemetryNodes = (): DNode[] => TELEMETRY.map(t => ({ id: t.id, label: t.label, kind: t.kind, description: t.description, cloud: t.cloud }))

export const stackName = (t: TelemetryPart, cloud: Cloud) => (cloud === 'aws' || cloud === 'gcp' ? t.cloud[cloud] : t.label)

// ---------------------------------------------------------------- SLOs and traces
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`

/** How much failure the SLO tolerates, in words. */
export function budgetText(s: Pick<Slo, 'kind' | 'target' | 'window' | 'threshold'>): string {
  if (s.target >= 100) return 'No budget: a single miss is an incident'
  const bad = 100 - s.target
  if (s.kind === 'availability') {
    const min = (bad / 100) * s.window * 1440
    const t = min < 1 ? `${Math.max(1, Math.round(min * 60))} seconds` : min < 120 ? `${Number(min.toFixed(1))} minutes` : `${Number((min / 60).toFixed(1))} hours`
    return `${t} of full outage per ${plural(s.window, 'day')}, or the same share of failed requests`
  }
  return `${Number(bad.toPrecision(2))}% of events may miss ${s.threshold ? `"${s.threshold}"` : 'the target'} per ${plural(s.window, 'day')}`
}

/** A stable, trace-looking id for a flow, so the same request shows the same id on every hop. */
export function traceId(seed: string): string {
  let h = 2166136261
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619)
  const hex = (n: number) => (n >>> 0).toString(16).padStart(8, '0')
  return `${hex(h)}${hex(Math.imul(h, 2654435761))}`
}
