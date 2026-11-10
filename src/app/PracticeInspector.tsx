import { HA_MODES, STEP_KINDS, type Design, type Flow } from '../model/schema'
import { KINDS, type Cloud, nameOf } from '../model/kinds'
import { addFlow, flipEdge, removeEdge, removeFlow, removeNode, removeStep, renameFlow, setEdgeAsync, stepProblem, updateNode, updateStep } from '../practice/attempt'
import type { Check } from '../practice/checks'
import { ReviewPanel, type StoredReview } from './ReviewPanel'
import { KIND_TEXT, KIND_VAR } from './stepKinds'
import { NodeIcon } from './NodeIcon'
import type { Player } from './hooks'
import { TimedPanel, type TimedControls } from './TimedPanel'
import { AiInterviewer } from './AiInterviewer'
import { useState } from 'react'
import { store, useTabStrip } from './hooks'
import { mmss, status } from '../practice/timed'

export type PracticeTab = 'build' | 'flows' | 'check' | 'reasoning' | 'review' | 'interview'

const REASONING = [
  { key: 'requirements', title: 'Requirements and assumptions', hint: 'What is in and out of scope? Which numbers are you assuming?' },
  { key: 'estimates', title: 'Capacity estimates', hint: 'Requests per second, storage per year, bandwidth, cache size. Show the arithmetic.' },
  { key: 'api', title: 'API design', hint: 'The main endpoints or messages, with request and response shapes.' },
  { key: 'data_model', title: 'Data model', hint: 'Tables or keys, primary keys, indexes, and how data is partitioned.' },
  { key: 'monitoring', title: 'Monitoring and alerting', hint: 'Your SLIs and SLOs, what pages someone versus what only files a ticket, and how you would trace a slow request.' },
  { key: 'tradeoffs', title: 'Trade-offs and bottlenecks', hint: 'What did you choose and what did you give up? What breaks first at 10× load?' },
]
const LEVEL_ICON = { pass: '✓', fail: '✕', warn: '!', info: 'i' } as const

export function PracticeInspector(p: {
  attempt: Design; setAttempt: (d: Design, key?: string) => void; cloud: Cloud
  tab: PracticeTab; onTab: (t: PracticeTab) => void
  selected: string | null; onSelect: (id: string | null) => void
  picked: { from: string; to: string } | null; onPick: (e: { from: string; to: string } | null) => void
  flow: Flow | undefined; onFlow: (id: string) => void; player: Player
  recording: boolean; onRecord: () => void; onStopRecording: () => void
  result: { checks: Check[]; passed: number; total: number }; reasoningOn: boolean; onCompare: () => void
  reference: Design; review: StoredReview | null; onReview: (r: StoredReview | null) => void
  timed: TimedControls
}) {
  const { attempt: d, setAttempt, cloud, tab } = p
  const [mode, setModeState] = useState<'timed' | 'ai'>(() => store.get('archstory.interviewMode', 'timed'))
  const setMode = (m: 'timed' | 'ai') => { setModeState(m); store.set('archstory.interviewMode', m) }
  const node = p.selected ? d.nodes.find(n => n.id === p.selected) : undefined
  const edge = p.picked ? d.edges.find(e => e.from === p.picked!.from && e.to === p.picked!.to) : undefined
  const label = (id: string) => { const n = d.nodes.find(x => x.id === id); return n ? nameOf(n, cloud) : id }
  const tabs: PracticeTab[] = ['build', 'flows', 'check', ...(p.reasoningOn ? ['reasoning' as const] : []), 'review', 'interview']
  const shownTab = tab === 'reasoning' && !p.reasoningOn ? 'build' : tab
  const tabStrip = useTabStrip(shownTab)
  const tabName = { build: 'Build', flows: `Flows (${d.flows.length})`, check: p.result.total ? `Check ${p.result.passed}/${p.result.total}` : 'Check', reasoning: 'Reasoning', review: p.review ? `Review ${p.review.review.overall}/5` : 'Review',
    interview: p.timed.session && p.timed.session.endedAt === null ? `Interview ${mmss(status(p.timed.session, p.timed.now).totalLeft)}` : 'Interview' }

  return (
    <>
      <div className="tabs" role="tablist" ref={tabStrip}>
        {tabs.map(t => <button key={t} role="tab" aria-selected={shownTab === t} className={shownTab === t ? 'on' : ''} onClick={() => p.onTab(t)}>{tabName[t]}</button>)}
      </div>
      <div className="panel-body">

        {shownTab === 'build' && edge && (
          <>
            <h3>Connection</h3>
            <p>{label(edge.from)} <span className="muted">→</span> {label(edge.to)}</p>
            <p className="muted small">Arrows point from the caller to the component it calls. Responses travel back along the same connection.</p>
            <label className="check-row"><input type="checkbox" checked={!!edge.async} onChange={e => setAttempt(setEdgeAsync(d, edge.from, edge.to, e.target.checked))} /> Asynchronous (fire-and-forget)</label>
            <div className="row wrap">
              <button onClick={() => { setAttempt(flipEdge(d, edge.from, edge.to)); p.onPick({ from: edge.to, to: edge.from }) }}>Reverse direction</button>
              <button className="danger" onClick={() => { setAttempt(removeEdge(d, edge.from, edge.to)); p.onPick(null) }}>Delete</button>
            </div>
          </>
        )}

        {shownTab === 'build' && !edge && node && (
          <>
            <h3 className="with-icon"><NodeIcon node={node} cloud={cloud} size={24} /> {node.label}</h3>
            <label className="field">Name<input type="text" value={node.label} onChange={e => setAttempt(updateNode(d, node.id, { label: e.target.value }), `label:${node.id}`)} /></label>
            <label className="field">Kind
              <select value={node.kind} onChange={e => setAttempt(updateNode(d, node.id, { kind: e.target.value }))}>
                {Object.entries(KINDS).map(([k, v]) => <option key={k} value={k}>{v.icon} {v.label}</option>)}
              </select>
            </label>
            <div className="field-row">
              <label className="field">AWS product<input type="text" placeholder="e.g. ElastiCache Redis" value={node.cloud?.aws ?? ''}
                onChange={e => setAttempt(updateNode(d, node.id, { cloud: { ...node.cloud, aws: e.target.value || undefined } }), `aws:${node.id}`)} /></label>
              <label className="field">GCP product<input type="text" placeholder="e.g. Memorystore Redis" value={node.cloud?.gcp ?? ''}
                onChange={e => setAttempt(updateNode(d, node.id, { cloud: { ...node.cloud, gcp: e.target.value || undefined } }), `gcp:${node.id}`)} /></label>
            </div>
            <div className="field-row">
              <label className="field">Replicas<input type="number" min={1} value={node.replicas ?? ''} placeholder="1"
                onChange={e => setAttempt(updateNode(d, node.id, { replicas: Number(e.target.value) > 1 ? Number(e.target.value) : undefined }))} /></label>
              {d.network && (
                <label className="field">Zone failure
                  <select value={node.ha ?? ''} onChange={e => setAttempt(updateNode(d, node.id, { ha: (e.target.value || undefined) as typeof node.ha }))}>
                    <option value="">default for kind</option>
                    {HA_MODES.map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
                </label>
              )}
            </div>
            <label className="field">Why it is here (optional)<textarea rows={3} value={node.description ?? ''}
              onChange={e => setAttempt(updateNode(d, node.id, { description: e.target.value || undefined }), `desc:${node.id}`)} /></label>
            <button className="danger" onClick={() => { setAttempt(removeNode(d, node.id)); p.onSelect(null) }}>Delete component</button>
          </>
        )}

        {shownTab === 'build' && !edge && !node && (
          <>
            <h3>Build your answer</h3>
            <ol className="howto">
              <li><b>Add components</b> from the palette on the left. They land in their tier band automatically.</li>
              <li><b>Connect</b> them: press <b>Connect</b> (or C), click the caller, then what it calls. Clicks keep chaining. Dragging between component edges works too.</li>
              <li><b>Record flows</b> in the Flows tab: click components in the order a request travels, then back for the response.</li>
              <li><b>Check</b> your answer, then compare it with the reference.</li>
            </ol>
            <p className="muted small">Click a component or connection to edit it. Press <kbd>/</kbd> to add by typing (connected from the selected component), <kbd>⌘D</kbd> to duplicate, Delete to remove, <kbd>⌘Z</kbd> to undo, and <kbd>?</kbd> for all shortcuts.</p>
          </>
        )}

        {shownTab === 'flows' && (
          <>
            <div className="row wrap">
              <button className="primary" onClick={() => { const r = addFlow(d); setAttempt(r.design); p.onFlow(r.id); p.onRecord() }}>New flow</button>
              {d.flows.length > 1 && (
                <select value={p.flow?.id} onChange={e => p.onFlow(e.target.value)} aria-label="Flow">
                  {d.flows.map(f => <option key={f.id} value={f.id}>{f.title}</option>)}
                </select>
              )}
            </div>
            {!p.flow && <p className="muted small">A flow is one request's journey: for example "Create link" or "Redirect". Record the main read and write paths.</p>}
            {p.flow && (
              <>
                <label className="field">Title<input type="text" value={p.flow.title} onChange={e => setAttempt(renameFlow(d, p.flow!.id, e.target.value), `flow:${p.flow!.id}`)} /></label>
                <div className="row wrap">
                  {p.recording
                    ? <button onClick={p.onStopRecording}>■ Stop recording</button>
                    : <button onClick={p.onRecord}>● {p.flow.steps.length ? 'Continue recording' : 'Record'}</button>}
                  <button className="danger" onClick={() => { setAttempt(removeFlow(d, p.flow!.id)); p.onStopRecording() }}>Delete flow</button>
                </div>
                <ol className="rec-steps">
                  {p.flow.steps.map((s, i) => {
                    const problem = stepProblem(d, s)
                    return (
                      <li key={i} className={`${i === p.player.step ? 'cur' : ''}${problem ? ' bad' : ''}`}>
                        <button className="step-hop" onClick={() => p.player.jump(i)}>
                          <span className="dot" style={{ background: KIND_VAR[s.kind] }} />
                          {i + 1}. {label(s.from)}{s.from !== s.to && <> → {label(s.to)}</>}
                        </button>
                        <div className="step-edit">
                          <select value={s.kind} onChange={e => setAttempt(updateStep(d, p.flow!.id, i, { kind: e.target.value as typeof s.kind }))} aria-label="Step kind">
                            {STEP_KINDS.map(k => <option key={k} value={k}>{KIND_TEXT[k]}</option>)}
                          </select>
                          <input type="text" value={s.label} aria-label="Step label" onChange={e => setAttempt(updateStep(d, p.flow!.id, i, { label: e.target.value }), `step:${p.flow!.id}:${i}`)} />
                          <button className="icon ghost" title="Remove step" onClick={() => setAttempt(removeStep(d, p.flow!.id, i))}>×</button>
                        </div>
                        {problem && <span className="step-problem">✕ {problem}</span>}
                      </li>
                    )
                  })}
                </ol>
                {!p.flow.steps.length && !p.recording && <p className="muted small">No steps yet. Press Record, then click components on the canvas.</p>}
              </>
            )}
          </>
        )}

        {shownTab === 'check' && (
          <>
            <div className="score">
              <b>{p.result.passed} / {p.result.total}</b> checks pass
              <button onClick={p.onCompare}>Compare with reference</button>
            </div>
            <ul className="checks">
              {p.result.checks.map(c => (
                <li key={c.id} className={`lvl-${c.level}`}>
                  <span className="check-icon">{LEVEL_ICON[c.level]}</span>
                  <div>
                    <b>{c.title}</b>
                    {c.detail && <p>{c.detail}</p>}
                  </div>
                </li>
              ))}
            </ul>
            <p className="muted small">Highlighted components on the canvas are involved in a failed check.</p>
          </>
        )}

        {shownTab === 'review' && (
          <ReviewPanel attempt={d} reference={p.reference} checks={p.result.checks} stored={p.review} onStore={p.onReview}
            onSelectNode={id => { p.onPick(null); p.onSelect(id) }} cloud={cloud} />
        )}

        {shownTab === 'interview' && (
          <>
            <div className="seg iv-mode" role="group" aria-label="Interview mode">
              {(['timed', 'ai'] as const).map(m => <button key={m} className={mode === m ? 'on' : ''} aria-pressed={mode === m} onClick={() => setMode(m)}>{m === 'timed' ? 'Timed' : 'AI interviewer'}</button>)}
            </div>
            {mode === 'timed'
              ? <TimedPanel t={p.timed} attempt={d} checks={p.result.checks} />
              : <AiInterviewer attempt={d} reference={p.reference} checks={p.result.checks} cloud={cloud} onSelectNode={id => { p.onPick(null); p.onSelect(id) }} />}
          </>
        )}

        {shownTab === 'reasoning' && (
          <>
            <p className="muted small">Write what you would say out loud in the interview. Saved with your answer and included in exports.</p>
            {REASONING.map(r => (
              <label key={r.key} id={`reasoning-${r.key}`} className="field">{r.title}
                <textarea rows={5} placeholder={r.hint} value={d.reasoning?.[r.key] ?? ''}
                  onChange={e => setAttempt({ ...d, reasoning: { ...d.reasoning, [r.key]: e.target.value } }, `reasoning:${r.key}`)} />
              </label>
            ))}
          </>
        )}
      </div>
    </>
  )
}
