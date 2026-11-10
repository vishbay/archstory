// Ask the model for JSON, check it, and if it does not validate send one fix request in the same conversation.
// This is the same loop a person does by hand with copy and paste.
import { AiError, sendChat, type AiConfig, type Message, type SendOptions } from './providers'

export type Checked<T> = { ok: true; value: T } | { ok: false; errors: string[] }
export type Asked<T> =
  | { ok: true; value: T; text: string; fixed: boolean }
  | { ok: false; kind: 'invalid' | 'error'; errors: string[]; text: string | null; cancelled?: boolean }

export async function askForJson<T>(
  cfg: AiConfig, prompt: string,
  validate: (reply: string) => Checked<T>, fixRequest: (errors: string[]) => string,
  opts: SendOptions = {},
): Promise<Asked<T>> {
  const messages: Message[] = [{ role: 'user', content: prompt }]
  let text: string | null = null
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const r = await sendChat(cfg, messages, opts)
      text = r.text
      if (r.truncated) return { ok: false, kind: 'invalid', text, errors: ['The reply was cut off because it reached the length limit. Try a model with a larger output limit, or a smaller request.'] }
    } catch (e) {
      const err = e instanceof AiError ? e : new AiError('Something went wrong while contacting the provider.', 'http')
      return { ok: false, kind: 'error', text, errors: [err.message], cancelled: err.kind === 'cancelled' }
    }
    const checked = validate(text)
    if (checked.ok) return { ok: true, value: checked.value, text, fixed: attempt > 0 }
    if (attempt === 1) return { ok: false, kind: 'invalid', text, errors: checked.errors }
    messages.push({ role: 'assistant', content: text }, { role: 'user', content: fixRequest(checked.errors) })
  }
  return { ok: false, kind: 'error', text, errors: ['No reply.'] }   // unreachable: the loop always returns
}
