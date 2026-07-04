from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any


# ── Requests ──────────────────────────────────────────────────────────

class IngestRequest(BaseModel):
    chunk_size: int = Field(800, ge=200, le=4000)
    chunk_overlap: int = Field(150, ge=0, le=500)


class QueryRequest(BaseModel):
    question: str = Field(..., min_length=3)
    top_k: int = Field(4, ge=1, le=10)
    temperature: float = Field(0.1, ge=0.0, le=1.0)
    max_tokens: int = Field(1024, ge=64, le=4096)


class ReindexRequest(BaseModel):
    chunk_size: int = Field(800, ge=200, le=4000)
    chunk_overlap: int = Field(150, ge=0, le=500)


# ── Chunk / Document ──────────────────────────────────────────────────

class ChunkMetadata(BaseModel):
    filename: str
    page: int
    doc_id: str
    total_pages: int
    chunk_index: int
    chunk_in_page: int = 0


class ChunkInfo(BaseModel):
    id: str
    text: str
    metadata: Dict[str, Any]
    embedding_status: str = "embedded"
    char_count: int = 0


class DocumentInfo(BaseModel):
    id: str
    filename: str
    pages: int
    chunks_count: int


# ── Ingestion Response ─────────────────────────────────────────────────

class IngestionProgress(BaseModel):
    stage: str = "idle"     # idle | loading | chunking | embedding | storing | complete | error
    current: int = 0
    total: int = 0
    message: str = ""
    percent: float = 0.0


class IngestResponse(BaseModel):
    status: str
    documents_loaded: int
    total_pages: int
    total_chunks: int
    embeddings_created: int
    time_taken_seconds: float
    collection_name: str
    storage_path: str
    chunk_size: int
    chunk_overlap: int


# ── Query Response ─────────────────────────────────────────────────────

class RetrievedChunk(BaseModel):
    chunk_id: str
    text: str
    metadata: Dict[str, Any]
    score: float


class PromptInfo(BaseModel):
    system: str
    context: str
    question: str
    full_prompt: str


class QueryMetrics(BaseModel):
    query_latency_ms: float
    search_latency_ms: float
    llm_response_time_ms: float
    prompt_tokens: int
    completion_tokens: int
    total_tokens: int


class QueryResponse(BaseModel):
    answer: str
    sources: List[RetrievedChunk]
    prompt_used: PromptInfo
    metrics: QueryMetrics


# ── Metrics ───────────────────────────────────────────────────────────

class DocumentMetrics(BaseModel):
    total_documents: int = 0
    total_pages: int = 0
    total_chunks: int = 0
    avg_chunk_size: float = 0.0


class EmbeddingMetrics(BaseModel):
    model: str = ""
    dimension: int = 768
    time_taken_seconds: float = 0.0
    total_vectors: int = 0


class RetrievalMetrics(BaseModel):
    top_k: int = 4
    avg_query_latency_ms: float = 0.0
    avg_search_latency_ms: float = 0.0
    avg_similarity_score: float = 0.0
    total_queries: int = 0


class LLMMetrics(BaseModel):
    model: str = ""
    avg_response_time_ms: float = 0.0
    avg_prompt_tokens: float = 0.0
    avg_completion_tokens: float = 0.0
    total_requests: int = 0


class AllMetrics(BaseModel):
    document_metrics: DocumentMetrics = DocumentMetrics()
    embedding_metrics: EmbeddingMetrics = EmbeddingMetrics()
    retrieval_metrics: RetrievalMetrics = RetrievalMetrics()
    llm_metrics: LLMMetrics = LLMMetrics()


# ── Status ────────────────────────────────────────────────────────────

class AppStatus(BaseModel):
    status: str = "idle"    # idle | ingesting | ready | error
    progress: IngestionProgress = IngestionProgress()
    is_ready: bool = False
    error: Optional[str] = None
