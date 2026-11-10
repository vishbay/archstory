import { useSyncExternalStore } from 'react'
import type { AiConfig } from '../ai/providers'
import { clearConfig, loadConfig, saveConfig } from '../ai/settings'

// One shared copy of the AI settings, so every place that offers "send with your API key" sees changes at once.
const tab = () => { try { return window.sessionStorage } catch { return undefined } }
const device = () => { try { return window.localStorage } catch { return undefined } }

let current: AiConfig | null = null
const listeners = new Set<() => void>()
const emit = () => listeners.forEach(l => l())

export const getAiConfig = (): AiConfig => (current ??= loadConfig(tab(), device()))
export function setAiConfig(c: AiConfig): boolean { current = c; const ok = saveConfig(c, tab(), device()); emit(); return ok }
export function forgetAiKeys() { clearConfig(tab(), device()); current = null; emit() }
export const useAiConfig = () => useSyncExternalStore(cb => { listeners.add(cb); return () => listeners.delete(cb) }, getAiConfig)

const OPEN = 'archstory:ai-settings'
export const openAiSettings = () => window.dispatchEvent(new Event(OPEN))
export const onOpenAiSettings = (cb: () => void) => { window.addEventListener(OPEN, cb); return () => window.removeEventListener(OPEN, cb) }
