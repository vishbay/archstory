import type { ReactNode } from 'react'
import { parseMarkdown, type Block, type Inline, type ListNode } from '../practice/markdown'

const inline = (kids: Inline[]): ReactNode[] => kids.map((k, i) => {
  if (k.t === 'text') return k.text
  if (k.t === 'code') return <code key={i}>{k.text}</code>
  if (k.t === 'b') return <strong key={i}>{inline(k.kids)}</strong>
  if (k.t === 'i') return <em key={i}>{inline(k.kids)}</em>
  return <a key={i} href={k.href} target="_blank" rel="noreferrer noopener">{inline(k.kids)}</a>
})

const list = (l: ListNode): ReactNode => {
  const Tag = l.ordered ? 'ol' : 'ul'
  return <Tag>{l.items.map((it, i) => <li key={i}>{inline(it.kids)}{it.children.map((c, j) => <div key={j}>{list(c)}</div>)}</li>)}</Tag>
}

const block = (b: Block, i: number): ReactNode => {
  switch (b.t) {
    case 'h': return <p key={i} className={`md-h md-h${Math.min(b.level, 3)}`}>{inline(b.kids)}</p>
    case 'p': return <p key={i}>{inline(b.kids)}</p>
    case 'list': return <div key={i}>{list(b.list)}</div>
    case 'code': return <pre key={i}><code>{b.text}</code></pre>
    case 'hr': return <hr key={i} />
    case 'quote': return <blockquote key={i}>{b.blocks.map(block)}</blockquote>
    case 'table': return (
      <div key={i} className="md-table"><table>
        <thead><tr>{b.head.map((c, j) => <th key={j}>{inline(c)}</th>)}</tr></thead>
        <tbody>{b.rows.map((r, j) => <tr key={j}>{r.map((c, k) => <td key={k}>{inline(c)}</td>)}</tr>)}</tbody>
      </table></div>
    )
  }
}

/** An AI answer written in Markdown, shown as formatted text. Built from React elements, so nothing in the answer can inject HTML. */
export function Markdown({ text }: { text: string }) {
  return <div className="md">{parseMarkdown(text).map(block)}</div>
}
