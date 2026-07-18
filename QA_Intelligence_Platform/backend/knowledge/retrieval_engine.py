"""
RetrievalEngine — the central Knowledge Layer orchestrator.

Full pipeline:
    Query → IntentClassifier → QueryExpander → HybridSearcher
         → MetadataFilter → Reranker → ContextCompressor → Citations

Every feature must call RetrievalEngine.retrieve(), never Qdrant directly.
"""
from __future__ import annotations
from dataclasses import dataclass, field
from typing import Any

from .intent_classifier import IntentClassifier, ClassificationResult
from .query_expander import QueryExpander
from .hybrid_searcher import HybridSearcher
from .reranker import Reranker
from .context_compressor import ContextCompressor


@dataclass
class RetrievedChunk:
    text: str
    score: float
    metadata: dict[str, Any]
    collection: str

    @property
    def citation(self) -> dict[str, str]:
        m = self.metadata
        return {
            "source":   m.get("source", ""),
            "path":     m.get("path", ""),
            "filename": m.get("filename", ""),
            "line":     str(m.get("line", "")),
            "page":     str(m.get("page", "")),
            "jira":     m.get("jira", ""),
            "testcase": m.get("testcase", ""),
        }


@dataclass
class RetrievalResult:
    chunks: list[RetrievedChunk]
    intent: str
    collections_searched: list[str]
    citations: list[dict[str, str]] = field(default_factory=list)
    context: str = ""

    def __post_init__(self):
        self.citations = [c.citation for c in self.chunks]
        self.context = "\n\n---\n\n".join(c.text for c in self.chunks)


class RetrievalEngine:
    """
    Orchestrates the full retrieval pipeline.

    Usage:
        engine = RetrievalEngine()
        result = engine.retrieve("Where is switchMediaType() implemented?", top_k=5)
        print(result.context)    # context for LLM
        print(result.citations)  # source citations
    """

    def __init__(
        self,
        top_k: int = 10,
        rerank_top_k: int = 5,
        max_context_tokens: int = 6000,
    ):
        self.top_k = top_k
        self.rerank_top_k = rerank_top_k
        self.max_context_tokens = max_context_tokens

        self._classifier  = IntentClassifier()
        self._expander    = QueryExpander()
        self._searcher    = HybridSearcher()
        self._reranker    = Reranker()
        self._compressor  = ContextCompressor(max_tokens=max_context_tokens)

    def retrieve(
        self,
        query: str,
        metadata_filters: dict[str, Any] | None = None,
        top_k: int | None = None,
    ) -> RetrievalResult:
        """
        Full retrieval pipeline.

        Args:
            query:            Natural language query from the user.
            metadata_filters: Optional pre-filters e.g. {"sprint": "Sprint-17", "severity": "high"}
            top_k:            Override default top_k.
        """
        k = top_k or self.top_k

        # 1. Intent → which collection(s) to search
        classification: ClassificationResult = self._classifier.classify(query)

        # 2. Expand query (abbreviations, synonyms)
        expanded_query = self._expander.expand(query)

        # 3. Hybrid search (vector dense + BM25 sparse → RRF fusion)
        raw_chunks = self._searcher.search(
            query=expanded_query,
            collections=classification.collections,
            top_k=k,
            metadata_filters=metadata_filters or {},
        )

        # 4. Cross-encoder reranking
        reranked = self._reranker.rerank(
            query=query,
            chunks=raw_chunks,
            top_k=self.rerank_top_k,
        )

        # 5. Context compression
        compressed = self._compressor.compress(reranked)

        return RetrievalResult(
            chunks=compressed,
            intent=classification.intent,
            collections_searched=classification.collections,
        )
