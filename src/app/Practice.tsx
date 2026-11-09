// Practice mode: build your own answer to a library problem on the same tier-band canvas, record request flows
// by clicking components, then check it against the reference design.
import { useEffect, useMemo, useRef, useState } from 'react'
import { ReactFlowProvider } from '@xyflow/react'
import { LIBRARY } from '../library'
import { edgeId, TIERS, type Design } from '../model/schema'
import { KINDS, TIER_INFO, type Cloud } from '../model/kinds'
import { addNode, appendStep, blankAttempt, connect, removeEdge, removeNode } from '../practice/attempt'
import { runChecks } from '../practice/checks'
import { BandCanvas, type ZoneState } from './BandCanvas'
import { Seg, Toggle, Toolbar, ToolbarSep, ToolbarSpacer } from './CanvasToolbar'
import { Timeline } from './Timeline'
import { PlayerBar } from './PlayerBar'
import { Inspector, type InspectorTab } from './Inspector'
import { PracticeInspector, type PracticeTab } from './PracticeInspector'
import { Section } from './Sidebar'
import { PANEL_LEFT, PANEL_RIGHT, store, usePlayer, useWide } from './hooks'
import { commit, initHistory, redo, undo } from '../practice/history'
import type { StoredReview } from './ReviewPanel'

const NO_ZONES: ZoneState = { failed: null, home: 0, zl: null, hops: null }
const attemptKey = (id: string) => `archstory.attempt.${id}`

export function Practice({ problemId, onProblem, cloud, colorMode, leftOpen, rightOpen, onExport, onViewJson }: {
  problemId: string; onProblem: (id: string) => void; cloud: Cloud; colorMode: 'light' | 'dark'
  leftOpen: boolean; rightOpen: boolean; onExport: (d: Design) => void; onViewJson: (d: Design) => void
}) {
  const ref = LIBRARY.find(d => d.id === problemId) ?? LIBRARY[0]
  const [hist, setHist] = useState(() => initHistory<Design>(store.get(attemptKey(ref.id), blankAttempt(ref))))
  const attempt = hist.present
  const [loadedFor, setLoadedFor] = useState(ref.id)
  const [review, setReviewState] = useState<StoredReview | null>(() => store.get(`archstory.review.${ref.id}`, null))
  if (loadedFor !== ref.id) {
    setLoadedFor(ref.id)
    setHist(initHistory<Design>(store.get(attemptKey(ref.id), blankAttempt(ref))))
    setReviewState(store.get(`archstory.review.${ref.id}`, null))
  }
  /** Every edit goes through history; `key` groups rapid edits to one field into a single undo step. */
  const setAttempt = (d: Design, key?: string) => setHist(h => commit(h, d, key))
  const [saved, setSaved] = useState<'idle' | 'saved' | 'failed'>('idle')
  const firstSave = useRef(true)
  useEffect(() => {
    if (firstSave.current) { firstSave.current = false; return }
    setSaved(store.set(attemptKey(ref.id), attempt) ? 'saved' : 'failed')
  }, [attempt]) // eslint-disable-line react-hooks/exhaustive-deps
  const [connecting, setConnecting] = useState(false)
  const [connFrom, setConnFrom] = useState<string | null>(null)
  const [dropping, setDropping] = useState(false)
  const setReview = (r: StoredReview | null) => { setReviewState(r); store.set(`archstory.review.${ref.id}`, r) }

  const [showRef, setShowRef] = useState(false)
  const [view, setView] = useState<'canvas' | 'timeline'>('canvas')
  const [network, setNetwork] = useState(false)
  const [selected, setSelected] = useState<string | null>(null)
  const [picked, setPicked] = useState<{ from: string; to: string } | null>(null)
  const [flowId, setFlowId] = useState('')
  const [recording, setRecording] = useState(false)
  const [recFrom, setRecFrom] = useState<string | null>(null)
  const [tab, setTab] = useState<PracticeTab>('build')
  const [refTab, setRefTab] = useState<InspectorTab>('step')
  const [reasoningOn, setReasoningOn] = useState(() => store.get('archstory.reasoning', false))
  useEffect(() => { store.set('archstory.reasoning', reasoningOn) }, [reasoningOn])

  const wide = useWide()
  const insets = { left: wide && leftOpen ? PANEL_LEFT : 12, right: wide && rightOpen ? PANEL_RIGHT : 12 }
  const shown = showRef ? ref : attempt
  const flow = shown.flows.find(f => f.id === flowId) ?? shown.flows[0]
  const player = usePlayer(flow?.steps.length ?? 0, `${shown.id}/${flow?.id}`)
  const result = useMemo(() => runChecks(attempt, ref), [attempt, ref])
  const flagged = useMemo(() => new Set(tab === 'check' ? result.checks.filter(c => c.level === 'fail' || c.level === 'warn').flatMap(c => c.nodes ?? []) : []),
    [result, tab])
  // Review findings marked on their components while the review tab is open
  const marks = useMemo(() => {
    const m = new Map<string, { count: number; severity: string }>()
    if (tab !== 'review' || !review) return m
    const rank = ['critical', 'major', 'minor', 'praise']
    for (const f of review.review.findings) {
      if (!f.target) continue
      const cur = m.get(f.target)
      m.set(f.target, { count: (cur?.count ?? 0) + 1, severity: cur && rank.indexOf(cur.severity) < rank.indexOf(f.severity) ? cur.severity : f.severity })
    }
    return m
  }, [review, tab])

  // While recording, keep the player on the newest step so each click animates the hop just added.
  const steps = flow?.steps.length ?? 0
  useEffect(() => { if (recording && steps) player.jump(steps - 1) }, [steps]) // eslint-disable-line react-hooks/exhaustive-deps

  const stopRecording = () => { setRecording(false); setRecFrom(null) }
  const stopConnecting = () => { setConnecting(false); setConnFrom(null) }
  const startConnecting = () => { stopRecording(); setConnecting(true); setConnFrom(null); setSelected(null); setPicked(null); setShowRef(false) }
  const reset = () => {
    if (!confirm(`Clear your answer for "${ref.meta.title}"? This cannot be undone.`)) return
    setAttempt(blankAttempt(ref)); setReview(null); setSelected(null); setPicked(null); stopRecording(); setFlowId('')
  }
  const add = (kind: string) => {
    const r = addNode(attempt, kind)
    setAttempt(r.design); setSelected(r.id); setPicked(null); setTab('build'); setShowRef(false)
  }
  const onNode = (id: string | null) => {
    if (showRef) { setSelected(id); if (id) setRefTab('component'); return }
    if (connecting && id) {
      if (connFrom && connFrom !== id) setAttempt(connect(attempt, connFrom, id))
      setConnFrom(id)
      return
    }
    if (recording && id && flow) {
      if (recFrom) setAttempt(appendStep(attempt, flow.id, recFrom, id))
      setRecFrom(id)
      return
    }
    setSelected(id); setPicked(null); if (id) setTab('build')
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest('input, textarea, select, [contenteditable]') || showRef) return
      const mod = e.metaKey || e.ctrlKey
      if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); setHist(h => (e.shiftKey ? redo(h) : undo(h))); return }
      if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); setHist(redo); return }
      if (e.key === 'Escape') { stopRecording(); stopConnecting() }
      if (e.key === 'c' && !mod) { if (connecting) stopConnecting(); else startConnecting() }
      if (e.key !== 'Delete' && e.key !== 'Backspace') return
      if (picked) { setAttempt(removeEdge(attempt, picked.from, picked.to)); setPicked(null) }
      else if (selected) { setAttempt(removeNode(attempt, selected)); setSelected(null) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const r = ref.requirements
  const kindsByTier = TIERS.map(t => ({ t, kinds: Object.entries(KINDS).filter(([, v]) => v.tier === t) }))

  return (
    <>
      {leftOpen && (
        <aside className="left">
          <div className="panel-body">
            <label className="field">Problem
              <select value={ref.id} onChange={e => { onProblem(e.target.value); setShowRef(false); stopRecording(); setSelected(null); setPicked(null); setFlowId('') }}>
                {LIBRARY.map(d => <option key={d.id} value={d.id}>{d.meta.title}</option>)}
              </select>
            </label>
            <Section id="p-requirements" title="Requirements">
              {ref.meta.summary && <p className="small">{ref.meta.summary}</p>}
              {r.functional.length > 0 && <details open><summary>Functional</summary><ul className="reqs">{r.functional.map(x => <li key={x}>{x}</li>)}</ul></details>}
              {r.nonFunctional.length > 0 && <details open><summary>Non-functional</summary><ul className="reqs">{r.nonFunctional.map(x => <li key={x}>{x}</li>)}</ul></details>}
              {r.scale.length > 0 && <details open><summary>Scale</summary>
                <table className="kv"><tbody>{r.scale.map(s => <tr key={s.label}><th>{s.label}</th><td>{s.value}</td></tr>)}</tbody></table></details>}
            </Section>
            <Section id="p-palette" title="Components" count={attempt.nodes.length}>
              <p className="muted small">Click or drag onto the canvas. Each lands in its tier band.</p>
              {kindsByTier.map(({ t, kinds }) => (
                <div key={t} className="palette-group">
                  <span className="palette-tier">{TIER_INFO[t].title}</span>
                  <div className="palette">
                    {kinds.map(([k, v]) => (
                      <button key={k} className="chip" draggable onClick={() => add(k)} title={`Add ${v.label} (click or drag onto the canvas)`}
                        onDragStart={e => { e.dataTransfer.setData('application/x-kind', k); e.dataTransfer.effectAllowed = 'copy' }}>{v.icon} {v.label}</button>
                    ))}
                  </div>
                </div>
              ))}
            </Section>
            <Section id="p-actions" title="Answer">
              <label className="check-row"><input type="checkbox" checked={reasoningOn} onChange={e => setReasoningOn(e.target.checked)} /> Written reasoning</label>
              <div className="row wrap">
                <button onClick={() => onViewJson(attempt)}>View JSON</button>
                <button onClick={() => onExport(attempt)}>Export</button>
                <button onClick={reset}>Reset</button>
              </div>
            </Section>
          </div>
        </aside>
      )}

      <main className="stage">
        <Toolbar>
          <Seg label="View" value={view} onChange={setView}
            options={[{ key: 'canvas', label: 'Architecture' }, { key: 'timeline', label: 'Timeline', disabled: !flow?.steps.length }]} />
          <Seg label="Whose design" value={showRef ? 'ref' : 'mine'}
            onChange={k => { if (k === 'ref') { setShowRef(true); stopRecording(); stopConnecting(); setPicked(null) } else setShowRef(false); setSelected(null) }}
            options={[{ key: 'mine', label: 'Mine' }, { key: 'ref', label: 'Reference' }]} />
          {view === 'canvas' && <>
            <ToolbarSep />
            <Toggle on={network && !!shown.network} disabled={!shown.network} onClick={() => setNetwork(v => !v)} title="Show VPC and subnets">Network</Toggle>
          </>}
          <ToolbarSpacer />
          {!showRef && <>
            {saved !== 'idle' && <span className={`save-state ${saved}`}>{saved === 'saved' ? 'Saved' : 'Not saved: browser storage is blocked'}</span>}
            <button className="tb-btn" title="Undo (⌘Z / Ctrl+Z)" disabled={!hist.past.length} onClick={() => setHist(undo)}>Undo</button>
            <button className="tb-btn" title="Redo (⇧⌘Z / Ctrl+Y)" disabled={!hist.future.length} onClick={() => setHist(redo)}>Redo</button>
            <Toggle on={connecting} title="Connect mode (C): click a caller, then what it calls"
              onClick={() => (connecting ? stopConnecting() : startConnecting())}>Connect</Toggle>
          </>}
        </Toolbar>
        {connecting && !showRef && (
          <div className="rec-banner conn">
            <span className="rec-dot" />
            <span>Connect: {connFrom ? <>click what <b>{attempt.nodes.find(n => n.id === connFrom)?.label}</b> calls (keeps chaining)</> : 'click the caller'}</span>
            <button onClick={stopConnecting}>Done</button>
          </div>
        )}
        {recording && !showRef && flow && (
          <div className="rec-banner">
            <span className="rec-dot" />
            <span>Recording “{flow.title}”: {recFrom ? 'click the next component the request reaches (click the same one again for a step inside it)' : 'click the component where the request starts'}</span>
            <button onClick={stopRecording}>Done</button>
          </div>
        )}
        <div className={`stage-body${dropping ? ' dropping' : ''}`}
          onDragOver={e => { if (!showRef && e.dataTransfer.types.includes('application/x-kind')) { e.preventDefault(); setDropping(true) } }}
          onDragLeave={() => setDropping(false)}
          onDrop={e => { setDropping(false); const k = e.dataTransfer.getData('application/x-kind'); if (k) { e.preventDefault(); add(k) } }}>
          {view === 'timeline' && flow?.steps.length
            ? <Timeline design={shown} flow={flow} player={player} cloud={cloud} onSelect={onNode} />
            : <ReactFlowProvider>
                <BandCanvas design={shown} flow={flow?.steps.length ? flow : undefined} player={player} cloud={cloud} network={network}
                  zonesView={false} zone={NO_ZONES} insets={insets} selected={selected} onSelect={onNode} colorMode={colorMode}
                  edit={showRef ? undefined : {
                    onConnect: (a, b) => setAttempt(connect(attempt, a, b)),
                    onEdgeClick: (from, to) => { if (recording || connecting) return; setPicked({ from, to }); setSelected(null); setTab('build') },
                    pickedEdge: picked ? edgeId(picked) : null, flagged, marks, recordingFrom: recording ? recFrom : connecting ? connFrom : null,
                    mode: recording ? 'record' : connecting ? 'connect' : null,
                  }} />
              </ReactFlowProvider>}
          {!showRef && attempt.nodes.length === 0 && (
            <div className="empty-hint">
              <b>Design: {ref.meta.title}</b>
              <span>Add components from the palette on the left. Drag from one component's edge to another to connect them, then record a request flow.</span>
            </div>
          )}
          {showRef && <div className="ref-badge">Reference design</div>}
        </div>
        <PlayerBar flows={shown.flows.filter(f => f.steps.length)} flow={flow?.steps.length ? flow : undefined} onFlow={setFlowId} player={player} />
      </main>

      {rightOpen && (
        <aside className="right">
          {showRef
            ? <Inspector design={ref} flow={flow} player={player} cloud={cloud} network={network && !!ref.network} zone={NO_ZONES}
                selected={selected} tab={refTab} onTab={setRefTab} onFlow={setFlowId} />
            : <PracticeInspector attempt={attempt} setAttempt={setAttempt} cloud={cloud} tab={tab} onTab={setTab}
                selected={selected} onSelect={setSelected} picked={picked} onPick={setPicked}
                flow={flow} onFlow={id => { setFlowId(id); stopRecording() }} player={player}
                recording={recording} onRecord={() => { stopConnecting(); setRecording(true); setRecFrom(null); setSelected(null); setPicked(null) }} onStopRecording={stopRecording}
                result={result} reasoningOn={reasoningOn} onCompare={() => setShowRef(true)}
                reference={ref} review={review} onReview={setReview} />}
        </aside>
      )}
    </>
  )
}
