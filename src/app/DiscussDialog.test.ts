import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { emptyConfig } from '../ai/providers'
import { parseDesign } from '../model/schema'
import { STARTER_DESIGN } from './starterDesign'
import { DiscussDialog } from './DiscussDialog'

// Server rendering has no store to subscribe to, so stand in for the shared AI settings (no key saved).
vi.mock('./useAiConfig', () => ({ useAiConfig: () => emptyConfig(), openAiSettings: () => {} }))

describe('DiscussDialog', () => {
  it('opens on a choice between a quick question and a longer conversation', () => {
    const parsed = parseDesign(STARTER_DESIGN)
    if (!parsed.ok) throw new Error('starter design should parse')
    const html = renderToStaticMarkup(createElement(DiscussDialog, { design: parsed.design, onClose: () => {} }))
    expect(html).toContain('Quick question')
    expect(html).toContain('Longer conversation')
    expect(html).toContain('Needs an API key')
    expect(html).not.toContain('Copy prompt')   // the copy step only shows after choosing it
  })
})
