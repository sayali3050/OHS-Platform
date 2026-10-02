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
