// Labs: hidden features switched on from the author card (five quick clicks on the logo). Each flag is a boolean in
// local storage; one event tells every component using it to update at once.
import { useSyncExternalStore } from 'react'
import { store } from './hooks'

export type Lab = 'underhood'
const EVENT = 'archstory:labs'
export const labKey = (lab: Lab) => `archstory.labs.${lab}`

export const getLab = (lab: Lab): boolean => store.get<unknown>(labKey(lab), false) === true
export function setLab(lab: Lab, on: boolean) {
  store.set(labKey(lab), on)
  window.dispatchEvent(new Event(EVENT))
}
/** Calls `cb` whenever a lab flag changes, here or in another tab. */
export function onLabs(cb: () => void) {
  window.addEventListener(EVENT, cb)
  window.addEventListener('storage', cb)
  return () => { window.removeEventListener(EVENT, cb); window.removeEventListener('storage', cb) }
}
export const useLab = (lab: Lab) => useSyncExternalStore(onLabs, () => getLab(lab), () => false)
