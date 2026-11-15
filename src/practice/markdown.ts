// A small, safe reader for the Markdown that AI answers come in: headings, paragraphs, lists (nested), code blocks, tables,
// quotes, rules, and inline bold, italic, code and http(s) links. It produces plain data; nothing is ever turned into HTML.

export type Inline = { t: 'text'; text: string } | { t: 'code'; text: string } | { t: 'b'; kids: Inline[] } | { t: 'i'; kids: Inline[] } | { t: 'a'; href: string; kids: Inline[] }
export interface ListNode { ordered: boolean; items: { kids: Inline[]; children: ListNode[] }[] }
export type Block =
  | { t: 'h'; level: number; kids: Inline[] }
  | { t: 'p'; kids: Inline[] }
  | { t: 'list'; list: ListNode }
  | { t: 'code'; lang: string; text: string }
  | { t: 'table'; head: Inline[][]; rows: Inline[][][] }
  | { t: 'quote'; blocks: Block[] }
  | { t: 'hr' }

const INLINE = /`([^`]+)`|\*\*(.+?)\*\*|\*([^*\s](?:[^*]*[^*\s])?)\*|\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/

export function parseInline(s: string): Inline[] {
  const out: Inline[] = []
  let rest = s
  while (rest) {
    const m = INLINE.exec(rest)
    if (!m) { out.push({ t: 'text', text: rest }); break }
    if (m.index > 0) out.push({ t: 'text', text: rest.slice(0, m.index) })
    if (m[1] !== undefined) out.push({ t: 'code', text: m[1] })
    else if (m[2] !== undefined) out.push({ t: 'b', kids: parseInline(m[2]) })
    else if (m[3] !== undefined) out.push({ t: 'i', kids: parseInline(m[3]) })
    else out.push({ t: 'a', href: m[5], kids: parseInline(m[4]) })
    rest = rest.slice(m.index + m[0].length)
  }
  return out
}

const FENCE = /^\s*```\s*([\w+-]*)\s*$/
const HEADING = /^(#{1,6})\s+(.*?)\s*#*\s*$/
const HR = /^\s*([-*_])(\s*\1){2,}\s*$/
const ITEM = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/
const QUOTE = /^\s*>\s?(.*)$/
const TABLE_SEP = /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/
const cells = (line: string) => line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(c => c.trim())

const startsBlock = (line: string, next: string | undefined) =>
  FENCE.test(line) || HEADING.test(line) || HR.test(line) || ITEM.test(line) || QUOTE.test(line) || (line.includes('|') && next !== undefined && TABLE_SEP.test(next))

export function parseMarkdown(src: string): Block[] {
  const lines = src.replace(/\r\n?/g, '\n').split('\n')
  const blocks: Block[] = []
  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    if (!line.trim()) { i++; continue }

    const fence = FENCE.exec(line)
    if (fence) {
      const body: string[] = []
      i++
      while (i < lines.length && !FENCE.test(lines[i])) body.push(lines[i++])
      i++   // the closing fence (or the end of an unfinished block)
      blocks.push({ t: 'code', lang: fence[1], text: body.join('\n') })
      continue
    }
    const h = HEADING.exec(line)
    if (h) { blocks.push({ t: 'h', level: h[1].length, kids: parseInline(h[2]) }); i++; continue }
    if (HR.test(line)) { blocks.push({ t: 'hr' }); i++; continue }

    if (line.includes('|') && i + 1 < lines.length && TABLE_SEP.test(lines[i + 1])) {
      const head = cells(line).map(parseInline), rows: Inline[][][] = []
      i += 2
      while (i < lines.length && lines[i].trim() && lines[i].includes('|')) rows.push(cells(lines[i++]).map(parseInline))
      blocks.push({ t: 'table', head, rows })
      continue
    }

    if (QUOTE.test(line)) {
      const inner: string[] = []
      while (i < lines.length && QUOTE.test(lines[i])) inner.push(QUOTE.exec(lines[i++])![1])
      blocks.push({ t: 'quote', blocks: parseMarkdown(inner.join('\n')) })
      continue
    }

    if (ITEM.test(line)) {
      const root: ListNode = { ordered: /\d/.test(ITEM.exec(line)![2]), items: [] }
      const stack: { indent: number; list: ListNode }[] = [{ indent: ITEM.exec(line)![1].length, list: root }]
      while (i < lines.length) {
        const m = ITEM.exec(lines[i])
        if (m) {
          const indent = m[1].length
          while (stack.length > 1 && indent < stack.at(-1)!.indent) stack.pop()
          const top = stack.at(-1)!
          if (indent > top.indent && top.list.items.length) {
            const child: ListNode = { ordered: /\d/.test(m[2]), items: [] }
            top.list.items.at(-1)!.children.push(child)
            stack.push({ indent, list: child })
          }
          stack.at(-1)!.list.items.push({ kids: parseInline(m[3]), children: [] })
          i++
        } else if (lines[i].trim() && /^\s+/.test(lines[i]) && !startsBlock(lines[i], lines[i + 1])) {
          // a wrapped line that belongs to the item above it
          const last = stack.at(-1)!.list.items.at(-1)!
          last.kids = [...last.kids, { t: 'text', text: ' ' }, ...parseInline(lines[i].trim())]
          i++
        } else break
      }
      blocks.push({ t: 'list', list: root })
      continue
    }

    const para: string[] = []
    while (i < lines.length && lines[i].trim() && (para.length === 0 || !startsBlock(lines[i], lines[i + 1]))) para.push(lines[i++].trim())
    blocks.push({ t: 'p', kids: parseInline(para.join(' ')) })
  }
  return blocks
}
