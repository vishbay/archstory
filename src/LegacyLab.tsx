import { useCallback, useMemo, useRef, useState } from 'react'
import {
  ReactFlow, Background, Controls, ConnectionMode, MarkerType,
  addEdge, useNodesState, useEdgesState, useReactFlow, ReactFlowProvider,
  type Connection, type Edge, type Node,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import './index.css'
import { ComponentNode, type CompData } from './ComponentNode'
import { CATALOG } from './engine/catalog'
import { validate } from './engine/validate'
import { urlShortener } from './problems/urlShortener'
import type { Diagram, Kind } from './engine/types'

const problem = urlShortener
const nodeTypes = { comp: ComponentNode }
const edgeDefaults = { markerEnd: { type: MarkerType.ArrowClosed }, style: { strokeWidth: 2 } }

type Report = ReturnType<typeof validate>

function Lab() {
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([])
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([])
  const [report, setReport] = useState<Report | null>(null)
  const [showRef, setShowRef] = useState(false)
  const counter = useRef(0)
  const wrapper = useRef<HTMLDivElement>(null)
  const { screenToFlowPosition } = useReactFlow()

  const diagram = useMemo<Diagram>(() => ({
    nodes: nodes.map(n => ({ id: n.id, kind: (n.data as CompData).kind })),
    edges: edges.map(e => ({ id: e.id, source: e.source, target: e.target })),
  }), [nodes, edges])

  const addNode = useCallback((kind: Kind, pos?: { x: number; y: number }) => {
    const i = counter.current++
    setNodes(ns => [...ns, {
      id: `n${Date.now()}_${i}`, type: 'comp', data: { kind } as CompData,
      position: pos ?? { x: 60 + (i % 4) * 170, y: 40 + Math.floor(i / 4) * 110 },
    }])
    setReport(null)
  }, [setNodes])

  const onConnect = useCallback((c: Connection) => {
    setEdges(es => addEdge({ ...c, ...edgeDefaults }, es)); setReport(null)
  }, [setEdges])

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault()
    const kind = e.dataTransfer.getData('application/x-kind') as Kind
    if (kind) addNode(kind, screenToFlowPosition({ x: e.clientX - 55, y: e.clientY - 20 }))
  }

  const runValidate = () => {
    const r = validate(diagram, problem)
    setReport(r)
    const bad = new Set(r.results.filter(x => !x.passed && x.rule.severity === 'required').flatMap(x => x.nodeIds))
    setNodes(ns => ns.map(n => ({
      ...n, data: { ...(n.data as CompData), status: bad.has(n.id) ? 'fail' : r.allRequiredPass ? 'ok' : null },
    })))
  }

  const loadReference = () => {
    const ref = problem.reference.diagram
    const cols: Record<Kind, number> = {
      client: 0, cdn: 0, rate_limiter: 1, load_balancer: 1, api_server: 2, key_gen: 3,
      cache: 3, queue: 3, database: 4, worker: 4, db_replica: 5, object_store: 5,
    }
    const rows: Record<number, number> = {}
    setNodes(ref.nodes.map(n => {
      const col = cols[n.kind]; const row = rows[col] = (rows[col] ?? -1) + 1
      return { id: n.id, type: 'comp', data: { kind: n.kind } as CompData, position: { x: 30 + col * 190, y: 30 + row * 110 } }
    }))
    setEdges(ref.edges.map(e => ({ ...e, ...edgeDefaults })))
    setReport(null); setShowRef(true)
  }

  const clear = () => { setNodes([]); setEdges([]); setReport(null); setShowRef(false) }

  return (
    <div className="app">
      <aside className="left">
        <h2>{problem.title}</h2>
        <p className="prompt">{problem.prompt}</p>
        <h3>Requirements</h3>
        <ul className="reqs">
          {problem.requirements.map(r => <li key={r.label}><b>{r.label}</b> {r.detail}</li>)}
        </ul>
        <h3>Components <small>(drag or click)</small></h3>
        <div className="palette">
          {problem.palette.map(k => (
            <div key={k} className="chip" draggable style={{ borderColor: CATALOG[k].color }}
              onDragStart={e => e.dataTransfer.setData('application/x-kind', k)}
              onClick={() => addNode(k)}>
              {CATALOG[k].icon} {CATALOG[k].label}
            </div>
          ))}
        </div>
      </aside>

      <main ref={wrapper} onDrop={onDrop} onDragOver={e => e.preventDefault()}>
        <ReactFlow nodes={nodes} edges={edges} nodeTypes={nodeTypes}
          onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} onConnect={onConnect}
          connectionMode={ConnectionMode.Loose} deleteKeyCode={['Backspace', 'Delete']}
          colorMode="dark" fitView>
          <Background gap={24} />
          <Controls />
        </ReactFlow>
        <div className="toolbar">
          <button className="primary" onClick={runValidate}>Validate</button>
          <button onClick={loadReference}>Show reference</button>
          <button onClick={clear}>Clear</button>
        </div>
        {nodes.length === 0 && <div className="empty">Drag components here, then connect them by dragging from one node's edge to another. Delete removes the selection.</div>}
      </main>

      <aside className="right">
        <h3>Checklist</h3>
        {!report && <p className="muted">Build your design, then press Validate.</p>}
        {report && (
          <>
            <div className={`score ${report.allRequiredPass ? 'good' : ''}`}>
              {report.allRequiredPass ? '✅ ' : ''}{report.requiredPassed}/{report.requiredTotal} required · {report.bonusPassed}/{report.bonusTotal} bonus
            </div>
            <ul className="results">
              {report.results.map(r => (
                <li key={r.rule.id} className={r.passed ? 'pass' : r.rule.severity === 'bonus' ? 'bonus' : 'fail'}>
                  <div className="rtitle">{r.passed ? '✓' : r.rule.severity === 'bonus' ? '○' : '✗'} {r.rule.title}{r.rule.severity === 'bonus' && <em> bonus</em>}</div>
                  <div className="rbody">{r.passed ? r.rule.why : r.rule.hint}</div>
                </li>
              ))}
            </ul>
          </>
        )}
        {showRef && (
          <>
            <h3>Reference notes</h3>
            <ul className="notes">
              {problem.reference.notes.map(n => <li key={n.kind}><b>{CATALOG[n.kind].icon} {CATALOG[n.kind].label}:</b> {n.note}</li>)}
            </ul>
          </>
        )}
      </aside>
    </div>
  )
}

export default function App() {
  return <ReactFlowProvider><Lab /></ReactFlowProvider>
}
