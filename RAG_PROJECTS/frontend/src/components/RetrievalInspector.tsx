import { motion, AnimatePresence } from 'framer-motion'
import { FileSearch, BookOpen } from 'lucide-react'
import { useRAGStore } from '../store/ragStore'

function ScoreBar({ score }: { score: number }) {
  const pct = Math.round(score * 100)
  const color = pct >= 80 ? '#10b981' : pct >= 60 ? '#f59e0b' : '#ef4444'
  return (
    <div className="flex items-center gap-2 mt-1.5">
      <div className="flex-1 h-1 rounded-full bg-[var(--surface-0)] overflow-hidden">
        <motion.div
          style={{ backgroundColor: color }}
          className="h-full rounded-full"
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
        />
      </div>
      <span className="w-10 text-right text-[10px] font-mono" style={{ color }}>
        {score.toFixed(3)}
      </span>
    </div>
  )
}

export default function RetrievalInspector() {
  const { queryResult, streamingSources, isQuerying } = useRAGStore()
  const sources = isQuerying && streamingSources.length > 0
    ? streamingSources
    : queryResult?.sources ?? []
  const effectiveResult = queryResult ?? (sources.length > 0 ? { sources, metrics: { search_latency_ms: 0 } } : null)

  if (!effectiveResult) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
        <FileSearch size={30} className="text-[var(--text-muted)]" />
        <p className="text-xs text-[var(--text-muted)]">Retrieved chunks appear here after a query.</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-[var(--text-muted)]">
          Top {sources.length} Retrieved Chunks
        </p>
        <span className="text-[10px] text-[var(--text-muted)]">
          Avg score: {(sources.reduce((a, b) => a + b.score, 0) / sources.length).toFixed(3)}
        </span>
      </div>

      <AnimatePresence>
        {sources.map((src, i) => (
          <motion.div
            key={`${src.chunk_id}-${i}`}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.08 }}
            className="card p-3"
          >
            {/* Header */}
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className="flex h-5 w-5 items-center justify-center rounded bg-blue-900/50 text-[10px] font-bold text-blue-400">
                  {i + 1}
                </span>
                <span className="text-xs font-mono text-[var(--text-secondary)]">
                  chunk_{src.chunk_id}
                </span>
              </div>
              <div className="flex items-center gap-3">
                <span className="flex items-center gap-1 text-[10px] text-purple-400">
                  <BookOpen size={10} /> p.{src.metadata.page}
                </span>
                <span className="text-[10px] text-[var(--text-muted)]">{src.metadata.filename}</span>
              </div>
            </div>

            {/* Score bar */}
            <div>
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-[var(--text-muted)]">Similarity score</span>
              </div>
              <ScoreBar score={src.score} />
            </div>

            {/* Text preview */}
            <p className="mt-2 text-[11px] leading-relaxed text-[var(--text-secondary)] line-clamp-4">
              {src.text}
            </p>

            {/* "Why matched" hint */}
            <div className="mt-2 rounded-md border border-blue-900/40 bg-blue-950/20 px-2.5 py-1.5">
              <p className="text-[10px] text-blue-400">
                <span className="font-semibold">Why retrieved:</span>{' '}
                Cosine similarity {(src.score * 100).toFixed(1)}% — semantically closest to your query among all {sources.length > 0 ? 'indexed' : ''} chunks.
              </p>
            </div>
          </motion.div>
        ))}
      </AnimatePresence>

      {/* Metrics summary */}
      <div className="card p-3 grid grid-cols-2 gap-2 text-center">
        <div>
          <p className="text-[10px] text-[var(--text-muted)]">Search latency</p>
          <p className="text-sm font-bold text-blue-400">{(effectiveResult.metrics?.search_latency_ms ?? 0).toFixed(1)} ms</p>
        </div>
        <div>
          <p className="text-[10px] text-[var(--text-muted)]">Top-K</p>
          <p className="text-sm font-bold text-blue-400">{sources.length}</p>
        </div>
      </div>
    </div>
  )
}
