import { motion } from 'framer-motion'
import { FileText, Cpu, Search, Zap, RefreshCw } from 'lucide-react'
import { useRAGStore } from '../store/ragStore'
import { useMetrics } from '../hooks/useMetrics'

function Stat({ label, value, unit, color = 'text-blue-400' }: { label: string; value: string | number; unit?: string; color?: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-[10px] text-[var(--text-muted)] truncate">{label}</span>
      <span className={`text-sm font-bold ${color} leading-tight`}>
        {value}
        {unit && <span className="ml-0.5 text-[10px] font-normal text-[var(--text-muted)]">{unit}</span>}
      </span>
    </div>
  )
}

function MetricCard({ title, icon: Icon, color, children }: {
  title: string; icon: typeof FileText; color: string; children: React.ReactNode
}) {
  return (
    <div className="card p-3">
      <div className="flex items-center gap-2 mb-2.5 pb-2 border-b border-[var(--border-color)]">
        <Icon size={13} className={color} />
        <span className="text-xs font-semibold text-[var(--text-primary)]">{title}</span>
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-2">
        {children}
      </div>
    </div>
  )
}

export default function MetricsDashboard() {
  const { metrics } = useRAGStore()
  const { refetch, isFetching } = useMetrics()

  if (!metrics) {
    return (
      <div className="card mx-4 mb-4 p-4 text-center">
        <p className="text-xs text-[var(--text-muted)]">Metrics available after indexing.</p>
      </div>
    )
  }

  const { document_metrics: dm, embedding_metrics: em, retrieval_metrics: rm, llm_metrics: lm } = metrics

  return (
    <div className="card mx-4 mb-4 overflow-hidden">
      <div className="flex items-center justify-between border-b border-[var(--border-color)] px-4 py-2.5">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">RAG Metrics Dashboard</h3>
        <button
          onClick={() => refetch()}
          className="flex items-center gap-1 text-[10px] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition"
        >
          <RefreshCw size={11} className={isFetching ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3 p-3 md:grid-cols-4">
        {/* Document */}
        <MetricCard title="Document" icon={FileText} color="text-purple-400">
          <Stat label="Documents" value={dm.total_documents} color="text-purple-400" />
          <Stat label="Pages" value={dm.total_pages} color="text-purple-400" />
          <Stat label="Chunks" value={dm.total_chunks} color="text-purple-400" />
          <Stat label="Avg chunk" value={dm.avg_chunk_size} unit="chars" color="text-purple-400" />
        </MetricCard>

        {/* Embedding */}
        <MetricCard title="Embedding" icon={Cpu} color="text-blue-400">
          <Stat label="Model" value={em.model || 'nomic-embed-text'} color="text-blue-400" />
          <Stat label="Dimension" value={em.dimension || 768} color="text-blue-400" />
          <Stat label="Vectors" value={em.total_vectors} color="text-blue-400" />
          <Stat label="Index time" value={em.time_taken_seconds.toFixed(1)} unit="s" color="text-blue-400" />
        </MetricCard>

        {/* Retrieval */}
        <MetricCard title="Retrieval" icon={Search} color="text-emerald-400">
          <Stat label="Queries" value={rm.total_queries} color="text-emerald-400" />
          <Stat label="Top-K" value={rm.top_k} color="text-emerald-400" />
          <Stat label="Avg latency" value={rm.avg_query_latency_ms.toFixed(0)} unit="ms" color="text-emerald-400" />
          <Stat label="Avg similarity" value={(rm.avg_similarity_score * 100).toFixed(1)} unit="%" color="text-emerald-400" />
        </MetricCard>

        {/* LLM */}
        <MetricCard title="LLM" icon={Zap} color="text-orange-400">
          <Stat label="Requests" value={lm.total_requests} color="text-orange-400" />
          <Stat label="Avg resp" value={lm.avg_response_time_ms.toFixed(0)} unit="ms" color="text-orange-400" />
          <Stat label="Avg prompt" value={lm.avg_prompt_tokens.toFixed(0)} unit="tok" color="text-orange-400" />
          <Stat label="Avg output" value={lm.avg_completion_tokens.toFixed(0)} unit="tok" color="text-orange-400" />
        </MetricCard>
      </div>
    </div>
  )
}
