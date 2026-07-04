// ── Shared types matching backend Pydantic models ────────────────────

export type StageStatus = 'idle' | 'processing' | 'complete' | 'error'

export interface IngestionProgress {
  stage: string
  current: number
  total: number
  message: string
  percent: number
}

export interface AppStatus {
  status: 'idle' | 'ingesting' | 'ready' | 'error'
  progress: IngestionProgress
  is_ready: boolean
  error: string | null
}

export interface IngestRequest {
  chunk_size?: number
  chunk_overlap?: number
}

export interface IngestResponse {
  status: string
  documents_loaded: number
  total_pages: number
  total_chunks: number
  embeddings_created: number
  time_taken_seconds: number
  collection_name: string
  storage_path: string
  chunk_size: number
  chunk_overlap: number
}

export interface ChunkMetadata {
  filename: string
  page: number
  doc_id: string
  total_pages: number
  chunk_index: number
  chunk_in_page: number
  source?: string
}

export interface ChunkInfo {
  id: string
  text: string
  metadata: ChunkMetadata
  embedding_status: string
  char_count: number
}

export interface DocumentInfo {
  id: string
  filename: string
  pages: number
  chunks_count: number
}

export interface RetrievedChunk {
  chunk_id: string
  text: string
  metadata: ChunkMetadata
  score: number
}

export interface PromptInfo {
  system: string
  context: string
  question: string
  full_prompt: string
}

export interface QueryMetrics {
  query_latency_ms: number
  search_latency_ms: number
  llm_response_time_ms: number
  prompt_tokens: number
  completion_tokens: number
  total_tokens: number
}

export interface QueryResponse {
  answer: string
  sources: RetrievedChunk[]
  prompt_used: PromptInfo
  metrics: QueryMetrics
}

export interface DocumentMetrics {
  total_documents: number
  total_pages: number
  total_chunks: number
  avg_chunk_size: number
}

export interface EmbeddingMetrics {
  model: string
  dimension: number
  time_taken_seconds: number
  total_vectors: number
}

export interface RetrievalMetrics {
  top_k: number
  avg_query_latency_ms: number
  avg_search_latency_ms: number
  avg_similarity_score: number
  total_queries: number
}

export interface LLMMetrics {
  model: string
  avg_response_time_ms: number
  avg_prompt_tokens: number
  avg_completion_tokens: number
  total_requests: number
}

export interface AllMetrics {
  document_metrics: DocumentMetrics
  embedding_metrics: EmbeddingMetrics
  retrieval_metrics: RetrievalMetrics
  llm_metrics: LLMMetrics
}

// ── Pipeline stage definition ─────────────────────────────────────────

export interface PipelineStage {
  id: string
  label: string
  sublabel: string
  icon: string
  status: StageStatus
}

// ── Query history ─────────────────────────────────────────────────────

export interface HistoryEntry {
  id: string
  question: string
  answer: string
  sources: RetrievedChunk[]
  metrics: QueryMetrics
  timestamp: number
}

// ── Settings ──────────────────────────────────────────────────────────

export interface RAGSettings {
  chunk_size: number
  chunk_overlap: number
  top_k: number
  temperature: number
  max_tokens: number
}
