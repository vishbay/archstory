import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ReactFlow, Background, Controls, BaseEdge, EdgeLabelRenderer, Handle, MarkerType, Position, getBezierPath, ConnectionMode, ControlButton, useReactFlow,
  type Edge, type EdgeProps, type Node, type NodeProps,
} from '@xyflow/react'
import { edgeId, findEdge, type Design, type DNode, type Flow, type StepKind, type Tier } from '../model/schema'
import { kindInfo, nameOf, TIER_INFO, type Cloud } from '../model/kinds'
import { subnetLabel, vpcLabel } from '../model/network'
import { impactOf, zoneBadge, zoneName, type Level } from '../model/availability'
import { layoutBands, NODE_W, type Layout, type Side } from '../layout/bands'
import { ZNODE_W, type Hop, type ZoneLayout } from '../layout/zones'
import { NodeIcon } from './NodeIcon'
import { Packet } from './Packet'
import { KIND_VAR } from './stepKinds'
import { reducedMotion, store, type Player } from './hooks'
import { KIND_TEXT } from './stepKinds'

type State = 'active' | 'visited' | 'flow' | 'off'

/** Availability settings shared by the canvas and the inspector. */
export interface ZoneState { failed: number | null; home: number; zl: ZoneLayout | null; hops: Hop[] | null }

// ---------- background nodes ----------
function BandNode({ data }: NodeProps) {
  const { tier, w, h } = data as { tier: Tier; w: number; h: number }
  return (
    <div className="band" style={{ width: w, height: h }}>
      <div className="band-head"><b>{TIER_INFO[tier].title}</b><span>{TIER_INFO[tier].blurb}</span></div>
    </div>
  )
}
function GroupNode({ data }: NodeProps) {
  const { label, kind, w, h } = data as { label: string; kind: string; w: number; h: number }
  return <div className={`group group-${kind}`} style={{ width: w, height: h }}><span>{kind} · {label}</span></div>
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
  editable?: boolean; flagged?: boolean; recordingFrom?: boolean; mark?: { count: number; severity: string }
}
const SIDES: [Side, Position][] = [['top', Position.Top], ['right', Position.Right], ['bottom', Position.Bottom], ['left', Position.Left]]

function ComponentNode({ data }: NodeProps) {
  const { node: n, cloud, state, selected, note, tag, failed, compact, editable, flagged, recordingFrom, mark } = data as NodeData
  const name = nameOf(n, cloud)
  const cls = [`node st-${state}`, selected && 'selected', failed && 'failed', compact && 'compact', editable && 'editable', flagged && 'flagged', recordingFrom && 'rec-from']
  return (
    <div className={cls.filter(Boolean).join(' ')}
      style={{ width: compact ? ZNODE_W : NODE_W }} title={compact ? name : undefined}>
      {note && <div className="node-note">{note}</div>}
      {tag && <span className={`node-tag tag-${tag.level ?? 'info'}`}>{tag.text}</span>}
      {mark && <span className={`node-mark sev-${mark.severity}`} title={`${mark.count} review finding${mark.count > 1 ? 's' : ''}`}>{mark.count}</span>}
      <NodeIcon node={n} cloud={cloud} size={compact ? 22 : 28} />
      <div className="node-text">
        <div className="node-name">{name}</div>
        <div className="node-sub">{name !== n.label ? n.label : kindInfo(n.kind).label}</div>
      </div>
      {n.replicas && <span className="node-rep">×{n.replicas}</span>}
      {SIDES.map(([s, p]) => <Handle key={`s-${s}`} id={`s-${s}`} type="source" position={p} isConnectable={!!editable} />)}
      {SIDES.map(([s, p]) => <Handle key={`t-${s}`} id={`t-${s}`} type="target" position={p} isConnectable={!!editable} />)}
    </div>
  )
}

// ---------- edges ----------
type EdgeData = {
  state: State; async?: boolean; picked?: boolean; kind?: StepKind; label?: string; note?: string
  packet?: { key: string; ms: number; reverse: boolean }
}
const edgeColor = (d: EdgeData) =>
  d.state === 'active' ? KIND_VAR[d.kind!] : d.state === 'visited' ? 'var(--edge-visited)' : d.state === 'flow' ? 'var(--edge-flow)' : 'var(--edge-off)'

function FlowEdge(p: EdgeProps) {
  const d = p.data as EdgeData
  const [path, lx, ly] = getBezierPath(p)
  const color = d.picked ? 'var(--accent)' : edgeColor(d)
  const dashed = d.state === 'active' ? d.kind === 'async' : d.async
  const label = d.state === 'active' ? d.label : d.note
  return (
    <>
      <BaseEdge id={p.id} path={path} markerEnd={p.markerEnd}
        interactionWidth={18}
        style={{ stroke: color, strokeWidth: d.state === 'active' || d.picked ? 3 : 1.6, strokeDasharray: dashed ? '6 5' : undefined }} />
      {d.packet && <Packet key={d.packet.key} path={path} ms={d.packet.ms} reverse={d.packet.reverse} color={color} />}
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

const marker = (d: EdgeData) => ({ type: MarkerType.ArrowClosed, color: edgeColor(d), width: 16, height: 16 })

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

export function BandCanvas({ design, flow, player, cloud, network, zonesView, zone, selected, onSelect, colorMode, edit }: {
  design: Design; flow: Flow | undefined; player: Player; cloud: Cloud; network: boolean; zonesView: boolean; zone: ZoneState
  selected: string | null; onSelect: (id: string | null) => void; colorMode: 'light' | 'dark'; edit?: EditProps
}) {
  const rf = useReactFlow()
  // Each side has overlapping source and target handles, and React Flow reverses a connection dragged from a
  // target handle. The component where the drag started is always the caller.
  const dragFrom = useRef<string | null>(null)
  const count = design.nodes.length
  useEffect(() => { if (edit) requestAnimationFrame(() => rf.fitView({ duration: 250, padding: { top: '96px', bottom: '24px', left: '24px', right: '24px' } })) },
    // refit the editor when components are added or removed
    [count]) // eslint-disable-line react-hooks/exhaustive-deps
  const net = network && !!design.network
  const zoned = net && zonesView && !!zone.zl
  const L = useMemo(() => layoutBands(design, { network: net }), [design, net])
  const { step, nonce, packetMs } = player

  // Camera follows the request: frame the two components of the current hop; zoom back out on reset.
  const [follow, setFollow] = useState(() => store.get('archstory.follow', true))
  const toggleFollow = () => setFollow(f => { store.set('archstory.follow', !f); return !f })
  const FRAME = { top: '110px', bottom: '150px', left: '80px', right: '80px' } as const
  const OVERVIEW = { top: '96px', bottom: '24px', left: '24px', right: '24px' } as const
  useEffect(() => {
    if (!follow || edit?.mode) return
    const duration = reducedMotion() ? 0 : 450
    const cur = flow?.steps[step]
    if (!cur) { rf.fitView({ duration, padding: OVERVIEW }); return }
    const ids = (zoned && zone.hops?.[step] ? [zone.hops[step].from, zone.hops[step].to] : [cur.from, cur.to])
      .filter((id): id is string => !!id)
    if (ids.length) rf.fitView({ nodes: [...new Set(ids)].map(id => ({ id })), duration, padding: FRAME, maxZoom: 1 })
  }, [step, nonce, follow, flow?.id, zoned]) // eslint-disable-line react-hooks/exhaustive-deps
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
          data: { label: zoneName(z.zone, cloud), failed: z.zone === failed, w: z.w, h: z.h } })),
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
              tag: i.failed ? { text: 'zone down', level: 'down' as const } : role,
              note: cur?.kind === 'local' && hop?.from === i.id ? cur.label : undefined } satisfies NodeData,
          }
        }),
      ]
      const edges: Edge[] = zl.edges.map(e => {
        const active = !!hop?.edge && hop.edge.id === e.id
        const data: EdgeData = {
          state: !flow ? 'visited' : active ? 'active' : seenE.has(e.id) ? 'visited' : flowE.has(e.id) ? 'flow' : 'off',
          async: e.async || e.replication, kind: cur?.kind,
          label: cur && `${cur.label}${hop?.cross ? ' · cross-zone' : ''}`,
          note: e.replication ? (e.async ? 'async replica' : 'sync standby') : undefined,
          packet: active ? { key: packetKey, ms: packetMs, reverse: hop!.reverse } : undefined,
        }
        const [sh, th] = zl.handles(e.from, e.to)
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
      if (!net) return undefined
      if (failed !== null) { const im = impactOf(design, n, failed, cloud); return im ? { text: im.tag, level: im.level } : undefined }
      const b = zoneBadge(design, n, cloud)
      return b ? { text: b, level: b.includes('only') ? 'down' : undefined } : undefined
    }

    const nodes: Node[] = [
      ...backdrop(design, cloud, L),
      ...L.groups.map(g => ({ id: `group:${g.id}`, type: 'boundary', position: { x: g.x, y: g.y }, ...fixed, zIndex: -1,
        data: { label: g.label, kind: g.kind, w: g.w, h: g.h } })),
      ...design.nodes.map(n => ({
        id: n.id, type: 'component', position: L.pos[n.id], draggable: false,
        data: { node: n, cloud, state: nodeState(n.id), selected: selected === n.id, tag: tagFor(n),
          editable: !!edit, flagged: edit?.flagged.has(n.id), recordingFrom: edit?.recordingFrom === n.id, mark: edit?.marks?.get(n.id),
          note: cur?.kind === 'local' && cur.from === n.id ? cur.label : undefined } satisfies NodeData,
      })),
    ]
    const edges: Edge[] = design.edges.map((e, i) => {
      const [sh, th] = L.handles(e.from, e.to)
      const active = hop?.index === i
      const data: EdgeData = {
        state: !flow ? 'visited' : active ? 'active' : seenEdges.has(i) ? 'visited' : flowEdges.has(i) ? 'flow' : 'off',
        async: e.async, kind: cur?.kind, label: cur?.label, picked: edit?.pickedEdge === edgeId(e),
        packet: active ? { key: packetKey, ms: packetMs, reverse: hop!.reverse } : undefined,
      }
      return { id: edgeId(e), source: e.from, target: e.to, sourceHandle: `s-${sh}`, targetHandle: `t-${th}`, type: 'flow', data, markerEnd: marker(data) }
    })
    return { nodes, edges }
  }, [L, zoned, zone, design, flow, step, nonce, packetMs, cloud, selected, net, failed, edit])

  return (
    <ReactFlow key={`${design.id}:${net}:${zoned}`} className={edit?.mode === 'connect' ? 'connect-mode' : undefined} nodes={nodes} edges={edges} nodeTypes={nodeTypes} edgeTypes={edgeTypes}
      nodesDraggable={false} nodesConnectable={!!edit} elementsSelectable={false} colorMode={colorMode}
      connectionMode={ConnectionMode.Loose}
      onConnectStart={(_, h) => { dragFrom.current = h.nodeId }}
      onConnect={c => {
        const from = dragFrom.current ?? c.source
        edit?.onConnect(from, c.source === from ? c.target : c.source)
        dragFrom.current = null
      }}
      onEdgeClick={(_, e) => edit?.onEdgeClick(e.source, e.target)}
      onNodeClick={(_, n) => onSelect(n.type === 'component' ? (n.data as NodeData).node.id : null)} onPaneClick={() => onSelect(null)}
      fitView fitViewOptions={{ padding: { top: '96px', bottom: '24px', left: '24px', right: '24px' } }}
      minZoom={0.2} maxZoom={1.3} proOptions={{ hideAttribution: true }}>
      <Background gap={24} color="var(--grid)" />
      <Controls showInteractive={false} position="top-right">
        <ControlButton onClick={toggleFollow} title={follow ? 'Camera follows the request (on)' : 'Camera follows the request (off)'}
          className={follow ? 'follow-on' : ''} aria-pressed={follow}>◎</ControlButton>
      </Controls>
      {flow?.steps[step] && <Caption design={design} step={flow.steps[step]} index={step} total={flow.steps.length} cloud={cloud}
        cross={zoned && !!zone.hops?.[step]?.cross} />}
    </ReactFlow>
  )
}

/** Short on-canvas caption for the current hop, so the explanation sits next to the action. */
function Caption({ design, step, index, total, cloud, cross }: {
  design: Design; step: Flow['steps'][number]; index: number; total: number; cloud: Cloud; cross: boolean
}) {
  const name = (id: string) => { const n = design.nodes.find(x => x.id === id); return n ? nameOf(n, cloud) : id }
  return (
    <div className="caption" role="status" aria-live="polite">
      <div className="caption-head">
        <span className="pill" style={{ color: KIND_VAR[step.kind], borderColor: KIND_VAR[step.kind] }}>{KIND_TEXT[step.kind]}</span>
        <span className="muted">{index + 1}/{total}</span>
        <b>{name(step.from)}{step.from !== step.to && <> → {name(step.to)}</>}</b>
        <span className="mono" style={{ color: KIND_VAR[step.kind] }}>{step.label}</span>
        {cross && <span className="muted">· cross-zone</span>}
      </div>
      {step.detail && <p>{step.detail}</p>}
    </div>
  )
}
