// A three-step hint ladder for a stuck learner: which tiers are empty, which kinds of component are missing, then one
// reference flow. Each level is worked out from the gap between the attempt and the reference, so it changes as the answer does.
import { TIERS, type Design, type DNode } from '../model/schema'
import { KINDS, tierOf, TIER_INFO } from '../model/kinds'
import { familyOf, FAMILY_NAME, IMPLIED, nameOfFamily, TELEMETRY_KINDS, UNCHECKED } from './checks'

export interface Hint { level: 1 | 2 | 3; title: string; lines: string[]; done: boolean }
export const MAX_HINT = 3

/** One short question per family, so level 2 nudges rather than just naming the part. */
const NUDGE: Partial<Record<keyof typeof FAMILY_NAME, string>> = {
  entry: 'What is the front door that spreads requests across servers?',
  database: 'Where does the data live for good?',
  queue: 'How is slow work handed off so the caller does not wait?',
  worker: 'What does the work that happens off the request path?',
  cache: 'Where would repeated reads be served from?',
  cdn: 'Could popular content be served closer to users?',
  waf: 'What filters bad traffic before it reaches you?',
  db_replica: 'How would the database keep up with heavy reads?',
  object_store: 'Where would large files or blobs be kept?',
  push_gateway: 'How would the server push updates to connected clients or devices?',
  geo_index: 'How would you find things near a location quickly?',
  search_index: 'How would text or similarity search be answered quickly?',
  catalog: 'How do producers and consumers agree on what the data looks like?',
  llm: 'Which model generates the answer, and how is it called?',
  hybrid_link: 'How does the cloud reach systems still in the data centre?',
  analytics: 'Where would events go for reporting?',
  auth: 'What checks who the user is?',
  key_gen: 'How are unique keys made without collisions?',
  rate_limiter: 'What stops one client flooding the system?',
  payment_provider: 'Who actually moves the money?',
  notification_provider: 'How does a message reach a phone or inbox?',
  external_api: 'Which outside system does this depend on?',
}

const telemetry = (n: DNode) => TELEMETRY_KINDS.has(n.kind)

export function hintsFor(att: Design, ref: Design): Hint[] {
  // 1. Tiers the reference uses that the attempt leaves empty (monitoring parts do not count, as in the checks)
  const mineTiers = new Set(att.nodes.map(tierOf))
  const refTiers = new Set(ref.nodes.filter(n => !telemetry(n)).map(tierOf))
  const emptyTiers = TIERS.filter(t => refTiers.has(t) && !mineTiers.has(t))
  const tiers: Hint = emptyTiers.length
    ? { level: 1, title: 'Tiers', done: false, lines: emptyTiers.map(t => `Nothing in the ${TIER_INFO[t].title} tier yet`) }
    : { level: 1, title: 'Tiers', done: true, lines: ['Every tier the reference uses has something in it. The next hint looks at components.'] }

  // 2. Families the reference has and the attempt lacks, skipped the same way the checks skip them
  const mine = new Set(att.nodes.map(familyOf))
  const missing = [...new Set(ref.nodes.filter(n => !telemetry(n)).map(familyOf))]
    .filter(f => !mine.has(f) && !UNCHECKED.has(f) && !IMPLIED.has(f))
  const parts: Hint = missing.length
    ? { level: 2, title: 'Components', done: false, lines: missing.map(f => NUDGE[f] ? `${NUDGE[f]} (${nameOfFamily(f)})` : `Think about ${nameOfFamily(f)}`) }
    : { level: 2, title: 'Components', done: true, lines: ['You have every kind of component the reference uses.'] }

  return [tiers, parts, flowHint(att, ref)]
}

/** 3. The reference's first flow, as the components it visits in order. */
function flowHint(att: Design, ref: Design): Hint {
  const f = ref.flows.find(x => x.steps.length)
  if (!f) return { level: 3, title: 'One flow', done: true, lines: ['The reference has no flows to show.'] }
  const byId = new Map(ref.nodes.map(n => [n.id, n]))
  const path = [...new Set(f.steps.flatMap(s => [s.from, s.to]))].map(id => byId.get(id)).filter((n): n is DNode => !!n)
  // Already done when one of your flows passes through every kind of component this one does.
  const want = new Set(path.filter(n => !IMPLIED.has(familyOf(n))).map(familyOf))
  const attById = new Map(att.nodes.map(n => [n.id, n]))
  const yours = att.flows.find(a => {
    const fams = new Set(a.steps.flatMap(s => [s.from, s.to]).map(id => attById.get(id)).filter((n): n is DNode => !!n).map(familyOf))
    return a.steps.length && [...want].every(x => fams.has(x))
  })
  if (yours) return { level: 3, title: 'One flow', done: true, lines: [`Your flow "${yours.title}" already covers the path of "${f.title}".`] }
  const name = (n: DNode) => { const k = KINDS[n.kind]?.label; return !k || n.label.toLowerCase().includes(k.toLowerCase()) ? n.label : `${n.label} (${k})` }
  return { level: 3, title: 'One flow', done: false, lines: [`${f.title}: ${path.map(name).join(' → ')}`] }
}
