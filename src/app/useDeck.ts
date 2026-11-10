import { useSyncExternalStore } from 'react'
import { cleanDeck, dayOf, rate, type Deck, type Rating } from '../practice/cards'
import { store } from './hooks'

// The learner's review schedule for follow-up questions, shared by the Questions tab, the drill and the Home page.
const KEY = 'archstory.deck'
let deck: Deck | null = null
const listeners = new Set<() => void>()
const get = () => (deck ??= cleanDeck(store.get(KEY, {})))

export const useDeck = () => useSyncExternalStore(cb => { listeners.add(cb); return () => listeners.delete(cb) }, get)
export function rateCard(key: string, rating: Rating) {
  deck = { ...get(), [key]: rate(get()[key], rating, dayOf(Date.now())) }
  store.set(KEY, deck)
  listeners.forEach(l => l())
}
/** Read the schedule from storage again (after a backup is restored). */
export function reloadDeck() { deck = null; listeners.forEach(l => l()) }
export const today = () => dayOf(Date.now())

const OPEN = 'archstory:drill'
/** Open the drill, for one design or for the whole library. */
export const openDrill = (designId?: string) => window.dispatchEvent(new CustomEvent(OPEN, { detail: designId ?? null }))
export const onOpenDrill = (cb: (designId: string | null) => void) => {
  const h = (e: Event) => cb((e as CustomEvent<string | null>).detail)
  window.addEventListener(OPEN, h); return () => window.removeEventListener(OPEN, h)
}
