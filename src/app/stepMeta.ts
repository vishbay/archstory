// The meta line of the Flow tab's current step card: "Step 3 of 8 · phase · at 1.5 RTT, 75 ms", with "lost in the network" for a
// step that never arrives and the round trip time spelled out when the Distance control is not at the module's own reference.
import { fmtMs, fmtRtt, rttToMs } from '../model/protocol'

/** The note after the round trip count when the chosen distance differs from the module's own reference. */
export const customRttNote = (ms: number) => `${Number(ms.toFixed(1))} ms round trip`

export function stepMetaText(o: {
  step: number; total: number; phase?: string
  /** Elapsed time in round trips at this step; null when the design is not a protocol (no clock). */
  at: number | null; lost?: boolean; rttMs: number; custom: boolean
}): string {
  const head = `Step ${o.step + 1} of ${o.total}${o.phase ? ` · ${o.phase}` : ''}`
  if (o.at === null) return head
  const when = o.lost ? ' · lost in the network' : ` · at ${fmtRtt(o.at)}, ${fmtMs(rttToMs(o.at, o.rttMs))}`
  return head + when + (o.custom ? ` (at ${customRttNote(o.rttMs)})` : '')
}
