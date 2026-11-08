import type { Diagram, Problem, Rule, RuleResult, Kind } from './types'

function adjacency(d: Diagram): Map<string, Set<string>> {
  const adj = new Map<string, Set<string>>()
  d.nodes.forEach(n => adj.set(n.id, new Set()))
  d.edges.forEach(e => {
    adj.get(e.source)?.add(e.target)
    adj.get(e.target)?.add(e.source)
  })
  return adj
}

const idsOf = (d: Diagram, k: Kind) => d.nodes.filter(n => n.kind === k).map(n => n.id)

// Is there a simple path visiting nodes of kinds[0], kinds[1], ... in order?
function chainExists(d: Diagram, kinds: Kind[]): string[] | null {
  const adj = adjacency(d)
  const kindOf = new Map(d.nodes.map(n => [n.id, n.kind]))
  const walk = (id: string, idx: number, seen: Set<string>, path: string[]): string[] | null => {
    const here = kindOf.get(id)
    const nextIdx = here === kinds[idx] ? idx + 1 : idx
    const nextPath = here === kinds[idx] ? [...path, id] : path
    if (nextIdx === kinds.length) return nextPath
    for (const nb of adj.get(id) ?? []) {
      if (seen.has(nb)) continue
      const r = walk(nb, nextIdx, new Set(seen).add(nb), nextPath)
      if (r) return r
    }
    return null
  }
  for (const start of idsOf(d, kinds[0])) {
    const r = walk(start, 0, new Set([start]), [])
    if (r) return r
  }
  return null
}

function edgeBetween(d: Diagram, a: Kind, b: Kind): [string, string][] {
  const kindOf = new Map(d.nodes.map(n => [n.id, n.kind]))
  return d.edges
    .filter(e => {
      const s = kindOf.get(e.source), t = kindOf.get(e.target)
      return (s === a && t === b) || (s === b && t === a)
    })
    .map(e => [e.source, e.target])
}

export function checkRule(d: Diagram, rule: Rule): RuleResult {
  switch (rule.type) {
    case 'has': {
      const ids = idsOf(d, rule.kind)
      return { rule, passed: ids.length >= rule.min, nodeIds: ids.length >= rule.min ? [] : ids }
    }
    case 'edge': {
      const found = edgeBetween(d, rule.a, rule.b)
      return {
        rule, passed: found.length > 0,
        nodeIds: found.length ? [] : [...idsOf(d, rule.a), ...idsOf(d, rule.b)],
      }
    }
    case 'chain': {
      const p = chainExists(d, rule.kinds)
      return { rule, passed: !!p, nodeIds: p ? [] : rule.kinds.flatMap(k => idsOf(d, k)) }
    }
    case 'forbid_edge': {
      const found = edgeBetween(d, rule.a, rule.b)
      return { rule, passed: d.nodes.length > 0 && found.length === 0, nodeIds: found.flat() }
    }
    case 'no_orphans': {
      const adj = adjacency(d)
      const orphans = d.nodes.filter(n => (adj.get(n.id)?.size ?? 0) === 0).map(n => n.id)
      return { rule, passed: orphans.length === 0 && d.nodes.length > 0, nodeIds: orphans }
    }
  }
}

export function validate(d: Diagram, p: Problem) {
  const results = p.rules.map(r => checkRule(d, r))
  const required = results.filter(r => r.rule.severity === 'required')
  const bonus = results.filter(r => r.rule.severity === 'bonus')
  return {
    results,
    requiredPassed: required.filter(r => r.passed).length,
    requiredTotal: required.length,
    bonusPassed: bonus.filter(r => r.passed).length,
    bonusTotal: bonus.length,
    allRequiredPass: required.every(r => r.passed),
  }
}
