import { useEffect, useMemo, useState } from 'react'
import { ReactFlowProvider } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import './app.css'
import { LIBRARY } from '../library'
import { parseDesign, type Design } from '../model/schema'
import type { Cloud } from '../model/kinds'
import { COMPACT_BELOW, panelInsets, store, usePlayer, useTheme, useViewportWidth } from './hooks'
import { BandCanvas, type ZoneState } from './BandCanvas'
import { AvailabilityMenu, Seg, Toggle, Toolbar, ToolbarLabel, ToolbarSep } from './CanvasToolbar'
import { layoutZones, resolveFlow } from '../layout/zones'
import { Timeline } from './Timeline'
import { PlayerBar } from './PlayerBar'
import { Inspector, type InspectorTab } from './Inspector'
import { Sidebar } from './Sidebar'
import { ImportDialog } from './ImportDialog'
import { GenerateDialog } from './GenerateDialog'
import { JsonDialog } from './JsonDialog'
import { DesignPicker } from './DesignPicker'
import { copyText, readSharedDesign, shareUrl } from './share'
import { Practice } from './Practice'
import { Home } from './Home'
import { Tour } from './Tour'
import { EXPLORE_TOUR, PRACTICE_TOUR } from './tourSteps'

type View = 'canvas' | 'timeline'
const MINE_KEY = 'archstory.myDesigns'

const loadMine = (): Design[] =>
  store.get<unknown[]>(MINE_KEY, []).flatMap(raw => { const r = parseDesign(raw); return r.ok ? [r.design] : [] })

const params = new URLSearchParams(location.search)

// A design opened from a share link: shown but not saved until the viewer chooses to.
const sharedAtLoad = (() => {
  const r = readSharedDesign()
  if (!r) return { design: null, error: null }
  if (!r.ok) return { design: null, error: `Could not open the shared design: ${r.errors[0]}` }
  const d = r.design
  return { design: LIBRARY.some(x => x.id === d.id) ? { ...d, id: `${d.id}-shared` } : d, error: null }
})()

export function App() {
  const theme = useTheme()
  const [mine, setMine] = useState(loadMine)
  const [shared, setShared] = useState<Design | null>(sharedAtLoad.design)
  const all = [...LIBRARY, ...(shared ? [shared] : []), ...mine]
  const [designId, setDesignId] = useState(() => sharedAtLoad.design?.id ?? params.get('d') ?? LIBRARY[0].id)
  const [toast, setToast] = useState<string | null>(sharedAtLoad.error)
  // A bare URL opens the home page; links with a design, a practice problem or a shared design open that directly.
  const [mode, setMode] = useState<'home' | 'explore' | 'practice'>(() =>
    sharedAtLoad.design ? 'explore' : params.get('mode') === 'practice' ? 'practice' : params.get('d') ? 'explore' : 'home')
  const [tour, setTour] = useState<'explore' | 'practice' | null>(null)
  useEffect(() => {
    if (mode === 'home' || store.get(`archstory.tour.${mode}`, false)) return
    const t = setTimeout(() => setTour(mode), 700)   // let the canvas lay out before measuring targets
    return () => clearTimeout(t)
  }, [mode])
  const endTour = () => { if (tour) store.set(`archstory.tour.${tour}`, true); setTour(null) }
  const [problemId, setProblemId] = useState(() => params.get('p') ?? 'url-shortener')
  const [generating, setGenerating] = useState(false)
  const [picking, setPicking] = useState(false)
  const [jsonOf, setJsonOf] = useState<Design | null>(null)
  const design = all.find(d => d.id === designId) ?? LIBRARY[0]
  const [flowId, setFlowId] = useState(() => params.get('f') ?? '')
  const flow = design.flows.find(f => f.id === flowId) ?? design.flows[0]
  const [view, setView] = useState<View>(() => (params.get('view') === 'timeline' ? 'timeline' : 'canvas'))
  const [network, setNetwork] = useState(() => params.get('net') === '1')
  const [zonesView, setZonesView] = useState(() => params.get('zones') === '1')
  const [monitoring, setMonitoring] = useState(() => params.get('mon') === '1')
  const [failed, setFailed] = useState<number | null>(null)
  const [home, setHome] = useState(1)
  const [cloud, setCloud] = useState<Cloud>(() => store.get('archstory.cloud', 'neutral'))
  const [selected, setSelected] = useState<string | null>(null)
  const [tab, setTab] = useState<InspectorTab>('step')
  // On a compact window the left panel starts closed so the diagram keeps its room; a saved choice always wins.
  const [leftOpen, setLeftOpen] = useState(() => store.get('archstory.left', window.innerWidth > COMPACT_BELOW))
  const [rightOpen, setRightOpen] = useState(() => store.get('archstory.right', true))
  const [importing, setImporting] = useState(false)
  const player = usePlayer(flow?.steps.length ?? 0, `${design.id}/${flow?.id}`)
  const viewport = useViewportWidth()
  const insets = panelInsets(viewport, leftOpen, rightOpen)
  const net = network && !!design.network
  const zoneCount = design.network?.zones ?? 1
  const failedZone = net && failed !== null && failed < zoneCount ? failed : null
  const homeZone = Math.min(home, zoneCount - 1)
  const zl = useMemo(() => (net && zoneCount > 1 ? layoutZones(design, failedZone) : null), [design, net, zoneCount, failedZone])
  const hops = useMemo(() => (zl && flow ? resolveFlow(zl, flow, homeZone, failedZone) : null), [zl, flow, homeZone, failedZone])
  const zone: ZoneState = { failed: failedZone, home: homeZone, zl, hops }

  useEffect(() => {
    const u = new URL(location.href)
    if (mode === 'home') { u.search = ''; u.hash = ''; history.replaceState(null, '', u); return }
    if (mode === 'practice') {
      u.search = ''; u.hash = ''
      u.searchParams.set('mode', 'practice'); u.searchParams.set('p', problemId)
      history.replaceState(null, '', u)
      return
    }
    u.searchParams.delete('mode'); u.searchParams.delete('p')
    u.searchParams.set('d', design.id)
    if (flow) u.searchParams.set('f', flow.id); else u.searchParams.delete('f')
    u.searchParams.set('view', view)
    if (network) u.searchParams.set('net', '1'); else u.searchParams.delete('net')
    if (zonesView) u.searchParams.set('zones', '1'); else u.searchParams.delete('zones')
    if (monitoring) u.searchParams.set('mon', '1'); else u.searchParams.delete('mon')
    if (design.id !== shared?.id) u.hash = ''
    history.replaceState(null, '', u)
  }, [design.id, flow, view, network, zonesView, monitoring, shared, mode, problemId])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k' && mode !== 'practice') { e.preventDefault(); setPicking(true) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [mode])
  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 3500)
    return () => clearTimeout(t)
  }, [toast])
  useEffect(() => { store.set('archstory.cloud', cloud) }, [cloud])
  useEffect(() => { store.set('archstory.left', leftOpen) }, [leftOpen])
  useEffect(() => { store.set('archstory.right', rightOpen) }, [rightOpen])

  const open = (id: string) => { setDesignId(id); setFlowId(''); setSelected(null); setTab('step') }
  const select = (id: string | null) => { setSelected(id); if (id) { setTab(t => (t === 'monitoring' ? t : 'component')); setRightOpen(true) } }
  const saveMine = (list: Design[]) => { setMine(list); store.set(MINE_KEY, list) }
  const importDesign = (d: Design) => {
    const id = LIBRARY.some(x => x.id === d.id) ? `${d.id}-mine` : d.id
    saveMine([...mine.filter(x => x.id !== id), { ...d, id }])
    setImporting(false); open(id); setMode('explore')
  }
  const exportDesign = (d: Design = design) => {
    const url = URL.createObjectURL(new Blob([JSON.stringify(d, null, 2)], { type: 'application/json' }))
    const a = Object.assign(document.createElement('a'), { href: url, download: `${d.id}.json` })
    a.click(); URL.revokeObjectURL(url)
  }
  const isShared = !!shared && design.id === shared.id
  const share = async () => {
    const builtIn = LIBRARY.some(x => x.id === design.id)
    const url = shareUrl(design, builtIn)
    const ok = await copyText(url)
    setToast(!ok ? 'Could not reach the clipboard.'
      : builtIn ? 'Link copied.'
      : `Link copied. The whole design is inside it (${Math.round(url.length / 1000)}k characters), so nothing is uploaded anywhere.`)
  }
  const saveShared = () => {
    if (!shared) return
    setShared(null)
    importDesign(shared)
    setToast('Saved to My designs.')
  }
  const themeIcon = theme.pref === 'system' ? '◐' : theme.pref === 'light' ? '☀' : '☾'

  return (
    <div className={mode === 'home' ? 'app home-mode' : `app${leftOpen ? '' : ' no-left'}${rightOpen ? '' : ' no-right'}`}>
      <header className="topbar">
        {mode !== 'home' && (
          <button className="icon ghost" aria-label={mode === 'practice' ? 'Show or hide the problem and palette panel' : 'Show or hide the requirements panel'} aria-expanded={leftOpen}
            title={`${leftOpen ? 'Hide' : 'Show'} the ${mode === 'practice' ? 'problem and palette' : 'requirements'} panel`} onClick={() => setLeftOpen(o => !o)}>☰</button>
        )}
        <button className="brand" onClick={() => setMode('home')} title="Home">Arch<span>Story</span></button>
        {mode !== 'home' && <>
          <span className="sep" />
          {mode === 'practice'
            ? <span className="title">{`Practice: ${(LIBRARY.find(d => d.id === problemId) ?? LIBRARY[0]).meta.title}`}</span>
            : <button className="title-btn" onClick={() => setPicking(true)} aria-haspopup="dialog" title="Switch design (⌘K / Ctrl+K)">{design.meta.title}<span className="chev-down" aria-hidden>▾</span></button>}
        </>}
        {mode === 'explore' && isShared && (
          <span className="shared-pill">Shared link · not saved
            <button className="link" onClick={saveShared}>Save to My designs</button>
          </span>
        )}
        {mode !== 'home' && (
          <nav className="seg" aria-label="Mode">
            <button className={mode === 'explore' ? 'on' : ''} onClick={() => setMode('explore')}>Explore</button>
            <button className={mode === 'practice' ? 'on' : ''}
              onClick={() => { if (LIBRARY.some(d => d.id === design.id)) setProblemId(design.id); setMode('practice') }}>Practice</button>
          </nav>
        )}
        <span className="spacer" />
        {mode !== 'home' && (
          <div className="seg" role="group" aria-label="Cloud">
            {(['neutral', 'aws', 'gcp'] as Cloud[]).map(c => (
              <button key={c} className={cloud === c ? 'on' : ''} onClick={() => setCloud(c)}>{c === 'neutral' ? 'Neutral' : c.toUpperCase()}</button>
            ))}
          </div>
        )}
        {mode === 'explore' && <button onClick={share} title="Copy a link to this design, flow and view">Share</button>}
        <button className="icon ghost" aria-label={`Theme: ${theme.pref}. Click to change`} title={`Theme: ${theme.pref} (click to change)`} onClick={theme.cycle}>{themeIcon}</button>
        {mode !== 'home' && (
          <button className="icon ghost" aria-label={mode === 'practice' ? 'Show or hide the inspector' : 'Show or hide the flow inspector'} aria-expanded={rightOpen}
            title={`${rightOpen ? 'Hide' : 'Show'} the ${mode === 'practice' ? 'inspector' : 'flow, component and notes panel'}`} onClick={() => setRightOpen(o => !o)}>◫</button>
        )}
      </header>

      {mode === 'home' ? (
        <main className="home-main">
          <Home library={LIBRARY} mine={mine}
            onExplore={id => { open(id); setMode('explore') }}
            onPractice={id => { setProblemId(id); setMode('practice') }}
            onImport={() => setImporting(true)} onGenerate={() => setGenerating(true)}
            onTour={() => { store.set('archstory.tour.explore', false); open(LIBRARY.find(d => d.id === 'url-shortener')?.id ?? LIBRARY[0].id); setLeftOpen(true); setRightOpen(true); setMode('explore'); setTour('explore') }} />
        </main>
      ) : mode === 'practice' ? (
        <Practice problemId={problemId} onProblem={setProblemId} cloud={cloud} colorMode={theme.resolved}
          leftOpen={leftOpen} rightOpen={rightOpen} onExport={exportDesign} onViewJson={setJsonOf} />
      ) : (<>
      {leftOpen && (
        <aside className="left">
          <Sidebar current={design} onBrowse={() => setPicking(true)}
            onImport={() => setImporting(true)} onExport={() => exportDesign()} onGenerate={() => setGenerating(true)} onViewJson={() => setJsonOf(design)} />
        </aside>
      )}

      <main className="stage">
        <Toolbar>
          <Seg label="View" value={view} onChange={setView}
            options={[{ key: 'canvas', label: 'Architecture' }, { key: 'timeline', label: 'Timeline', disabled: !flow }]} />
          {view === 'canvas' && <>
            <ToolbarSep />
            <ToolbarLabel>Layers</ToolbarLabel>
            <Toggle on={net} disabled={!design.network} onClick={() => setNetwork(v => !v)}
              title={design.network ? 'Show VPC, subnets and availability zones' : 'This design has no network section'}>Network</Toggle>
            <Toggle on={monitoring && !!design.observability} disabled={!design.observability}
              onClick={() => { setMonitoring(v => !v); if (!monitoring) { setTab('monitoring'); setRightOpen(true) } }}
              title={design.observability ? 'Show where telemetry comes from, SLOs, alerts and what to watch' : 'This design has no monitoring section'}>Monitoring</Toggle>
            {net && zoneCount > 1 && (
              <AvailabilityMenu zoneCount={zoneCount} cloud={cloud} zonesView={zonesView} onZonesView={setZonesView}
                failed={failedZone} onFailed={setFailed} home={homeZone} onHome={setHome} />
            )}
          </>}
        </Toolbar>
        <div className="stage-body">
          {view === 'timeline' && flow
            ? <Timeline design={design} flow={flow} player={player} cloud={cloud} onSelect={select} />
            : <ReactFlowProvider>
                <BandCanvas design={design} flow={flow} player={player} cloud={cloud} network={network} monitoring={monitoring} selected={selected}
                  zonesView={zonesView} zone={zone} insets={insets} captionDetail={!rightOpen || viewport <= 900}
                  onSelect={select} colorMode={theme.resolved} />
              </ReactFlowProvider>}
        </div>
        <PlayerBar flows={design.flows} flow={flow} onFlow={setFlowId} player={player} />
      </main>

      {rightOpen && (
        <aside className="right">
          <Inspector design={design} flow={flow} player={player} cloud={cloud} network={net} monitoring={monitoring} zone={zonesView ? zone : { ...zone, hops: null }} selected={selected}
            tab={tab} onTab={setTab} onFlow={setFlowId} onSelect={select} />
        </aside>
      )}
      </>)}

      {jsonOf && <JsonDialog design={jsonOf} onClose={() => setJsonOf(null)} onDownload={() => exportDesign(jsonOf)} />}
      {importing && <ImportDialog onClose={() => setImporting(false)} onImport={importDesign} />}
      {picking && <DesignPicker library={LIBRARY} mine={mine} currentId={design.id} onClose={() => setPicking(false)}
        onOpen={id => { open(id); setMode('explore') }}
        onDelete={id => { saveMine(mine.filter(d => d.id !== id)); if (id === design.id) open(LIBRARY[0].id) }} />}
      {generating && <GenerateDialog example={LIBRARY.find(d => d.id === 'url-shortener') ?? LIBRARY[0]}
        onClose={() => setGenerating(false)} onPasteAnswer={() => { setGenerating(false); setImporting(true) }} />}
      {toast && <div className="toast" role="status">{toast}</div>}
      {tour && <Tour key={tour} steps={tour === 'explore' ? EXPLORE_TOUR : PRACTICE_TOUR} onDone={endTour} />}
    </div>
  )
}
