// PROTOTYPE. Variants A (tier columns) and B (tier bands) share this canvas; only the layout differs.
import { useMemo } from 'react'
import {
  ReactFlow, Background, Controls, BaseEdge, EdgeLabelRenderer, Handle, MarkerType, Position, getBezierPath,
  type Edge, type EdgeProps, type Node, type NodeProps,
} from '@xyflow/react'
import { KIND_COLOR, TIERS, resolveEdge, type Cloud, type Design, type Flow, type StepKind, type XNode } from './data'
import { Packet } from './Packet'

type Orientation = 'cols' | 'rows'
type State = 'active' | 'visited' | 'flow' | 'off'
const NODE_W = 184, NODE_H = 58
type Side = 'top' | 'right' | 'bottom' | 'left'

function layout(d: Design, o: Orientation) {
  const byTier = TIERS.map(t => d.nodes.filter(n => n.tier === t.id))
  const maxN = Math.max(...byTier.map(l => l.length))
  const pos: Record<string, { x: number; y: number }> = {}
  const lanes: Node[] = []
  if (o === 'cols') {
    const COL = 236, GAP = 20, HEAD = 56, ROW = 104
    const h = HEAD + maxN * ROW + 12
    byTier.forEach((list, i) => {
      const x = i * COL
      lanes.push({ id: `lane-${TIERS[i].id}`, type: 'lane', position: { x, y: 0 }, draggable: false, selectable: false,
        data: { tier: TIERS[i], w: COL - GAP, h, o } })
      const off = (maxN - list.length) * ROW / 2
      list.forEach((n, r) => { pos[n.id] = { x: x + (COL - GAP - NODE_W) / 2, y: HEAD + off + r * ROW + (ROW - NODE_H) / 2 } })
    })
  } else {
    const ROWH = 116, GAP = 14, LABEL = 170, CELL = 224
    const w = LABEL + maxN * CELL + 12
    byTier.forEach((list, i) => {
      const y = i * ROWH
      lanes.push({ id: `lane-${TIERS[i].id}`, type: 'lane', position: { x: 0, y }, draggable: false, selectable: false,
        data: { tier: TIERS[i], w, h: ROWH - GAP, o } })
      const off = (maxN - list.length) * CELL / 2
      list.forEach((n, c) => { pos[n.id] = { x: LABEL + off + c * CELL + (CELL - NODE_W) / 2, y: y + (ROWH - GAP - NODE_H) / 2 } })
    })
  }
  const tierIdx = Object.fromEntries(TIERS.map((t, i) => [t.id, i]))
  const tierOf = Object.fromEntries(d.nodes.map(n => [n.id, tierIdx[n.tier]]))
  const handles = (s: string, t: string): [Side, Side] => {
    const dt = tierOf[t] - tierOf[s]
    if (o === 'cols') {
      if (dt !== 0) return dt > 0 ? ['right', 'left'] : ['left', 'right']
      return pos[t].y > pos[s].y ? ['bottom', 'top'] : ['top', 'bottom']
    }
    if (dt !== 0) return dt > 0 ? ['bottom', 'top'] : ['top', 'bottom']
    return pos[t].x > pos[s].x ? ['right', 'left'] : ['left', 'right']
  }
  return { pos, lanes, handles }
}

function LaneNode({ data }: NodeProps) {
  const { tier, w, h, o } = data as { tier: typeof TIERS[number]; w: number; h: number; o: Orientation }
  return (
    <div className={`xp-lane xp-lane-${o}`} style={{ width: w, height: h }}>
      <div className="xp-lane-head"><b>{tier.title}</b><span>{tier.blurb}</span></div>
    </div>
  )
}

type NodeData = { node: XNode; cloud: Cloud; state: State; note?: string }
const SIDES: [Side, Position][] = [['top', Position.Top], ['right', Position.Right], ['bottom', Position.Bottom], ['left', Position.Left]]

function ServiceNode({ data }: NodeProps) {
  const { node: n, cloud, state, note } = data as NodeData
  return (
    <div className={`xp-node xp-${state}`} style={{ borderColor: n.color, width: NODE_W }}>
      {note && <div className="xp-node-note">{note}</div>}
      <span className="xp-node-icon">{n.icon}</span>
      <div className="xp-node-text">
        <div className="xp-node-name">{n.names[cloud]}</div>
        <div className="xp-node-sub">{cloud === 'neutral' ? n.role : n.names.neutral}</div>
      </div>
      {n.replicas && <span className="xp-node-rep">×{n.replicas}</span>}
      {SIDES.map(([s, p]) => <Handle key={`s-${s}`} id={`s-${s}`} type="source" position={p} isConnectable={false} />)}
      {SIDES.map(([s, p]) => <Handle key={`t-${s}`} id={`t-${s}`} type="target" position={p} isConnectable={false} />)}
    </div>
  )
}

type EdgeData = { state: State; kind?: StepKind; label?: string; packet?: { key: string; ms: number; reverse: boolean } }
const edgeColor = (d: EdgeData) =>
  d.state === 'active' ? KIND_COLOR[d.kind!] : d.state === 'visited' ? '#64748b' : d.state === 'flow' ? '#334155' : '#1a2238'

function PacketEdge(p: EdgeProps) {
  const d = p.data as EdgeData
  const [path, lx, ly] = getBezierPath(p)
  const color = edgeColor(d)
  return (
    <>
      <BaseEdge id={p.id} path={path} markerEnd={p.markerEnd}
        style={{ stroke: color, strokeWidth: d.state === 'active' ? 3 : 1.6, strokeDasharray: d.state === 'active' && d.kind === 'async' ? '6 5' : undefined }} />
      {d.packet && <Packet key={d.packet.key} path={path} ms={d.packet.ms} reverse={d.packet.reverse} color={color} />}
      {d.state === 'active' && d.label && (
        <EdgeLabelRenderer>
          <div className="xp-edge-label" style={{ transform: `translate(-50%, -50%) translate(${lx}px, ${ly}px)`, borderColor: color }}>{d.label}</div>
        </EdgeLabelRenderer>
      )}
    </>
  )
}

const nodeTypes = { lane: LaneNode, svc: ServiceNode }
const edgeTypes = { packet: PacketEdge }

export function TieredCanvas({ design, flow, step, cloud, orientation, packetMs, nonce }: {
  design: Design; flow: Flow; step: number; cloud: Cloud; orientation: Orientation; packetMs: number; nonce: number
}) {
  const L = useMemo(() => layout(design, orientation), [design, orientation])

  const { nodes, edges } = useMemo(() => {
    const cur = flow.steps[step]
    const inFlow = new Set(flow.steps.flatMap(s => [s.from, s.to]))
    const seen = new Set(flow.steps.slice(0, step + 1).flatMap(s => [s.from, s.to]))
    const flowEdges = new Set(flow.steps.map(s => resolveEdge(design, s)?.edge.id))
    const seenEdges = new Set(flow.steps.slice(0, step + 1).map(s => resolveEdge(design, s)?.edge.id))
    const hop = cur && resolveEdge(design, cur)

    const nodeState = (id: string): State =>
      cur && (cur.from === id || cur.to === id) ? 'active' : seen.has(id) ? 'visited' : inFlow.has(id) ? 'flow' : 'off'

    const nodes: Node[] = [
      ...L.lanes,
      ...design.nodes.map(n => ({
        id: n.id, type: 'svc', position: L.pos[n.id], draggable: false,
        data: { node: n, cloud, state: nodeState(n.id), note: cur?.kind === 'local' && cur.from === n.id ? cur.label : undefined } satisfies NodeData,
      })),
    ]
    const edges: Edge[] = design.edges.map(e => {
      const [sh, th] = L.handles(e.source, e.target)
      const active = hop?.edge.id === e.id
      const data: EdgeData = {
        state: active ? 'active' : seenEdges.has(e.id) ? 'visited' : flowEdges.has(e.id) ? 'flow' : 'off',
        kind: cur?.kind, label: cur?.label,
        packet: active ? { key: `${flow.id}-${step}-${nonce}`, ms: packetMs, reverse: hop!.reverse } : undefined,
      }
      return {
        id: e.id, source: e.source, target: e.target, sourceHandle: `s-${sh}`, targetHandle: `t-${th}`, type: 'packet', data,
        markerEnd: { type: MarkerType.ArrowClosed, color: edgeColor(data), width: 16, height: 16 },
      }
    })
    return { nodes, edges }
  }, [L, design, flow, step, cloud, packetMs, nonce])

  return (
    <ReactFlow nodes={nodes} edges={edges} nodeTypes={nodeTypes} edgeTypes={edgeTypes}
      nodesDraggable={false} nodesConnectable={false} elementsSelectable={false}
      colorMode="dark" fitView fitViewOptions={{ padding: { top: '120px', bottom: '70px', left: '24px', right: '24px' } }} minZoom={0.3} proOptions={{ hideAttribution: true }}>
      <Background gap={24} color="#1a2238" />
      <Controls showInteractive={false} />
    </ReactFlow>
  )
}
