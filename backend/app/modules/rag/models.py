"""
RAG module models: retained raw documents + the pgvector embedding store.

These tables are managed exclusively by Alembic (migrations b1pgvec + b2embed) and are
deliberately NOT imported by backend/create_all_tables.py — mirroring how the Monobank
tables are kept out of the create_all bootstrap. That keeps a single owner per table:
fresh databases get the legacy schema from create_all and these incremental tables from
`alembic upgrade head`, with no double-creation conflict.
"""
from sqlalchemy import Column, String, DateTime, Text, Integer, ForeignKey
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.sql import func
from pgvector.sqlalchemy import Vector
import uuid

from app.core.database import Base


class ParsedDocument(Base):
    """
    Raw output of the Vision pipeline, retained for RAG.

    The structured-extraction endpoints in app/modules/ai/service.py persist their clean
    rows into domain tables (expenses, income, ...) but historically discarded the raw
    text the model produced. We keep it here so the semantic arm of the agent can retrieve
    "what the document actually said", not just the tidy numbers.
    """
    __tablename__ = "parsed_documents"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    uploaded_file_id = Column(UUID(as_uuid=True), ForeignKey("uploaded_files.id", ondelete="SET NULL"), nullable=True, index=True)
    doc_type = Column(String(50), nullable=False)  # income, account, portfolio, subscription, installment, statement
    raw_text = Column(Text, nullable=True)  # narrative / OCR text the model returned
    structured_json = Column(JSONB, nullable=True)  # the parsed structured payload
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class DocumentEmbedding(Base):
    """
    pgvector store for the RAG / semantic-retrieval arm of the agent.

    One row per embedded chunk. Structured records (a transaction, a subscription) become
    a single templated natural-language chunk; longer parsed_documents.raw_text is split
    into several. `source_table`/`source_id` link a chunk back to its origin row for
    citation and for eval ground-truth assertions. `embedding` is cosine-indexed (HNSW).
    All retrieval is scoped `WHERE user_id = :user_id`.
    """
    __tablename__ = "document_embeddings"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    source_table = Column(String(50), nullable=False)  # expense, income_transaction, subscription, ai_insight, parsed_document, ...
    source_id = Column(UUID(as_uuid=True), nullable=True)  # origin row id (null for split-doc chunks)
    chunk_index = Column(Integer, nullable=False, default=0)
    content = Column(Text, nullable=False)  # the exact text that was embedded
    embedding = Column(Vector(1536), nullable=False)  # text-embedding-3-small
    # `metadata` is reserved on the SQLAlchemy declarative Base, so the attribute is `meta`.
    meta = Column("metadata", JSONB, nullable=True)  # {date, category, amount, currency, ...} for filtering + citation
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
