"""agent_action_log (Level D actions audit)

Revision ID: c1actions
Revises: b2embed
Create Date: 2026-06-28
"""
from typing import Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB, UUID

revision: str = "c1actions"
down_revision: Union[str, None] = "b2embed"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "agent_action_log",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("user_id", UUID(as_uuid=True),
                  sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("action_type", sa.String(length=50), nullable=False),
        sa.Column("args", JSONB, nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("created_entity_type", sa.String(length=50), nullable=True),
        sa.Column("created_entity_id", UUID(as_uuid=True), nullable=True),
        sa.Column("idempotency_key", sa.String(length=100), nullable=False),
        sa.Column("error", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.UniqueConstraint("user_id", "idempotency_key", name="uq_agent_action_user_idem"),
    )
    op.create_index("ix_agent_action_log_user_id", "agent_action_log", ["user_id"])


def downgrade() -> None:
    op.drop_index("ix_agent_action_log_user_id", table_name="agent_action_log")
    op.drop_table("agent_action_log")
