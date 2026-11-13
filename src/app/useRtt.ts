// The Distance control of Under the hood: how long one round trip to the far end takes, in ms. One choice for every module,
// kept in browser storage and shared by the timeline and the inspector. With no choice yet each module uses its own reference.
import { useSyncExternalStore } from 'react'
import { moduleRtt } from '../model/protocol'
import type { Design } from '../model/schema'
import { store } from './hooks'

export const RTT_KEY = 'archstory.hood.rtt'
const KEY = RTT_KEY
const listeners = new Set<() => void>()

/** The saved choice in ms, or null (storage may be unavailable, and an old or hand-edited value may be junk). */
export function savedRtt(): number | null {
  const v = store.get<unknown>(KEY, null)
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null
}

let current = savedRtt()
const subscribe = (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn) } }

/** Save a choice and tell every component using the control. */
export function chooseRtt(ms: number) { current = ms; store.set(KEY, ms); listeners.forEach(f => f()) }

/** What the readouts use for a module drawn for `own` ms when the reader chose `chosen` (null: no choice yet). */
export const resolveRtt = (own: number, chosen: number | null) => ({
  /** The round trip time every readout uses. */
  ms: chosen ?? own,
  /** The module's own reference round trip. */
  own,
  /** The choice differs from the module's own reference: say so next to the numbers. */
  custom: chosen !== null && chosen !== own,
})

export function useRtt(design: Pick<Design, 'meta'>) {
  const chosen = useSyncExternalStore(subscribe, () => current, () => null)
  return { ...resolveRtt(moduleRtt(design), chosen), choose: chooseRtt }
}
