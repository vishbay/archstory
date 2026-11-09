// The archstory/v1 design format. Everything (library, imports, LLM output, practice answers) is one of these.
// Zod is the single source of truth: types are inferred and the published JSON Schema is generated from it.
import { z } from 'zod'

export const TIERS = ['client', 'edge', 'entry', 'services', 'data', 'async', 'external'] as const
export const STEP_KINDS = ['req', 'res', 'async', 'local'] as const
export const GROUP_KINDS = ['region', 'zone', 'network', 'tenant', 'cluster', 'boundary'] as const
export const HA_MODES = ['active-active', 'primary-standby', 'quorum', 'regional', 'single'] as const
export const NOTE_KINDS = ['tradeoff', 'scaling', 'failure', 'security', 'note'] as const

const Id = z.string().regex(/^[a-z0-9][a-z0-9_-]*$/, 'ids are lowercase letters, digits, "-" or "_"')

export const NodeSchema = z.object({
  id: Id,
  label: z.string().min(1).describe('Cloud-neutral display name, e.g. "Load Balancer"'),
  kind: z.string().min(1).describe('Component type, e.g. load_balancer (L7, HTTP), network_load_balancer (L4, TCP/UDP), service, cache, sql_db. Unknown kinds are allowed.'),
  tier: z.enum(TIERS).optional().describe('Band on the canvas. Defaults from kind when omitted.'),
  description: z.string().optional(),
  group: Id.optional().describe('Id of a group (region, tenant, …) this node sits inside'),
  subnet: Id.optional().describe('Override the subnet chosen by tier; "none" places the node outside the VPC (managed service)'),
  zones: z.number().int().positive().optional().describe('Availability zones this node spans; defaults to network.zones'),
  ha: z.enum(HA_MODES).optional()
    .describe('How it survives a zone failure. Defaults by kind: services active-active, SQL/cache primary-standby, managed services regional'),
  replicas: z.number().int().positive().optional(),
  icon: z.string().optional().describe('Emoji override'),
  cloud: z.object({ aws: z.string().optional(), gcp: z.string().optional(), azure: z.string().optional() }).optional()
    .describe('Provider-specific product names, e.g. { "aws": "ALB", "gcp": "Cloud Load Balancing" }'),
})

export const SubnetSchema = z.object({
  id: Id, label: z.string(),
  public: z.boolean().default(false).describe('Has a route to the internet gateway'),
  tiers: z.array(z.enum(TIERS)).default([]).describe('Nodes in these tiers land in this subnet unless they override it'),
  cidr: z.string().optional(),
})

export const NetworkSchema = z.object({
  cidr: z.string().optional().describe('VPC address range, e.g. 10.0.0.0/16'),
  zones: z.number().int().min(1).max(6).default(1).describe('Availability zones the VPC spans'),
  subnets: z.array(SubnetSchema).min(1),
  egress: z.enum(['nat', 'none']).default('nat').describe('How private subnets reach the internet'),
}).describe('Optional network layer: VPC, subnets and availability zones')

export const GroupSchema = z.object({ id: Id, label: z.string(), kind: z.enum(GROUP_KINDS).default('boundary') })

export const EdgeSchema = z.object({
  from: Id, to: Id,
  label: z.string().optional(), protocol: z.string().optional(),
  async: z.boolean().optional().describe('Fire-and-forget / queued connection'),
})

export const StepSchema = z.object({
  from: Id, to: Id,
  kind: z.enum(STEP_KINDS).describe('req/res/async travel an edge (either direction); local happens inside one node (from === to)'),
  label: z.string().describe('Short wire label, e.g. "GET /aZ3k9Q" or "SET key ttl=24h"'),
  detail: z.string().optional().describe('Why this hop happens; the teaching text'),
  payload: z.string().optional().describe('Example message: HTTP, SQL, JSON event…'),
})

export const FlowSchema = z.object({
  id: Id, title: z.string(), summary: z.string().optional(),
  steps: z.array(StepSchema).min(1),
})

export const NoteSchema = z.object({
  target: Id.optional().describe('Node, group or flow id; omit for a design-wide note'),
  kind: z.enum(NOTE_KINDS).default('note'),
  text: z.string(),
})

export const DesignSchema = z.object({
  schema: z.literal('archstory/v1'),
  id: Id,
  meta: z.object({
    title: z.string(),
    summary: z.string().optional(),
    tags: z.array(z.string()).default([]),
    difficulty: z.enum(['easy', 'medium', 'hard']).optional(),
    author: z.string().optional(),
    source: z.string().optional(),
  }),
  requirements: z.object({
    functional: z.array(z.string()).default([]),
    nonFunctional: z.array(z.string()).default([]),
    scale: z.array(z.object({ label: z.string(), value: z.string() })).default([]),
  }).default({ functional: [], nonFunctional: [], scale: [] }),
  nodes: z.array(NodeSchema).min(1),
  groups: z.array(GroupSchema).default([]),
  edges: z.array(EdgeSchema).default([]),
  flows: z.array(FlowSchema).default([]),
  notes: z.array(NoteSchema).default([]),
  network: NetworkSchema.optional(),
  reasoning: z.record(z.string(), z.string()).optional()
    .describe('Practice mode written answers keyed by section, e.g. { "estimates": "…", "api": "…" }'),
})

export type Tier = typeof TIERS[number]
export type HAMode = typeof HA_MODES[number]
export type StepKind = typeof STEP_KINDS[number]
export type Design = z.infer<typeof DesignSchema>
export type DNode = z.infer<typeof NodeSchema>
export type DEdge = z.infer<typeof EdgeSchema>
export type Flow = z.infer<typeof FlowSchema>
export type Step = z.infer<typeof StepSchema>
export type Group = z.infer<typeof GroupSchema>
export type Network = z.infer<typeof NetworkSchema>
export type Subnet = z.infer<typeof SubnetSchema>

export type ParseResult = { ok: true; design: Design } | { ok: false; errors: string[] }

/** Shape check (zod) + referential checks a schema can't express. Errors are human-readable paths. */
/** Format ids from before the project was renamed to ArchStory; files using them still import. */
const LEGACY_FORMATS = new Set(['sysdesign/v1'])

export function parseDesign(input: unknown): ParseResult {
  const raw = input && typeof input === 'object' && LEGACY_FORMATS.has((input as { schema?: unknown }).schema as string)
    ? { ...input, schema: 'archstory/v1' } : input
  const r = DesignSchema.safeParse(raw)
  if (!r.success) return { ok: false, errors: r.error.issues.map(i => `${i.path.join('.') || '(root)'}: ${i.message}`) }
  const d = r.data
  const errors: string[] = []
  const nodeIds = new Set<string>()
  for (const n of d.nodes) {
    if (nodeIds.has(n.id)) errors.push(`nodes: duplicate id "${n.id}"`)
    nodeIds.add(n.id)
  }
  const groupIds = new Set(d.groups.map(g => g.id))
  for (const n of d.nodes) if (n.group && !groupIds.has(n.group)) errors.push(`node "${n.id}": unknown group "${n.group}"`)
  d.edges.forEach((e, i) => {
    for (const end of [e.from, e.to]) if (!nodeIds.has(end)) errors.push(`edges[${i}] ${e.from}→${e.to}: unknown node "${end}"`)
  })
  const flowIds = new Set<string>()
  for (const f of d.flows) {
    if (flowIds.has(f.id)) errors.push(`flows: duplicate id "${f.id}"`)
    flowIds.add(f.id)
    f.steps.forEach((s, i) => {
      const at = `flow "${f.id}" step ${i + 1}`
      for (const end of [s.from, s.to]) if (!nodeIds.has(end)) errors.push(`${at}: unknown node "${end}"`)
      if (s.kind === 'local' && s.from !== s.to) errors.push(`${at}: a "local" step must have from === to`)
      if (s.kind !== 'local' && s.from === s.to) errors.push(`${at}: from === to needs kind "local"`)
      if (s.kind !== 'local' && s.from !== s.to && nodeIds.has(s.from) && nodeIds.has(s.to) && !findEdge(d, s.from, s.to))
        errors.push(`${at}: no edge between "${s.from}" and "${s.to}" (a step must follow a connection, and a response retraces the request path one connection at a time)`)
    })
  }
  if (d.network) {
    const subnetIds = new Set<string>()
    const claimed = new Map<string, string>()
    for (const s of d.network.subnets) {
      if (subnetIds.has(s.id)) errors.push(`network.subnets: duplicate id "${s.id}"`)
      subnetIds.add(s.id)
      for (const t of s.tiers) {
        if (claimed.has(t)) errors.push(`network.subnets: tier "${t}" is claimed by both "${claimed.get(t)}" and "${s.id}"`)
        else claimed.set(t, s.id)
      }
    }
    for (const n of d.nodes) if (n.subnet && n.subnet !== 'none' && !subnetIds.has(n.subnet))
      errors.push(`node "${n.id}": unknown subnet "${n.subnet}"`)
  } else {
    for (const n of d.nodes) if (n.subnet) errors.push(`node "${n.id}": has a subnet but the design has no network section`)
  }
  const targets = new Set([...nodeIds, ...groupIds, ...flowIds])
  d.notes.forEach((n, i) => { if (n.target && !targets.has(n.target)) errors.push(`notes[${i}]: unknown target "${n.target}"`) })
  return errors.length ? { ok: false, errors } : { ok: true, design: d }
}

/** The edge a hop travels, and whether it travels it backwards (responses ride request edges in reverse). */
export function findEdge(d: Pick<Design, 'edges'>, from: string, to: string): { edge: DEdge; index: number; reverse: boolean } | null {
  let index = d.edges.findIndex(e => e.from === from && e.to === to)
  if (index >= 0) return { edge: d.edges[index], index, reverse: false }
  index = d.edges.findIndex(e => e.from === to && e.to === from)
  return index >= 0 ? { edge: d.edges[index], index, reverse: true } : null
}

export const edgeId = (e: DEdge) => `${e.from}->${e.to}`

// Managed, regional services that normally live outside your VPC and are reached through a private endpoint.
const MANAGED_KINDS = new Set(['object_store', 'queue', 'nosql_db', 'stream'])

/** The subnet a node sits in, or null when it is outside the VPC (or the design has no network). */
export function subnetOf(d: Pick<Design, 'network'>, n: DNode, tier: Tier): Subnet | null {
  if (!d.network || n.subnet === 'none') return null
  if (n.subnet) return d.network.subnets.find(s => s.id === n.subnet) ?? null
  if (MANAGED_KINDS.has(n.kind)) return null
  return d.network.subnets.find(s => s.tiers.includes(tier)) ?? null
}
