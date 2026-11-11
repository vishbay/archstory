import { describe, expect, it } from 'vitest'
import { LIBRARY } from '../library'
import { addNode, blankAttempt } from './attempt'
import { familyOf } from './checks'
import { compareDesigns } from './compare'
import type { Design } from '../model/schema'

const url = LIBRARY.find(d => d.id === 'url-shortener')!
const build = (kinds: string[]) => kinds.reduce<Design>((d, k) => addNode(d, k).design, blankAttempt(url))
const kindsOf = (d: Design, ids: Set<string>) => [...new Set(d.nodes.filter(n => ids.has(n.id)).map(n => n.kind))].sort()

describe('compare with the reference', () => {
  it('marks every checked reference component missing from an empty attempt, and no extras', () => {
    const { missing, extra } = compareDesigns(blankAttempt(url), url)
    expect(kindsOf(url, missing)).toEqual(['analytics', 'cache', 'cdn', 'db_replica', 'key_gen', 'load_balancer', 'queue', 'sql_db', 'worker'])
    expect(url.nodes.filter(n => missing.has(n.id)).map(familyOf)).not.toContain('service')
    expect(extra.size).toBe(0)
  })
  it('counts an equivalent kind as present', () => {
    const att = build(['web_client', 'api_gateway', 'service', 'nosql_db', 'stream'])
    const { missing, extra } = compareDesigns(att, url)
    expect(kindsOf(url, missing)).not.toContain('queue')
    expect(kindsOf(url, missing)).not.toContain('load_balancer')
    expect(kindsOf(url, missing)).not.toContain('sql_db')
    expect(extra.size).toBe(0)
  })
  it('marks a family the reference does without as extra', () => {
    const att = build(['web_client', 'service', 'search_index', 'dns', 'metrics_store'])
    const { extra } = compareDesigns(att, url)
    expect(kindsOf(att, extra)).toEqual(['search_index'])
  })
})
