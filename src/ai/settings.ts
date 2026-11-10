// Where the user's AI settings live. The key is kept for this tab only unless they choose to remember it on this device.
// It is never part of a share link, an export or a practice backup.
import { emptyConfig, PROVIDER_IDS, type AiConfig } from './providers'

export const AI_STORAGE_KEY = 'archstory.ai'

type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>
const safe = <T,>(f: () => T, fallback: T): T => { try { return f() } catch { return fallback } }

/** Merge whatever was stored over the defaults, ignoring anything of the wrong shape. */
export function normalise(raw: unknown): AiConfig {
  const base = emptyConfig(), r = (raw && typeof raw === 'object' ? raw : {}) as Partial<AiConfig>
  const str = (v: unknown, d: string) => (typeof v === 'string' ? v : d)
  const out: AiConfig = { ...base, keys: { ...base.keys }, models: { ...base.models } }
  if (r.provider && PROVIDER_IDS.includes(r.provider)) out.provider = r.provider
  for (const id of PROVIDER_IDS) {
    out.keys[id] = str(r.keys?.[id], '')
    out.models[id] = str(r.models?.[id], base.models[id]) || base.models[id]
  }
  out.baseUrl = str(r.baseUrl, base.baseUrl)
  out.remember = r.remember === true
  return out
}

export function loadConfig(session: Store | undefined, local: Store | undefined): AiConfig {
  const read = (s?: Store) => safe(() => { const v = s?.getItem(AI_STORAGE_KEY); return v ? JSON.parse(v) : null }, null)
  return normalise(read(session) ?? read(local))
}

export function saveConfig(c: AiConfig, session: Store | undefined, local: Store | undefined): boolean {
  const json = JSON.stringify(c)
  return safe(() => {
    const keep = c.remember ? local : session, drop = c.remember ? session : local
    drop?.removeItem(AI_STORAGE_KEY)
    keep?.setItem(AI_STORAGE_KEY, json)
    return !!keep
  }, false)
}

export function clearConfig(session: Store | undefined, local: Store | undefined) {
  safe(() => session?.removeItem(AI_STORAGE_KEY), undefined)
  safe(() => local?.removeItem(AI_STORAGE_KEY), undefined)
}
