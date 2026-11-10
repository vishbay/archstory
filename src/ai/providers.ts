// Calls an AI provider straight from the browser with the user's own key. There is no ArchStory server in between.
// Request building and reply parsing are pure so they can be tested without a network.

export type ProviderId = 'anthropic' | 'openai' | 'gemini' | 'custom'
export interface Message { role: 'user' | 'assistant'; content: string }
export interface AiConfig {
  provider: ProviderId
  keys: Record<ProviderId, string>
  models: Record<ProviderId, string>
  /** Base URL of an OpenAI-compatible server, used by the "custom" provider (for example Ollama). */
  baseUrl: string
  /** Keep the key on this device (localStorage) instead of for this tab only (sessionStorage). */
  remember: boolean
}

export const PROVIDERS: Record<ProviderId, { label: string; defaultModel: string; keyHint: string; keyUrl?: string; needsKey: boolean }> = {
  anthropic: { label: 'Anthropic (Claude)', defaultModel: 'claude-sonnet-5-5', keyHint: 'sk-ant-…', keyUrl: 'https://console.anthropic.com/settings/keys', needsKey: true },
  openai: { label: 'OpenAI', defaultModel: 'gpt-4.1', keyHint: 'sk-…', keyUrl: 'https://platform.openai.com/api-keys', needsKey: true },
  gemini: { label: 'Google Gemini', defaultModel: 'gemini-2.5-flash', keyHint: 'AIza…', keyUrl: 'https://aistudio.google.com/apikey', needsKey: true },
  custom: { label: 'Custom (OpenAI-compatible)', defaultModel: 'llama3.1', keyHint: 'optional', needsKey: false },
}
export const PROVIDER_IDS = Object.keys(PROVIDERS) as ProviderId[]
export const DEFAULT_BASE_URL = 'http://localhost:11434/v1'   // Ollama's OpenAI-compatible endpoint

export const emptyConfig = (): AiConfig => ({
  provider: 'anthropic',
  keys: { anthropic: '', openai: '', gemini: '', custom: '' },
  models: { anthropic: PROVIDERS.anthropic.defaultModel, openai: PROVIDERS.openai.defaultModel, gemini: PROVIDERS.gemini.defaultModel, custom: PROVIDERS.custom.defaultModel },
  baseUrl: DEFAULT_BASE_URL,
  remember: false,
})

/** Whether there is enough to send a request: a key (unless the provider does not need one) and a model. */
export function isConfigured(c: AiConfig): boolean {
  const p = PROVIDERS[c.provider]
  if (!c.models[c.provider].trim()) return false
  if (c.provider === 'custom' && !c.baseUrl.trim()) return false
  return !p.needsKey || !!c.keys[c.provider].trim()
}

export const providerLabel = (c: AiConfig) => PROVIDERS[c.provider].label.replace(/ \(.*\)/, '')

/** The host a request goes to, shown so the user knows where their design is being sent. */
export function hostOf(c: AiConfig): string {
  if (c.provider === 'anthropic') return 'api.anthropic.com'
  if (c.provider === 'openai') return 'api.openai.com'
  if (c.provider === 'gemini') return 'generativelanguage.googleapis.com'
  try { return new URL(c.baseUrl).host } catch { return c.baseUrl }
}

export interface HttpRequest { url: string; init: { method: 'POST'; headers: Record<string, string>; body: string } }

export function buildRequest(c: AiConfig, messages: Message[], maxTokens: number): HttpRequest {
  const key = c.keys[c.provider].trim(), model = c.models[c.provider].trim()
  const post = (url: string, headers: Record<string, string>, body: unknown): HttpRequest =>
    ({ url, init: { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) } })

  if (c.provider === 'anthropic') {
    return post('https://api.anthropic.com/v1/messages', {
      'x-api-key': key, 'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',   // required for calls made from a web page
    }, { model, max_tokens: maxTokens, messages })
  }
  if (c.provider === 'gemini') {
    return post(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, { 'x-goog-api-key': key }, {
      contents: messages.map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] })),
      generationConfig: { maxOutputTokens: maxTokens },
    })
  }
  const base = c.provider === 'openai' ? 'https://api.openai.com/v1' : c.baseUrl.trim().replace(/\/+$/, '')
  return post(`${base}/chat/completions`, key ? { authorization: `Bearer ${key}` } : {}, { model, messages })
}

/** The reply text, and whether the provider stopped because it hit the length limit (the JSON would be cut off). */
export function parseReply(provider: ProviderId, json: unknown): { text: string; truncated: boolean } | null {
  const j = json as Record<string, any> | null
  if (!j || typeof j !== 'object') return null
  if (provider === 'anthropic') {
    if (!Array.isArray(j.content)) return null
    return { text: j.content.filter((b: any) => b?.type === 'text').map((b: any) => b.text).join(''), truncated: j.stop_reason === 'max_tokens' }
  }
  if (provider === 'gemini') {
    const cand = j.candidates?.[0]
    if (!cand) return null
    return { text: (cand.content?.parts ?? []).map((p: any) => p?.text ?? '').join(''), truncated: cand.finishReason === 'MAX_TOKENS' }
  }
  const choice = j.choices?.[0]
  if (!choice) return null
  return { text: choice.message?.content ?? '', truncated: choice.finish_reason === 'length' }
}

export class AiError extends Error {
  readonly kind: 'auth' | 'limit' | 'network' | 'http' | 'format' | 'cancelled' | 'truncated'
  constructor(message: string, kind: AiError['kind']) { super(message); this.kind = kind }
}

const scrub = (text: string, key: string) => (key.length >= 8 ? text.split(key).join('***') : text).slice(0, 400)

/** A friendly message for an HTTP failure. The key never appears in it. */
export function describeHttpError(c: AiConfig, status: number, body: string): AiError {
  const key = c.keys[c.provider].trim(), who = providerLabel(c)
  let detail = ''
  try { const j = JSON.parse(body); detail = j?.error?.message ?? j?.error ?? j?.message ?? '' } catch { detail = body }
  detail = scrub(typeof detail === 'string' ? detail : JSON.stringify(detail), key).trim()
  const tail = detail ? ` ${who} said: ${detail}` : ''
  if (status === 401 || status === 403) return new AiError(`${who} rejected the key. Check that it is correct, active, and allowed to use this model.${tail}`, 'auth')
  if (status === 404) return new AiError(`${who} does not know the model "${c.models[c.provider]}"${c.provider === 'custom' ? ', or the base URL is wrong' : ''}. Check the model name in the AI settings.${tail}`, 'http')
  if (status === 429) return new AiError(`${who} is rate limiting this key, or the account is out of credit.${tail}`, 'limit')
  if (status === 408 || status >= 500) return new AiError(`${who} had a problem (HTTP ${status}). Try again in a moment.${tail}`, 'http')
  return new AiError(`${who} returned HTTP ${status}.${tail}`, 'http')
}

export function describeNetworkError(c: AiConfig): AiError {
  const host = hostOf(c)
  const hint = c.provider === 'custom'
    ? ' For a local server, make sure it is running and that it allows requests from this page (Ollama needs OLLAMA_ORIGINS set to this site).'
    : ' Check your connection, and that no extension or network rule is blocking the request.'
  return new AiError(`Could not reach ${host}.${hint}`, 'network')
}

export interface SendOptions { maxTokens?: number; signal?: AbortSignal; timeoutMs?: number; fetchImpl?: typeof fetch }

/** Send a conversation and return the reply text. Throws AiError with a message that is safe to show. */
export async function sendChat(c: AiConfig, messages: Message[], opts: SendOptions = {}): Promise<{ text: string; truncated: boolean }> {
  const { url, init } = buildRequest(c, messages, opts.maxTokens ?? 8000)
  const ctl = new AbortController()
  const onAbort = () => ctl.abort()
  opts.signal?.addEventListener('abort', onAbort)
  const timer = setTimeout(() => ctl.abort(), opts.timeoutMs ?? 240_000)
  try {
    if (opts.signal?.aborted) throw new AiError('Cancelled.', 'cancelled')
    let res: Response
    try { res = await (opts.fetchImpl ?? fetch)(url, { ...init, signal: ctl.signal, credentials: 'omit', referrerPolicy: 'no-referrer' }) }
    catch (e) {
      if (opts.signal?.aborted) throw new AiError('Cancelled.', 'cancelled')
      if ((e as Error)?.name === 'AbortError') throw new AiError(`${providerLabel(c)} took too long to answer. Try again, or use a faster model.`, 'network')
      throw describeNetworkError(c)
    }
    const body = await res.text()
    if (!res.ok) throw describeHttpError(c, res.status, body)
    let json: unknown
    try { json = JSON.parse(body) } catch { throw new AiError(`${providerLabel(c)} sent a reply that is not JSON.`, 'format') }
    const reply = parseReply(c.provider, json)
    if (!reply) throw new AiError(`${providerLabel(c)} sent a reply in a shape ArchStory does not recognise.`, 'format')
    return reply
  } finally {
    clearTimeout(timer)
    opts.signal?.removeEventListener('abort', onAbort)
  }
}
