// Undo/redo for practice answers. Rapid edits with the same key (typing in one field) collapse into one step.
export interface History<T> { past: T[]; present: T; future: T[]; lastKey?: string; lastAt?: number }

const LIMIT = 100, COALESCE_MS = 1000

export const initHistory = <T>(present: T): History<T> => ({ past: [], present, future: [] })

export function commit<T>(h: History<T>, next: T, key?: string, now = Date.now()): History<T> {
  if (next === h.present) return h
  const coalesce = !!key && key === h.lastKey && now - (h.lastAt ?? 0) < COALESCE_MS
  return { past: coalesce ? h.past : [...h.past, h.present].slice(-LIMIT), present: next, future: [], lastKey: key, lastAt: now }
}

export const undo = <T>(h: History<T>): History<T> =>
  h.past.length ? { past: h.past.slice(0, -1), present: h.past[h.past.length - 1], future: [h.present, ...h.future] } : h

export const redo = <T>(h: History<T>): History<T> =>
  h.future.length ? { past: [...h.past, h.present], present: h.future[0], future: h.future.slice(1) } : h
