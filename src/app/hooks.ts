import type { Kv } from '../practice/snapshots'
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'

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

/** The same storage, shaped for the practice modules. */
export const storeKv: Kv = { get: k => store.get<unknown>(k, null), set: (k, v) => store.set(k, v) }

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

/** Wide enough for the side panels to float over the canvas (below this they stack under it). */
const wideQuery = typeof matchMedia === 'function' ? matchMedia('(min-width: 901px)') : null
const subscribeWide = (cb: () => void) => { wideQuery?.addEventListener('change', cb); return () => wideQuery?.removeEventListener('change', cb) }
export const useWide = () => useSyncExternalStore(subscribeWide, () => wideQuery?.matches ?? true)

/** Below this width the panels get narrower and the left one starts closed. */
export const COMPACT_BELOW = 1180
export function useViewportWidth() {
  const [w, setW] = useState(() => (typeof window === 'undefined' ? 1440 : window.innerWidth))
  useEffect(() => {
    const on = () => setW(window.innerWidth)
    window.addEventListener('resize', on)
    return () => window.removeEventListener('resize', on)
  }, [])
  return w
}

/** How far the floating panels cover the canvas, so the camera frames designs in the visible middle. */
export function panelInsets(width: number, leftOpen: boolean, rightOpen: boolean) {
  if (width <= 900) return { left: 12, right: 12 }          // stacked layout: nothing floats over the canvas
  const compact = width <= COMPACT_BELOW
  return { left: leftOpen ? (compact ? 280 : 300) : 12, right: rightOpen ? (compact ? 340 : 380) : 12 }
}

/** The current time, refreshed every second while `active`. */
export function useNow(active: boolean, every = 1000): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    setNow(Date.now())   // eslint-disable-line react-hooks/set-state-in-effect
    if (!active) return
    const t = setInterval(() => setNow(Date.now()), every)
    return () => clearInterval(t)
  }, [active, every])
  return now
}

/** For a row of tabs that can overflow: marks whether it does (for an edge fade) and keeps the active tab in view sideways. */
export function useTabStrip(active: string) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const update = () => {
      el.dataset.overflow = el.scrollWidth > el.clientWidth + 1 ? (el.scrollLeft + el.clientWidth >= el.scrollWidth - 1 ? 'start' : el.scrollLeft > 1 ? 'both' : 'end') : ''
    }
    const on = el.querySelector<HTMLElement>('[aria-selected="true"]')
    const reveal = () => {   // scroll only the strip, so a phone page never jumps
      if (on) {
        const l = on.offsetLeft, r = l + on.offsetWidth
        if (l < el.scrollLeft) el.scrollLeft = l - 8
        else if (r > el.scrollLeft + el.clientWidth) el.scrollLeft = r - el.clientWidth + 8
      }
      update()
    }
    reveal()
    el.addEventListener('scroll', update, { passive: true })
    // labels can grow (a running clock in a tab name), so re-check when the strip or the active tab changes size
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(reveal) : null
    ro?.observe(el); if (on) ro?.observe(on)
    return () => { el.removeEventListener('scroll', update); ro?.disconnect() }
  }, [active])
  return ref
}
