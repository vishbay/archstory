import { useEffect, useMemo, useState } from 'react'
import { ReactFlowProvider } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import './app.css'
import { LIBRARY } from '../library'
import { parseDesign, type Design } from '../model/schema'
import type { Cloud } from '../model/kinds'
import { store, usePlayer, useTheme } from './hooks'
import { BandCanvas, type ZoneState } from './BandCanvas'
import { layoutZones, resolveFlow } from '../layout/zones'
import { zoneName } from '../model/availability'
import { Timeline } from './Timeline'
import { PlayerBar } from './PlayerBar'
import { Inspector, type InspectorTab } from './Inspector'
import { Sidebar } from './Sidebar'
import { ImportDialog } from './ImportDialog'
import { GenerateDialog } from './GenerateDialog'
import { copyText, readSharedDesign, shareUrl } from './share'
import { Practice } from './Practice'

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
  const [mode, setMode] = useState<'explore' | 'practice'>(() => (params.get('mode') === 'practice' && !sharedAtLoad.design ? 'practice' : 'explore'))
  const [problemId, setProblemId] = useState(() => params.get('p') ?? 'url-shortener')
  const [generating, setGenerating] = useState(false)
  const design = all.find(d => d.id === designId) ?? LIBRARY[0]
  const [flowId, setFlowId] = useState(() => params.get('f') ?? '')
  const flow = design.flows.find(f => f.id === flowId) ?? design.flows[0]
  const [view, setView] = useState<View>(() => (params.get('view') === 'timeline' ? 'timeline' : 'canvas'))
  const [network, setNetwork] = useState(() => params.get('net') === '1')
  const [zonesView, setZonesView] = useState(() => params.get('zones') === '1')
  const [failed, setFailed] = useState<number | null>(null)
  const [home, setHome] = useState(1)
  const [cloud, setCloud] = useState<Cloud>(() => store.get('archstory.cloud', 'neutral'))
  const [selected, setSelected] = useState<string | null>(null)
  const [tab, setTab] = useState<InspectorTab>('step')
  const [leftOpen, setLeftOpen] = useState(() => store.get('archstory.left', true))
  const [rightOpen, setRightOpen] = useState(() => store.get('archstory.right', true))
  const [importing, setImporting] = useState(false)
  const player = usePlayer(flow?.steps.length ?? 0, `${design.id}/${flow?.id}`)
  const net = network && !!design.network
  const zoneCount = design.network?.zones ?? 1
  const failedZone = net && failed !== null && failed < zoneCount ? failed : null
  const homeZone = Math.min(home, zoneCount - 1)
  const zl = useMemo(() => (net && zoneCount > 1 ? layoutZones(design, failedZone) : null), [design, net, zoneCount, failedZone])
  const hops = useMemo(() => (zl && flow ? resolveFlow(zl, flow, homeZone, failedZone) : null), [zl, flow, homeZone, failedZone])
  const zone: ZoneState = { failed: failedZone, home: homeZone, zl, hops }

  useEffect(() => {
    const u = new URL(location.href)
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
    if (design.id !== shared?.id) u.hash = ''
    history.replaceState(null, '', u)
  }, [design.id, flow, view, network, zonesView, shared, mode, problemId])
  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 3500)
    return () => clearTimeout(t)
  }, [toast])
  useEffect(() => { store.set('archstory.cloud', cloud) }, [cloud])
  useEffect(() => { store.set('archstory.left', leftOpen) }, [leftOpen])
  useEffect(() => { store.set('archstory.right', rightOpen) }, [rightOpen])

  const open = (id: string) => { setDesignId(id); setFlowId(''); setSelected(null); setTab('step') }
  const select = (id: string | null) => { setSelected(id); if (id) { setTab('component'); setRightOpen(true) } }
  const saveMine = (list: Design[]) => { setMine(list); store.set(MINE_KEY, list) }
  const importDesign = (d: Design) => {
    const id = LIBRARY.some(x => x.id === d.id) ? `${d.id}-mine` : d.id
    saveMine([...mine.filter(x => x.id !== id), { ...d, id }])
    setImporting(false); open(id)
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
    <div className={`app${leftOpen ? '' : ' no-left'}${rightOpen ? '' : ' no-right'}`}>
      <header className="topbar">
        <button className="icon ghost" title="Toggle library" onClick={() => setLeftOpen(o => !o)}>☰</button>
        <span className="brand">Arch<span>Story</span></span>
        <span className="sep" />
        <span className="title">{mode === 'practice' ? `Practice: ${(LIBRARY.find(d => d.id === problemId) ?? LIBRARY[0]).meta.title}` : design.meta.title}</span>
        {mode === 'explore' && isShared && (
          <span className="shared-pill">Shared link · not saved
            <button className="link" onClick={saveShared}>Save to My designs</button>
          </span>
        )}
        <nav className="seg" aria-label="Mode">
          <button className={mode === 'explore' ? 'on' : ''} onClick={() => setMode('explore')}>Explore</button>
          <button className={mode === 'practice' ? 'on' : ''}
            onClick={() => { if (LIBRARY.some(d => d.id === design.id)) setProblemId(design.id); setMode('practice') }}>Practice</button>
        </nav>
        <span className="spacer" />
        <div className="seg" role="group" aria-label="Cloud">
          {(['neutral', 'aws', 'gcp'] as Cloud[]).map(c => (
            <button key={c} className={cloud === c ? 'on' : ''} onClick={() => setCloud(c)}>{c === 'neutral' ? 'Neutral' : c.toUpperCase()}</button>
          ))}
        </div>
        {mode === 'explore' && <button onClick={share} title="Copy a link to this design, flow and view">Share</button>}
        <button className="icon ghost" title={`Theme: ${theme.pref}`} onClick={theme.cycle}>{themeIcon}</button>
        <button className="icon ghost" title="Toggle inspector" onClick={() => setRightOpen(o => !o)}>◫</button>
      </header>

      {mode === 'practice' ? (
        <Practice problemId={problemId} onProblem={setProblemId} cloud={cloud} colorMode={theme.resolved}
          leftOpen={leftOpen} rightOpen={rightOpen} onExport={exportDesign} />
      ) : (<>
      {leftOpen && (
        <aside className="left">
          <Sidebar library={LIBRARY} mine={mine} current={design} onOpen={open}
            onDelete={id => { saveMine(mine.filter(d => d.id !== id)); if (id === design.id) open(LIBRARY[0].id) }}
            onImport={() => setImporting(true)} onExport={() => exportDesign()} onGenerate={() => setGenerating(true)} />
        </aside>
      )}

      <main className="stage">
        <div className="stage-tools">
        <div className="seg view-toggle" role="group" aria-label="View">
          <button className={view === 'canvas' ? 'on' : ''} onClick={() => setView('canvas')}>Architecture</button>
          <button className={view === 'timeline' ? 'on' : ''} onClick={() => setView('timeline')} disabled={!flow}>Timeline</button>
        </div>
        {view === 'canvas' && (
          <button className={`network-toggle${network && design.network ? ' on' : ''}`} aria-pressed={network && !!design.network}
            disabled={!design.network} onClick={() => setNetwork(v => !v)}
            title={design.network ? 'Show VPC, subnets and availability zones' : 'This design has no network section'}>
            Network
          </button>
        )}
        </div>
        {view === 'canvas' && net && zoneCount > 1 && (
          <div className="zone-tools">
            <div className="seg" role="group" aria-label="Layout">
              <button className={zonesView ? '' : 'on'} onClick={() => setZonesView(false)}>Tiers</button>
              <button className={zonesView ? 'on' : ''} onClick={() => setZonesView(true)}>Zones</button>
            </div>
            <label className="zone-pick">Fail
              <select value={failedZone ?? ''} onChange={e => setFailed(e.target.value === '' ? null : Number(e.target.value))}>
                <option value="">nothing</option>
                {Array.from({ length: zoneCount }, (_, i) => <option key={i} value={i}>{zoneName(i, cloud)}</option>)}
              </select>
            </label>
            {zonesView && (
              <label className="zone-pick">Request enters
                <select value={homeZone} onChange={e => setHome(Number(e.target.value))}>
                  {Array.from({ length: zoneCount }, (_, i) => <option key={i} value={i}>{zoneName(i, cloud)}</option>)}
                </select>
              </label>
            )}
          </div>
        )}
        <div className="stage-body">
          {view === 'timeline' && flow
            ? <Timeline design={design} flow={flow} player={player} cloud={cloud} onSelect={select} />
            : <ReactFlowProvider>
                <BandCanvas design={design} flow={flow} player={player} cloud={cloud} network={network} selected={selected}
                  zonesView={zonesView} zone={zone}
                  onSelect={select} colorMode={theme.resolved} />
              </ReactFlowProvider>}
        </div>
        <PlayerBar flows={design.flows} flow={flow} onFlow={setFlowId} player={player} />
      </main>

      {rightOpen && (
        <aside className="right">
          <Inspector design={design} flow={flow} player={player} cloud={cloud} network={net} zone={zonesView ? zone : { ...zone, hops: null }} selected={selected}
            tab={tab} onTab={setTab} onFlow={setFlowId} />
        </aside>
      )}
      </>)}

      {importing && <ImportDialog onClose={() => setImporting(false)} onImport={importDesign} />}
      {generating && <GenerateDialog example={LIBRARY.find(d => d.id === 'url-shortener') ?? LIBRARY[0]}
        onClose={() => setGenerating(false)} onPasteAnswer={() => { setGenerating(false); setImporting(true) }} />}
      {toast && <div className="toast" role="status">{toast}</div>}
    </div>
  )
}
