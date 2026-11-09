// Flows are easier to follow in stages. A step names its stage in `phase`; consecutive steps with the same
// phase form one group, and a step with no phase continues the previous step's stage.
export interface PhaseGroup { name: string; start: number; end: number }   // inclusive step indices

/** The phase each step belongs to, after letting unnamed steps continue the previous stage. */
export function resolvePhases(steps: { phase?: string }[]): (string | undefined)[] {
  let cur: string | undefined
  return steps.map(s => (cur = s.phase?.trim() || cur))
}

/** Groups of consecutive steps, or null when the flow has no phases at all (the list then stays flat). */
export function phaseGroups(steps: { phase?: string }[]): PhaseGroup[] | null {
  const names = resolvePhases(steps)
  if (!names.some(Boolean)) return null
  const groups: PhaseGroup[] = []
  names.forEach((name, i) => {
    const last = groups.at(-1)
    if (last && last.name === (name ?? '')) last.end = i
    else groups.push({ name: name ?? '', start: i, end: i })
  })
  return groups
}
