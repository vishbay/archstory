import { describe, expect, it } from 'vitest'
import { askForJson } from './ask'
import { AiError, buildRequest, describeHttpError, emptyConfig, hostOf, isConfigured, parseReply, sendChat, type AiConfig } from './providers'
import { AI_STORAGE_KEY, clearConfig, loadConfig, normalise, saveConfig } from './settings'

const cfg = (over: Partial<AiConfig> = {}, key = 'sk-test-1234567890'): AiConfig => {
  const c = { ...emptyConfig(), ...over }
  c.keys = { ...c.keys, [c.provider]: key }
  return c
}
const msg = [{ role: 'user' as const, content: 'hi' }]
const json = (status: number, body: unknown) => async () => new Response(JSON.stringify(body), { status })

describe('buildRequest', () => {
  it('sends Anthropic calls with the browser-access header and the key only in x-api-key', () => {
    const r = buildRequest(cfg({ provider: 'anthropic' }), msg, 1000)
    expect(r.url).toBe('https://api.anthropic.com/v1/messages')
    expect(r.init.headers['x-api-key']).toBe('sk-test-1234567890')
    expect(r.init.headers['anthropic-dangerous-direct-browser-access']).toBe('true')
    expect(r.init.headers['anthropic-version']).toBeTruthy()
    const body = JSON.parse(r.init.body)
    expect(body).toMatchObject({ model: 'claude-sonnet-5-5', max_tokens: 1000, messages: msg })
    expect(r.init.body).not.toContain('sk-test')
    expect(r.url).not.toContain('sk-test')
  })
  it('uses a bearer token for OpenAI and omits it for a keyless custom server', () => {
    const o = buildRequest(cfg({ provider: 'openai' }), msg, 10)
    expect(o.url).toBe('https://api.openai.com/v1/chat/completions')
    expect(o.init.headers.authorization).toBe('Bearer sk-test-1234567890')
    const c = buildRequest(cfg({ provider: 'custom', baseUrl: 'http://localhost:11434/v1/' }, ''), msg, 10)
    expect(c.url).toBe('http://localhost:11434/v1/chat/completions')
    expect(c.init.headers.authorization).toBeUndefined()
  })
  it('maps Gemini roles and keeps the key out of the URL', () => {
    const r = buildRequest(cfg({ provider: 'gemini' }), [...msg, { role: 'assistant', content: 'ok' }], 50)
    expect(r.url).toBe('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent')
    expect(r.init.headers['x-goog-api-key']).toBe('sk-test-1234567890')
    expect(JSON.parse(r.init.body).contents.map((c: { role: string }) => c.role)).toEqual(['user', 'model'])
  })
})

describe('parseReply', () => {
  it('reads each provider shape and flags a length cutoff', () => {
    expect(parseReply('anthropic', { content: [{ type: 'text', text: 'a' }, { type: 'text', text: 'b' }], stop_reason: 'end_turn' })).toEqual({ text: 'ab', truncated: false })
    expect(parseReply('anthropic', { content: [{ type: 'text', text: '{' }], stop_reason: 'max_tokens' })?.truncated).toBe(true)
    expect(parseReply('openai', { choices: [{ message: { content: 'x' }, finish_reason: 'length' }] })).toEqual({ text: 'x', truncated: true })
    expect(parseReply('custom', { choices: [{ message: { content: 'y' }, finish_reason: 'stop' }] })?.text).toBe('y')
    expect(parseReply('gemini', { candidates: [{ content: { parts: [{ text: 'g' }] }, finishReason: 'STOP' }] })).toEqual({ text: 'g', truncated: false })
  })
  it('returns null for shapes it does not know', () => {
    expect(parseReply('anthropic', { nope: 1 })).toBeNull()
    expect(parseReply('openai', null)).toBeNull()
    expect(parseReply('gemini', { candidates: [] })).toBeNull()
  })
})

describe('errors', () => {
  it('explains common HTTP failures in plain words and never repeats the key', () => {
    const c = cfg({ provider: 'openai' })
    const e = describeHttpError(c, 401, JSON.stringify({ error: { message: 'Incorrect API key provided: sk-test-1234567890.' } }))
    expect(e.kind).toBe('auth'); expect(e.message).toContain('rejected the key'); expect(e.message).not.toContain('sk-test-1234567890')
    expect(describeHttpError(c, 429, '{}').kind).toBe('limit')
    expect(describeHttpError(c, 404, '{}').message).toContain('gpt-4.1')
    expect(describeHttpError(c, 503, 'down').message).toContain('HTTP 503')
  })
  it('tells a local-server user about CORS when the request cannot connect', async () => {
    const c = cfg({ provider: 'custom', baseUrl: 'http://localhost:11434/v1' }, '')
    const err = await sendChat(c, msg, { fetchImpl: async () => { throw new TypeError('Failed to fetch') } }).catch(e => e)
    expect(err).toBeInstanceOf(AiError); expect(err.kind).toBe('network'); expect(err.message).toContain('OLLAMA_ORIGINS')
  })
  it('reports a cancel as cancelled, not as a network failure', async () => {
    const ctl = new AbortController()
    const slow = (_: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((_, rej) => init?.signal?.addEventListener('abort', () => rej(Object.assign(new Error('x'), { name: 'AbortError' }))))
    const p = sendChat(cfg(), msg, { fetchImpl: slow as typeof fetch, signal: ctl.signal })
    ctl.abort()
    expect((await p.catch(e => e)).kind).toBe('cancelled')
  })
  it('does not send credentials or a referrer with the request', async () => {
    let seen: RequestInit | undefined
    await sendChat(cfg(), msg, { fetchImpl: (async (_u: RequestInfo | URL, i?: RequestInit) => { seen = i; return new Response(JSON.stringify({ content: [{ type: 'text', text: 'ok' }] })) }) as typeof fetch })
    expect(seen?.credentials).toBe('omit'); expect(seen?.referrerPolicy).toBe('no-referrer')
  })
})

describe('configuration', () => {
  it('needs a key for hosted providers but not for a local server', () => {
    expect(isConfigured(emptyConfig())).toBe(false)
    expect(isConfigured(cfg({ provider: 'anthropic' }))).toBe(true)
    expect(isConfigured({ ...emptyConfig(), provider: 'custom' })).toBe(true)
    expect(isConfigured({ ...emptyConfig(), provider: 'custom', baseUrl: ' ' })).toBe(false)
    expect(hostOf({ ...emptyConfig(), provider: 'custom', baseUrl: 'http://localhost:11434/v1' })).toBe('localhost:11434')
  })
  it('ignores stored junk and falls back to defaults', () => {
    const n = normalise({ provider: 'nope', keys: { openai: 5 }, models: { openai: '' }, remember: 'yes' })
    expect(n.provider).toBe('anthropic'); expect(n.keys.openai).toBe(''); expect(n.models.openai).toBe('gpt-4.1'); expect(n.remember).toBe(false)
  })
})

describe('key storage', () => {
  const fake = () => { const m = new Map<string, string>(); return { m, getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) } }
  it('keeps the key in this tab only unless the user opts in, and never in both places', () => {
    const s = fake(), l = fake()
    saveConfig(cfg(), s, l)
    expect(s.m.has(AI_STORAGE_KEY)).toBe(true); expect(l.m.has(AI_STORAGE_KEY)).toBe(false)
    saveConfig({ ...cfg(), remember: true }, s, l)
    expect(l.m.has(AI_STORAGE_KEY)).toBe(true); expect(s.m.has(AI_STORAGE_KEY)).toBe(false)
    expect(loadConfig(s, l).keys.anthropic).toBe('sk-test-1234567890')
    clearConfig(s, l)
    expect(loadConfig(s, l).keys.anthropic).toBe('')
  })
  it('survives storage that throws', () => {
    const bad = { getItem: () => { throw new Error('blocked') }, setItem: () => { throw new Error('blocked') }, removeItem: () => { throw new Error('blocked') } }
    expect(saveConfig(cfg(), bad, bad)).toBe(false)
    expect(loadConfig(bad, bad).keys.anthropic).toBe('')
  })
})

describe('askForJson', () => {
  const ok = (text: string) => json(200, { content: [{ type: 'text', text }], stop_reason: 'end_turn' })
  const validate = (t: string) => { try { const v = JSON.parse(t); return v.good ? { ok: true as const, value: v } : { ok: false as const, errors: ['not good'] } } catch { return { ok: false as const, errors: ['bad json'] } } }
  const asked = (replies: ReturnType<typeof ok>[], bodies: string[] = []) => {
    let i = 0
    return askForJson(cfg(), 'prompt', validate, errs => `fix: ${errs.join(',')}`, { fetchImpl: (async (_u: RequestInfo | URL, init?: RequestInit) => { bodies.push(String(init?.body)); return replies[i++]() }) as typeof fetch })
  }

  it('returns a valid first reply without a second call', async () => {
    const bodies: string[] = []
    const r = await asked([ok('{"good":true}')], bodies)
    expect(r).toMatchObject({ ok: true, fixed: false }); expect(bodies).toHaveLength(1)
  })
  it('sends one fix request in the same conversation, then accepts the corrected reply', async () => {
    const bodies: string[] = []
    const r = await asked([ok('{"good":false}'), ok('{"good":true}')], bodies)
    expect(r).toMatchObject({ ok: true, fixed: true })
    const second = JSON.parse(bodies[1]).messages
    expect(second.map((m: { role: string }) => m.role)).toEqual(['user', 'assistant', 'user'])
    expect(second[2].content).toBe('fix: not good')
  })
  it('gives up after one fix and hands back the last reply with its problems', async () => {
    const r = await asked([ok('nope'), ok('{"good":false}')])
    expect(r).toMatchObject({ ok: false, kind: 'invalid', errors: ['not good'], text: '{"good":false}' })
  })
  it('reports provider failures as errors, with no retry', async () => {
    const r = await asked([json(401, { error: { message: 'bad key' } })])
    expect(r).toMatchObject({ ok: false, kind: 'error' }); expect((r as { errors: string[] }).errors[0]).toContain('rejected the key')
  })
  it('does not try to fix a reply that was cut off by the length limit', async () => {
    const bodies: string[] = []
    const r = await asked([json(200, { content: [{ type: 'text', text: '{"good"' }], stop_reason: 'max_tokens' })], bodies)
    expect(r).toMatchObject({ ok: false, kind: 'invalid' }); expect(bodies).toHaveLength(1)
  })
})
