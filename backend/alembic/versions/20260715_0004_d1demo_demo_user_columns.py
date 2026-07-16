"""demo user columns + uuid-ossp

Revision ID: d1demo
Revises: c1actions
"""
from typing import Sequence, Union

from alembic import op

revision: str = "d1demo"
down_revision: Union[str, None] = "c1actions"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # uuid_generate_v5 is used by the demo clone service
    op.execute('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"')
    # Idempotent adds: on a fresh DB `users` is built by create_all_tables.py (which imports the
    # User model, so these columns already exist) BEFORE `alembic upgrade` runs; on an
    # already-migrated DB they don't exist yet. IF NOT EXISTS lets this migration succeed in BOTH
    # bootstrap orders (create_all + alembic, as CI/deploy use — and a pure-alembic upgrade)
    # instead of failing with a duplicate-column error.
    op.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS is_demo BOOLEAN NOT NULL DEFAULT false")
    op.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS demo_expires_at TIMESTAMPTZ")


def downgrade() -> None:
    op.execute("ALTER TABLE users DROP COLUMN IF EXISTS demo_expires_at")
    op.execute("ALTER TABLE users DROP COLUMN IF EXISTS is_demo")
