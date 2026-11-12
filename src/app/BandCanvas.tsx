import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ReactFlow, Background, BackgroundVariant, Controls, BaseEdge, EdgeLabelRenderer, Handle, MarkerType, Position, getBezierPath, getStraightPath, ConnectionMode, ControlButton, useReactFlow,
  type Edge, type EdgeProps, type Node, type NodeProps,
} from '@xyflow/react'
import { edgeId, findEdge, type Design, type DNode, type Flow, type StepKind, type Tier } from '../model/schema'
import { kindInfo, nameOf, TIER_INFO, type Cloud } from '../model/kinds'
import { subnetLabel, vpcLabel } from '../model/network'
import { impactOf, zoneBadge, zoneName, type Level } from '../model/availability'
import { regionImpactOf } from '../model/regions'
import { layoutBands, NODE_H, NODE_W, OBS_NODE_W, ON_PREM_GROUP, type Layout, type Side } from '../layout/bands'
import { isFreeLayout, layoutFree } from '../layout/free'
import { midpoint, roundedPolyline, routeEdges, type Pt, type Rect } from '../layout/route'
import { ZNODE_W, type Hop, type ZoneLayout } from '../layout/zones'
import { emits, signalsFor, stackName, TELEMETRY, telemetryNodes, TELEMETRY_EDGES, traceId } from '../model/observability'
import { NodeIcon } from './NodeIcon'
import { Packet } from './Packet'
import { KIND_GLYPH, KIND_INK, KIND_VAR } from './stepKinds'
import { reducedMotion, store, type Player } from './hooks'
import { KIND_TEXT } from './stepKinds'

type State = 'active' | 'visited' | 'flow' | 'off'

/** Availability settings shared by the canvas and the inspector. With a region layout (zl.unit 'region') the columns are regions. */
export interface ZoneState { failed: number | null; home: number; zl: ZoneLayout | null; hops: Hop[] | null }

// ---------- background nodes ----------
function BandNode({ data }: NodeProps) {
  const { tier, title, blurb, color, w, h, strip, summary, open, onToggle } = data as {
    tier?: Tier; title?: string; blurb?: string; color?: string; w: number; h: number
    strip?: boolean; summary?: string; open?: boolean; onToggle?: () => void
  }
  const style = { width: w, height: h, ['--tier' as string]: color ?? TIER_INFO[tier!].color }
  if (strip) {
    // the collapsed monitoring lane: one line that expands on click
    return (
      <div className="band obs-strip" style={style}>
        <button className="obs-toggle nopan" aria-expanded={false} onClick={onToggle} title="Show the telemetry stack">
          <span className="chev">›</span><b>{title}</b><span className="obs-summary">{summary}</span><span className="obs-hint">Show</span>
        </button>
      </div>
    )
  }
  return (
    <div className="band" style={style}>
      <div className="band-head" title={blurb ?? TIER_INFO[tier!].blurb}><b>{title ?? TIER_INFO[tier!].title}</b></div>
      {onToggle && open && <button className="obs-collapse nopan" aria-expanded onClick={onToggle}>Collapse ▴</button>}
    </div>
  )
}
function GroupNode({ data }: NodeProps) {
  const { label, kind, w, h } = data as { label: string; kind: string; w: number; h: number }
  return <div className={`group group-${kind}`} style={{ width: w, height: h }}><span>{kind === 'onprem' ? label : `${kind} · ${label}`}</span></div>
}
function VpcNode({ data }: NodeProps) {
  const { label, w, h } = data as { label: string; w: number; h: number }
  return <div className="vpc" style={{ width: w, height: h }}><span>{label}</span></div>
}
function SubnetNode({ data }: NodeProps) {
  const { label, isPublic, w, h } = data as { label: string; isPublic: boolean; w: number; h: number }
  return <div className={`subnet${isPublic ? ' public' : ''}`} style={{ width: w, height: h }}><span>{label}</span></div>
}
function ZoneNode({ data }: NodeProps) {
  const { label, failed, w, h } = data as { label: string; failed: boolean; w: number; h: number }
  return <div className={`zone${failed ? ' failed' : ''}`} style={{ width: w, height: h }}><span>{label}{failed ? ' · failed' : ''}</span></div>
}

// ---------- components ----------
type NodeData = {
  node: DNode; cloud: Cloud; state: State; selected: boolean; note?: string
  tag?: { text: string; level?: Level | 'role' }; failed?: boolean; compact?: boolean
  editable?: boolean; flagged?: boolean; recordingFrom?: boolean; mark?: { count: number; severity: string }; gap?: Gap
  /** Monitoring layer: which telemetry this component emits, and whether it is a telemetry part itself. */
  signals?: { metrics: boolean; logs: boolean; traces: boolean }; telemetry?: boolean
}
const SIDES: [Side, Position][] = [['top', Position.Top], ['right', Position.Right], ['bottom', Position.Bottom], ['left', Position.Left]]

function ComponentNode({ data }: NodeProps) {
  const { node: n, cloud, state, selected, note, tag, failed, compact, editable, flagged, recordingFrom, mark, gap, signals, telemetry } = data as NodeData
  const name = nameOf(n, cloud)
  const cls = [`node st-${state}`, selected && 'selected', failed && 'failed', compact && 'compact', editable && 'editable', flagged && 'flagged', recordingFrom && 'rec-from', gap && `mark-${gap}`, telemetry && 'telemetry']
  return (
    <div className={cls.filter(Boolean).join(' ')}
      style={{ width: telemetry ? OBS_NODE_W : compact ? ZNODE_W : NODE_W }} title={compact ? name : undefined}>
      {note && <div className="node-note">{note}</div>}
      {tag && <span className={`node-tag tag-${tag.level ?? 'info'}`}>{tag.text}</span>}
      {mark && <span className={`node-mark sev-${mark.severity}`} title={`${mark.count} review finding${mark.count > 1 ? 's' : ''}`}>{mark.count}</span>}
      <NodeIcon node={n} cloud={cloud} size={compact ? 22 : 28} />
      <div className="node-text">
        <div className="node-name">{name}</div>
        <div className="node-sub">{name !== n.label ? n.label : kindInfo(n.kind).label}</div>
      </div>
      {n.replicas && <span className="node-rep">×{n.replicas}</span>}
      {signals && (signals.metrics || signals.logs || signals.traces) && (
        <span className="node-signals" role="group" aria-label="Telemetry this component emits">
          {signals.metrics && <i title="Emits metrics" aria-label="emits metrics">M</i>}
          {signals.logs && <i title="Emits logs" aria-label="emits logs">L</i>}
          {signals.traces && <i title="Emits traces" aria-label="emits traces">T</i>}
        </span>
      )}
      {SIDES.map(([s, p]) => <Handle key={`s-${s}`} id={`s-${s}`} type="source" position={p} isConnectable={!!editable} />)}
      {SIDES.map(([s, p]) => <Handle key={`t-${s}`} id={`t-${s}`} type="target" position={p} isConnectable={!!editable} />)}
    </div>
  )
}

// ---------- edges ----------
type EdgeData = {
  state: State; async?: boolean; picked?: boolean; kind?: StepKind; label?: string; note?: string
  /** Corners of a routed path (an edge that would otherwise cross a component); absent means the default curve. */
  via?: Pt[]
  /** Right-angled path between the two handles, for edges that have no precomputed route (the monitoring lane). */
  elbow?: boolean
  packet?: { key: string; ms: number; reverse: boolean }
  /** Free layout (protocol rings and topologies): a straight line between the two nodes instead of the tier-band curve. */
  direct?: boolean
  /** The current step's message never arrives: its packet stops part of the way, fades and leaves an X. */
  lost?: boolean
}
const edgeColor = (d: EdgeData) =>
  d.state === 'active' ? KIND_VAR[d.kind!] : d.state === 'visited' ? 'var(--edge-visited)' : d.state === 'flow' ? 'var(--edge-flow)' : 'var(--edge-off)'

function FlowEdge(p: EdgeProps) {
  const d = p.data as EdgeData
  const mx = (p.sourceX + p.targetX) / 2, my = (p.sourceY + p.targetY) / 2
  const sideways = p.sourcePosition === Position.Left || p.sourcePosition === Position.Right   // same lane: keep the tag above the nodes
  // A straight route assumes both nodes line up. Rendered heights can differ a little, so add a small jog rather than draw a slanted line.
  const straight = (): Pt[] => (sideways ? (Math.abs(p.sourceY - p.targetY) < 1 ? [] : [[mx, p.sourceY], [mx, p.targetY]]) : (Math.abs(p.sourceX - p.targetX) < 1 ? [] : [[p.sourceX, my], [p.targetX, my]]))
  const via = d.via ? (d.via.length ? d.via : straight()) : d.elbow ? straight() : undefined
  const routed: Pt[] | undefined = via && [[p.sourceX, p.sourceY], ...via, [p.targetX, p.targetY]]
  const [bezier, bx, by] = d.direct ? getStraightPath(p) : getBezierPath(p)
  const path = routed ? roundedPolyline(routed) : bezier
  const [lx, ly] = routed ? midpoint(routed) : [bx, by]
  const color = d.picked ? 'var(--accent)' : edgeColor(d)
  const dashed = d.state === 'active' ? d.kind === 'async' : d.async
  const label = d.state === 'active' ? undefined : d.note   // the active step's label travels with the packet
  return (
    <>
      <BaseEdge id={p.id} path={path} markerEnd={p.markerEnd}
        interactionWidth={18}
        style={{ stroke: color, strokeWidth: d.state === 'active' || d.picked ? 3 : d.state === 'off' ? 1 : 1.6, strokeDasharray: dashed ? '6 5' : undefined, opacity: d.state === 'off' ? 0.55 : 1 }} />
      {d.packet && <Packet key={d.packet.key} path={path} ms={d.packet.ms} reverse={d.packet.reverse} color={d.lost ? 'var(--hard)' : color} lost={d.lost ? 'x' : undefined} />}
      {d.packet && d.label && (
        <EdgeLabelRenderer>
          <div key={d.packet.key} className={`packet-tag${d.lost ? ' lost' : ''}`} title={d.label}
            style={{ offsetPath: `path("${path}")`, offsetAnchor: sideways ? '-12px 64px' : undefined, animationDuration: `${d.packet.ms}ms`, animationDirection: d.packet.reverse ? 'reverse' : 'normal', borderColor: d.lost ? 'var(--hard)' : color, color: d.lost ? 'var(--hard-t)' : d.kind ? KIND_INK[d.kind] : color }}>
            {KIND_GLYPH[d.kind!]} {d.label}{d.lost ? ' (lost)' : ''}
          </div>
        </EdgeLabelRenderer>
      )}
      {label && (
        <EdgeLabelRenderer>
          <div className={`edge-label${d.state === 'active' ? '' : ' quiet'}`}
            style={{ transform: `translate(-50%, -50%) translate(${lx}px, ${ly}px)`, borderColor: color }}>{label}</div>
        </EdgeLabelRenderer>
      )}
    </>
  )
}

const nodeTypes = { band: BandNode, boundary: GroupNode, vpc: VpcNode, subnet: SubnetNode, zone: ZoneNode, component: ComponentNode }
const edgeTypes = { flow: FlowEdge }
const fixed = { draggable: false, selectable: false } as const

function backdrop(design: Design, cloud: Cloud, L: Pick<Layout, 'bands' | 'subnets' | 'vpc'>): Node[] {
  return [
    ...L.bands.map(b => ({ id: `band:${b.tier}`, type: 'band', position: { x: b.x, y: b.y }, ...fixed, zIndex: -5, data: { tier: b.tier, w: b.w, h: b.h } })),
    ...(L.vpc ? [{ id: 'vpc', type: 'vpc', position: { x: L.vpc.x, y: L.vpc.y }, ...fixed, zIndex: -4,
      data: { label: vpcLabel(design, cloud), w: L.vpc.w, h: L.vpc.h } }] : []),
    ...L.subnets.map((s, i) => ({ id: `subnet:${s.id}:${i}`, type: 'subnet', position: { x: s.x, y: s.y }, ...fixed, zIndex: -3,
      data: { label: subnetLabel(design, s, cloud), isPublic: s.public, w: s.w, h: s.h } })),
  ]
}

// Edges a scenario does not use stay as faint lines without arrowheads.
const marker = (d: EdgeData) => (d.state === 'off' ? undefined : { type: MarkerType.ArrowClosed, color: edgeColor(d), width: 16, height: 16 })

/** Side by side with the reference: outline what one design has and the other lacks. */
export type Gap = 'missing' | 'extra'

/** Practice mode: the canvas becomes an editor. */
export interface EditProps {
  onConnect: (from: string, to: string) => void
  onEdgeClick: (from: string, to: string) => void
  pickedEdge: string | null
  flagged: Set<string>
  marks?: Map<string, { count: number; severity: string }>
  recordingFrom: string | null
  /** Recording or connecting: keep the whole design in view and mark the start in the accent colour when connecting. */
  mode?: 'record' | 'connect' | null
}

export function BandCanvas({ id, design, flow, player, cloud, network, monitoring = false, zonesView, zone, regionFailed = null, selected, onSelect, colorMode, edit, gaps, insets = { left: 12, right: 12 }, captionDetail = true }: {
  /** Needed when two canvases share the page, so their SVG ids do not clash. */
  id?: string
  design: Design; flow: Flow | undefined; player: Player; cloud: Cloud; network: boolean; monitoring?: boolean; zonesView: boolean; zone: ZoneState
  /** A failed region, tagged on the tier view (the regions view gets it through `zone`). */
  regionFailed?: number | null
  selected: string | null; onSelect: (id: string | null) => void; colorMode: 'light' | 'dark'; edit?: EditProps
  gaps?: { ids: Set<string>; gap: Gap }
  /** Pixels at the left and right edge covered by floating panels. */
  insets?: { left: number; right: number; top?: number }
  /** Show the step's explanation in the caption (only needed when the Flow panel is closed). */
  captionDetail?: boolean
}) {
  const rf = useReactFlow()
  // Each side has overlapping source and target handles, and React Flow reverses a connection dragged from a
  // target handle. The component where the drag started is always the caller.
  const dragFrom = useRef<string | null>(null)
  const count = design.nodes.length
  type Px = `${number}px`
  const px = (n: number): Px => `${n}px`
  const pad = (top: number, bottom: number, side: number) =>
    ({ top: px(top + (insets.top ?? 0)), bottom: px(bottom), left: px(insets.left + side), right: px(insets.right + side) })
  useEffect(() => { if (edit) requestAnimationFrame(() => rf.fitView({ duration: 250, padding: pad(24, 24, 24) })) },
    // refit the editor when components are added or removed, or the toolbar above it wraps
    [count, insets.top]) // eslint-disable-line react-hooks/exhaustive-deps
  const net = network && !!design.network
  const regional = zone.zl?.unit === 'region'
  const zoned = !!zone.zl && (regional || (net && zonesView))
  const unit = regional ? 'region' : 'zone'
  const mon = monitoring && !!design.observability && !zoned   // the zones view has no telemetry band
  const [obsOpen, setObsOpen] = useState(false)               // the monitoring lane starts as a one-line strip
  const free = isFreeLayout(design)   // a protocol ring or topology: the nodes' own positions, straight edges, no bands
  const L = useMemo(() => (free ? layoutFree(design) : layoutBands(design, { network: net, observability: mon, obsOpen })), [design, free, net, mon, obsOpen])
  // Route edges around components: clear edges keep the default curve, the rest follow the gaps between nodes.
  const tierRoutes = useMemo(() => {
    if (free) return {}
    const rects: Record<string, Rect> = Object.fromEntries(design.nodes.map(n => [n.id, { ...L.pos[n.id], w: NODE_W, h: NODE_H }]))
    return routeEdges(rects, design.edges.map(e => ({ key: edgeId(e), from: e.from, to: e.to })))
  }, [design, L, free])
  const zoneRoutes = useMemo(() => {
    if (!zoned || !zone.zl) return {}
    const zl = zone.zl
    const rects: Record<string, Rect> = Object.fromEntries(zl.insts.map(i => [i.id, { ...zl.pos[i.id], w: i.zone !== null ? ZNODE_W : NODE_W, h: NODE_H }]))
    return routeEdges(rects, zl.edges.map(e => ({ key: e.id, from: e.from, to: e.to })))
  }, [zoned, zone.zl])
  const stack = (c: Cloud) => { const n = (i: number) => stackName(TELEMETRY[i], c); return `${n(0)} → ${n(1)} · ${n(2)} · ${n(3)} → ${n(4)} → ${n(5)}` }
  const { step, nonce, packetMs } = player

  // Camera follows the request: frame the two components of the current hop; zoom back out on reset.
  const [follow, setFollow] = useState(() => store.get('archstory.follow', true))
  const toggleFollow = () => setFollow(f => { store.set('archstory.follow', !f); return !f })
  const FRAME = pad(40, 150, 80)
  const OVERVIEW = pad(24, 24, 24)
  useEffect(() => {
    if (!follow || edit?.mode) return
    const duration = reducedMotion() ? 0 : 450
    const cur = flow?.steps[step]
    if (!cur) { rf.fitView({ duration, padding: OVERVIEW }); return }
    const ids = (zoned && zone.hops?.[step] ? [zone.hops[step].from, zone.hops[step].to] : [cur.from, cur.to])
      .filter((id): id is string => !!id)
    if (ids.length) rf.fitView({ nodes: [...new Set(ids)].map(id => ({ id })), duration, padding: FRAME, maxZoom: 1 })
  }, [step, nonce, follow, flow?.id, zoned, insets.left, insets.right, insets.top]) // eslint-disable-line react-hooks/exhaustive-deps
  const { failed } = zone

  const { nodes, edges } = useMemo(() => {
    const steps = flow?.steps ?? []
    const cur = steps[step]
    const packetKey = `${flow?.id}-${step}-${nonce}`

    // ---- zones view: one box per instance, edges between instances ----
    if (zoned) {
      const zl = zone.zl!, hops = zone.hops ?? []
      const ids = (upto: number) => new Set(hops.slice(0, upto).flatMap(h => [h.from, h.to]))
      const seen = ids(step + 1), inFlow = ids(hops.length)
      const edgeIds = (upto: number) => new Set(hops.slice(0, upto).map(h => h.edge?.id))
      const seenE = edgeIds(step + 1), flowE = edgeIds(hops.length)
      const hop = hops[step]
      const nodes: Node[] = [
        ...backdrop(design, cloud, zl),
        ...zl.zoneBoxes.map(z => ({ id: `zone:${z.zone}`, type: 'zone', position: { x: z.x, y: z.y }, ...fixed, zIndex: -2,
          data: { label: z.label ?? zoneName(z.zone, cloud), failed: z.zone === failed, w: z.w, h: z.h } })),
        ...(zl.onprem ? [{ id: 'group:~onprem', type: 'boundary', position: { x: zl.onprem.x, y: zl.onprem.y }, ...fixed, zIndex: -2,
          data: { label: ON_PREM_GROUP.label, kind: ON_PREM_GROUP.kind, w: zl.onprem.w, h: zl.onprem.h } }] : []),
        ...zl.insts.map(i => {
          const node = design.nodes.find(n => n.id === i.node)!
          const state: State = !flow ? 'visited' : hop && (hop.from === i.id || hop.to === i.id) ? 'active'
            : seen.has(i.id) ? 'visited' : inFlow.has(i.id) ? 'flow' : 'off'
          const role = i.role === 'primary' || i.role === 'standby' ? { text: i.role, level: 'role' as const }
            : i.role === 'promoted' ? { text: 'promoted to primary', level: 'warn' as const }
            : i.role === 'single' ? { text: 'single zone', level: 'down' as const } : undefined
          return {
            id: i.id, type: 'component', position: zl.pos[i.id], draggable: false,
            data: { node, cloud, state, selected: selected === i.node, failed: i.failed, compact: i.zone !== null,
              tag: i.failed ? { text: `${unit} down`, level: 'down' as const } : i.tag ?? role,
              note: cur?.kind === 'local' && hop?.from === i.id ? cur.label : undefined } satisfies NodeData,
          }
        }),
      ]
      const edges: Edge[] = zl.edges.map(e => {
        const active = !!hop?.edge && hop.edge.id === e.id
        const data: EdgeData = {
          state: !flow ? 'visited' : active ? 'active' : seenE.has(e.id) ? 'visited' : flowE.has(e.id) ? 'flow' : 'off',
          async: e.async || e.replication, kind: cur?.kind,
          label: cur && `${cur.label}${hop?.cross ? ` · cross-${unit}` : ''}`,
          note: e.replication ? e.note ?? (e.async ? 'async replica' : 'sync standby') : undefined,
          packet: active ? { key: packetKey, ms: packetMs, reverse: hop!.reverse } : undefined,
          lost: active && !!cur?.lost,
        }
        const rt = zoneRoutes[e.id]
        const [sh, th] = rt ? [rt.from, rt.to] : zl.handles(e.from, e.to)
        if (rt) data.via = rt.via
        return { id: e.id, source: e.from, target: e.to, sourceHandle: `s-${sh}`, targetHandle: `t-${th}`, type: 'flow', data, markerEnd: marker(data) }
      })
      return { nodes, edges }
    }

    // ---- tier view: one box per component ----
    const inFlow = new Set(steps.flatMap(s => [s.from, s.to]))
    const seen = new Set(steps.slice(0, step + 1).flatMap(s => [s.from, s.to]))
    const hopIdx = (i: number) => findEdge(design, steps[i].from, steps[i].to)?.index
    const flowEdges = new Set(steps.map((_, i) => hopIdx(i)))
    const seenEdges = new Set(steps.slice(0, step + 1).map((_, i) => hopIdx(i)))
    const hop = cur && findEdge(design, cur.from, cur.to)
    const nodeState = (id: string): State =>
      !flow ? 'visited' : cur && (cur.from === id || cur.to === id) ? 'active' : seen.has(id) ? 'visited' : inFlow.has(id) ? 'flow' : 'off'
    const tagFor = (n: DNode): NodeData['tag'] => {
      if (regionFailed !== null && design.regions) { const im = regionImpactOf(design, n, regionFailed); return im ? { text: im.tag, level: im.level } : undefined }
      if (!net) return undefined
      if (failed !== null) { const im = impactOf(design, n, failed, cloud); return im ? { text: im.tag, level: im.level } : undefined }
      const b = zoneBadge(design, n, cloud)
      return b ? { text: b, level: b.includes('only') ? 'down' : undefined } : undefined
    }

    const nodes: Node[] = [
      ...backdrop(design, cloud, L),
      ...L.groups.map(g => ({ id: `group:${g.id}`, type: 'boundary', position: { x: g.x, y: g.y }, ...fixed, zIndex: -1,
        data: { label: g.label, kind: g.kind, w: g.w, h: g.h } })),
      ...(L.obs ? [
        { id: 'band:obs', type: 'band', position: { x: L.obs.band.x, y: L.obs.band.y }, ...fixed, zIndex: L.obs.open ? -5 : 1,
          data: { title: 'Monitoring', color: '#14b8a6', blurb: 'Every component emits metrics, logs and traces; alerts page a person', w: L.obs.band.w, h: L.obs.band.h,
            strip: !L.obs.open, open: L.obs.open, summary: stack(cloud), onToggle: () => setObsOpen(o => !o) } },
        ...(L.obs.open ? telemetryNodes() : []).map(t => ({ id: t.id, type: 'component', position: L.obs!.pos[t.id], draggable: false,
          data: { node: t, cloud, state: 'visited' as State, selected: false, compact: true, telemetry: true } satisfies NodeData })),
      ] : []),
      ...design.nodes.map(n => ({
        id: n.id, type: 'component', position: L.pos[n.id], draggable: false,
        data: { node: n, cloud, state: nodeState(n.id), selected: selected === n.id, tag: tagFor(n), signals: mon ? emits(n.kind) : undefined,
          editable: !!edit, flagged: edit?.flagged.has(n.id), recordingFrom: edit?.recordingFrom === n.id, mark: edit?.marks?.get(n.id),
          gap: gaps?.ids.has(n.id) ? gaps.gap : undefined,
          note: cur?.kind === 'local' && cur.from === n.id ? cur.label : undefined } satisfies NodeData,
      })),
    ]
    const edges: Edge[] = design.edges.map((e, i) => {
      const rt = tierRoutes[edgeId(e)]
      const [sh, th] = rt ? [rt.from, rt.to] : L.handles(e.from, e.to)
      const active = hop?.index === i
      const data: EdgeData = {
        state: !flow ? 'visited' : active ? 'active' : seenEdges.has(i) ? 'visited' : flowEdges.has(i) ? 'flow' : 'off',
        async: e.async, kind: cur?.kind, label: cur?.label, picked: edit?.pickedEdge === edgeId(e),
        packet: active ? { key: packetKey, ms: packetMs, reverse: hop!.reverse } : undefined,
        via: rt?.via, direct: free, lost: active && !!cur?.lost,
      }
      return { id: edgeId(e), source: e.from, target: e.to, sourceHandle: `s-${sh}`, targetHandle: `t-${th}`, type: 'flow', data, markerEnd: marker(data) }
    })
    if (L.obs) for (const [a, b] of TELEMETRY_EDGES) {
      const data: EdgeData = { state: 'visited', async: true, elbow: true }
      edges.push({ id: `${a}->${b}`, source: a, target: b, sourceHandle: 's-right', targetHandle: 't-left', type: 'flow', data, markerEnd: marker(data) })
    }
    return { nodes, edges }
  }, [L, free, tierRoutes, zoneRoutes, zoned, unit, zone, regionFailed, design, flow, step, nonce, packetMs, cloud, selected, net, mon, failed, edit, gaps])

  return (
    <ReactFlow id={id} key={`${design.id}:${net}:${zoned && unit}:${mon}:${obsOpen}`} className={edit?.mode === 'connect' ? 'connect-mode' : undefined} nodes={nodes} edges={edges} nodeTypes={nodeTypes} edgeTypes={edgeTypes}
      nodesDraggable={false} nodesConnectable={!!edit} elementsSelectable={false} colorMode={colorMode}
      connectionMode={ConnectionMode.Loose}
      onConnectStart={(_, h) => { dragFrom.current = h.nodeId }}
      onConnect={c => {
        const from = dragFrom.current ?? c.source
        edit?.onConnect(from, c.source === from ? c.target : c.source)
        dragFrom.current = null
      }}
      onEdgeClick={(_, e) => edit?.onEdgeClick(e.source, e.target)}
      onNodeClick={(_, n) => onSelect(n.type === 'component' && !(n.data as NodeData).telemetry ? (n.data as NodeData).node.id : null)} onPaneClick={() => onSelect(null)}
      fitView fitViewOptions={{ padding: pad(24, 24, 24) }}
      minZoom={0.2} maxZoom={1.3} proOptions={{ hideAttribution: true }}>
      <Background variant={BackgroundVariant.Dots} gap={24} size={2.4} color="var(--grid-dot)" />
      <Controls showInteractive={false} position="top-right">
        <ControlButton onClick={toggleFollow} title={follow ? 'Camera follows the request (on)' : 'Camera follows the request (off)'}
          className={follow ? 'follow-on' : ''} aria-pressed={follow}>◎</ControlButton>
      </Controls>
      {flow?.steps[step] && <Caption design={design} step={flow.steps[step]} index={step} total={flow.steps.length} cloud={cloud}
        cross={zoned && !!zone.hops?.[step]?.cross ? unit : null} monitoring={mon} flowId={flow.id} detail={captionDetail} />}
    </ReactFlow>
  )
}

/** Short on-canvas caption for the current hop, so the explanation sits next to the action. */
function Caption({ design, step, index, total, cloud, cross, monitoring, flowId, detail }: {
  design: Design; step: Flow['steps'][number]; index: number; total: number; cloud: Cloud; cross: 'zone' | 'region' | null; monitoring: boolean; flowId: string; detail: boolean
}) {
  const name = (id: string) => { const n = design.nodes.find(x => x.id === id); return n ? nameOf(n, cloud) : id }
  // Whoever answers records the request's latency and errors: the callee for a request, the sender for a response.
  const recorder = monitoring ? design.nodes.find(x => x.id === (step.kind === 'res' ? step.from : step.to)) : undefined
  const watched = recorder && Object.values(emits(recorder.kind)).some(Boolean)
  return (
    <div className="caption" role="status" aria-live="polite">
      <div className="caption-head">
        <span className="pill" style={{ color: KIND_INK[step.kind], borderColor: KIND_VAR[step.kind] }}>{KIND_TEXT[step.kind]}</span>
        <span className="muted">{index + 1}/{total}</span>
        <b>{name(step.from)}{step.from !== step.to && <> → {name(step.to)}</>}</b>
        <span className="mono" style={{ color: KIND_INK[step.kind] }}>{step.label}</span>
        {cross && <span className="muted">· cross-{cross}</span>}
      </div>
      {detail && step.detail && <p>{step.detail}</p>}
      {monitoring && (
        <div className="caption-obs">
          <span className="mono">trace {traceId(flowId)}</span><span>same id on every hop</span>
          {recorder && (watched
            ? <span><b>{name(recorder.id)}</b> records {signalsFor(recorder.kind).slice(0, 2).map(s => <code key={s.metric}>{s.metric}</code>)}</span>
            : <span><b>{name(recorder.id)}</b> cannot be instrumented: measured from our side</span>)}
        </div>
      )}
    </div>
  )
}
