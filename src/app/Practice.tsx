// Practice mode: build your own answer to a library or imported problem on the same tier-band canvas, record request flows
// by clicking components, then check it against the reference design.
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { ReactFlowProvider } from '@xyflow/react'
import { edgeId, TIERS, type Design } from '../model/schema'
import { KINDS, TIER_INFO, type Cloud } from '../model/kinds'
import { addNode, appendStep, blankAttempt, connect, removeEdge, removeNode } from '../practice/attempt'
import { runChecks } from '../practice/checks'
import { compareDesigns } from '../practice/compare'
import { BandCanvas, type EditProps, type ZoneState } from './BandCanvas'
import { ExportImageButton, Seg, Toggle, Toolbar, ToolbarLabel, ToolbarSep, ToolbarSpacer } from './CanvasToolbar'
import { Timeline } from './Timeline'
import { PlayerBar } from './PlayerBar'
import { Inspector, type InspectorTab } from './Inspector'
import { PracticeInspector, type PracticeTab } from './PracticeInspector'
import { AiSettingsButton, NumbersHint, Section } from './Sidebar'
import { Numbers } from './Numbers'
import { panelInsets, useBars, store, storeKv, useNow, usePlayer, useViewportWidth } from './hooks'
import { TimerBanner, type TimedControls } from './TimedPanel'
import { EstimateDialog } from './EstimateDialog'
import { QuickAdd, Shortcuts } from './QuickAdd'
import { applySkeleton, duplicateNode, SKELETONS } from '../practice/quick'
import { openDrill, reloadDeck } from './useDeck'
import { end as endTimed, nextPhase, pause as pauseTimed, resume as resumeTimed, startSession, toggleTick, type TimedSession } from '../practice/timed'
import { commit, initHistory, redo, undo } from '../practice/history'
import { addSnapshot, applyBackup, attemptKey, cleanHints, collectBackup, hintsKey, loadSnapshots, newSnapshot, nextName, parseBackup, reviewKey, snapshotsKey, type Snapshot } from '../practice/snapshots'
import { Attempts } from './Attempts'
import { downloadJson } from './files'
import type { StoredReview } from './ReviewPanel'
import { askConfirm } from './confirm'

const NO_ZONES: ZoneState = { failed: null, home: 0, zl: null, hops: null }
/** Side by side needs this much canvas between the floating panels: two panes of about 360px. */
const SIDE_MIN = 720
const NONE = new Set<string>()
const kv = storeKv

export function Practice({ problems, problemId, cloud, colorMode, leftOpen, rightOpen, onExport, onViewJson }: {
  problems: Design[]; problemId: string; cloud: Cloud; colorMode: 'light' | 'dark'
  leftOpen: boolean; rightOpen: boolean; onExport: (d: Design) => void; onViewJson: (d: Design) => void
}) {
  const ref = problems.find(d => d.id === problemId) ?? problems[0]
  const [hist, setHist] = useState(() => initHistory<Design>(store.get(attemptKey(ref.id), blankAttempt(ref))))
  const attempt = hist.present
  const [loadedFor, setLoadedFor] = useState(ref.id)
  const [review, setReviewState] = useState<StoredReview | null>(() => store.get(reviewKey(ref.id), null))
  const [snaps, setSnaps] = useState<Snapshot[]>(() => loadSnapshots(kv, ref.id))
  const [attemptMsg, setAttemptMsg] = useState('')
  // Highest hint level used on this problem (4: opened the reference), so saved attempts can say how much help they had.
  const [hints, setHintsState] = useState(() => cleanHints(store.get(hintsKey(ref.id), 0)))
  const setHints = (n: number) => { setHintsState(n); store.set(hintsKey(ref.id), n) }
  const takeHint = (n: number) => { if (n > hints) setHints(n) }
  const reload = (id: string) => {
    setHintsState(cleanHints(store.get(hintsKey(id), 0)))
    setHist(initHistory<Design>(store.get(attemptKey(id), blankAttempt(problems.find(d => d.id === id) ?? ref))))
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

  const [whose, setWhose] = useState<'mine' | 'ref' | 'side'>('mine')
  const showRef = whose === 'ref', side = whose === 'side'
  /** Back to the learner's own canvas from the reference; side by side stays, since its left canvas is the answer. */
  const leaveRef = () => setWhose(w => (w === 'ref' ? 'mine' : w))
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

  // Timed interview: kept per problem so a reload does not lose the clock.
  const timedKey = `archstory.timed.${ref.id}`
  const [session, setSession] = useState<TimedSession | null>(() => store.get(timedKey, null))
  const [savedAs, setSavedAs] = useState<string | null>(null)
  const [estimating, setEstimating] = useState(false)
  const [quickAdd, setQuickAdd] = useState(false)
  const [showKeys, setShowKeys] = useState(false)
  const clipboard = useRef<string | null>(null)
  const running = !!session && session.endedAt === null && !session.pausedAt
  const now = useNow(running)
  const putSession = (next: TimedSession | null) => { setSession(next); store.set(timedKey, next) }

  const viewport = useViewportWidth()
  const [phoneNote, setPhoneNote] = useState(() => !store.get('archstory.phoneNote', false))
  const bar = useBars(viewport)
  const insets = { ...panelInsets(viewport, leftOpen, rightOpen), top: bar.bars }
  const sideFits = viewport > 900 && viewport - insets.left - insets.right >= SIDE_MIN
  if (side && !sideFits) setWhose('mine')
  const shown = showRef ? ref : attempt
  const flow = shown.flows.find(f => f.id === flowId) ?? shown.flows[0]
  const player = usePlayer(flow?.steps.length ?? 0, `${shown.id}/${flow?.id}`)
  const idle = usePlayer(0, 'reference')   // the reference pane in side by side does not play
  const result = useMemo(() => runChecks(attempt, ref), [attempt, ref])
  const gaps = useMemo(() => (side ? compareDesigns(attempt, ref) : null), [side, attempt, ref])
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
  const startConnecting = () => { stopRecording(); setConnecting(true); setConnFrom(null); setSelected(null); setPicked(null); leaveRef() }
  const reset = async () => {
    if (!await askConfirm({ title: `Clear your answer for "${ref.meta.title}"?`, body: 'This cannot be undone.', confirm: 'Clear answer', danger: true })) return
    setAttempt(blankAttempt(ref)); setReview(null); setHints(0); setSelected(null); setPicked(null); stopRecording(); setFlowId('')
  }
  const saveAttempt = (name: string) => {
    const next = addSnapshot(snaps, newSnapshot(snaps, attempt, result, review, name, new Date(), hints))
    setSnaps(next)
    setAttemptMsg(store.set(snapshotsKey(ref.id), next) ? 'Attempt saved.' : 'Could not save: browser storage is blocked or full. Use Back up to keep a copy.')
  }
  const openAttempt = (s: Snapshot) => {
    setAttempt(s.design); setReview(s.review); setSelected(null); setPicked(null); stopRecording(); setFlowId(''); leaveRef()
    setAttemptMsg(`Opened "${s.name}". Undo brings your previous answer back.`)
  }
  const deleteAttempt = async (s: Snapshot) => {
    if (!await askConfirm({ title: `Delete "${s.name}"?`, body: 'This cannot be undone.', confirm: 'Delete attempt', danger: true })) return
    const next = snaps.filter(x => x.id !== s.id)
    setSnaps(next); store.set(snapshotsKey(ref.id), next); setAttemptMsg('Attempt deleted.')
  }
  const backUp = () => {
    const b = collectBackup(problems.map(d => d.id), kv, new Date())
    const n = Object.keys(b.attempts).length
    if (!n && !Object.keys(b.snapshots).length) return setAttemptMsg('Nothing to back up yet.')
    downloadJson(`archstory-practice-${new Date().toISOString().slice(0, 10)}.json`, b)
    setAttemptMsg(`Backed up ${n} answer${n === 1 ? '' : 's'} and ${Object.values(b.snapshots).reduce((a, l) => a + l.length, 0)} saved attempts.`)
  }
  const restore = async (file: File) => {
    let json: unknown
    try { json = JSON.parse(await file.text()) } catch { return setAttemptMsg('That file is not valid JSON.') }
    const r = parseBackup(json, problems.map(d => d.id))
    if (!r.ok) return setAttemptMsg(r.errors.join(' '))
    const n = Object.keys(r.backup.attempts).length
    if (!await askConfirm({ title: `Restore ${n} answer${n === 1 ? '' : 's'}?`, body: 'Any different answer you have now is kept as a "Before restore" attempt.', confirm: 'Restore' })) return
    const byId = Object.fromEntries(problems.map(d => [d.id, d]))
    const done = applyBackup(r.backup, kv, new Date(), (id, d) => { const c = runChecks(d, byId[id]); return { passed: c.passed, total: c.total } })
    reload(ref.id); reloadDeck(); setSelected(null); setPicked(null); stopRecording(); setFlowId('')
    setAttemptMsg(`Restored ${done.attempts} answer${done.attempts === 1 ? '' : 's'} and ${done.snapshots} new saved attempts${done.kept ? `; ${done.kept} current answer${done.kept === 1 ? ' was' : 's were'} kept as "Before restore"` : ''}.${r.skipped.length ? ` Skipped ${r.skipped.length}: ${r.skipped.join('; ')}.` : ''}`)
  }
  /** Ending a timed interview keeps a copy of the answer, so the attempt list shows how each timed run went. */
  const finishTimed = (done: TimedSession) => {
    putSession(done)
    const name = `Timed interview, ${done.total} min`
    if (attempt.nodes.length) { saveAttempt(name); setSavedAs(name) } else setSavedAs(null)
    setTab('interview')
  }
  const timed: TimedControls = {
    session, now, savedAs,
    start: minutes => { setReasoningOn(true); setSavedAs(null); putSession(startSession(minutes, Date.now())); setTab('interview') },
    pause: () => session && putSession(pauseTimed(session, Date.now())),
    resume: () => session && putSession(resumeTimed(session, Date.now())),
    next: () => { if (!session) return; const s = nextPhase(resumeTimed(session, Date.now()), Date.now()); if (s.endedAt !== null) finishTimed(s); else putSession(s) },
    end: () => session && finishTimed(endTimed(session, Date.now())),
    reset: () => { putSession(null); setSavedAs(null) },
    tick: key => session && putSession(toggleTick(session, key)),
    calculator: () => setEstimating(true),
    drill: () => openDrill(ref.id),
    notes: section => {
      setReasoningOn(true); setTab('reasoning')
      requestAnimationFrame(() => document.querySelector<HTMLTextAreaElement>(`#reasoning-${section} textarea`)?.focus())
    },
  }

  /** Add from the quick-add box: connected from the selected component when there is one. */
  const quickPick = (kind: string) => {
    const r = addNode(attempt, kind)
    const from = selected && attempt.nodes.some(n => n.id === selected) ? selected : null
    setAttempt(from ? connect(r.design, from, r.id) : r.design); setSelected(r.id); setPicked(null); setTab('build'); leaveRef()
  }
  const duplicate = (id: string | null) => {
    const r = id ? duplicateNode(attempt, id) : null
    if (r) { setAttempt(r.design); setSelected(r.id); setPicked(null); setTab('build') }
  }

  const add = (kind: string) => {
    const r = addNode(attempt, kind)
    setAttempt(r.design); setSelected(r.id); setPicked(null); setTab('build'); leaveRef()
  }
  const onNode = (id: string | null) => {
    if (showRef) { setSelected(id); if (id) setRefTab(t => (t === 'monitoring' || t === 'questions' ? t : 'component')); return }
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
      if (mod && e.key.toLowerCase() === 'd') { e.preventDefault(); duplicate(selected); return }
      if (mod && e.key.toLowerCase() === 'c' && selected) { clipboard.current = selected; return }
      if (mod && e.key.toLowerCase() === 'v' && clipboard.current) { e.preventDefault(); duplicate(clipboard.current); return }
      if (e.key === '/' && !mod) { e.preventDefault(); stopRecording(); stopConnecting(); setQuickAdd(true); return }
      if (e.key === '?') { setShowKeys(true); return }
      if (e.key === 'Escape') { stopRecording(); stopConnecting() }
      if (e.key === 'c' && !mod) { if (connecting) stopConnecting(); else startConnecting() }
      if (e.key !== 'Delete' && e.key !== 'Backspace') return
      if (picked) { setAttempt(removeEdge(attempt, picked.from, picked.to)); setPicked(null) }
      else if (selected) { setAttempt(removeNode(attempt, selected)); setSelected(null) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const edit: EditProps | undefined = showRef ? undefined : {
    onConnect: (a, b) => setAttempt(connect(attempt, a, b)),
    onEdgeClick: (from, to) => { if (recording || connecting) return; setPicked({ from, to }); setSelected(null); setTab('build') },
    // side by side shows only the comparison outlines
    pickedEdge: picked ? edgeId(picked) : null, flagged: side ? NONE : flagged, marks: side ? undefined : marks, recordingFrom: recording ? recFrom : connecting ? connFrom : null,
    mode: recording ? 'record' : connecting ? 'connect' : null,
  }
  const timerTop = !showRef && session && session.endedAt === null ? 56 : undefined   // room for the timer banner
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
              <NumbersHint />
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
          <div className="panel-foot side-actions"><AiSettingsButton /></div>
        </aside>
      )}

      <ReactFlowProvider>
      <main className="stage" style={{ '--bars': `${bar.bars}px` } as CSSProperties}>
        <Toolbar barRef={bar.ref}>
          <Seg label="View" value={view} onChange={setView}
            options={[{ key: 'canvas', label: 'Architecture' }, { key: 'timeline', label: 'Timeline', disabled: !flow?.steps.length }]} />
          <Seg label="Whose design" value={whose}
            onChange={k => { if (k !== 'mine') takeHint(4); if (k === 'ref') { stopRecording(); stopConnecting(); setPicked(null) } setWhose(k); setSelected(null) }}
            options={[{ key: 'mine', label: 'Mine' }, { key: 'ref', label: 'Reference' },
              { key: 'side', label: 'Side by side', disabled: !sideFits, title: sideFits ? 'Your answer and the reference next to each other' : 'Side by side needs a wider window, or a side panel closed' }]} />
          {view === 'canvas' && <>
            <ToolbarSep />
            <ToolbarLabel>Layers</ToolbarLabel>
            <Toggle on={network && !!shown.network} disabled={!shown.network} onClick={() => setNetwork(v => !v)} title="Show VPC and subnets">Network</Toggle>
            {showRef && ref.observability && (
              <Toggle on={monitoring} onClick={() => { setMonitoring(v => !v); if (!monitoring) setRefTab('monitoring') }} title="Show the reference's SLOs, alerts and telemetry">Monitoring</Toggle>
            )}
          </>}
          <ToolbarSpacer />
          <ExportImageButton title={shown.meta.title} disabled={view !== 'canvas' || !shown.nodes.length} />
          {!showRef && <>
            {saved !== 'idle' && <span className={`save-state ${saved}`} role="status" aria-label={saved === 'saved' ? 'Saved' : undefined} title={saved === 'saved' ? 'Your answer is saved in this browser' : undefined}>{saved === 'saved' ? <span className="tb-txt">Saved</span> : 'Not saved: browser storage is blocked'}</span>}
            <button className="tb-btn" title="Undo (⌘Z / Ctrl+Z)" aria-label="Undo" disabled={!hist.past.length} onClick={() => setHist(undo)}><span aria-hidden>↶</span><span className="tb-txt"> Undo</span></button>
            <button className="tb-btn" title="Redo (⇧⌘Z / Ctrl+Y)" aria-label="Redo" disabled={!hist.future.length} onClick={() => setHist(redo)}><span aria-hidden>↷</span><span className="tb-txt"> Redo</span></button>
            <button className="tb-btn" title="Add a component by typing (/)" aria-label="Add a component" onClick={() => { stopRecording(); stopConnecting(); setQuickAdd(true) }}><span aria-hidden>+</span><span className="tb-txt"> Add</span></button>
            <Toggle on={connecting} title="Connect mode (C): click a caller, then what it calls"
              onClick={() => (connecting ? stopConnecting() : startConnecting())}>Connect</Toggle>
          </>}
        </Toolbar>
        {phoneNote && viewport <= 600 && (
          <div className="phone-note">
            <span>Drawing works best on a larger screen. On a phone, Explore and the daily drill work well.</span>
            <button className="icon ghost" aria-label="Dismiss" onClick={() => { setPhoneNote(false); store.set('archstory.phoneNote', true) }}>×</button>
          </div>
        )}
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
          <Numbers design={ref} cloud={cloud} onCalculator={() => setEstimating(true)} />
          {view === 'timeline' && flow?.steps.length
            ? <Timeline design={shown} flow={flow} player={player} cloud={cloud} onSelect={onNode} />
            : gaps
              // Two canvases: the answer keeps the outer provider (so Export image saves it), the reference gets its own.
              ? <div className="side-by-side">
                  <div className="side-panes">
                    <section className="side-pane" aria-label="Your answer">
                      <span className="side-label">Your answer</span>
                      <BandCanvas design={attempt} flow={flow?.steps.length ? flow : undefined} player={player} cloud={cloud} network={network}
                        zonesView={false} zone={NO_ZONES} insets={{ left: 12, right: 12, top: timerTop ?? 28 }} captionDetail={!rightOpen} selected={selected} onSelect={onNode} colorMode={colorMode}
                        edit={edit} gaps={{ ids: gaps.extra, gap: 'extra' }} />
                    </section>
                    <section className="side-pane ref" aria-label="Reference">
                      <span className="side-label">Reference</span>
                      <ReactFlowProvider>
                        <BandCanvas id="reference" design={ref} flow={undefined} player={idle} cloud={cloud} network={network}
                          zonesView={false} zone={NO_ZONES} insets={{ left: 12, right: 12, top: timerTop ?? 28 }} selected={null} onSelect={() => {}} colorMode={colorMode}
                          gaps={{ ids: gaps.missing, gap: 'missing' }} />
                      </ReactFlowProvider>
                    </section>
                  </div>
                  <p className="side-legend">Outlined on the reference: kinds of component your answer does not have yet. Outlined on yours: extras the reference does without.</p>
                </div>
              : <BandCanvas design={shown} flow={flow?.steps.length ? flow : undefined} player={player} cloud={cloud} network={network}
                  monitoring={showRef && monitoring} zonesView={false} zone={NO_ZONES} insets={{ ...insets, top: insets.top + (timerTop ?? 0) }} captionDetail={!rightOpen || viewport <= 900} selected={selected} onSelect={onNode} colorMode={colorMode}
                  edit={edit} />}
          {!showRef && !side && attempt.nodes.length === 0 && (
            <div className="empty-hint">
              <b>Design: {ref.meta.title}</b>
              <span>Add components from the palette, or press <kbd>/</kbd> and type. Drag from one component's edge to another to connect them, then record a request flow.</span>
              <div className="skeletons">
                <span className="muted small">Or start from a common shape and change it:</span>
                {SKELETONS.map(k => <button key={k.id} onClick={() => { setAttempt(applySkeleton(attempt, k)); setSelected(null) }}><b>{k.title}</b><span>{k.blurb}</span></button>)}
              </div>
            </div>
          )}
          {showRef && <div className="ref-badge">Reference design</div>}
          {!showRef && <TimerBanner t={timed} onOpen={() => setTab('interview')} />}
        </div>
        <PlayerBar flows={shown.flows.filter(f => f.steps.length)} flow={flow?.steps.length ? flow : undefined} onFlow={setFlowId} player={player} picker />
      </main>
      </ReactFlowProvider>

      {quickAdd && <QuickAdd connectFrom={selected ? attempt.nodes.find(n => n.id === selected)?.label ?? null : null} onPick={quickPick} onClose={() => setQuickAdd(false)} />}
      {showKeys && <Shortcuts onClose={() => setShowKeys(false)} />}
      {estimating && <EstimateDialog problem={ref} cloud={cloud} onClose={() => setEstimating(false)}
        onAddToNotes={text => {
          const cur = attempt.reasoning?.estimates?.trim()
          setAttempt({ ...attempt, reasoning: { ...attempt.reasoning, estimates: cur ? `${cur}\n\n${text}` : text } })
          setReasoningOn(true)
        }} />}

      {rightOpen && (
        <aside className="right">
          {showRef
            ? <Inspector design={ref} flow={flow} player={player} cloud={cloud} network={network && !!ref.network} monitoring={monitoring} zone={NO_ZONES}
                selected={selected} tab={refTab} onTab={setRefTab} onFlow={setFlowId} onSelect={id => setSelected(id)} />
            : <PracticeInspector attempt={attempt} setAttempt={setAttempt} cloud={cloud} tab={tab} onTab={setTab}
                selected={selected} onSelect={setSelected} picked={picked} onPick={setPicked}
                flow={flow} onFlow={id => { setFlowId(id); stopRecording() }} player={player}
                recording={recording} onRecord={() => { stopConnecting(); setRecording(true); setRecFrom(null); setSelected(null); setPicked(null) }} onStopRecording={stopRecording}
                result={result} reasoningOn={reasoningOn} onCompare={() => { setWhose(sideFits ? 'side' : 'ref'); takeHint(4) }}
                hints={hints} onHint={takeHint}
                reference={ref} review={review} onReview={setReview} timed={timed} />}
        </aside>
      )}
    </>
  )
}
