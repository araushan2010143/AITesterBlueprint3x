import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Copy, Check, Terminal } from 'lucide-react'
import { useRAGStore } from '../store/ragStore'

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    await navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }
  return (
    <button onClick={copy} className="flex items-center gap-1 text-[10px] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition">
      {copied ? <Check size={11} className="text-emerald-400" /> : <Copy size={11} />}
      {copied ? 'Copied!' : 'Copy'}
    </button>
  )
}

function Section({ title, content, badge }: { title: string; content: string; badge?: string }) {
  const [expanded, setExpanded] = useState(title === 'User Question')

  return (
    <div className="card overflow-hidden">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center justify-between px-3 py-2.5 hover:bg-[var(--surface-2)] transition"
      >
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-[var(--text-primary)]">{title}</span>
          {badge && (
            <span className="rounded-full bg-blue-900/40 px-2 py-0.5 text-[10px] text-blue-400">{badge}</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <CopyButton text={content} />
          <span className="text-[var(--text-muted)] text-xs">{expanded ? '▲' : '▼'}</span>
        </div>
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="border-t border-[var(--border-color)] bg-[var(--surface-0)] p-3">
              <pre className="text-[11px] text-[var(--text-secondary)] whitespace-pre-wrap font-mono leading-relaxed max-h-48 overflow-y-auto">
                {content}
              </pre>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export default function PromptInspector() {
  const { queryResult, streamingPrompt, isQuerying } = useRAGStore()
  const promptData = isQuerying && streamingPrompt ? streamingPrompt : queryResult?.prompt_used
  const metricsData = queryResult?.metrics

  if (!promptData) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
        <Terminal size={30} className="text-[var(--text-muted)]" />
        <p className="text-xs text-[var(--text-muted)]">The exact prompt sent to Groq appears here after a query.</p>
        <p className="text-[11px] text-[var(--text-muted)]">This makes the RAG pipeline fully transparent.</p>
      </div>
    )
  }

  const prompt_used = promptData
  const metrics = metricsData

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2 mb-1">
        <Terminal size={13} className="text-blue-400" />
        <h3 className="text-xs font-semibold text-[var(--text-muted)]">Prompt Inspector</h3>
        <span className="ml-auto text-[10px] text-[var(--text-muted)]">
          {metrics ? `${metrics.prompt_tokens} prompt · ${metrics.completion_tokens} completion tokens` : 'streaming…'}
        </span>
      </div>

      <Section title="System Prompt" content={prompt_used.system} />
      <Section
        title="Retrieved Context"
        content={prompt_used.context}
        badge={`${queryResult?.sources.length ?? 0} chunks`}
      />
      <Section title="User Question" content={prompt_used.question} />

      {/* Token breakdown */}
      {metrics && (
        <div className="card p-3">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-2">Token Usage</p>
          <div className="flex gap-1 h-2 rounded-full overflow-hidden">
            <motion.div className="bg-blue-500" initial={{ flex: 0 }} animate={{ flex: metrics.prompt_tokens }} transition={{ duration: 0.5 }} />
            <motion.div className="bg-emerald-500" initial={{ flex: 0 }} animate={{ flex: metrics.completion_tokens }} transition={{ duration: 0.5, delay: 0.1 }} />
          </div>
          <div className="flex items-center justify-between mt-1.5">
            <span className="flex items-center gap-1.5 text-[10px] text-blue-400"><span className="h-2 w-2 rounded-full bg-blue-500" />Prompt: {metrics.prompt_tokens}</span>
            <span className="flex items-center gap-1.5 text-[10px] text-emerald-400"><span className="h-2 w-2 rounded-full bg-emerald-500" />Completion: {metrics.completion_tokens}</span>
            <span className="text-[10px] text-[var(--text-muted)]">Total: {metrics.total_tokens}</span>
          </div>
        </div>
      )}
    </div>
  )
}
