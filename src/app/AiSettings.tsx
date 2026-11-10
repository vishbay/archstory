import { useEffect, useRef, useState } from 'react'
import { AiError, DEFAULT_BASE_URL, hostOf, isConfigured, PROVIDERS, PROVIDER_IDS, sendChat, type AiConfig, type ProviderId } from '../ai/providers'
import { forgetAiKeys, getAiConfig, setAiConfig } from './useAiConfig'

/** Connect your own API key. Optional: every AI step also works by copy and paste. */
export function AiSettings({ onClose }: { onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [draft, setDraft] = useState<AiConfig>(() => structuredClone(getAiConfig()))
  const [test, setTest] = useState<{ state: 'idle' | 'running' | 'ok' | 'fail'; text: string }>({ state: 'idle', text: '' })
  const [storageFailed, setStorageFailed] = useState(false)
  const ctl = useRef<AbortController | null>(null)
  useEffect(() => { dialog.current?.showModal() }, [])

  const p = PROVIDERS[draft.provider]
  const set = (patch: Partial<AiConfig>) => { setDraft(d => ({ ...d, ...patch })); setTest({ state: 'idle', text: '' }) }
  const setKey = (v: string) => set({ keys: { ...draft.keys, [draft.provider]: v } })
  const setModel = (v: string) => set({ models: { ...draft.models, [draft.provider]: v } })

  const runTest = async () => {
    ctl.current?.abort(); ctl.current = new AbortController()
    setTest({ state: 'running', text: `Contacting ${hostOf(draft)}…` })
    try {
      const r = await sendChat(draft, [{ role: 'user', content: 'Reply with the single word OK.' }], { maxTokens: 20, signal: ctl.current.signal, timeoutMs: 30_000 })
      setTest({ state: 'ok', text: `Connected. ${p.label} replied: ${r.text.trim().slice(0, 40) || '(empty)'}` })
    } catch (e) {
      if (e instanceof AiError && e.kind === 'cancelled') return
      setTest({ state: 'fail', text: e instanceof AiError ? e.message : 'The test failed.' })
    }
  }
  const save = () => { setStorageFailed(!setAiConfig(draft)); if (isConfigured(draft)) dialog.current?.close(); else setStorageFailed(false) }
  const remove = () => { forgetAiKeys(); setDraft(structuredClone(getAiConfig())); setTest({ state: 'idle', text: '' }) }

  return (
    <dialog ref={dialog} className="dialog ai-dialog" onClose={() => { ctl.current?.abort(); onClose() }} aria-label="Connect your own AI">
      <h3>Connect your own AI</h3>
      <p className="muted small">
        Optional. With a key, the Review and Make-a-design steps can send their prompt for you instead of you copying it into a chat.
        ArchStory has no AI or server of its own: your browser calls the provider directly and you pay the provider for usage.
      </p>

      <label className="field">Provider
        <select value={draft.provider} onChange={e => set({ provider: e.target.value as ProviderId })}>
          {PROVIDER_IDS.map(id => <option key={id} value={id}>{PROVIDERS[id].label}</option>)}
        </select>
      </label>

      {draft.provider === 'custom' && (
        <label className="field">Server address
          <input type="text" value={draft.baseUrl} spellCheck={false} placeholder={DEFAULT_BASE_URL} onChange={e => set({ baseUrl: e.target.value })} />
          <span className="muted small">Any server that speaks the OpenAI chat API, such as Ollama or LM Studio. It must allow requests from this page (for Ollama, set <code>OLLAMA_ORIGINS</code>).</span>
        </label>
      )}

      <label className="field">API key{!p.needsKey && ' (optional)'}
        <input type="password" autoComplete="off" spellCheck={false} value={draft.keys[draft.provider]} placeholder={p.keyHint} onChange={e => setKey(e.target.value)} />
        {p.keyUrl && <span className="muted small">Make one at <a href={p.keyUrl} target="_blank" rel="noreferrer noopener">{new URL(p.keyUrl).host}</a>. Give it a spending limit.</span>}
      </label>

      <label className="field">Model
        <input type="text" value={draft.models[draft.provider]} spellCheck={false} onChange={e => setModel(e.target.value)} />
        <span className="muted small">Change this if your account uses a different model. Design reviews and generated designs work best with a strong model.</span>
      </label>

      <div className="field">Your prices (optional, per million tokens)
        <div className="ai-prices">
          <label>Input<input type="text" inputMode="decimal" value={draft.prices.input} placeholder="e.g. 3" onChange={e => set({ prices: { ...draft.prices, input: e.target.value } })} /></label>
          <label>Output<input type="text" inputMode="decimal" value={draft.prices.output} placeholder="e.g. 15" onChange={e => set({ prices: { ...draft.prices, output: e.target.value } })} /></label>
        </div>
        <span className="muted small">Copy them from your provider's pricing page. Used only to show a running cost estimate in the AI interviewer.</span>
      </div>

      <label className="check-row">
        <input type="checkbox" checked={draft.remember} onChange={e => set({ remember: e.target.checked })} />
        Remember on this device (otherwise it is forgotten when you close this tab)
      </label>

      <div className="ai-privacy small">
        <b>What gets sent:</b> the prompt, which includes your design or answer, goes to <b>{hostOf(draft)}</b> and nowhere else.
        The key stays in this browser, and is never put in exports or backups. Anyone who can use this browser profile can read a remembered key,
        so skip "remember" on a shared computer.
      </div>

      {test.state !== 'idle' && (
        <p className={`small ai-test ${test.state}`} role={test.state === 'fail' ? 'alert' : 'status'}>{test.text}</p>
      )}
      {storageFailed && <p className="small errors-inline">This browser blocked storage, so the key will be forgotten on reload.</p>}

      <div className="row end">
        <button className="link" onClick={remove} title="Forget every saved key">Remove keys</button>
        <span className="spacer" />
        <button onClick={runTest} disabled={!isConfigured(draft) || test.state === 'running'}>{test.state === 'running' ? 'Testing…' : 'Test'}</button>
        <button onClick={() => dialog.current?.close()}>Close</button>
        <button className="primary" onClick={save} disabled={!isConfigured(draft)}>Save</button>
      </div>
    </dialog>
  )
}
