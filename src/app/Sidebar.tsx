import { useState, type ReactNode } from 'react'
import { isProtocol, type Design } from '../model/schema'
import { store } from './hooks'
import { openNumbers } from './numbersBus'
import { isConfigured, providerLabel } from '../ai/providers'
import { openAiSettings, useAiConfig } from './useAiConfig'

/** A collapsible sidebar section whose open/closed state survives reloads. */
export function Section({ id, title, count, forceOpen, children }: { id: string; title: string; count?: number; forceOpen?: boolean; children: ReactNode }) {
  const [open, setOpen] = useState(() => store.get(`archstory.section.${id}`, true))
  const toggle = () => setOpen(o => { store.set(`archstory.section.${id}`, !o); return !o })
  const shown = open || forceOpen
  return (
    <section className="section">
      <button className="section-head" aria-expanded={shown} onClick={toggle}>
        <span className={`chev${shown ? ' open' : ''}`}>›</span>{title}{count !== undefined && <span className="count-pill">{count}</span>}
      </button>
      {shown && <div className="section-body">{children}</div>}
    </section>
  )
}

/** The Explore sidebar: the requirements stay in view; designs are chosen from the picker (⌘K). */
export function Sidebar({ current, onBrowse, onAsk, onImport, onExport, onGenerate, onViewJson }: {
  current: Design
  onBrowse: () => void; onAsk: () => void; onImport: () => void; onExport: () => void; onGenerate: () => void; onViewJson: () => void
}) {
  const r = current.requirements
  const has = !!current.meta.summary || r.functional.length + r.nonFunctional.length + r.scale.length > 0
  // A protocol (Under the hood) has key ideas rather than requirements, and its numbers sit here: there is no Numbers pill.
  const proto = isProtocol(current)
  return (
    <>
      <div className="panel-body req-body">
        <h4 className="req-title">{proto ? 'Key ideas' : 'Requirements'}</h4>
        {current.meta.summary && <p className="small req-summary">{current.meta.summary}</p>}
        {r.functional.length > 0 && <><h5>{proto ? 'What it does' : 'Functional'}</h5><ul className="reqs">{r.functional.map(x => <li key={x}>{x}</li>)}</ul></>}
        {r.nonFunctional.length > 0 && <><h5>{proto ? 'Gotchas' : 'Non-functional'}</h5><ul className="reqs">{r.nonFunctional.map(x => <li key={x}>{x}</li>)}</ul></>}
        {proto
          ? r.scale.length > 0 && <><h5>By the numbers</h5><table className="kv"><tbody>{r.scale.map(x => <tr key={x.label}><th>{x.label}</th><td>{x.value}</td></tr>)}</tbody></table></>
          : <NumbersHint />}
        {!has && <p className="muted small">This design has no requirements listed.</p>}
      </div>
      <div className="panel-foot side-actions">
        <button className="browse" onClick={onBrowse} title={`Search all ${proto ? 'protocols' : 'designs'} (⌘K / Ctrl+K)`}>Browse {proto ? 'protocols' : 'designs'}<kbd>⌘K</kbd></button>
        <button className="primary ask-ai" onClick={onAsk} title={`Copy this ${proto ? 'protocol walkthrough' : 'design'} as a prompt for ChatGPT, Claude, Gemini or any assistant, then ask your questions about it`}>✦ Ask AI about this {proto ? 'protocol' : 'design'}</button>
        <div className="side-tools" role="group" aria-label="File actions" style={{ ['--cols' as string]: proto ? 2 : 3 }}>
          {!proto && <button onClick={onImport} title="Add any other system design question as a JSON design, then explore and practise it">Import</button>}
          <button onClick={onViewJson} title={`See the JSON behind the ${proto ? 'protocol' : 'design'} you are viewing`}>View JSON</button>
          <button onClick={onExport}>Export</button>
        </div>
        {!proto && <button className="make-ai" onClick={onGenerate} title="ArchStory has no built-in AI: this writes a prompt for ChatGPT, Claude, Gemini or any assistant to make a new design"><span aria-hidden>＋</span> Make a design with AI</button>}
      </div>
    </>
  )
}

/** AI settings in the top bar, on every page: a status dot (green when a key is connected) and where the AI features go. */
export function AiTopButton() {
  const ai = useAiConfig()
  const ready = isConfigured(ai)
  const status = ready ? providerLabel(ai) : 'copy and paste'
  return (
    <button className={`ai-top${ready ? ' ready' : ''}`} onClick={openAiSettings} aria-label={`AI settings: ${ready ? `${status} key connected` : 'no key, copy and paste'}`}
      title={ready ? `Sending with your ${status} key. Change the provider or models per feature.` : 'Using copy and paste. Connect your own API key to send reviews, designs and interviews straight from here.'}>
      <i className="ai-dot" aria-hidden /><span className="ai-top-label">AI settings</span><span className="ai-top-status">{status}</span>
    </button>
  )
}

/** Scale and estimates live in the Numbers panel on the canvas; this line points there from the requirements. */
export function NumbersHint() {
  return <p className="muted small req-numbers">Scale and estimates: <button className="link" onClick={() => openNumbers('scale')}>Numbers</button> on the canvas.</p>
}
