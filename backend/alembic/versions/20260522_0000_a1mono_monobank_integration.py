"""Monobank integration: connections table + external linkage on savings tables.

Revision ID: a1mono
Revises:
Create Date: 2026-05-22

This is intentionally the first Alembic migration in the project. The base schema is built
via backend/create_all_tables.py (Base.metadata.create_all). Because the SQLAlchemy models
ALSO define the Monobank columns/indexes, a create_all-bootstrapped database already has
them before this migration runs — so a naive add_column would raise DuplicateColumnError
(exactly the CI failure this guards against). Every step here is therefore idempotent: it
inspects the live schema and only creates what's missing. That keeps both bootstrap paths
working — `create_all` then `alembic upgrade`, and a pure incremental `alembic upgrade`.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "a1mono"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _columns(insp, table: str) -> set:
    return {c["name"] for c in insp.get_columns(table)}


def _indexes(insp, table: str) -> set:
    return {i["name"] for i in insp.get_indexes(table)}


def _add_external_linkage(insp, table: str, index_name: str) -> None:
    """Add external_source/external_id + the unique partial index for one table, skipping
    anything `create_all` already produced from the models."""
    cols = _columns(insp, table)
    if "external_source" not in cols:
        op.add_column(table, sa.Column("external_source", sa.String(length=32), nullable=True))
    if "external_id" not in cols:
        op.add_column(table, sa.Column("external_id", sa.String(length=128), nullable=True))
    if index_name not in _indexes(insp, table):
        op.create_index(
            index_name,
            table,
            ["user_id", "external_source", "external_id"],
            unique=True,
            postgresql_where=sa.text("external_id IS NOT NULL"),
        )


def upgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)

    if "monobank_connections" not in insp.get_table_names():
        op.create_table(
            "monobank_connections",
            sa.Column("id", sa.dialects.postgresql.UUID(as_uuid=True), primary_key=True),
            sa.Column(
                "user_id",
                sa.dialects.postgresql.UUID(as_uuid=True),
                sa.ForeignKey("users.id", ondelete="CASCADE"),
                nullable=False,
            ),
            sa.Column("encrypted_token", sa.String(length=1024), nullable=False),
            sa.Column("webhook_secret", sa.String(length=64), nullable=False),
            sa.Column("webhook_url", sa.String(length=512), nullable=True),
            sa.Column("webhook_registered_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("mono_client_id", sa.String(length=64), nullable=True),
            sa.Column("mono_client_name", sa.String(length=256), nullable=True),
            sa.Column("permissions", sa.String(length=32), nullable=True),
            sa.Column("last_full_sync_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("last_webhook_at", sa.DateTime(timezone=True), nullable=True),
            sa.Column("last_error", sa.String(length=512), nullable=True),
            sa.Column("status", sa.String(length=20), nullable=False, server_default="active"),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
            sa.UniqueConstraint("user_id", name="uq_monobank_connection_user"),
            sa.UniqueConstraint("webhook_secret", name="uq_monobank_webhook_secret"),
        )

    _add_external_linkage(insp, "savings_accounts", "ix_savings_accounts_external")
    _add_external_linkage(insp, "account_transactions", "ix_account_transactions_external")


def downgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)

    for table, index_name in [
        ("account_transactions", "ix_account_transactions_external"),
        ("savings_accounts", "ix_savings_accounts_external"),
    ]:
        if index_name in _indexes(insp, table):
            op.drop_index(index_name, table_name=table)
        cols = _columns(insp, table)
        if "external_id" in cols:
            op.drop_column(table, "external_id")
        if "external_source" in cols:
            op.drop_column(table, "external_source")

    if "monobank_connections" in insp.get_table_names():
        op.drop_table("monobank_connections")
