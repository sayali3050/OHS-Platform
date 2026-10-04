from sqlalchemy import JSON, Boolean, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.base import Base, TimestampMixin


class AIConversation(TimestampMixin, Base):
    __tablename__ = "ai_conversations"
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    assistant: Mapped[str] = mapped_column(String(24), default="safeassist")  # safeassist | copilot
    title: Mapped[str] = mapped_column(String(200), default="New conversation")
    language: Mapped[str] = mapped_column(String(8), default="en")
    messages: Mapped[list["AIMessage"]] = relationship(cascade="all, delete-orphan", order_by="AIMessage.id")


class AIMessage(TimestampMixin, Base):
    __tablename__ = "ai_messages"
    id: Mapped[int] = mapped_column(primary_key=True)
    conversation_id: Mapped[int] = mapped_column(ForeignKey("ai_conversations.id", ondelete="CASCADE"), index=True)
    role: Mapped[str] = mapped_column(String(16), nullable=False)  # user | assistant
    content: Mapped[str] = mapped_column(Text, nullable=False)
    classification: Mapped[str | None] = mapped_column(String(24))  # emergency | safety_guidance | medical_concern
    sources: Mapped[list | None] = mapped_column(JSON)  # RAG citations
    demo_mode: Mapped[bool] = mapped_column(Boolean, default=False)


class KnowledgeDocument(TimestampMixin, Base):
    """Uploaded SOPs/manuals for the RAG knowledge base (vectors live in Qdrant, keyed by chunk id)."""
    __tablename__ = "knowledge_documents"
    id: Mapped[int] = mapped_column(primary_key=True)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    doc_type: Mapped[str] = mapped_column(String(32), default="sop")
    storage_key: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    chunk_count: Mapped[int] = mapped_column(Integer, default=0)
    summary: Mapped[str | None] = mapped_column(Text)
    uploaded_by: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    original_filename: Mapped[str | None] = mapped_column(String(255))
    content_type: Mapped[str | None] = mapped_column(String(100))
    size_bytes: Mapped[int] = mapped_column(Integer, default=0)
    chunks: Mapped[list["KnowledgeChunk"]] = relationship(cascade="all, delete-orphan", order_by="KnowledgeChunk.position")


class KnowledgeChunk(Base):
    """One searchable passage of a document. Keyword search always works; `embedding` is filled when live AI is on."""
    __tablename__ = "knowledge_chunks"
    id: Mapped[int] = mapped_column(primary_key=True)
    document_id: Mapped[int] = mapped_column(ForeignKey("knowledge_documents.id", ondelete="CASCADE"), index=True)
    position: Mapped[int] = mapped_column(Integer, default=0)
    heading: Mapped[str | None] = mapped_column(String(200))
    text: Mapped[str] = mapped_column(Text, nullable=False)
    embedding: Mapped[list | None] = mapped_column(JSON)
