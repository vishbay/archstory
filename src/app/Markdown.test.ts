import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { Markdown } from './Markdown'

describe('Markdown', () => {
  it('shows formatting as elements and never lets answer text become HTML', () => {
    const html = renderToStaticMarkup(createElement(Markdown, { text: '## Why\n- **fast** reads\n- `GET /x`\n\n<img src=x onerror=alert(1)>' }))
    expect(html).toContain('<strong>fast</strong>')
    expect(html).toContain('<code>GET /x</code>')
    expect(html).toContain('<ul>')
    expect(html).not.toContain('<img')
    expect(html).toContain('&lt;img')
  })
})
