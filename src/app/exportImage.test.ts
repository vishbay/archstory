import { describe, expect, it } from 'vitest'
import { imageFileName } from './exportImage'

describe('image file name', () => {
  it('slugs the title', () => expect(imageFileName('URL Shortener')).toBe('url-shortener.png'))
  it('drops punctuation and keeps the attempt prefix', () => expect(imageFileName('My answer: URL Shortener!')).toBe('my-answer-url-shortener.png'))
  it('folds accents and trims dashes', () => expect(imageFileName('  --Café & Bar--  ')).toBe('cafe-bar.png'))
  it('falls back when nothing is left', () => { expect(imageFileName('')).toBe('canvas.png'); expect(imageFileName('???')).toBe('canvas.png') })
})
