"""Enable the pgvector extension.

Revision ID: b1pgvec
Revises: a1mono
Create Date: 2026-06-24

Foundation for the RAG / semantic-retrieval layer. Kept as its own migration so the
extension exists before any table references the `vector` type. Uses CREATE EXTENSION
IF NOT EXISTS so it is a no-op on managed Postgres where the extension is already
enabled (e.g. Supabase). Runs inside Alembic's transaction — no CONCURRENTLY here — so
it works through a pgbouncer transaction-mode pooler.
"""
from typing import Sequence, Union

from alembic import op


revision: str = "b1pgvec"
down_revision: Union[str, None] = "a1mono"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS vector")


def downgrade() -> None:
    op.execute("DROP EXTENSION IF EXISTS vector")
