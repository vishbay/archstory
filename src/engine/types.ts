export type Kind =
  | 'client' | 'cdn' | 'load_balancer' | 'api_server' | 'cache'
  | 'database' | 'db_replica' | 'queue' | 'worker' | 'key_gen'
  | 'object_store' | 'rate_limiter'

export interface DNode { id: string; kind: Kind }
export interface DEdge { id: string; source: string; target: string }
export interface Diagram { nodes: DNode[]; edges: DEdge[] }

interface RuleBase {
  id: string
  title: string
  why: string            // shown after validation: the reasoning behind the rule
  hint: string           // shown on failure, nudges without giving the answer away
  severity: 'required' | 'bonus'
}

// Rules are declarative data so every problem is just a JSON-able object.
// Edges are treated as undirected in v1 (learners shouldn't fail on arrow direction).
export type Rule = RuleBase & (
  | { type: 'has'; kind: Kind; min: number }
  | { type: 'edge'; a: Kind; b: Kind }
  | { type: 'chain'; kinds: Kind[] }            // a path touching these kinds in order
  | { type: 'forbid_edge'; a: Kind; b: Kind }
  | { type: 'no_orphans' }
)

export interface ReferenceNote { kind: Kind; note: string }

export interface Problem {
  id: string
  title: string
  prompt: string
  requirements: { label: string; detail: string }[]
  palette: Kind[]
  rules: Rule[]
  reference: { diagram: Diagram; notes: ReferenceNote[] }
}

export interface RuleResult { rule: Rule; passed: boolean; nodeIds: string[] }
