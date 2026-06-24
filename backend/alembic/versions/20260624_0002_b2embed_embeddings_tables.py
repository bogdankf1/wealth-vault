"""parsed_documents + document_embeddings (pgvector) tables.

Revision ID: b2embed
Revises: b1pgvec
Create Date: 2026-06-24

Adds:
  - parsed_documents: raw Vision-pipeline output retained for RAG.
  - document_embeddings: the pgvector store (one row per embedded chunk), with an
    HNSW cosine index for similarity search and a (user_id, source_table) btree index
    for tenant-scoped filtered retrieval.

Indexes are created with plain CREATE INDEX (not CONCURRENTLY) so the whole migration
runs in one transaction and is safe through a pgbouncer transaction-mode pooler.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql
from pgvector.sqlalchemy import Vector


revision: str = "b2embed"
down_revision: Union[str, None] = "b1pgvec"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "parsed_documents",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "uploaded_file_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("uploaded_files.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("doc_type", sa.String(length=50), nullable=False),
        sa.Column("raw_text", sa.Text(), nullable=True),
        sa.Column("structured_json", postgresql.JSONB(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_parsed_documents_user", "parsed_documents", ["user_id"])

    op.create_table(
        "document_embeddings",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("source_table", sa.String(length=50), nullable=False),
        sa.Column("source_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("chunk_index", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("embedding", Vector(1536), nullable=False),
        sa.Column("metadata", postgresql.JSONB(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index(
        "ix_document_embeddings_user_source",
        "document_embeddings",
        ["user_id", "source_table"],
    )
    # HNSW index for cosine similarity. HNSW (vs IVFFlat) needs no training step and
    # gives better recall at our single-user data scale; build cost is negligible here.
    op.create_index(
        "ix_document_embeddings_hnsw",
        "document_embeddings",
        ["embedding"],
        postgresql_using="hnsw",
        postgresql_with={"m": 16, "ef_construction": 64},
        postgresql_ops={"embedding": "vector_cosine_ops"},
    )


def downgrade() -> None:
    op.drop_index("ix_document_embeddings_hnsw", table_name="document_embeddings")
    op.drop_index("ix_document_embeddings_user_source", table_name="document_embeddings")
    op.drop_table("document_embeddings")
    op.drop_index("ix_parsed_documents_user", table_name="parsed_documents")
    op.drop_table("parsed_documents")
