import { describe, expect, it } from 'vitest'
import { parseInline, parseMarkdown } from './markdown'

describe('inline', () => {
  it('reads bold, italic, code and http links, and leaves other brackets as text', () => {
    expect(parseInline('a **b `c`** *d* [e](https://x.io/p?q=1)')).toEqual([
      { t: 'text', text: 'a ' }, { t: 'b', kids: [{ t: 'text', text: 'b ' }, { t: 'code', text: 'c' }] }, { t: 'text', text: ' ' },
      { t: 'i', kids: [{ t: 'text', text: 'd' }] }, { t: 'text', text: ' ' }, { t: 'a', href: 'https://x.io/p?q=1', kids: [{ t: 'text', text: 'e' }] },
    ])
    expect(parseInline('[x](javascript:alert(1))')).toEqual([{ t: 'text', text: '[x](javascript:alert(1))' }])
    expect(parseInline('snake_case and 2 * 3 * 4')).toEqual([{ t: 'text', text: 'snake_case and 2 * 3 * 4' }])
  })
})

describe('blocks', () => {
  it('reads headings, paragraphs that wrap, and rules', () => {
    const b = parseMarkdown('## Title\nfirst line\nsecond line\n\n---\n')
    expect(b.map(x => x.t)).toEqual(['h', 'p', 'hr'])
    expect(b[1]).toEqual({ t: 'p', kids: [{ t: 'text', text: 'first line second line' }] })
  })
  it('keeps code fences verbatim, including an unfinished one', () => {
    expect(parseMarkdown('```json\n{ "a": **1** }\n```')).toEqual([{ t: 'code', lang: 'json', text: '{ "a": **1** }' }])
    expect(parseMarkdown('```\nnever closed')).toEqual([{ t: 'code', lang: '', text: 'never closed' }])
  })
  it('nests lists by indentation and keeps wrapped lines with their item', () => {
    const [b] = parseMarkdown('1. one\n   wraps here\n   - sub a\n   - sub b\n2. two')
    if (b.t !== 'list') throw new Error('not a list')
    expect(b.list.ordered).toBe(true)
    expect(b.list.items).toHaveLength(2)
    expect(b.list.items[0].children[0].items).toHaveLength(2)
    expect(b.list.items[0].kids.map(k => (k.t === 'text' ? k.text : '')).join('')).toBe('one wraps here')
  })
  it('reads a table and a quote', () => {
    const b = parseMarkdown('| A | B |\n|---|:-:|\n| 1 | 2 |\n\n> note\n> more')
    expect(b[0]).toMatchObject({ t: 'table', head: [[{ text: 'A' }], [{ text: 'B' }]] })
    expect(b[1].t).toBe('quote')
  })
})
