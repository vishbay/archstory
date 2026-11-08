// PROTOTYPE: floating variant switcher. ←/→ cycle variants; state lives in ?variant= so it's shareable.
import { useEffect, useState } from 'react'

export function useVariant(keys: string[]): [string, (v: string) => void] {
  const read = () => { const v = new URLSearchParams(location.search).get('variant'); return v && keys.includes(v) ? v : keys[0] }
  const [v, setV] = useState(read)
  const set = (next: string) => {
    const u = new URL(location.href); u.searchParams.set('variant', next)
    history.replaceState(null, '', u); setV(next)
  }
  return [v, set]
}

export function PrototypeSwitcher({ variants, current, onChange }: {
  variants: { key: string; name: string }[]; current: string; onChange: (k: string) => void
}) {
  const i = variants.findIndex(v => v.key === current)
  const cycle = (d: number) => onChange(variants[(i + d + variants.length) % variants.length].key)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest('input, textarea, [contenteditable]')) return
      if (e.key === 'ArrowLeft') cycle(-1)
      if (e.key === 'ArrowRight') cycle(1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  if (!import.meta.env.DEV) return null
  return (
    <div className="xp-switcher">
      <button onClick={() => cycle(-1)}>←</button>
      <span><b>{current}</b> · {variants[i].name}</span>
      <button onClick={() => cycle(1)}>→</button>
    </div>
  )
}
