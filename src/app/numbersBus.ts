// Open the Numbers panel on the canvas from elsewhere (the hint in the requirements panel).
const OPEN = 'archstory:numbers'
export const openNumbers = (tab?: 'scale' | 'estimate') => window.dispatchEvent(new CustomEvent(OPEN, { detail: tab }))
export const onOpenNumbers = (cb: (tab?: 'scale' | 'estimate') => void) => {
  const h = (e: Event) => cb((e as CustomEvent).detail)
  window.addEventListener(OPEN, h); return () => window.removeEventListener(OPEN, h)
}
