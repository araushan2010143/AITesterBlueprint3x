"""
Global singleton — stores ChromaDB client/collection, chunks, metrics.
No LangChain objects here; everything is plain Python.
"""
from typing import Optional, List, Dict, Any
from models import (
    IngestionProgress, AllMetrics, DocumentMetrics,
    EmbeddingMetrics, RetrievalMetrics, LLMMetrics
)


class AppState:
    def __init__(self):
        # ChromaDB native objects
        self.chroma_client = None   # chromadb.PersistentClient
        self.collection = None      # chromadb.Collection

        self.chunks: List[Dict[str, Any]] = []
        self.documents: List[Dict[str, Any]] = []

        self.status: str = "idle"   # idle | ingesting | ready | error
        self.progress: IngestionProgress = IngestionProgress()
        self.error: Optional[str] = None

        self.metrics = AllMetrics()

        # Rolling history for averages
        self._retrieval_latencies: List[float] = []
        self._search_latencies: List[float] = []
        self._similarity_scores: List[float] = []
        self._llm_times: List[float] = []
        self._prompt_tokens: List[int] = []
        self._completion_tokens: List[int] = []

    # ── Progress ──────────────────────────────────────────────────────

    def set_progress(self, stage: str, current: int, total: int, message: str):
        pct = round((current / total * 100) if total > 0 else 0, 1)
        self.progress = IngestionProgress(
            stage=stage, current=current, total=total,
            message=message, percent=pct
        )

    # ── Metrics helpers ───────────────────────────────────────────────

    def update_document_metrics(self, chunks: list):
        total_chars = sum(len(c["text"]) for c in chunks)
        docs = {c["metadata"]["doc_id"] for c in chunks}
        pages = {(c["metadata"]["doc_id"], c["metadata"]["page"]) for c in chunks}
        self.metrics.document_metrics = DocumentMetrics(
            total_documents=len(docs),
            total_pages=len(pages),
            total_chunks=len(chunks),
            avg_chunk_size=round(total_chars / len(chunks), 1) if chunks else 0.0
        )

    def update_embedding_metrics(self, model: str, dimension: int, time_sec: float, count: int):
        self.metrics.embedding_metrics = EmbeddingMetrics(
            model=model,
            dimension=dimension,
            time_taken_seconds=round(time_sec, 2),
            total_vectors=count
        )

    def record_retrieval(self, query_ms: float, search_ms: float, scores: list, top_k: int):
        self._retrieval_latencies.append(query_ms)
        self._search_latencies.append(search_ms)
        self._similarity_scores.extend(scores)
        n = len(self._retrieval_latencies)
        self.metrics.retrieval_metrics = RetrievalMetrics(
            top_k=top_k,
            avg_query_latency_ms=round(sum(self._retrieval_latencies) / n, 1),
            avg_search_latency_ms=round(sum(self._search_latencies) / n, 1),
            avg_similarity_score=round(
                sum(self._similarity_scores) / len(self._similarity_scores), 3
            ) if self._similarity_scores else 0.0,
            total_queries=n
        )

    def record_llm(self, model: str, response_ms: float, prompt_tok: int, completion_tok: int):
        self._llm_times.append(response_ms)
        self._prompt_tokens.append(prompt_tok)
        self._completion_tokens.append(completion_tok)
        n = len(self._llm_times)
        self.metrics.llm_metrics = LLMMetrics(
            model=model,
            avg_response_time_ms=round(sum(self._llm_times) / n, 1),
            avg_prompt_tokens=round(sum(self._prompt_tokens) / n, 1),
            avg_completion_tokens=round(sum(self._completion_tokens) / n, 1),
            total_requests=n
        )


app_state = AppState()
