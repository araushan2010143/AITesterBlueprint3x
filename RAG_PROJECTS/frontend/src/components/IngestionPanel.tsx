import { useState, useRef } from 'react'
import { Loader2, CheckCircle, AlertCircle, Upload, FileText, X } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { useRAGStore } from '../store/ragStore'
import { useIngest, useReindex, useStatus } from '../hooks/useIngest'

const STAGE_LABELS: Record<string, string> = {
  idle:      '—',
  loading:   '📄 Loading PDFs…',
  chunking:  '✂️ Chunking text…',
  embedding: '🔢 Generating embeddings…',
  storing:   '🗄️ Storing vectors…',
  complete:  '✅ Indexed & ready',
  error:     '❌ Error',
}

export default function IngestionPanel() {
  const { appStatus, ingestResult, isIngesting, settings } = useRAGStore()
  const { mutate: ingest } = useIngest()
  const { mutate: reindex } = useReindex()
  const { refetch: refreshStatus } = useStatus()
  const dropRef = useRef<HTMLDivElement>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [pendingFile, setPendingFile] = useState<File | null>(null)
  const [fileMsg, setFileMsg] = useState('')

  const progress = appStatus?.progress
  const isReady = appStatus?.is_ready

  const setFile = (file: File) => {
    if (!file.name.toLowerCase().endsWith('.pdf')) {
      setFileMsg('Only PDF files accepted.')
      return
    }
    setPendingFile(file)
    setFileMsg('')
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) setFile(file)
  }

  const openPicker = () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.pdf'
    input.onchange = (e) => {
      const f = (e.target as HTMLInputElement).files?.[0]
      if (f) setFile(f)
    }
    input.click()
  }

  const handleIngest = () => {
    if (!pendingFile) { setFileMsg('Select a PDF first.'); return }
    ingest({ file: pendingFile, chunk_size: settings.chunk_size, chunk_overlap: settings.chunk_overlap })
  }

  const handleReindex = () => {
    if (!pendingFile) { setFileMsg('Select the PDF to reindex.'); return }
    reindex({ file: pendingFile, chunk_size: settings.chunk_size, chunk_overlap: settings.chunk_overlap })
  }

  return (
    <div className="flex flex-col gap-3 p-4">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">Ingestion</h3>

      {/* Status card */}
      <div className="card p-3">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-[var(--text-muted)]">Status</span>
          {isReady ? (
            <span className="flex items-center gap-1 text-xs text-emerald-400"><CheckCircle size={12} /> Ready</span>
          ) : appStatus?.status === 'error' ? (
            <span className="flex items-center gap-1 text-xs text-red-400"><AlertCircle size={12} /> Error</span>
          ) : isIngesting ? (
            <span className="flex items-center gap-1 text-xs text-blue-400"><Loader2 size={12} className="animate-spin" /> Indexing</span>
          ) : (
            <span className="text-xs text-[var(--text-muted)]">Idle</span>
          )}
        </div>

        {progress && progress.stage !== 'idle' && (
          <div>
            <p className="text-[11px] text-[var(--text-secondary)] mb-1">
              {STAGE_LABELS[progress.stage] ?? progress.stage}
            </p>
            <div className="h-1.5 rounded-full bg-[var(--surface-0)] overflow-hidden">
              <motion.div
                className="h-full rounded-full bg-blue-500"
                animate={{ width: `${progress.percent}%` }}
                transition={{ ease: 'easeOut', duration: 0.4 }}
              />
            </div>
            <p className="mt-1 text-[10px] text-[var(--text-muted)]">{progress.message}</p>
          </div>
        )}

        {appStatus?.error && (
          <p className="mt-1 text-[11px] text-red-400">{appStatus.error}</p>
        )}
      </div>

      {/* Ingest result summary */}
      <AnimatePresence>
        {ingestResult && (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            className="card p-3 grid grid-cols-2 gap-2"
          >
            {[
              ['Documents', ingestResult.documents_loaded],
              ['Pages', ingestResult.total_pages],
              ['Chunks', ingestResult.total_chunks],
              ['Vectors', ingestResult.embeddings_created],
              ['Chunk Size', ingestResult.chunk_size],
              ['Time', `${ingestResult.time_taken_seconds}s`],
            ].map(([label, value]) => (
              <div key={String(label)}>
                <p className="text-[10px] text-[var(--text-muted)]">{label}</p>
                <p className="text-sm font-bold text-[var(--text-primary)]">{value}</p>
              </div>
            ))}
            <div className="col-span-2 border-t border-[var(--border-color)] pt-2 mt-1">
              <p className="text-[10px] text-[var(--text-muted)]">Index</p>
              <p className="text-xs font-mono text-blue-400">{ingestResult.collection_name}</p>
              <p className="text-[10px] text-[var(--text-muted)] mt-0.5">{ingestResult.storage_path}</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Drop zone */}
      <div
        ref={dropRef}
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        onClick={openPicker}
        className={`cursor-pointer rounded-lg border-2 border-dashed p-4 text-center transition
          ${isDragging ? 'border-blue-500 bg-blue-950/20' : 'border-[var(--border-color)] hover:border-blue-500/50'}`}
      >
        {pendingFile ? (
          <div className="flex items-center justify-center gap-2">
            <FileText size={16} className="text-blue-400 shrink-0" />
            <span className="text-xs text-blue-400 truncate max-w-[160px]">{pendingFile.name}</span>
            <button
              onClick={(e) => { e.stopPropagation(); setPendingFile(null); setFileMsg('') }}
              className="text-[var(--text-muted)] hover:text-red-400 transition shrink-0"
            >
              <X size={12} />
            </button>
          </div>
        ) : (
          <>
            <Upload size={18} className="mx-auto mb-1 text-[var(--text-muted)]" />
            <p className="text-xs text-[var(--text-muted)]">Drop PDF or click to select</p>
          </>
        )}
      </div>

      {fileMsg && (
        <p className="text-[11px] text-[var(--text-secondary)]">{fileMsg}</p>
      )}

      {/* Action buttons */}
      <div className="flex gap-2">
        <button
          onClick={handleIngest}
          disabled={isIngesting || !pendingFile}
          className="flex-1 rounded-lg bg-blue-600 py-2 text-xs font-bold text-white transition hover:bg-blue-500 disabled:opacity-40"
        >
          {isIngesting ? <Loader2 size={13} className="mx-auto animate-spin" /> : 'Ingest'}
        </button>
        <button
          onClick={handleReindex}
          disabled={isIngesting || !pendingFile}
          className="flex-1 rounded-lg border border-[var(--border-color)] bg-[var(--surface-2)] py-2 text-xs font-medium text-[var(--text-secondary)] transition hover:border-blue-500 hover:text-blue-400 disabled:opacity-40"
        >
          Reindex
        </button>
      </div>
    </div>
  )
}
