// Timing and actor state for protocol timelines (designs with meta.kind "protocol"). Pure functions, so the timeline,
// the inspector and the Ask AI prompt all show the same numbers.
import type { Flow, Step } from './schema'

/** One-way delay of a step in one-way trips: the step's own `delay`, else 1 between two nodes and 0 inside one. */
export const stepDelay = (s: Pick<Step, 'from' | 'to' | 'delay'>) => s.delay ?? (s.from === s.to ? 0 : 1)

/** Elapsed time in round trips when each step has arrived: cumulative one-way delays divided by 2. */
export function rttTimes(steps: Pick<Step, 'from' | 'to' | 'delay'>[]): number[] {
  let oneWay = 0
  return steps.map(s => (oneWay += stepDelay(s)) / 2)
}

/** "0 RTT", "0.5 RTT", "1 RTT", "1.25 RTT". */
export const fmtRtt = (rtt: number) => `${Number(rtt.toFixed(2))} RTT`

/** Each actor's latest named state up to and including step `upTo` (empty before the first step). */
export function stateAt(flow: Pick<Flow, 'steps'>, upTo: number): Record<string, string> {
  const out: Record<string, string> = {}
  flow.steps.slice(0, Math.max(0, upTo + 1)).forEach(s => Object.assign(out, s.state ?? {}))
  return out
}

/** Per step, the actors whose state changes there (listed with a value that differs from the one before). */
export function stateChanges(flow: Pick<Flow, 'steps'>): Record<string, string>[] {
  const now: Record<string, string> = {}
  return flow.steps.map(s => {
    const changed: Record<string, string> = {}
    for (const [id, v] of Object.entries(s.state ?? {})) if (now[id] !== v) { changed[id] = v; now[id] = v }
    return changed
  })
}
