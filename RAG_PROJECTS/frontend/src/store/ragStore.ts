import { create } from 'zustand'
import type {
  AppStatus, IngestResponse, DocumentInfo, ChunkInfo,
  QueryResponse, AllMetrics, PipelineStage, HistoryEntry, RAGSettings,
  RetrievedChunk, PromptInfo, QueryMetrics
} from '../types'

interface RAGStore {
  // ── Status ─────────────────────────────────────────────────────────
  appStatus: AppStatus | null
  ingestResult: IngestResponse | null
  isIngesting: boolean
  isQuerying: boolean

  // ── Data ───────────────────────────────────────────────────────────
  documents: DocumentInfo[]
  chunks: ChunkInfo[]
  queryResult: QueryResponse | null
  metrics: AllMetrics | null
  queryHistory: HistoryEntry[]

  // ── Streaming ──────────────────────────────────────────────────────
  streamingAnswer: string
  streamingSources: RetrievedChunk[]
  streamingPrompt: PromptInfo | null
  streamingStage: string
  streamingMetrics: Record<string, number>

  // ── Pipeline visualization ─────────────────────────────────────────
  pipelineStages: PipelineStage[]

  // ── UI state ───────────────────────────────────────────────────────
  selectedDocId: string | null
  selectedChunkId: string | null
  activeTab: 'query' | 'prompt' | 'retrieval' | 'metrics'
  isDark: boolean
  showUpload: boolean

  // ── Settings ───────────────────────────────────────────────────────
  settings: RAGSettings

  // ── Actions ────────────────────────────────────────────────────────
  setAppStatus: (s: AppStatus) => void
  setIngestResult: (r: IngestResponse) => void
  setIsIngesting: (v: boolean) => void
  setIsQuerying: (v: boolean) => void
  setDocuments: (d: DocumentInfo[]) => void
  setChunks: (c: ChunkInfo[]) => void
  setQueryResult: (r: QueryResponse) => void
  setMetrics: (m: AllMetrics) => void
  addToHistory: (entry: HistoryEntry) => void
  setStageStatus: (id: string, status: PipelineStage['status']) => void
  setAllStages: (status: PipelineStage['status']) => void
  setSelectedDoc: (id: string | null) => void
  setSelectedChunk: (id: string | null) => void
  setActiveTab: (tab: RAGStore['activeTab']) => void
  toggleTheme: () => void
  setShowUpload: (v: boolean) => void
  updateSettings: (s: Partial<RAGSettings>) => void

  // Streaming actions
  startStreaming: () => void
  appendToken: (text: string) => void
  setStreamingSources: (sources: RetrievedChunk[], prompt: PromptInfo) => void
  setStreamingStage: (stage: string) => void
  finalizeStreaming: (metrics: Record<string, number>) => void
  resetStreaming: () => void
}

const INITIAL_STAGES: PipelineStage[] = [
  { id: 'pdf',       label: 'PDF',       sublabel: 'Document loader',    icon: '📄', status: 'idle' },
  { id: 'chunker',   label: 'Chunker',   sublabel: 'Text splitter',      icon: '✂️', status: 'idle' },
  { id: 'embedder',  label: 'Embedder',  sublabel: 'Nomic embed-text',   icon: '🔢', status: 'idle' },
  { id: 'chromadb',  label: 'ChromaDB',  sublabel: 'Vector store',       icon: '🗄️', status: 'idle' },
  { id: 'retriever', label: 'Retriever', sublabel: 'Similarity search',  icon: '🔍', status: 'idle' },
  { id: 'groq',      label: 'Groq LLM',  sublabel: 'llama-3.3-70b',     icon: '🤖', status: 'idle' },
  { id: 'answer',    label: 'Answer',    sublabel: 'Generated response', icon: '💡', status: 'idle' },
]

export const useRAGStore = create<RAGStore>((set, get) => ({
  appStatus: null,
  ingestResult: null,
  isIngesting: false,
  isQuerying: false,
  documents: [],
  chunks: [],
  queryResult: null,
  metrics: null,
  queryHistory: [],
  pipelineStages: INITIAL_STAGES,
  selectedDocId: null,
  selectedChunkId: null,
  activeTab: 'query',
  isDark: true,
  showUpload: false,
  streamingAnswer: '',
  streamingSources: [],
  streamingPrompt: null,
  streamingStage: '',
  streamingMetrics: {},
  settings: {
    chunk_size: 800,
    chunk_overlap: 150,
    top_k: 4,
    temperature: 0.1,
    max_tokens: 1024
  },

  setAppStatus:    (s)   => set({ appStatus: s }),
  setIngestResult: (r)   => set({ ingestResult: r }),
  setIsIngesting:  (v)   => set({ isIngesting: v }),
  setIsQuerying:   (v)   => set({ isQuerying: v }),
  setDocuments:    (d)   => set({ documents: d }),
  setChunks:       (c)   => set({ chunks: c }),
  setQueryResult:  (r)   => set({ queryResult: r }),
  setMetrics:      (m)   => set({ metrics: m }),
  setSelectedDoc:  (id)  => set({ selectedDocId: id }),
  setSelectedChunk:(id)  => set({ selectedChunkId: id }),
  setActiveTab:    (tab) => set({ activeTab: tab }),
  setShowUpload:   (v)   => set({ showUpload: v }),

  addToHistory: (entry) =>
    set((s) => ({ queryHistory: [entry, ...s.queryHistory].slice(0, 20) })),

  setStageStatus: (id, status) =>
    set((s) => ({
      pipelineStages: s.pipelineStages.map((st) =>
        st.id === id ? { ...st, status } : st
      )
    })),

  setAllStages: (status) =>
    set((s) => ({
      pipelineStages: s.pipelineStages.map((st) => ({ ...st, status }))
    })),

  toggleTheme: () =>
    set((s) => {
      const next = !s.isDark
      document.documentElement.classList.toggle('dark', next)
      document.documentElement.classList.toggle('light', !next)
      return { isDark: next }
    }),

  updateSettings: (partial) =>
    set((s) => ({ settings: { ...s.settings, ...partial } })),

  // ── Streaming ────────────────────────────────────────────────────────

  startStreaming: () =>
    set({
      streamingAnswer: '',
      streamingSources: [],
      streamingPrompt: null,
      streamingStage: 'embedding',
      streamingMetrics: {},
      isQuerying: true
    }),

  appendToken: (text) =>
    set((s) => ({ streamingAnswer: s.streamingAnswer + text })),

  setStreamingSources: (sources, prompt) =>
    set({ streamingSources: sources, streamingPrompt: prompt }),

  setStreamingStage: (stage) =>
    set({ streamingStage: stage }),

  finalizeStreaming: (metrics) =>
    set((s) => {
      const result: QueryResponse = {
        answer: s.streamingAnswer,
        sources: s.streamingSources,
        prompt_used: s.streamingPrompt ?? {
          system: '', context: '', question: '', full_prompt: ''
        },
        metrics: {
          query_latency_ms: (metrics.embed_ms ?? 0) + (metrics.search_ms ?? 0),
          search_latency_ms: metrics.search_ms ?? 0,
          llm_response_time_ms: metrics.llm_ms ?? 0,
          prompt_tokens: 0,
          completion_tokens: 0,
          total_tokens: 0
        }
      }
      return {
        queryResult: result,
        streamingMetrics: metrics,
        isQuerying: false
      }
    }),

  resetStreaming: () =>
    set({ streamingAnswer: '', streamingSources: [], streamingStage: '', isQuerying: false })
}))
