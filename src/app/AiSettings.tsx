import { useEffect, useRef, useState } from 'react'
import { AiError, DEFAULT_BASE_URL, FEATURES, hostOf, isConfigured, listModels, PROVIDERS, PROVIDER_IDS, sendChat, type AiConfig, type Feature, type ProviderId } from '../ai/providers'
import { forgetAiKeys, getAiConfig, setAiConfig } from './useAiConfig'

/** Connect your own API key. Optional: every AI step also works by copy and paste. */
export function AiSettings({ onClose }: { onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [draft, setDraft] = useState<AiConfig>(() => structuredClone(getAiConfig()))
  const [test, setTest] = useState<{ state: 'idle' | 'running' | 'ok' | 'fail'; text: string }>({ state: 'idle', text: '' })
  const [storageFailed, setStorageFailed] = useState(false)
  // Models the provider says this key can use, per provider. Dropped when the key or server address changes.
  const [lists, setLists] = useState<Partial<Record<ProviderId, string[]>>>({})
  const [listing, setListing] = useState<{ state: 'idle' | 'running' | 'fail'; text: string }>({ state: 'idle', text: '' })
  const models = lists[draft.provider] ?? null
  const ctl = useRef<AbortController | null>(null)
  useEffect(() => { dialog.current?.showModal() }, [])

  const p = PROVIDERS[draft.provider]
  const set = (patch: Partial<AiConfig>) => { setDraft(d => ({ ...d, ...patch })); setTest({ state: 'idle', text: '' }) }
  const setKey = (v: string) => { setLists(l => ({ ...l, [draft.provider]: undefined })); set({ keys: { ...draft.keys, [draft.provider]: v } }) }
  const setModel = (v: string) => set({ models: { ...draft.models, [draft.provider]: v } })
  const setFeatureModel = (f: Feature, v: string) => set({ featureModels: { ...draft.featureModels, [draft.provider]: { ...draft.featureModels[draft.provider], [f]: v } } })
  const anyFeature = FEATURES.some(f => draft.featureModels[draft.provider][f.id].trim())

  const loadModels = async () => {
    ctl.current?.abort(); ctl.current = new AbortController()
    setListing({ state: 'running', text: '' })
    try {
      const ids = await listModels(draft, { signal: ctl.current.signal })
      setLists(l => ({ ...l, [draft.provider]: ids })); setListing({ state: 'idle', text: '' })
    } catch (e) {
      if (e instanceof AiError && e.kind === 'cancelled') return
      setListing({ state: 'fail', text: e instanceof AiError ? e.message : 'Could not load the model list.' })
    }
  }
  const canList = (!p.needsKey || !!draft.keys[draft.provider].trim()) && (draft.provider !== 'custom' || !!draft.baseUrl.trim())

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
          <input type="text" value={draft.baseUrl} spellCheck={false} placeholder={DEFAULT_BASE_URL} onChange={e => { setLists(l => ({ ...l, custom: undefined })); set({ baseUrl: e.target.value }) }} />
          <span className="muted small">Any server that speaks the OpenAI chat API, such as Ollama or LM Studio. It must allow requests from this page (for Ollama, set <code>OLLAMA_ORIGINS</code>).</span>
        </label>
      )}

      <label className="field">API key{!p.needsKey && ' (optional)'}
        <input type="password" autoComplete="off" spellCheck={false} value={draft.keys[draft.provider]} placeholder={p.keyHint} onChange={e => setKey(e.target.value)} />
        {p.keyUrl && <span className="muted small">Make one at <a href={p.keyUrl} target="_blank" rel="noreferrer noopener">{new URL(p.keyUrl).host}</a>. Give it a spending limit.</span>}
      </label>

      <label className="field">Model
        <ModelPicker value={draft.models[draft.provider]} models={models} onChange={setModel} />
        <span className="muted small">Used for everything unless you choose a model per feature below.</span>
      </label>
      <div className="row">
        <button onClick={loadModels} disabled={!canList || listing.state === 'running'}>{listing.state === 'running' ? 'Loading…' : models ? 'Reload models' : 'Load my models'}</button>
        <span className="muted small">{models ? `${models.length} models this key can use.` : 'Asks the provider which models your key can use, so you can pick one instead of typing it.'}</span>
      </div>
      {listing.state === 'fail' && <p className="small errors-inline" role="alert">{listing.text}</p>}

      <details className="ai-features" open={anyFeature}>
        <summary>Use a different model for each feature</summary>
        <p className="muted small">Leave a box empty to use the main model. A common mix: a strong model for reviews and making designs, and a faster, cheaper one for the interviewer.</p>
        {FEATURES.map(f => (
          <label key={f.id} className="field ai-feature">{f.label} <span className="muted small">({f.hint})</span>
            <ModelPicker value={draft.featureModels[draft.provider][f.id]} models={models} emptyLabel={`Main model (${draft.models[draft.provider] || p.defaultModel})`}
              placeholder={draft.models[draft.provider] || p.defaultModel} onChange={v => setFeatureModel(f.id, v)} />
          </label>
        ))}
      </details>

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
        so skip "remember" on a shared computer. Safest: make a key just for ArchStory, give it a low spending limit, and delete it when you stop using the app.
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

/** A model name box that turns into a drop-down once the provider's model list is loaded. A saved name that is not in the list stays selectable. */
function ModelPicker({ value, models, onChange, emptyLabel, placeholder }: {
  value: string; models: string[] | null; onChange: (v: string) => void; emptyLabel?: string; placeholder?: string
}) {
  if (!models) return <input type="text" value={value} spellCheck={false} placeholder={placeholder} onChange={e => onChange(e.target.value)} />
  const options = value && !models.includes(value) ? [value, ...models] : models
  return (
    <select value={value} onChange={e => onChange(e.target.value)}>
      {(emptyLabel !== undefined || !value) && <option value="">{emptyLabel ?? 'Choose a model'}</option>}
      {options.map(id => <option key={id} value={id}>{id}{models.includes(id) ? '' : ' (not in the list)'}</option>)}
    </select>
  )
}
