import type { Flow } from '../model/schema'

/** The scenario to offer when one finishes: the next in the list, wrapping to the first after the last. */
export function nextScenario(flows: Pick<Flow, 'id' | 'title'>[], currentId: string): { flow: Pick<Flow, 'id' | 'title'>; wrapped: boolean } | null {
  if (flows.length < 2) return null
  const i = flows.findIndex(f => f.id === currentId)
  if (i < 0) return null
  const wrapped = i === flows.length - 1
  return { flow: flows[wrapped ? 0 : i + 1], wrapped }
}
