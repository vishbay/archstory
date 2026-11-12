// The Distance control of Under the hood: how long one round trip to the far end takes, in ms. One choice for every module,
// kept in browser storage and shared by the timeline and the inspector. With no choice yet each module uses its own reference.
import { useSyncExternalStore } from 'react'
import { moduleRtt } from '../model/protocol'
import type { Design } from '../model/schema'
import { store } from './hooks'

const KEY = 'archstory.hood.rtt'
const listeners = new Set<() => void>()

/** The saved choice in ms, or null (storage may be unavailable, and an old or hand-edited value may be junk). */
export function savedRtt(): number | null {
  const v = store.get<unknown>(KEY, null)
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null
}

let current = savedRtt()
const subscribe = (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn) } }

export function useRtt(design: Pick<Design, 'meta'>) {
  const chosen = useSyncExternalStore(subscribe, () => current, () => null)
  const own = moduleRtt(design)
  return {
    /** The round trip time every readout uses. */
    ms: chosen ?? own,
    /** The module's own reference round trip. */
    own,
    /** The choice differs from the module's own reference: say so next to the numbers. */
    custom: chosen !== null && chosen !== own,
    choose(ms: number) { current = ms; store.set(KEY, ms); listeners.forEach(f => f()) },
  }
}
