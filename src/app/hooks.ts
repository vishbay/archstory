import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'

// ---------- storage (best-effort: private windows may throw) ----------
/** One-time move of browser data saved under the pre-rename "sdl." prefix, so saved answers survive the rename. */
export function migrateStorage(from = 'sdl.', to = 'archstory.') {
  try {
    const old = Object.keys(localStorage).filter(k => k.startsWith(from))
    for (const k of old) {
      const next = to + k.slice(from.length)
      if (localStorage.getItem(next) === null) localStorage.setItem(next, localStorage.getItem(k)!)
      localStorage.removeItem(k)
    }
  } catch { /* storage unavailable: nothing to migrate */ }
}
migrateStorage()

export const store = {
  get<T>(key: string, fallback: T): T {
    try { const v = localStorage.getItem(key); return v ? JSON.parse(v) as T : fallback } catch { return fallback }
  },
  set(key: string, value: unknown): boolean { try { localStorage.setItem(key, JSON.stringify(value)); return true } catch { return false } },
}

// ---------- theme ----------
export type ThemePref = 'system' | 'light' | 'dark'
const media = typeof matchMedia === 'function' ? matchMedia('(prefers-color-scheme: dark)') : null
const subscribe = (cb: () => void) => { media?.addEventListener('change', cb); return () => media?.removeEventListener('change', cb) }

export function useTheme() {
  const [pref, setPref] = useState<ThemePref>(() => store.get('archstory.theme', 'system'))
  const systemDark = useSyncExternalStore(subscribe, () => media?.matches ?? false)
  const resolved: 'light' | 'dark' = pref === 'system' ? (systemDark ? 'dark' : 'light') : pref
  useEffect(() => {
    const root = document.documentElement
    if (pref === 'system') delete root.dataset.theme
    else root.dataset.theme = pref
    store.set('archstory.theme', pref)
  }, [pref])
  const cycle = () => setPref(p => (p === 'system' ? 'light' : p === 'light' ? 'dark' : 'system'))
  return { pref, resolved, cycle }
}

// ---------- flow player ----------
const BASE_MS = 1700

export function usePlayer(length: number, resetKey: string) {
  const [step, setStep] = useState(-1)
  const [playing, setPlaying] = useState(false)
  const [speed, setSpeed] = useState(1)
  const [nonce, setNonce] = useState(0)
  const [key, setKey] = useState(resetKey)
  if (key !== resetKey) { setKey(resetKey); setStep(-1); setPlaying(false) }

  const last = length - 1
  const stepMs = BASE_MS / speed
  const go = useCallback((i: number) => { setStep(Math.max(-1, Math.min(last, i))); setNonce(n => n + 1) }, [last])

  useEffect(() => {
    if (!playing || step >= last) return
    const t = setTimeout(() => { go(step + 1); if (step + 1 >= last) setPlaying(false) }, step < 0 ? 150 : stepMs)
    return () => clearTimeout(t)
  }, [playing, step, last, stepMs, go])

  const toggle = () => {
    if (playing) return setPlaying(false)
    if (step >= last) go(-1)
    setPlaying(true)
  }
  const jump = (i: number) => { setPlaying(false); go(i) }
  return { step, playing, speed, setSpeed, nonce, stepMs, packetMs: stepMs * 0.7, toggle, jump, last, length }
}
export type Player = ReturnType<typeof usePlayer>

/** Whether the viewer asked the OS to reduce motion. */
export const reducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
