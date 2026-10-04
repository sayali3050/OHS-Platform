"""Knowledge base: admins upload SOPs and manuals; everyone can search and read them; SafeAssist cites them."""
import secrets
from datetime import datetime

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, Request, UploadFile, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.ai import service as ai
from app.ai.provider import AIError
from app.auth.deps import get_current_user, require_admin
from app.database.session import get_db
from app.models import KnowledgeChunk, KnowledgeDocument, User
from app.services import audit
from app.services.knowledge_base import DocumentRejected, citation, extract_text, search, split
from app.services.uploads import upload_root
from app.utils.forms import field_error

router = APIRouter(prefix="/knowledge", tags=["Knowledge base"])
MAX_MB = 10
DOC_TYPES = ("sop", "manual", "policy", "msds", "other")


class DocumentOut(BaseModel):
    id: int
    title: str
    doc_type: str
    summary: str | None
    chunk_count: int
    original_filename: str | None
    size_bytes: int
    created_at: datetime


class ChunkOut(BaseModel):
    id: int
    position: int
    heading: str | None
    text: str


class DocumentDetail(DocumentOut):
    chunks: list[ChunkOut]


def _out(d: KnowledgeDocument) -> DocumentOut:
    return DocumentOut(id=d.id, title=d.title, doc_type=d.doc_type, summary=d.summary, chunk_count=d.chunk_count,
                       original_filename=d.original_filename, size_bytes=d.size_bytes or 0, created_at=d.created_at)


def index_document(db: Session, *, title: str, doc_type: str, raw: bytes, filename: str, uploaded_by: int | None) -> KnowledgeDocument:
    """Extract, split, summarise and (with live AI) embed. Shared by the upload route and the seed."""
    text, content_type = extract_text(raw, filename)
    parts = split(text)
    if not parts:
        raise DocumentRejected("No readable text found in this file.")
    key = f"{secrets.token_hex(16)}.{'pdf' if content_type == 'application/pdf' else 'txt'}"
    (upload_root() / key).write_bytes(raw)
    summary, _ = ai.summarise_document(title, text)
    doc = KnowledgeDocument(title=title, doc_type=doc_type, storage_key=key, chunk_count=len(parts), summary=summary,
                            uploaded_by=uploaded_by, original_filename=filename[:255], content_type=content_type,
                            size_bytes=len(raw))
    doc.chunks = [KnowledgeChunk(position=i, heading=h, text=body) for i, (h, body) in enumerate(parts)]
    embed = ai.embedder()
    if embed is not None:
        try:
            for start in range(0, len(doc.chunks), 64):
                batch = doc.chunks[start:start + 64]
                for c, v in zip(batch, embed([f"{c.heading or ''}\n{c.text}" for c in batch])):
                    c.embedding = v
        except AIError:
            pass  # keyword search still works; vectors can be added by re-uploading later
    db.add(doc)
    db.flush()
    return doc


@router.get("", response_model=list[DocumentOut], summary="Company documents")
def documents(_: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return [_out(d) for d in db.scalars(select(KnowledgeDocument).order_by(KnowledgeDocument.title))]


@router.get("/search", response_model=list[dict], summary="Find passages in company documents")
def search_docs(q: str = Query(min_length=2, max_length=200), _: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return [citation(h) for h in search(db, q, limit=8, embed=ai.embedder())]


@router.get("/{document_id}", response_model=DocumentDetail, summary="A document's summary and passages")
def document(document_id: int, _: User = Depends(get_current_user), db: Session = Depends(get_db)):
    d = db.get(KnowledgeDocument, document_id)
    if d is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Document not found")
    return DocumentDetail(**_out(d).model_dump(), chunks=[ChunkOut(id=c.id, position=c.position, heading=c.heading, text=c.text)
                                                          for c in d.chunks])


@router.post("", response_model=DocumentOut, status_code=201, summary="Upload a PDF, Markdown or text document (admins)")
def upload(request: Request, file: UploadFile = File(...), title: str = Form(..., min_length=3, max_length=200),
           doc_type: str = Form("sop"), admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    if doc_type not in DOC_TYPES:
        raise field_error("doc_type", "Choose a document type")
    raw = file.file.read(MAX_MB * 1024 * 1024 + 1)
    if len(raw) > MAX_MB * 1024 * 1024:
        raise field_error("file", f"Documents must be {MAX_MB} MB or smaller.")
    try:
        doc = index_document(db, title=title.strip(), doc_type=doc_type, raw=raw, filename=file.filename or "document",
                             uploaded_by=admin.id)
    except DocumentRejected as e:
        raise field_error("file", str(e))
    audit.record(db, "knowledge.upload", user_id=admin.id, entity_type="knowledge_document", entity_id=doc.id,
                 details={"title": doc.title, "chunks": doc.chunk_count}, request=request)
    db.commit()
    db.refresh(doc)
    return _out(doc)


@router.delete("/{document_id}", status_code=204, summary="Remove a document (admins)")
def delete(document_id: int, request: Request, admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    d = db.get(KnowledgeDocument, document_id)
    if d is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Document not found")
    path = upload_root() / d.storage_key
    db.delete(d)
    audit.record(db, "knowledge.delete", user_id=admin.id, entity_type="knowledge_document", entity_id=document_id,
                 request=request)
    db.commit()
    path.unlink(missing_ok=True)
