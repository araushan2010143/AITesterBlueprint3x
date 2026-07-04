import { motion, AnimatePresence } from 'framer-motion'
import { BookOpen, Zap, Clock, Cpu } from 'lucide-react'
import { useRAGStore } from '../store/ragStore'

function ConfidenceBar({ score }: { score: number }) {
  const pct = Math.round(score * 100)
  const color = score > 0.8 ? 'bg-emerald-500' : score > 0.6 ? 'bg-yellow-500' : 'bg-red-400'
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 flex-1 rounded-full bg-[var(--surface-0)] overflow-hidden">
        <motion.div
          className={`h-full rounded-full ${color}`}
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
        />
      </div>
      <span className="w-10 text-right text-[10px] font-mono text-[var(--text-muted)]">{pct}%</span>
    </div>
  )
}

export default function AnswerPanel() {
  const {
    queryResult, isQuerying,
    streamingAnswer, streamingSources, streamingStage
  } = useRAGStore()

  // Determine what to show: streaming in progress or final result
  const showStreaming = isQuerying && streamingAnswer.length > 0
  const sources = isQuerying ? streamingSources : (queryResult?.sources ?? [])
  const avgScore = sources.length
    ? sources.reduce((a, b) => a + b.score, 0) / sources.length
    : 0

  const STAGE_STATUS: Record<string, string> = {
    embedding:  '🔢 Embedding query via Nomic…',
    retrieving: '🔍 Searching ChromaDB for top chunks…',
    generating: '🤖 Groq is streaming the answer…',
  }

  return (
    <div className="flex flex-col gap-3">
      <AnimatePresence mode="wait">

        {/* Streaming in progress — show tokens as they arrive */}
        {isQuerying && (
          <motion.div key="streaming" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            {/* Stage indicator */}
            {!streamingAnswer && (
              <div className="card p-4 flex items-center gap-3 mb-3">
                <div className="flex gap-1">
                  {[0,1,2].map((i) => (
                    <motion.span
                      key={i}
                      className="h-2 w-2 rounded-full bg-blue-400"
                      animate={{ y: [0, -6, 0] }}
                      transition={{ repeat: Infinity, duration: 0.8, delay: i * 0.15 }}
                    />
                  ))}
                </div>
                <span className="text-sm text-[var(--text-secondary)]">
                  {STAGE_STATUS[streamingStage] ?? '⏳ Processing…'}
                </span>
              </div>
            )}

            {/* Streaming answer */}
            {streamingAnswer && (
              <div className="card p-4 mb-3">
                <div className="flex items-center gap-1.5 mb-2">
                  <Zap size={13} className="text-blue-400" />
                  <span className="text-xs font-semibold text-blue-400">Streaming…</span>
                  <span className="ml-auto text-[10px] text-[var(--text-muted)]">
                    {STAGE_STATUS[streamingStage] ?? ''}
                  </span>
                </div>
                <p className="text-sm leading-relaxed text-[var(--text-primary)] whitespace-pre-wrap">
                  {streamingAnswer}
                  <motion.span
                    className="inline-block w-0.5 h-4 bg-blue-400 ml-0.5 align-middle"
                    animate={{ opacity: [1, 0] }}
                    transition={{ repeat: Infinity, duration: 0.6 }}
                  />
                </p>
              </div>
            )}

            {/* Retrieved sources (shown as soon as retrieval completes) */}
            {streamingSources.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-3">
                {streamingSources.map((src, i) => (
                  <div key={i} className="flex items-center gap-1.5 rounded-full border border-[var(--border-color)] bg-[var(--surface-2)] px-2.5 py-1">
                    <BookOpen size={10} className="text-purple-400" />
                    <span className="text-[11px] text-[var(--text-secondary)]">Page {src.metadata.page}</span>
                    <span className="text-[10px] font-mono text-blue-400">{(src.score * 100).toFixed(0)}%</span>
                  </div>
                ))}
              </div>
            )}
          </motion.div>
        )}

        {/* Final result */}
        {queryResult && !isQuerying && (
          <motion.div
            key="result"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25 }}
            className="flex flex-col gap-3"
          >
            {/* Answer */}
            <div className="card p-4">
              <div className="flex items-center justify-between mb-3">
                <span className="flex items-center gap-1.5 text-xs font-semibold text-emerald-400">
                  <Zap size={13} /> Answer
                </span>
                <span className="text-[10px] text-[var(--text-muted)]">
                  {queryResult.metrics.llm_response_time_ms.toFixed(0)}ms LLM
                </span>
              </div>
              <p className="text-sm leading-relaxed text-[var(--text-primary)] whitespace-pre-wrap">
                {queryResult.answer}
              </p>
            </div>

            {/* Confidence */}
            <div className="card p-3">
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                Retrieval Confidence
              </p>
              <ConfidenceBar score={avgScore} />
              <p className="mt-1 text-[10px] text-[var(--text-muted)]">
                Avg cosine similarity across {sources.length} chunks
              </p>
            </div>

            {/* Source pills */}
            <div>
              <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">Sources</p>
              <div className="flex flex-wrap gap-1.5">
                {sources.map((src, i) => (
                  <div key={i} className="flex items-center gap-1.5 rounded-full border border-[var(--border-color)] bg-[var(--surface-2)] px-2.5 py-1">
                    <BookOpen size={10} className="text-purple-400" />
                    <span className="text-[11px] text-[var(--text-secondary)]">Page {src.metadata.page}</span>
                    <span className="text-[10px] font-mono text-blue-400">{(src.score * 100).toFixed(0)}%</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Latency stats */}
            <div className="grid grid-cols-3 gap-2">
              {[
                { icon: Clock, label: 'Embed', value: `${queryResult.metrics.query_latency_ms.toFixed(0)}ms` },
                { icon: Clock, label: 'Search', value: `${queryResult.metrics.search_latency_ms.toFixed(0)}ms` },
                { icon: Cpu,   label: 'LLM',    value: `${queryResult.metrics.llm_response_time_ms.toFixed(0)}ms` },
              ].map(({ icon: Icon, label, value }) => (
                <div key={label} className="card p-2 text-center">
                  <Icon size={12} className="mx-auto mb-1 text-blue-400" />
                  <p className="text-[10px] text-[var(--text-muted)]">{label}</p>
                  <p className="text-xs font-bold text-[var(--text-primary)]">{value}</p>
                </div>
              ))}
            </div>
          </motion.div>
        )}

        {/* Empty state */}
        {!queryResult && !isQuerying && (
          <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="card p-8 text-center">
            <span className="text-3xl">💬</span>
            <p className="mt-2 text-sm text-[var(--text-muted)]">Ask a question to see the answer here.</p>
          </motion.div>
        )}

      </AnimatePresence>
    </div>
  )
}
