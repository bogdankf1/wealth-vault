"""Celery task: purge expired demo users and all their data."""
import asyncio
from datetime import datetime, timezone

from sqlalchemy import select, delete, text

from app.core.celery_app import celery_app
from app.tasks.base import BaseTask, get_async_db_session
from app.models.user import User

# user_id FKs WITHOUT ON DELETE CASCADE (verified via pg_constraint) — clear before deleting
# the user. Children are listed before their non-cascade parents so per-table FK constraints
# (e.g. income_transactions.source_id -> income_sources, support_messages.topic_id ->
# support_topics) don't block the parent row's delete.
NON_CASCADE_TABLES = (
    "income_transactions",
    "income_sources",
    "support_messages",
    "support_topics",
    "budgets",
    "backups",
)


async def _purge_expired(db) -> int:
    now = datetime.now(timezone.utc)
    result = await db.execute(
        select(User.id).where(
            User.is_demo.is_(True),
            User.demo_expires_at.is_not(None),
            User.demo_expires_at < now,
        )
    )
    ids = [str(r[0]) for r in result]
    if not ids:
        return 0
    for table in NON_CASCADE_TABLES:
        await db.execute(
            text(f'DELETE FROM "{table}" WHERE user_id = ANY(CAST(:ids AS uuid[]))'),
            {"ids": ids},
        )
    await db.execute(delete(User).where(User.id.in_(ids)))
    await db.commit()
    return len(ids)


@celery_app.task(base=BaseTask, bind=True, name="tasks.demo.purge_expired_demo_users")
def purge_expired_demo_users(self):
    async def _run():
        async with get_async_db_session() as db:
            return await _purge_expired(db)
    return asyncio.get_event_loop().run_until_complete(_run())
