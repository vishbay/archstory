// Timing and actor state for protocol timelines (designs with meta.kind "protocol"). Pure functions, so the timeline,
// the inspector and the Ask AI prompt all show the same numbers.
import type { Design, Flow, Step } from './schema'
import { resolvePhases } from './phases'

/** One-way delay of a step in one-way trips: a fixed `wait` in milliseconds converted at the round trip `rttMs`, else the step's own `delay`,
 *  else 1 between two nodes and 0 inside one.
 *  A lost step never arrives, so the clock does not advance for it: 0 unless it has a `delay` of its own. */
export const stepDelay = (s: Pick<Step, 'from' | 'to' | 'delay' | 'lost'> & { wait?: number }, rttMs = DEFAULT_RTT_MS) =>
  s.wait !== undefined ? (2 * s.wait) / rttMs : s.delay ?? (s.lost || s.from === s.to ? 0 : 1)

/** Elapsed time in round trips when each step has arrived: cumulative one-way delays divided by 2. */
export function rttTimes(steps: Pick<Step, 'from' | 'to' | 'delay' | 'lost'>[], rttMs = DEFAULT_RTT_MS): number[] {
  let oneWay = 0
  return steps.map(s => (oneWay += stepDelay(s, rttMs)) / 2)
}

/** "0 RTT", "0.5 RTT", "1 RTT", "1.25 RTT". */
export const fmtRtt = (rtt: number) => `${Number(rtt.toFixed(2))} RTT`

export interface PhaseBudget { name: string; rtt: number }

/** Round trips spent in each phase, in order of first appearance: the one-way delays of the phase's steps divided by 2.
 *  A step with no phase continues the previous one (as in the step list); steps before the first phase count as "Start".
 *  Phases that repeat later in the flow are added into their first entry, so the totals always sum to the flow's time. */
export function phaseBudget(steps: Pick<Step, 'from' | 'to' | 'delay' | 'lost' | 'phase'>[], rttMs = DEFAULT_RTT_MS): PhaseBudget[] {
  const out: PhaseBudget[] = []
  resolvePhases(steps).forEach((p, i) => {
    const name = p ?? 'Start'
    const row = out.find(b => b.name === name) ?? (out[out.length] = { name, rtt: 0 })
    row.rtt += stepDelay(steps[i], rttMs) / 2
  })
  return out
}

/** The phase name of step `i` (as `phaseBudget` names it), or undefined before the first step. */
export const phaseOfStep = (steps: Pick<Step, 'phase'>[], i: number) =>
  i < 0 || i >= steps.length ? undefined : resolvePhases(steps)[i] ?? 'Start'

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

/** The contents of an actor's data structure, as a step lists it. */
export type DataView = NonNullable<Step['data']>[string]

/** Each actor's latest data view up to and including step `upTo` (empty before the first step). */
export function dataAt(flow: Pick<Flow, 'steps'>, upTo: number): Record<string, DataView> {
  const out: Record<string, DataView> = {}
  flow.steps.slice(0, Math.max(0, upTo + 1)).forEach(s => Object.assign(out, s.data ?? {}))
  return out
}

/** Per step, the actors whose data view is listed there (so the timeline can mark the change). */
export const dataChanges = (flow: Pick<Flow, 'steps'>): string[][] => flow.steps.map(s => Object.keys(s.data ?? {}))

/** Does any step of the flow show a data view? Only those flows get the data cards under the actor headers. */
export const usesData = (flow: Pick<Flow, 'steps'>) => flow.steps.some(s => s.data && Object.keys(s.data).length > 0)

/** The most lines a data card shows; the rest are summed up as "+N more". */
export const DATA_LINES = 6

/** The lines a card shows for a view: its first DATA_LINES items and a "+N more" line (a marked item beyond the cut is shown instead of the last line). */
export function dataLines(v: DataView): { text: string; marked: boolean }[] {
  const mark = new Set(v.mark ?? [])
  if (v.items.length <= DATA_LINES) return v.items.map((text, i) => ({ text, marked: mark.has(i) }))
  const shown = v.items.slice(0, DATA_LINES).map((text, i) => ({ text, marked: mark.has(i) }))
  const hiddenMarked = (v.mark ?? []).some(m => m >= DATA_LINES)
  const more = v.items.length - DATA_LINES
  return [...shown, { text: `+${more} more`, marked: hiddenMarked }]
}

// ---------- distance: round trip time in milliseconds ----------

/** The round trip times offered by the Distance control, in ms: same city, same region, across a country, across an ocean. */
export const RTT_PRESETS = [10, 30, 70, 150] as const
/** The reference round trip a module is drawn for when it does not say (ms). */
export const DEFAULT_RTT_MS = 50

/** The module's own round trip time in ms: `meta.rtt`, else 50. */
export const moduleRtt = (d: Pick<Design, 'meta'>) => d.meta.rtt ?? DEFAULT_RTT_MS

/** Distance options, ascending: the presets, the module's own value and the chosen one if it is none of those. */
export const rttOptions = (moduleMs: number, chosenMs: number): number[] =>
  [...new Set<number>([...RTT_PRESETS, moduleMs, chosenMs])].sort((a, b) => a - b)

/** Elapsed time in ms for a time in round trips when one round trip takes `rttMs`. */
export const rttToMs = (rtt: number, rttMs: number) => Number((rtt * rttMs).toFixed(3))

/** "25 ms", "1.5 s", "20 s": milliseconds below a second, seconds above. */
export function fmtMs(ms: number): string {
  if (ms < 1000) return `${Number(ms.toFixed(1))} ms`
  return `${Number((ms / 1000).toFixed(2))} s`
}

/** "0.5 RTT, 25 ms". */
export const fmtRttMs = (rtt: number, rttMs: number) => `${fmtRtt(rtt)}, ${fmtMs(rttToMs(rtt, rttMs))}`
