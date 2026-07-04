import { useCallback } from 'react'
import ReactFlow, {
  Node, Edge, Background, Controls,
  useNodesState, useEdgesState, BackgroundVariant,
  Position, Handle
} from 'reactflow'
import 'reactflow/dist/style.css'
import { motion } from 'framer-motion'
import { useRAGStore } from '../store/ragStore'
import type { PipelineStage } from '../types'

// ── Custom node ───────────────────────────────────────────────────────

function PipelineNode({ data }: { data: PipelineStage & { isFirst: boolean; isLast: boolean } }) {
  const statusClass =
    data.status === 'processing' ? 'node-active' :
    data.status === 'complete'   ? 'node-done'   :
    data.status === 'error'      ? 'node-error'  : 'node-idle'

  const bgColor =
    data.status === 'processing' ? 'bg-blue-950/80 border-blue-500' :
    data.status === 'complete'   ? 'bg-emerald-950/80 border-emerald-500' :
    data.status === 'error'      ? 'bg-red-950/80 border-red-500' : 'bg-[var(--surface-2)] border-[var(--border-color)]'

  const textColor =
    data.status === 'processing' ? 'text-blue-300' :
    data.status === 'complete'   ? 'text-emerald-300' :
    data.status === 'error'      ? 'text-red-300' : 'text-[var(--text-secondary)]'

  return (
    <motion.div
      className={`relative flex flex-col items-center justify-center rounded-xl border-2 px-4 py-3 w-28 ${bgColor} ${statusClass} transition-all duration-500`}
      animate={data.status === 'processing' ? { scale: [1, 1.03, 1] } : { scale: 1 }}
      transition={{ repeat: data.status === 'processing' ? Infinity : 0, duration: 1.5 }}
    >
      {!data.isFirst && <Handle type="target" position={Position.Left} className="!bg-transparent !border-0" />}

      <span className="text-2xl mb-1">{data.icon}</span>
      <span className="text-xs font-bold text-[var(--text-primary)]">{data.label}</span>
      <span className={`text-[10px] ${textColor} text-center leading-tight mt-0.5`}>{data.sublabel}</span>

      {data.status === 'processing' && (
        <span className="absolute -top-1 -right-1 flex h-3 w-3">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-3 w-3 bg-blue-500" />
        </span>
      )}
      {data.status === 'complete' && (
        <span className="absolute -top-1 -right-1 flex h-3 w-3 rounded-full bg-emerald-500 items-center justify-center text-[8px] text-white">✓</span>
      )}

      {!data.isLast && <Handle type="source" position={Position.Right} className="!bg-transparent !border-0" />}
    </motion.div>
  )
}

const nodeTypes = { pipeline: PipelineNode }

// ── Layout helpers ────────────────────────────────────────────────────

function buildNodes(stages: PipelineStage[]): Node[] {
  return stages.map((stage, i) => ({
    id: stage.id,
    type: 'pipeline',
    position: { x: i * 160, y: 20 },
    data: { ...stage, isFirst: i === 0, isLast: i === stages.length - 1 },
    draggable: false,
    selectable: false
  }))
}

function buildEdges(stages: PipelineStage[]): Edge[] {
  return stages.slice(0, -1).map((stage, i) => {
    const nextStage = stages[i + 1]
    const isActive = stage.status === 'complete' || stage.status === 'processing'
    return {
      id: `e-${stage.id}-${nextStage.id}`,
      source: stage.id,
      target: nextStage.id,
      animated: isActive,
      style: { stroke: isActive ? '#3b82f6' : '#334155', strokeWidth: 2 }
    }
  })
}

export default function PipelineFlow() {
  const pipelineStages = useRAGStore((s) => s.pipelineStages)
  const [nodes, , onNodesChange] = useNodesState(buildNodes(pipelineStages))
  const [edges, , onEdgesChange] = useEdgesState(buildEdges(pipelineStages))

  // Update nodes when stages change
  const currentNodes = buildNodes(pipelineStages)
  const currentEdges = buildEdges(pipelineStages)

  return (
    <div className="card mx-4 mt-4 overflow-hidden" style={{ height: 148 }}>
      <div className="flex items-center gap-2 px-4 pt-3 pb-1">
        <span className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
          Pipeline
        </span>
        <div className="flex-1 border-t border-[var(--border-color)]" />
        <span className="text-[10px] text-[var(--text-muted)]">
          PDF → Chunker → Embedder → ChromaDB → Retriever → Groq → Answer
        </span>
      </div>
      <ReactFlow
        nodes={currentNodes}
        edges={currentEdges}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        panOnScroll={false}
        zoomOnScroll={false}
        panOnDrag={false}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        proOptions={{ hideAttribution: true }}
      >
        <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#1e293b" />
      </ReactFlow>
    </div>
  )
}
