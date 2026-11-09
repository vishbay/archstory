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
import { Seg, Toggle, Toolbar, ToolbarLabel, ToolbarSep, ToolbarSpacer } from './CanvasToolbar'
import { Timeline } from './Timeline'
import { PlayerBar } from './PlayerBar'
import { Inspector, type InspectorTab } from './Inspector'
import { PracticeInspector, type PracticeTab } from './PracticeInspector'
import { Section } from './Sidebar'
import { panelInsets, store, storeKv, usePlayer, useViewportWidth } from './hooks'
import { commit, initHistory, redo, undo } from '../practice/history'
import { addSnapshot, applyBackup, attemptKey, collectBackup, loadSnapshots, newSnapshot, nextName, parseBackup, reviewKey, snapshotsKey, type Snapshot } from '../practice/snapshots'
import { Attempts } from './Attempts'
import { downloadJson } from './files'
import type { StoredReview } from './ReviewPanel'

const NO_ZONES: ZoneState = { failed: null, home: 0, zl: null, hops: null }
const kv = storeKv

export function Practice({ problemId, cloud, colorMode, leftOpen, rightOpen, onExport, onViewJson }: {
  problemId: string; cloud: Cloud; colorMode: 'light' | 'dark'
  leftOpen: boolean; rightOpen: boolean; onExport: (d: Design) => void; onViewJson: (d: Design) => void
}) {
  const ref = LIBRARY.find(d => d.id === problemId) ?? LIBRARY[0]
  const [hist, setHist] = useState(() => initHistory<Design>(store.get(attemptKey(ref.id), blankAttempt(ref))))
  const attempt = hist.present
  const [loadedFor, setLoadedFor] = useState(ref.id)
  const [review, setReviewState] = useState<StoredReview | null>(() => store.get(reviewKey(ref.id), null))
  const [snaps, setSnaps] = useState<Snapshot[]>(() => loadSnapshots(kv, ref.id))
  const [attemptMsg, setAttemptMsg] = useState('')
  const reload = (id: string) => {
    setHist(initHistory<Design>(store.get(attemptKey(id), blankAttempt(LIBRARY.find(d => d.id === id) ?? ref))))
    setReviewState(store.get(reviewKey(id), null))
    setSnaps(loadSnapshots(kv, id)); setAttemptMsg('')
  }
  if (loadedFor !== ref.id) { setLoadedFor(ref.id); reload(ref.id) }
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
  const setReview = (r: StoredReview | null) => { setReviewState(r); store.set(reviewKey(ref.id), r) }

  const [showRef, setShowRef] = useState(false)
  const [view, setView] = useState<'canvas' | 'timeline'>('canvas')
  const [network, setNetwork] = useState(false)
  const [monitoring, setMonitoring] = useState(false)
  const [selected, setSelected] = useState<string | null>(null)
  const [picked, setPicked] = useState<{ from: string; to: string } | null>(null)
  const [flowId, setFlowId] = useState('')
  const [recording, setRecording] = useState(false)
  const [recFrom, setRecFrom] = useState<string | null>(null)
  const [tab, setTab] = useState<PracticeTab>('build')
  const [refTab, setRefTab] = useState<InspectorTab>('step')
  const [reasoningOn, setReasoningOn] = useState(() => store.get('archstory.reasoning', false))
  useEffect(() => { store.set('archstory.reasoning', reasoningOn) }, [reasoningOn])

  const viewport = useViewportWidth()
  const insets = panelInsets(viewport, leftOpen, rightOpen)
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
  const saveAttempt = (name: string) => {
    const next = addSnapshot(snaps, newSnapshot(snaps, attempt, result, review, name, new Date()))
    setSnaps(next)
    setAttemptMsg(store.set(snapshotsKey(ref.id), next) ? 'Attempt saved.' : 'Could not save: browser storage is blocked or full. Use Back up to keep a copy.')
  }
  const openAttempt = (s: Snapshot) => {
    setAttempt(s.design); setReview(s.review); setSelected(null); setPicked(null); stopRecording(); setFlowId(''); setShowRef(false)
    setAttemptMsg(`Opened "${s.name}". Undo brings your previous answer back.`)
  }
  const deleteAttempt = (s: Snapshot) => {
    if (!confirm(`Delete "${s.name}"? This cannot be undone.`)) return
    const next = snaps.filter(x => x.id !== s.id)
    setSnaps(next); store.set(snapshotsKey(ref.id), next); setAttemptMsg('Attempt deleted.')
  }
  const backUp = () => {
    const b = collectBackup(LIBRARY.map(d => d.id), kv, new Date())
    const n = Object.keys(b.attempts).length
    if (!n && !Object.keys(b.snapshots).length) return setAttemptMsg('Nothing to back up yet.')
    downloadJson(`archstory-practice-${new Date().toISOString().slice(0, 10)}.json`, b)
    setAttemptMsg(`Backed up ${n} answer${n === 1 ? '' : 's'} and ${Object.values(b.snapshots).reduce((a, l) => a + l.length, 0)} saved attempts.`)
  }
  const restore = async (file: File) => {
    let json: unknown
    try { json = JSON.parse(await file.text()) } catch { return setAttemptMsg('That file is not valid JSON.') }
    const r = parseBackup(json, LIBRARY.map(d => d.id))
    if (!r.ok) return setAttemptMsg(r.errors.join(' '))
    const n = Object.keys(r.backup.attempts).length
    if (!confirm(`Restore ${n} answer${n === 1 ? '' : 's'}? Any different answer you have now is kept as a "Before restore" attempt.`)) return
    const byId = Object.fromEntries(LIBRARY.map(d => [d.id, d]))
    const done = applyBackup(r.backup, kv, new Date(), (id, d) => { const c = runChecks(d, byId[id]); return { passed: c.passed, total: c.total } })
    reload(ref.id); setSelected(null); setPicked(null); stopRecording(); setFlowId('')
    setAttemptMsg(`Restored ${done.attempts} answer${done.attempts === 1 ? '' : 's'} and ${done.snapshots} new saved attempts${done.kept ? `; ${done.kept} current answer${done.kept === 1 ? ' was' : 's were'} kept as "Before restore"` : ''}.${r.skipped.length ? ` Skipped ${r.skipped.length}: ${r.skipped.join('; ')}.` : ''}`)
  }
  const add = (kind: string) => {
    const r = addNode(attempt, kind)
    setAttempt(r.design); setSelected(r.id); setPicked(null); setTab('build'); setShowRef(false)
  }
  const onNode = (id: string | null) => {
    if (showRef) { setSelected(id); if (id) setRefTab(t => (t === 'monitoring' ? t : 'component')); return }
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
            <Section id="p-requirements" title="Requirements">
              {ref.meta.summary && <p className="small">{ref.meta.summary}</p>}
              {r.functional.length > 0 && <details open><summary>Functional</summary><ul className="reqs">{r.functional.map(x => <li key={x}>{x}</li>)}</ul></details>}
              {r.nonFunctional.length > 0 && <details open><summary>Non-functional</summary><ul className="reqs">{r.nonFunctional.map(x => <li key={x}>{x}</li>)}</ul></details>}
              {r.scale.length > 0 && <details open><summary>Scale</summary>
                <table className="kv"><tbody>{r.scale.map(s => <tr key={s.label}><th>{s.label}</th><td>{s.value}</td></tr>)}</tbody></table></details>}
            </Section>
            <Section id="p-attempts" title="Attempts" count={snaps.length}>
              <Attempts snaps={snaps} canSave={attempt.nodes.length > 0} suggested={nextName(snaps)} message={attemptMsg}
                onSave={saveAttempt} onOpen={openAttempt} onDelete={deleteAttempt} onBackup={backUp} onRestore={restore} />
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
            <ToolbarLabel>Layers</ToolbarLabel>
            <Toggle on={network && !!shown.network} disabled={!shown.network} onClick={() => setNetwork(v => !v)} title="Show VPC and subnets">Network</Toggle>
            {showRef && ref.observability && (
              <Toggle on={monitoring} onClick={() => { setMonitoring(v => !v); if (!monitoring) setRefTab('monitoring') }} title="Show the reference's SLOs, alerts and telemetry">Monitoring</Toggle>
            )}
          </>}
          <ToolbarSpacer />
          {!showRef && <>
            {saved !== 'idle' && <span className={`save-state ${saved}`} role="status" aria-label={saved === 'saved' ? 'Saved' : undefined} title={saved === 'saved' ? 'Your answer is saved in this browser' : undefined}>{saved === 'saved' ? <span className="tb-txt">Saved</span> : 'Not saved: browser storage is blocked'}</span>}
            <button className="tb-btn" title="Undo (⌘Z / Ctrl+Z)" aria-label="Undo" disabled={!hist.past.length} onClick={() => setHist(undo)}><span aria-hidden>↶</span><span className="tb-txt"> Undo</span></button>
            <button className="tb-btn" title="Redo (⇧⌘Z / Ctrl+Y)" aria-label="Redo" disabled={!hist.future.length} onClick={() => setHist(redo)}><span aria-hidden>↷</span><span className="tb-txt"> Redo</span></button>
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
                  monitoring={showRef && monitoring} zonesView={false} zone={NO_ZONES} insets={insets} captionDetail={!rightOpen || viewport <= 900} selected={selected} onSelect={onNode} colorMode={colorMode}
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
        <PlayerBar flows={shown.flows.filter(f => f.steps.length)} flow={flow?.steps.length ? flow : undefined} onFlow={setFlowId} player={player} picker />
      </main>

      {rightOpen && (
        <aside className="right">
          {showRef
            ? <Inspector design={ref} flow={flow} player={player} cloud={cloud} network={network && !!ref.network} monitoring={monitoring} zone={NO_ZONES}
                selected={selected} tab={refTab} onTab={setRefTab} onFlow={setFlowId} onSelect={id => setSelected(id)} />
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
