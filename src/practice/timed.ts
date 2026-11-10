// Timed interview mode: the usual phases of a system design interview on a clock, with a checklist per phase.
// The clock is wall time minus pauses, so it survives a reload. Phases advance only when the learner moves on;
// running over budget earns a nudge, never a forced jump.
import type { Design } from '../model/schema'
import { tierOf } from '../model/kinds'
import type { Check } from './checks'

export interface ChecklistItem {
  id: string
  text: string
  /** Ticked automatically when the answer shows it. The learner can still tick it by hand (for something said out loud). */
  auto?: (a: Design, checks: Check[]) => boolean
}
export interface Phase {
  id: string; title: string
  /** Share of the total time, in minutes out of 45. */
  minutes: number
  goal: string
  /** The Reasoning section where notes for this phase belong. */
  notes?: string
  items: ChecklistItem[]
}

const wrote = (key: string) => (a: Design) => !!a.reasoning?.[key]?.trim()
const passed = (id: string) => (_: Design, c: Check[]) => c.some(x => x.id === id && x.level === 'pass')

export const PHASES: Phase[] = [
  {
    id: 'requirements', title: 'Requirements', minutes: 5, notes: 'requirements',
    goal: 'Agree on what to build before drawing anything.',
    items: [
      { id: 'functional', text: 'Restated the core features in your own words' },
      { id: 'scale', text: 'Asked about scale: users, requests, data size, read and write mix' },
      { id: 'nfr', text: 'Agreed the non-functional goals: latency, availability, consistency' },
      { id: 'scope', text: 'Said what is out of scope' },
      { id: 'written', text: 'Wrote down requirements and assumptions', auto: wrote('requirements') },
    ],
  },
  {
    id: 'estimates', title: 'Estimates', minutes: 5, notes: 'estimates',
    goal: 'Rough numbers that drive the design: load, storage, bandwidth.',
    items: [
      { id: 'qps', text: 'Requests per second, average and peak, reads and writes' },
      { id: 'storage', text: 'Storage per year and in total' },
      { id: 'bandwidth', text: 'Bandwidth or cache size where it matters' },
      { id: 'written', text: 'Wrote the arithmetic down', auto: wrote('estimates') },
    ],
  },
  {
    id: 'interface', title: 'API and data', minutes: 5, notes: 'api',
    goal: 'The contract and the shape of the data.',
    items: [
      { id: 'api', text: 'Listed the main endpoints or messages', auto: wrote('api') },
      { id: 'model', text: 'Chose the main tables or keys and how they are looked up', auto: wrote('data_model') },
      { id: 'store', text: 'Picked a datastore and said why' },
    ],
  },
  {
    id: 'design', title: 'High-level design', minutes: 15,
    goal: 'Components and the main request paths, end to end.',
    items: [
      { id: 'path', text: 'Drew the request path from client to data', auto: a => a.nodes.length >= 4 && a.edges.length >= 3 },
      { id: 'connected', text: 'Every component is connected', auto: (a, c) => a.nodes.length > 1 && passed('orphans')(a, c) },
      { id: 'flows', text: 'Walked through the main read and write flows', auto: (_, c) => c.some(x => x.id.startsWith('flow:') && x.level === 'pass') },
      { id: 'entry', text: 'Put a load balancer or gateway in front of the services', auto: a => a.nodes.some(n => tierOf(n) === 'entry') },
    ],
  },
  {
    id: 'deep', title: 'Deep dive', minutes: 10, notes: 'tradeoffs',
    goal: 'Stress the design: the bottleneck, failures, consistency.',
    items: [
      { id: 'bottleneck', text: 'Named what breaks first at 10x load and how to fix it' },
      { id: 'failure', text: 'Survives losing a zone or an instance', auto: passed('spof') },
      { id: 'scale', text: 'Covered caching, partitioning or replication where needed' },
      { id: 'consistency', text: 'Said where data may be stale and why that is acceptable' },
    ],
  },
  {
    id: 'wrap', title: 'Wrap-up', minutes: 5, notes: 'monitoring',
    goal: 'Close strongly: how you would run it and what you traded away.',
    items: [
      { id: 'monitoring', text: 'Said how you would monitor it: SLOs and what pages someone', auto: (a, c) => passed('monitoring')(a, c) || wrote('monitoring')(a) },
      { id: 'tradeoffs', text: 'Summed up the main trade-offs', auto: wrote('tradeoffs') },
      { id: 'summary', text: 'Gave a 30-second summary of the design' },
    ],
  },
]
export const PLAN_MINUTES = PHASES.reduce((n, p) => n + p.minutes, 0)   // 45
export const PRESETS = [30, 45, 60] as const

/** Phase budgets in milliseconds for a given total, in whole minutes that add up exactly. */
export function budgets(totalMinutes: number): number[] {
  const raw = PHASES.map(p => (p.minutes * totalMinutes) / PLAN_MINUTES)
  const mins = raw.map(Math.floor)
  let left = totalMinutes - mins.reduce((a, b) => a + b, 0)
  // hand out the leftover minutes to the phases that lost the most to rounding
  for (const i of raw.map((r, i) => [r - Math.floor(r), i] as const).sort((a, b) => b[0] - a[0]).map(([, i]) => i)) { if (left-- <= 0) break; mins[i]++ }
  return mins.map(m => Math.max(1, m) * 60_000)
}

export interface TimedSession {
  total: number                 // minutes
  startedAt: number             // epoch ms
  pausedAt: number | null       // epoch ms while paused
  pausedMs: number              // total time spent paused
  phase: number
  /** Clock time (ms since start, pauses excluded) at which each phase began. */
  phaseStarts: number[]
  /** Checklist items ticked by hand, as "phase:item". */
  ticked: string[]
  endedAt: number | null        // clock time when ended
}

export const startSession = (total: number, now: number): TimedSession =>
  ({ total, startedAt: now, pausedAt: null, pausedMs: 0, phase: 0, phaseStarts: [0], ticked: [], endedAt: null })

/** Interview time so far, not counting pauses. */
export const clock = (s: TimedSession, now: number) => s.endedAt ?? Math.max(0, (s.pausedAt ?? now) - s.startedAt - s.pausedMs)

export const pause = (s: TimedSession, now: number): TimedSession => (s.pausedAt || s.endedAt !== null ? s : { ...s, pausedAt: now })
export const resume = (s: TimedSession, now: number): TimedSession => (s.pausedAt ? { ...s, pausedMs: s.pausedMs + (now - s.pausedAt), pausedAt: null } : s)

export function nextPhase(s: TimedSession, now: number): TimedSession {
  if (s.endedAt !== null) return s
  if (s.phase >= PHASES.length - 1) return end(s, now)
  return { ...s, phase: s.phase + 1, phaseStarts: [...s.phaseStarts, clock(s, now)] }
}
export const end = (s: TimedSession, now: number): TimedSession => (s.endedAt !== null ? s : { ...s, endedAt: clock(s, now), pausedAt: null })

export function toggleTick(s: TimedSession, key: string): TimedSession {
  return { ...s, ticked: s.ticked.includes(key) ? s.ticked.filter(k => k !== key) : [...s.ticked, key] }
}

export interface PhaseStatus { index: number; spent: number; budget: number; over: number; totalLeft: number }
export function status(s: TimedSession, now: number): PhaseStatus {
  const t = clock(s, now), b = budgets(s.total)
  const spent = t - (s.phaseStarts[s.phase] ?? 0)
  return { index: s.phase, spent, budget: b[s.phase], over: Math.max(0, spent - b[s.phase]), totalLeft: s.total * 60_000 - t }
}

/** Planned versus actual time for every phase reached. */
export function report(s: TimedSession, now: number): { id: string; title: string; planned: number; actual: number | null }[] {
  const b = budgets(s.total), t = clock(s, now)
  return PHASES.map((p, i) => {
    const start = s.phaseStarts[i]
    const stop = s.phaseStarts[i + 1] ?? (i === s.phase ? t : undefined)
    return { id: p.id, title: p.title, planned: b[i], actual: start === undefined || stop === undefined ? null : stop - start }
  })
}

export const itemKey = (phase: Phase, item: ChecklistItem) => `${phase.id}:${item.id}`
export function itemDone(s: TimedSession, phase: Phase, item: ChecklistItem, a: Design, checks: Check[]): { done: boolean; auto: boolean } {
  const auto = !!item.auto?.(a, checks)
  return { done: auto || s.ticked.includes(itemKey(phase, item)), auto }
}
export function checklistScore(s: TimedSession, a: Design, checks: Check[]): { done: number; total: number } {
  const all = PHASES.flatMap(p => p.items.map(i => itemDone(s, p, i, a, checks).done))
  return { done: all.filter(Boolean).length, total: all.length }
}

/** m:ss, with a minus sign for time past zero. */
export function mmss(ms: number): string {
  const neg = ms < 0, s = Math.floor(Math.abs(ms) / 1000)
  return `${neg ? '-' : ''}${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}
