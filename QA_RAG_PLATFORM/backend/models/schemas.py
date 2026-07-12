from pydantic import BaseModel, ConfigDict
from typing import Optional, List, Dict, Any
from datetime import datetime


class DocumentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    filename: str
    file_type: str
    status: str
    document_type: Optional[str]
    module: Optional[str]
    feature: Optional[str]
    priority: Optional[str]
    author: Optional[str]
    release: Optional[str]
    tags: Optional[str]
    automation_status: Optional[str]
    total_pages: int
    total_chunks: int
    total_vectors: int
    created_at: datetime
    error: Optional[str]


class SearchRequest(BaseModel):
    query: str
    top_k: int = 10
    module: Optional[str] = None
    priority: Optional[str] = None
    document_type: Optional[str] = None
    release: Optional[str] = None
    author: Optional[str] = None
    automation_status: Optional[str] = None
    bm25_weight: float = 0.3
    use_reranker: bool = False


class SearchResult(BaseModel):
    chunk_id: str
    doc_id: str
    filename: str
    text: str
    score: float
    page: int
    metadata: Dict[str, Any]
    highlight: Optional[str] = None


class SearchResponse(BaseModel):
    query: str
    results: List[SearchResult]
    total: int
    latency_ms: float


class AIActionRequest(BaseModel):
    action: str   # generate_test_cases | find_duplicates | coverage_analysis | rca | automate | release_summary | test_data | explain_failure
    content: Optional[str] = None      # raw text input
    doc_ids: Optional[List[str]] = None  # reference documents
    options: Dict[str, Any] = {}


class AIActionResponse(BaseModel):
    action: str
    result: Any
    tokens_used: int = 0
    latency_ms: float = 0.0


class Stats(BaseModel):
    total_documents: int
    total_chunks: int
    total_vectors: int
    by_type: Dict[str, int]
    by_module: Dict[str, int]
    by_status: Dict[str, int]
    recent_documents: List[DocumentOut]
