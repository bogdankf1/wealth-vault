"""Monobank integration: connections table + external linkage on savings tables.

Revision ID: a1mono
Revises:
Create Date: 2026-05-22

This is intentionally the first Alembic migration in the project. The existing
schema was built via backend/create_all_tables.py (Base.metadata.create_all),
so this migration only adds Monobank-specific objects on top — it does not
attempt to recreate prior tables.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "a1mono"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
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

    op.add_column(
        "savings_accounts",
        sa.Column("external_source", sa.String(length=32), nullable=True),
    )
    op.add_column(
        "savings_accounts",
        sa.Column("external_id", sa.String(length=128), nullable=True),
    )
    op.create_index(
        "ix_savings_accounts_external",
        "savings_accounts",
        ["user_id", "external_source", "external_id"],
        unique=True,
        postgresql_where=sa.text("external_id IS NOT NULL"),
    )

    op.add_column(
        "account_transactions",
        sa.Column("external_source", sa.String(length=32), nullable=True),
    )
    op.add_column(
        "account_transactions",
        sa.Column("external_id", sa.String(length=128), nullable=True),
    )
    op.create_index(
        "ix_account_transactions_external",
        "account_transactions",
        ["user_id", "external_source", "external_id"],
        unique=True,
        postgresql_where=sa.text("external_id IS NOT NULL"),
    )


def downgrade() -> None:
    op.drop_index("ix_account_transactions_external", table_name="account_transactions")
    op.drop_column("account_transactions", "external_id")
    op.drop_column("account_transactions", "external_source")

    op.drop_index("ix_savings_accounts_external", table_name="savings_accounts")
    op.drop_column("savings_accounts", "external_id")
    op.drop_column("savings_accounts", "external_source")

    op.drop_table("monobank_connections")
