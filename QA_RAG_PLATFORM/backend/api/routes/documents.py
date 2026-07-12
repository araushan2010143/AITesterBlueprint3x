from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select
from typing import List, Optional
from backend.database.db import Document, get_session
from backend.models.schemas import DocumentOut

router = APIRouter(prefix="/api/documents", tags=["Documents"])


@router.get("", response_model=List[DocumentOut])
def list_documents(
    status: Optional[str] = None,
    document_type: Optional[str] = None,
    module: Optional[str] = None,
    session: Session = Depends(get_session),
):
    query = select(Document)
    if status:
        query = query.where(Document.status == status)
    if document_type:
        query = query.where(Document.document_type == document_type)
    if module:
        query = query.where(Document.module == module)
    docs = session.exec(query.order_by(Document.created_at.desc())).all()
    return docs


@router.get("/{doc_id}", response_model=DocumentOut)
def get_document(doc_id: str, session: Session = Depends(get_session)):
    doc = session.get(Document, doc_id)
    if not doc:
        raise HTTPException(404, "Document not found")
    return doc


@router.get("/filters/values")
def get_filter_values(session: Session = Depends(get_session)):
    """Return unique filter values for the search UI."""
    docs = session.exec(select(Document).where(Document.status == "ready")).all()
    return {
        "modules": sorted({d.module for d in docs if d.module}),
        "document_types": sorted({d.document_type for d in docs if d.document_type}),
        "releases": sorted({d.release for d in docs if d.release}),
        "authors": sorted({d.author for d in docs if d.author}),
        "priorities": ["High", "Medium", "Low"],
        "automation_statuses": ["Automated", "Manual", "Partial"],
    }
