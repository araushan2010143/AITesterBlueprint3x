import { Sun, Moon, Upload, RefreshCw, Zap } from 'lucide-react'
import { motion } from 'framer-motion'
import { useRAGStore } from '../store/ragStore'
import { useStatus } from '../hooks/useIngest'

const STATUS_COLORS: Record<string, string> = {
  idle: 'text-gray-400',
  ingesting: 'text-blue-400',
  ready: 'text-emerald-400',
  error: 'text-red-400'
}

const STATUS_LABELS: Record<string, string> = {
  idle: 'Not indexed',
  ingesting: 'Indexing…',
  ready: 'Ready',
  error: 'Error'
}

export default function Header() {
  const { isDark, toggleTheme, appStatus, setShowUpload } = useRAGStore()
  const status = appStatus?.status ?? 'idle'
  const { refetch } = useStatus()

  return (
    <header className="sticky top-0 z-50 border-b border-[var(--border-color)] bg-[var(--surface-1)] backdrop-blur-sm">
      <div className="flex items-center justify-between px-6 py-3">
        {/* Logo + title */}
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-600 text-lg shadow-lg shadow-blue-900/40">
            🔍
          </div>
          <div>
            <h1 className="text-base font-bold tracking-tight text-[var(--text-primary)]">
              RAG Explorer
            </h1>
            <p className="text-xs text-[var(--text-muted)]">
              Interactive Pipeline Visualizer
            </p>
          </div>
        </div>

        {/* Pipeline status badge */}
        <div className="hidden items-center gap-6 md:flex">
          <div className="flex items-center gap-2 rounded-full border border-[var(--border-color)] bg-[var(--surface-2)] px-4 py-1.5">
            <motion.span
              className={`h-2 w-2 rounded-full ${status === 'ready' ? 'bg-emerald-400' : status === 'ingesting' ? 'bg-blue-400' : status === 'error' ? 'bg-red-400' : 'bg-gray-500'}`}
              animate={status === 'ingesting' ? { scale: [1, 1.4, 1] } : {}}
              transition={{ repeat: Infinity, duration: 1 }}
            />
            <span className={`text-xs font-medium ${STATUS_COLORS[status]}`}>
              {STATUS_LABELS[status]}
            </span>
          </div>

          {appStatus?.is_ready && (
            <div className="flex items-center gap-4 text-xs text-[var(--text-muted)]">
              <span className="flex items-center gap-1">
                <Zap size={12} className="text-blue-400" />
                {appStatus ? 'Pipeline Active' : '—'}
              </span>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowUpload(true)}
            className="flex items-center gap-1.5 rounded-lg border border-[var(--border-color)] bg-[var(--surface-2)] px-3 py-1.5 text-xs font-medium text-[var(--text-secondary)] transition hover:border-blue-500 hover:text-blue-400"
          >
            <Upload size={13} />
            Upload PDF
          </button>

          <button
            onClick={() => refetch()}
            className="flex items-center gap-1.5 rounded-lg border border-[var(--border-color)] bg-[var(--surface-2)] px-3 py-1.5 text-xs font-medium text-[var(--text-secondary)] transition hover:border-blue-500 hover:text-blue-400"
          >
            <RefreshCw size={13} />
            Refresh
          </button>

          <button
            onClick={toggleTheme}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--border-color)] bg-[var(--surface-2)] text-[var(--text-secondary)] transition hover:text-blue-400"
          >
            {isDark ? <Sun size={15} /> : <Moon size={15} />}
          </button>
        </div>
      </div>

      {/* Ingestion progress bar */}
      {status === 'ingesting' && appStatus?.progress && (
        <div className="h-0.5 bg-[var(--surface-2)]">
          <motion.div
            className="h-full bg-blue-500"
            initial={{ width: 0 }}
            animate={{ width: `${appStatus.progress.percent}%` }}
            transition={{ ease: 'easeOut', duration: 0.4 }}
          />
        </div>
      )}
    </header>
  )
}
