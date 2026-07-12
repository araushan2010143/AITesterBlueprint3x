"""
Reranker: Cohere rerank if API key set, else score-threshold passthrough.
"""
from typing import List, Dict, Any
from backend.config import get_settings

settings = get_settings()


def rerank(query: str, results: List[Dict[str, Any]], top_k: int = 5) -> List[Dict[str, Any]]:
    if settings.cohere_api_key and results:
        try:
            return _cohere_rerank(query, results, top_k)
        except Exception:
            pass
    # Fallback: return top_k by existing score, filter score < 0.1
    filtered = [r for r in results if r.get("score", 0) >= 0.1]
    return filtered[:top_k]


def _cohere_rerank(query: str, results: List[Dict[str, Any]], top_k: int) -> List[Dict[str, Any]]:
    import cohere
    co = cohere.Client(api_key=settings.cohere_api_key)
    docs = [r["text"][:512] for r in results]
    response = co.rerank(
        model="rerank-english-v3.0",
        query=query,
        documents=docs,
        top_n=top_k,
    )
    reranked = []
    for hit in response.results:
        r = dict(results[hit.index])
        r["rerank_score"] = round(hit.relevance_score, 4)
        r["score"] = r["rerank_score"]
        reranked.append(r)
    return reranked
