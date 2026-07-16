from fastapi import APIRouter, Depends
from sqlmodel import Session, select, func
from collections import Counter
from backend.database.db import Document, Chunk, get_session
from backend.models.schemas import Stats, DocumentOut
from backend.vectorstore import get_stats as _vs_get_stats

router = APIRouter(prefix="/api/stats", tags=["Stats"])


@router.get("", response_model=Stats)
def get_stats(session: Session = Depends(get_session)):
    docs = session.exec(select(Document)).all()
    total_chunks = session.exec(select(func.count(Chunk.id))).one()

    by_type = Counter(d.document_type or "general" for d in docs)
    by_module = Counter(d.module for d in docs if d.module)
    by_status = Counter(d.status for d in docs)

    pc_stats = _vs_get_stats()
    total_vectors = pc_stats.get("total_vectors", 0)

    recent = session.exec(
        select(Document).order_by(Document.created_at.desc()).limit(5)
    ).all()

    return Stats(
        total_documents=len(docs),
        total_chunks=total_chunks,
        total_vectors=total_vectors,
        by_type=dict(by_type),
        by_module=dict(by_module),
        by_status=dict(by_status),
        recent_documents=[DocumentOut.model_validate(d) for d in recent],
    )


@router.api_route("/health", methods=["GET", "HEAD"])
def health():
    return {"status": "healthy", "version": "1.0.0", "platform": "QA RAG Platform"}
