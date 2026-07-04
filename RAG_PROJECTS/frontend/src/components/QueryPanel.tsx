import { useState, useRef } from 'react'
import { Send, Loader2, Clock, ChevronDown, ChevronUp } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { useRAGStore } from '../store/ragStore'
import { useRAGQuery } from '../hooks/useQuery'

const SUGGESTED = [
  'What is VWO and what does it offer?',
  'What are the key features of the product?',
  'Who are the target users?',
  'What are the main use cases described?',
  'What is the competitive advantage?',
]

export default function QueryPanel() {
  const [question, setQuestion] = useState('')
  const [showHistory, setShowHistory] = useState(false)
  const textRef = useRef<HTMLTextAreaElement>(null)
  const { isQuerying, queryHistory, appStatus, streamingStage } = useRAGStore()
  const { query } = useRAGQuery()

  const isReady = appStatus?.is_ready

  const STAGE_LABEL: Record<string, string> = {
    embedding:  '🔢 Embedding query…',
    retrieving: '🔍 Searching ChromaDB…',
    generating: '🤖 Groq is writing…',
  }

  const submit = () => {
    const q = question.trim()
    if (!q || isQuerying || !isReady) return
    query(q)
  }

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit()
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Input */}
      <div className={`card overflow-hidden transition-all ${isReady ? '' : 'opacity-60'}`}>
        <textarea
          ref={textRef}
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={onKey}
          disabled={!isReady || isQuerying}
          placeholder={isReady
            ? 'Ask a question about the document… (Ctrl+Enter to send)'
            : 'Ingest a document first to enable queries.'}
          rows={3}
          className="w-full resize-none bg-transparent px-4 pt-3 pb-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none"
        />
        <div className="flex items-center justify-between border-t border-[var(--border-color)] px-3 py-2">
          {isQuerying ? (
            <span className="text-[11px] text-blue-400 animate-pulse">
              {STAGE_LABEL[streamingStage] ?? '⏳ Processing…'}
            </span>
          ) : (
            <span className="text-[10px] text-[var(--text-muted)]">{question.length} chars · Ctrl+Enter</span>
          )}
          <button
            onClick={submit}
            disabled={!question.trim() || !isReady || isQuerying}
            className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-bold text-white transition hover:bg-blue-500 disabled:opacity-40"
          >
            {isQuerying ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
            {isQuerying ? 'Working…' : 'Ask'}
          </button>
        </div>
      </div>

      {/* Suggestions */}
      <div>
        <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">Suggested questions</p>
        <div className="flex flex-wrap gap-1.5">
          {SUGGESTED.map((s) => (
            <button
              key={s}
              onClick={() => { setQuestion(s); textRef.current?.focus() }}
              disabled={!isReady || isQuerying}
              className="rounded-full border border-[var(--border-color)] px-2.5 py-1 text-[11px] text-[var(--text-secondary)] transition hover:border-blue-500 hover:text-blue-400 disabled:opacity-40"
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* Query history */}
      {queryHistory.length > 0 && (
        <div>
          <button
            onClick={() => setShowHistory((v) => !v)}
            className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
          >
            <Clock size={11} />
            History ({queryHistory.length})
            {showHistory ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
          </button>
          <AnimatePresence>
            {showHistory && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="mt-2 space-y-1 overflow-hidden"
              >
                {queryHistory.slice(0, 8).map((h) => (
                  <button
                    key={h.id}
                    onClick={() => { setQuestion(h.question); setShowHistory(false) }}
                    className="w-full rounded-lg border border-[var(--border-color)] p-2.5 text-left hover:border-blue-500/50 transition"
                  >
                    <p className="truncate text-xs text-[var(--text-primary)]">{h.question}</p>
                    <p className="mt-0.5 text-[10px] text-[var(--text-muted)]">
                      {new Date(h.timestamp).toLocaleTimeString()} · {h.sources.length} sources
                    </p>
                  </button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}
    </div>
  )
}
