"""Celery task: purge expired demo users and all their data."""
import logging
from datetime import datetime, timezone

from sqlalchemy import select, delete, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.celery_app import celery_app
from app.tasks.base import BaseTask, get_async_db_session
from app.models.user import User

logger = logging.getLogger(__name__)

# user_id FKs WITHOUT ON DELETE CASCADE — must be deleted before the user (children before
# parents). If a future migration adds a new user-owned table without ON DELETE CASCADE, add it
# here or the nightly purge will fail with an FK violation.
NON_CASCADE_TABLES = (
    "income_transactions",
    "income_sources",
    "support_messages",
    "support_topics",
    "budgets",
    "backups",
    # notifications: user_id FK is non-cascade in the model; it exists (and cascades) on prod but
    # is absent on some dev DBs. Listed defensively — _purge_expired skips any table absent here.
    "notifications",
)


async def _purge_expired(db: AsyncSession) -> int:
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
        # Schemas can differ across environments (e.g. a table cascades on prod but
        # is absent on a dev DB). Skip any listed table that doesn't exist here so one
        # environment's schema can't break the purge.
        if await db.scalar(text("SELECT to_regclass(:t)"), {"t": f"public.{table}"}) is None:
            continue
        await db.execute(
            text(f'DELETE FROM "{table}" WHERE user_id = ANY(CAST(:ids AS uuid[]))'),
            {"ids": ids},
        )
    await db.execute(delete(User).where(User.id.in_(ids)))
    await db.commit()
    return len(ids)


@celery_app.task(base=BaseTask, bind=True, name="tasks.demo.purge_expired_demo_users")
def purge_expired_demo_users(self):
    import asyncio

    async def _run():
        async with get_async_db_session() as db:
            return await _purge_expired(db)

    count = asyncio.get_event_loop().run_until_complete(_run())
    logger.info("Purged %d expired demo users", count)
    return {"purged": count}
