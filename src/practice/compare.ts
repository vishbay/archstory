// Side by side with the reference: which components each design has that the other lacks, by family,
// skipping the families the checks skip.
import type { Design } from '../model/schema'
import { familyOf, IMPLIED, TELEMETRY_KINDS, UNCHECKED } from './checks'

const checked = (fam: string) => !UNCHECKED.has(fam) && !IMPLIED.has(fam) && !TELEMETRY_KINDS.has(fam)

/** Reference components whose family the attempt lacks (`missing`), and attempt components whose family the reference lacks (`extra`). */
export function compareDesigns(att: Design, ref: Design): { missing: Set<string>; extra: Set<string> } {
  const fams = (d: Design) => new Set(d.nodes.map(familyOf))
  const mine = fams(att), theirs = fams(ref)
  return {
    missing: new Set(ref.nodes.filter(n => checked(familyOf(n)) && !mine.has(familyOf(n))).map(n => n.id)),
    extra: new Set(att.nodes.filter(n => checked(familyOf(n)) && !theirs.has(familyOf(n))).map(n => n.id)),
  }
}
