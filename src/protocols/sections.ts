// Under the hood modules are listed under section headings (meta.section). Any text is allowed; the app knows an order for
// these, then lists the others alphabetically, and modules with no section come last.
import type { Design } from '../model/schema'

export const KNOWN_SECTIONS = ['Network', 'Security', 'Distributed systems'] as const
/** The heading for modules that do not name a section. */
export const OTHER_SECTION = 'Other'

export interface SectionGroup { section: string; designs: Design[] }

const rank = (s: string) => { const i = (KNOWN_SECTIONS as readonly string[]).indexOf(s); return i >= 0 ? i : KNOWN_SECTIONS.length }

/** Group designs by section: known sections in their order, then any others by name, then "Other". `meta.order` sorts within a
 *  section (designs without one sort by title after those with one). */
export function groupBySection(designs: Design[]): SectionGroup[] {
  const by = new Map<string, Design[]>()
  for (const d of designs) {
    const s = d.meta.section?.trim() || OTHER_SECTION
    by.set(s, [...(by.get(s) ?? []), d])
  }
  const within = (a: Design, b: Design) => (a.meta.order ?? Infinity) - (b.meta.order ?? Infinity) || a.meta.title.localeCompare(b.meta.title)
  return [...by.entries()]
    .sort(([a], [b]) => (a === OTHER_SECTION ? 1 : 0) - (b === OTHER_SECTION ? 1 : 0) || rank(a) - rank(b) || a.localeCompare(b))
    .map(([section, list]) => ({ section, designs: [...list].sort(within) }))
}
