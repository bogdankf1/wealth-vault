"""demo user columns + uuid-ossp

Revision ID: d1demo
Revises: c1actions
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "d1demo"
down_revision: Union[str, None] = "c1actions"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # uuid_generate_v5 is used by the demo clone service
    op.execute('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"')
    op.add_column("users", sa.Column("is_demo", sa.Boolean(), nullable=False, server_default=sa.false()))
    op.add_column("users", sa.Column("demo_expires_at", sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    op.drop_column("users", "demo_expires_at")
    op.drop_column("users", "is_demo")
