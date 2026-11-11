import { describe, expect, it } from 'vitest'
import { extractJson, generationPrompt } from './prompts'
import { parseDesign } from '../model/schema'
import { LIBRARY } from '../library'

describe('AI answers', () => {
  it('extracts JSON from a fenced answer with prose around it', () => {
    const answer = 'Sure! Here is the design:\n\n```json\n{ "a": { "b": 1 } }\n```\n\nLet me know if you want changes.'
    expect(JSON.parse(extractJson(answer))).toEqual({ a: { b: 1 } })
    expect(JSON.parse(extractJson('{"x":1}'))).toEqual({ x: 1 })
  })
  it('builds a prompt with the task, rules, schema and a valid example', () => {
    const p = generationPrompt('Design Dropbox', LIBRARY[0])
    expect(p).toContain('Task: Design Dropbox')
    expect(p).toContain('"archstory/v1"')
    expect(p).toContain('Each flow step travels exactly one edge')
    expect(p).toContain('Include an "observability" section')
    expect(p).toContain('Do NOT add telemetry components')
    expect(p).toContain('"phase"')
    expect(p).toContain('Set "meta.difficulty" to "easy", "medium" or "hard"')
    expect(p).toContain('Include a "regions" section only when the task asks for multi-region, disaster recovery or global users')
    expect(p).toContain('"replication"')
    expect(p).toContain('14. Do not use em dashes')
    expect(p).not.toContain('—')
    const example = JSON.parse(extractJson(p.slice(p.indexOf('Example of a valid design'))))
    expect(parseDesign(example).ok).toBe(true)
  })
})
