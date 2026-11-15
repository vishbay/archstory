// Calls an AI provider straight from the browser with the user's own key. There is no ArchStory server in between.
// Request building and reply parsing are pure so they can be tested without a network.

export type ProviderId = 'anthropic' | 'openai' | 'gemini' | 'deepseek' | 'custom'
export interface Message { role: 'user' | 'assistant'; content: string }
export interface AiConfig {
  provider: ProviderId
  keys: Record<ProviderId, string>
  models: Record<ProviderId, string>
  /** Base URL of an OpenAI-compatible server, used by the "custom" provider (for example Ollama). */
  baseUrl: string
  /** Keep the key on this device (localStorage) instead of for this tab only (sessionStorage). */
  remember: boolean
  /** The user's own price per million tokens, used only to show a cost estimate. Empty when unknown. */
  prices: { input: string; output: string }
  /** Optional model per feature and provider; empty means the provider's main model. */
  featureModels: Record<ProviderId, Record<Feature, string>>
}

export type Feature = 'review' | 'generate' | 'interview'
export const FEATURES: { id: Feature; label: string; hint: string }[] = [
  { id: 'review', label: 'Reviews', hint: 'needs judgement: a strong model' },
  { id: 'generate', label: 'Making designs', hint: 'long, strict JSON: a strong model' },
  { id: 'interview', label: 'AI interviewer', hint: 'short replies, many turns: a fast, cheaper model is fine' },
]
const noFeatureModels = (): Record<Feature, string> => ({ review: '', generate: '', interview: '' })

/** The settings to use for one feature: its own model if one is set, otherwise the provider's main model. */
export function forFeature(c: AiConfig, f: Feature): AiConfig {
  const m = c.featureModels[c.provider]?.[f]?.trim()
  return m ? { ...c, models: { ...c.models, [c.provider]: m } } : c
}
export const modelFor = (c: AiConfig, f: Feature) => forFeature(c, f).models[c.provider]

export interface Usage { input: number; output: number; cacheRead: number; cacheWrite: number }
export const noUsage = (): Usage => ({ input: 0, output: 0, cacheRead: 0, cacheWrite: 0 })

export const PROVIDERS: Record<ProviderId, { label: string; defaultModel: string; keyHint: string; keyUrl?: string; needsKey: boolean }> = {
  anthropic: { label: 'Anthropic (Claude)', defaultModel: 'claude-sonnet-5-5', keyHint: 'sk-ant-…', keyUrl: 'https://console.anthropic.com/settings/keys', needsKey: true },
  openai: { label: 'OpenAI', defaultModel: 'gpt-6.1-sol', keyHint: 'sk-…', keyUrl: 'https://platform.openai.com/api-keys', needsKey: true },
  gemini: { label: 'Google Gemini', defaultModel: 'gemini-3.8-flash', keyHint: 'AIza…', keyUrl: 'https://aistudio.google.com/apikey', needsKey: true },
  deepseek: { label: 'DeepSeek', defaultModel: 'deepseek-v4-pro', keyHint: 'sk-…', keyUrl: 'https://platform.deepseek.com/api_keys', needsKey: true },
  custom: { label: 'Custom (OpenAI-compatible)', defaultModel: 'llama3.1', keyHint: 'optional', needsKey: false },
}
export const PROVIDER_IDS = Object.keys(PROVIDERS) as ProviderId[]
export const DEFAULT_BASE_URL = 'http://localhost:11434/v1'   // Ollama's OpenAI-compatible endpoint

export const emptyConfig = (): AiConfig => ({
  provider: 'anthropic',
  keys: { anthropic: '', openai: '', gemini: '', deepseek: '', custom: '' },
  models: { anthropic: PROVIDERS.anthropic.defaultModel, openai: PROVIDERS.openai.defaultModel, gemini: PROVIDERS.gemini.defaultModel, deepseek: PROVIDERS.deepseek.defaultModel, custom: PROVIDERS.custom.defaultModel },
  baseUrl: DEFAULT_BASE_URL,
  remember: false,
  prices: { input: '', output: '' },
  featureModels: { anthropic: noFeatureModels(), openai: noFeatureModels(), gemini: noFeatureModels(), deepseek: noFeatureModels(), custom: noFeatureModels() },
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
  if (c.provider === 'deepseek') return 'api.deepseek.com'
  try { return new URL(c.baseUrl).host } catch { return c.baseUrl }
}

export interface HttpRequest { url: string; init: { method: 'POST'; headers: Record<string, string>; body: string } }

export interface RequestExtras {
  /** Instructions that frame the whole conversation. */
  system?: string
  /** Ask the provider to cache the conversation so far (Anthropic only), which makes a long chat much cheaper. */
  cache?: boolean
}

export function buildRequest(c: AiConfig, messages: Message[], maxTokens: number, extras: RequestExtras = {}): HttpRequest {
  const key = c.keys[c.provider].trim(), model = c.models[c.provider].trim()
  const post = (url: string, headers: Record<string, string>, body: unknown): HttpRequest =>
    ({ url, init: { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) } })

  if (c.provider === 'anthropic') {
    const mark = { cache_control: { type: 'ephemeral' } }
    const last = messages.length - 1
    const wire = extras.cache
      ? messages.map((m, i) => (i === last ? { role: m.role, content: [{ type: 'text', text: m.content, ...mark }] } : m))
      : messages
    return post('https://api.anthropic.com/v1/messages', {
      'x-api-key': key, 'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',   // required for calls made from a web page
    }, {
      model, max_tokens: maxTokens, messages: wire,
      ...(extras.system ? { system: extras.cache ? [{ type: 'text', text: extras.system, ...mark }] : extras.system } : {}),
    })
  }
  if (c.provider === 'gemini') {
    return post(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, { 'x-goog-api-key': key }, {
      contents: messages.map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] })),
      generationConfig: { maxOutputTokens: maxTokens },
      ...(extras.system ? { systemInstruction: { parts: [{ text: extras.system }] } } : {}),
    })
  }
  // OpenAI, DeepSeek and custom servers share the OpenAI chat completions format
  const base = c.provider === 'openai' ? 'https://api.openai.com/v1' : c.provider === 'deepseek' ? 'https://api.deepseek.com' : c.baseUrl.trim().replace(/\/+$/, '')
  return post(`${base}/chat/completions`, key ? { authorization: `Bearer ${key}` } : {},
    { model, messages: extras.system ? [{ role: 'system', content: extras.system }, ...messages] : messages })
}

export interface Reply { text: string; truncated: boolean; usage: Usage | null; /** Why the provider stopped, in its own words (for example STOP, SAFETY, length), when it says. */ finish?: string }
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0)

/** The reply text, whether the provider stopped because it hit the length limit (the answer would be cut off), and tokens used. */
export function parseReply(provider: ProviderId, json: unknown): Reply | null {
  const j = json as Record<string, any> | null
  if (!j || typeof j !== 'object') return null
  if (provider === 'anthropic') {
    if (!Array.isArray(j.content)) return null
    const u = j.usage
    return {
      text: j.content.filter((b: any) => b?.type === 'text').map((b: any) => b.text).join(''), truncated: j.stop_reason === 'max_tokens', finish: j.stop_reason,
      usage: u ? { input: num(u.input_tokens), output: num(u.output_tokens), cacheRead: num(u.cache_read_input_tokens), cacheWrite: num(u.cache_creation_input_tokens) } : null,
    }
  }
  if (provider === 'gemini') {
    const cand = j.candidates?.[0]
    if (!cand) return null
    const u = j.usageMetadata
    return {
      text: (cand.content?.parts ?? []).map((p: any) => (p?.thought ? '' : p?.text ?? '')).join(''), truncated: cand.finishReason === 'MAX_TOKENS', finish: cand.finishReason,
      usage: u ? { input: Math.max(0, num(u.promptTokenCount) - num(u.cachedContentTokenCount)), output: num(u.candidatesTokenCount) + num(u.thoughtsTokenCount), cacheRead: num(u.cachedContentTokenCount), cacheWrite: 0 } : null,
    }
  }
  const choice = j.choices?.[0]
  if (!choice) return null
  const u = j.usage, cached = num(u?.prompt_tokens_details?.cached_tokens) || num(u?.prompt_cache_hit_tokens)   // DeepSeek reports cache hits its own way
  return {
    text: choice.message?.content ?? '', truncated: choice.finish_reason === 'length', finish: choice.finish_reason ?? undefined,
    usage: u ? { input: Math.max(0, num(u.prompt_tokens) - cached), output: num(u.completion_tokens), cacheRead: cached, cacheWrite: 0 } : null,
  }
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

/** A reply with no text is not an answer. Say why, since the usual cause is a thinking model using up the length limit on its reasoning. */
export function emptyReply(c: AiConfig, r: Reply): AiError {
  const who = providerLabel(c)
  if (r.truncated) return new AiError(`${who} used the whole length limit on its reasoning before writing an answer. Try again, or choose a faster model in the AI settings (thinking models spend part of the limit thinking).`, 'truncated')
  const why = r.finish && !/^(stop|end_turn)$/i.test(r.finish) ? ` It stopped with "${r.finish}", which often means a safety filter.` : ''
  return new AiError(`${who} sent back an empty answer.${why} Try again, or reword the question.`, 'format')
}

export interface SendOptions extends RequestExtras { maxTokens?: number; signal?: AbortSignal; timeoutMs?: number; fetchImpl?: typeof fetch }

/** Send a conversation and return the reply text. Throws AiError with a message that is safe to show. */
export async function sendChat(c: AiConfig, messages: Message[], opts: SendOptions = {}): Promise<Reply> {
  const { url, init } = buildRequest(c, messages, opts.maxTokens ?? 8000, { system: opts.system, cache: opts.cache })
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
    const blocked = (json as any)?.promptFeedback?.blockReason
    if (c.provider === 'gemini' && blocked) throw new AiError(`Gemini blocked this request (${blocked}). Try rewording the question.`, 'http')
    const reply = parseReply(c.provider, json)
    if (!reply) throw new AiError(`${providerLabel(c)} sent a reply in a shape ArchStory does not recognise.`, 'format')
    if (!reply.text.trim()) throw emptyReply(c, reply)
    return reply
  } finally {
    clearTimeout(timer)
    opts.signal?.removeEventListener('abort', onAbort)
  }
}

/** The request that lists the models this key can use. */
export function buildModelsRequest(c: AiConfig): { url: string; headers: Record<string, string> } {
  const key = c.keys[c.provider].trim()
  if (c.provider === 'anthropic') {
    return { url: 'https://api.anthropic.com/v1/models?limit=1000', headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' } }
  }
  if (c.provider === 'gemini') return { url: 'https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000', headers: { 'x-goog-api-key': key } }
  const base = c.provider === 'openai' ? 'https://api.openai.com/v1' : c.provider === 'deepseek' ? 'https://api.deepseek.com' : c.baseUrl.trim().replace(/\/+$/, '')
  return { url: `${base}/models`, headers: key ? { authorization: `Bearer ${key}` } : {} }
}

// OpenAI lists every model it has; these cannot answer a chat, so they are left out of the picker.
const NOT_CHAT = /embed|whisper|tts|transcribe|dall-e|moderation|image|audio|realtime|davinci|babbage|sora|search/i

/** Model ids that can chat, newest-looking names first. Empty when the reply is not a model list. */
export function parseModels(provider: ProviderId, json: unknown): string[] {
  const j = json as Record<string, any> | null
  if (!j || typeof j !== 'object') return []
  let ids: string[]
  if (provider === 'gemini') {
    ids = (Array.isArray(j.models) ? j.models : [])
      .filter((m: any) => Array.isArray(m?.supportedGenerationMethods) && m.supportedGenerationMethods.includes('generateContent'))
      .map((m: any) => String(m.name ?? '').replace(/^models\//, ''))
  } else {
    ids = (Array.isArray(j.data) ? j.data : []).map((m: any) => String(m?.id ?? ''))
    if (provider === 'openai') ids = ids.filter(id => !NOT_CHAT.test(id))
  }
  return [...new Set(ids.filter(Boolean))].sort((a, b) => b.localeCompare(a, undefined, { numeric: true }))
}

/** Ask the provider which models this key can use. Throws AiError with a message that is safe to show. */
export async function listModels(c: AiConfig, opts: { signal?: AbortSignal; fetchImpl?: typeof fetch } = {}): Promise<string[]> {
  const { url, headers } = buildModelsRequest(c)
  let res: Response
  try { res = await (opts.fetchImpl ?? fetch)(url, { headers, signal: opts.signal, credentials: 'omit', referrerPolicy: 'no-referrer' }) }
  catch { if (opts.signal?.aborted) throw new AiError('Cancelled.', 'cancelled'); throw describeNetworkError(c) }
  const body = await res.text()
  if (res.status === 404) throw new AiError(`${providerLabel(c)} has no model list at this address. Type the model name instead.`, 'http')
  if (!res.ok) throw describeHttpError(c, res.status, body)
  let json: unknown
  try { json = JSON.parse(body) } catch { throw new AiError(`${providerLabel(c)} sent a reply that is not JSON.`, 'format') }
  const ids = parseModels(c.provider, json)
  if (!ids.length) throw new AiError(`${providerLabel(c)} returned no models this key can chat with. Type the model name instead.`, 'format')
  return ids
}
