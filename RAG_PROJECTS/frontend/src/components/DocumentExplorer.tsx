import { useState } from 'react'
import { ChevronRight, ChevronDown, FileText, BookOpen, Hash, Loader2 } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { useRAGStore } from '../store/ragStore'
import { useDocuments, useChunks } from '../hooks/useIngest'

export default function DocumentExplorer() {
  const { documents, chunks, selectedDocId, selectedChunkId, setSelectedDoc, setSelectedChunk, appStatus } = useRAGStore()
  const [expandedDocs, setExpandedDocs] = useState<Set<string>>(new Set())
  const [expandedPages, setExpandedPages] = useState<Set<string>>(new Set())
  const [selectedChunkText, setSelectedChunkText] = useState<string | null>(null)

  const { isLoading: docsLoading } = useDocuments()
  const { isLoading: chunksLoading } = useChunks()

  const toggleDoc = (id: string) => {
    setExpandedDocs((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
    setSelectedDoc(id)
  }

  const togglePage = (key: string) => {
    setExpandedPages((prev) => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })
  }

  const chunksForDoc = (docId: string) => chunks.filter((c) => c.metadata.doc_id === docId)
  const pages = (docId: string) => [...new Set(chunksForDoc(docId).map((c) => c.metadata.page))].sort((a, b) => a - b)
  const chunksOnPage = (docId: string, page: number) => chunksForDoc(docId).filter((c) => c.metadata.page === page)

  if (!appStatus?.is_ready) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
        <FileText size={36} className="text-[var(--text-muted)]" />
        <p className="text-sm text-[var(--text-muted)]">No documents indexed yet.</p>
        <p className="text-xs text-[var(--text-muted)]">Use the Ingestion panel to load your PDF.</p>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="border-b border-[var(--border-color)] px-4 py-2.5">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">Document Explorer</h3>
        <p className="mt-0.5 text-[11px] text-[var(--text-muted)]">
          {documents.length} doc · {chunks.length} chunks
        </p>
      </div>

      {/* Tree */}
      <div className="flex-1 overflow-y-auto py-2">
        {(docsLoading || chunksLoading) && (
          <div className="flex items-center justify-center py-8">
            <Loader2 size={20} className="animate-spin text-blue-400" />
          </div>
        )}

        {documents.map((doc) => {
          const isExpanded = expandedDocs.has(doc.id)
          const docChunks = chunksForDoc(doc.id)
          const docPages = pages(doc.id)

          return (
            <div key={doc.id}>
              {/* Document row */}
              <button
                onClick={() => toggleDoc(doc.id)}
                className={`flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-[var(--surface-2)] transition ${selectedDocId === doc.id ? 'bg-blue-950/30' : ''}`}
              >
                {isExpanded ? <ChevronDown size={13} className="shrink-0 text-[var(--text-muted)]" /> : <ChevronRight size={13} className="shrink-0 text-[var(--text-muted)]" />}
                <FileText size={13} className="shrink-0 text-blue-400" />
                <span className="truncate text-xs font-medium text-[var(--text-primary)]">{doc.filename}</span>
                <span className="ml-auto shrink-0 rounded bg-blue-900/40 px-1.5 py-0.5 text-[10px] text-blue-400">
                  {doc.chunks_count}
                </span>
              </button>

              <AnimatePresence>
                {isExpanded && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="overflow-hidden"
                  >
                    {docPages.map((page) => {
                      const pageKey = `${doc.id}-${page}`
                      const isPageExpanded = expandedPages.has(pageKey)
                      const pageChunks = chunksOnPage(doc.id, page)

                      return (
                        <div key={pageKey}>
                          {/* Page row */}
                          <button
                            onClick={() => togglePage(pageKey)}
                            className="flex w-full items-center gap-2 py-1 pl-7 pr-3 text-left hover:bg-[var(--surface-2)] transition"
                          >
                            {isPageExpanded ? <ChevronDown size={11} className="shrink-0 text-[var(--text-muted)]" /> : <ChevronRight size={11} className="shrink-0 text-[var(--text-muted)]" />}
                            <BookOpen size={11} className="shrink-0 text-purple-400" />
                            <span className="text-[11px] text-[var(--text-secondary)]">Page {page}</span>
                            <span className="ml-auto text-[10px] text-[var(--text-muted)]">{pageChunks.length} chunks</span>
                          </button>

                          <AnimatePresence>
                            {isPageExpanded && (
                              <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: 'auto', opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                transition={{ duration: 0.15 }}
                                className="overflow-hidden"
                              >
                                {pageChunks.map((chunk) => (
                                  <button
                                    key={chunk.id}
                                    onClick={() => {
                                      setSelectedChunk(chunk.id)
                                      setSelectedChunkText(chunk.text)
                                    }}
                                    className={`flex w-full items-start gap-2 py-1 pl-12 pr-3 text-left hover:bg-[var(--surface-2)] transition ${selectedChunkId === chunk.id ? 'bg-emerald-950/30' : ''}`}
                                  >
                                    <Hash size={10} className="mt-0.5 shrink-0 text-emerald-400" />
                                    <div className="min-w-0">
                                      <span className="block text-[11px] text-[var(--text-secondary)] truncate">
                                        {chunk.id}
                                      </span>
                                      <span className="block text-[10px] text-[var(--text-muted)]">
                                        {chunk.char_count} chars
                                      </span>
                                    </div>
                                  </button>
                                ))}
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>
                      )
                    })}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )
        })}
      </div>

      {/* Chunk preview */}
      <AnimatePresence>
        {selectedChunkText && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="border-t border-[var(--border-color)] bg-[var(--surface-2)] overflow-hidden"
          >
            <div className="p-3">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">Chunk Preview</span>
                <button onClick={() => { setSelectedChunkText(null); setSelectedChunk(null) }} className="text-[10px] text-[var(--text-muted)] hover:text-[var(--text-primary)]">✕</button>
              </div>
              <p className="text-[11px] text-[var(--text-secondary)] leading-relaxed max-h-24 overflow-y-auto">
                {selectedChunkText}
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
