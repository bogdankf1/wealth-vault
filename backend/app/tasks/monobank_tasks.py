"""
Monobank Celery tasks.

- backfill_monobank_account: one-shot per-account history pull. Mono enforces
  1 req / 60 s per token, so this sleeps 65 s between API calls.
- sync_monobank_recent: nightly safety-net that pulls the last 24 h for every
  linked account, catching anything the webhook missed.
"""
from __future__ import annotations

import asyncio
import logging
import time
import uuid
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List, Optional

from sqlalchemy import select

from app.core.celery_app import celery_app
from app.core.encryption import decrypt_token
from app.modules.monobank.client import (
    MonobankClient,
    MonobankInvalidToken,
    MonobankRateLimited,
    chunk_statement_windows,
)
from app.modules.monobank.models import MonobankConnection, MonobankConnectionStatus
from app.modules.monobank.service import EXTERNAL_SOURCE, import_statement_items
from app.modules.savings.models import SavingsAccount
from app.tasks.base import BaseTask, get_async_db_session


logger = logging.getLogger(__name__)

# 60s + small safety margin to stay clear of Mono's per-token rate limit.
INTER_CALL_SLEEP = 65


@celery_app.task(base=BaseTask, bind=True, name="tasks.monobank.backfill_account")
def backfill_monobank_account(
    self,
    connection_id: str,
    savings_account_id: str,
    months_back: int = 3,
) -> Dict[str, Any]:
    """Pull `months_back` months of statement history for one linked Mono account."""
    async def _run() -> Dict[str, Any]:
        client = MonobankClient()
        total_inserted = 0
        total_skipped = 0
        async with get_async_db_session() as db:
            conn = await db.get(MonobankConnection, uuid.UUID(connection_id))
            if conn is None or conn.status != MonobankConnectionStatus.ACTIVE.value:
                return {"status": "skipped", "reason": "no_active_connection"}

            savings = await db.get(SavingsAccount, uuid.UUID(savings_account_id))
            if savings is None or savings.external_source != EXTERNAL_SOURCE:
                return {"status": "skipped", "reason": "not_linked"}
            if savings.user_id != conn.user_id:
                return {"status": "skipped", "reason": "ownership_mismatch"}

            token = decrypt_token(conn.encrypted_token)
            windows = chunk_statement_windows(months_back)

            for i, window in enumerate(windows):
                if i > 0:
                    await asyncio.sleep(INTER_CALL_SLEEP)
                try:
                    items = await client.get_statement(
                        token, savings.external_id, window.from_ts, window.to_ts
                    )
                except MonobankInvalidToken:
                    conn.status = MonobankConnectionStatus.INVALID_TOKEN.value
                    conn.last_error = "401 from Mono during backfill"
                    await db.commit()
                    return {"status": "invalid_token"}
                except MonobankRateLimited:
                    logger.warning("Mono rate-limited during backfill; sleeping extra")
                    await asyncio.sleep(INTER_CALL_SLEEP)
                    continue

                inserted, skipped = await import_statement_items(
                    db, conn.user_id, savings.id, items
                )
                total_inserted += inserted
                total_skipped += skipped
                logger.info(
                    "monobank backfill window %s..%s: inserted=%s skipped=%s",
                    window.from_ts, window.to_ts, inserted, skipped,
                )

            conn.last_full_sync_at = datetime.now(timezone.utc)
            conn.last_error = None
            await db.commit()
        return {
            "status": "ok",
            "inserted": total_inserted,
            "skipped": total_skipped,
            "windows": len(windows),
        }

    return asyncio.run(_run())


@celery_app.task(base=BaseTask, bind=True, name="tasks.monobank.sync_recent")
def sync_monobank_recent(self) -> Dict[str, Any]:
    """Nightly: pull the last 24h of statements for every linked Mono account."""
    async def _run() -> Dict[str, Any]:
        client = MonobankClient()
        total_inserted = 0
        accounts_synced = 0

        async with get_async_db_session() as db:
            conns: List[MonobankConnection] = list(
                (
                    await db.execute(
                        select(MonobankConnection).where(
                            MonobankConnection.status == MonobankConnectionStatus.ACTIVE.value
                        )
                    )
                ).scalars()
            )

            for conn in conns:
                token = decrypt_token(conn.encrypted_token)
                linked = list(
                    (
                        await db.execute(
                            select(SavingsAccount).where(
                                SavingsAccount.user_id == conn.user_id,
                                SavingsAccount.external_source == EXTERNAL_SOURCE,
                                SavingsAccount.is_active == True,  # noqa: E712
                            )
                        )
                    ).scalars()
                )
                from_ts = int((datetime.now(timezone.utc) - timedelta(hours=26)).timestamp())
                for j, savings in enumerate(linked):
                    if j > 0 or accounts_synced > 0:
                        await asyncio.sleep(INTER_CALL_SLEEP)
                    try:
                        items = await client.get_statement(token, savings.external_id, from_ts)
                    except MonobankInvalidToken:
                        conn.status = MonobankConnectionStatus.INVALID_TOKEN.value
                        conn.last_error = "401 from Mono during nightly sync"
                        await db.commit()
                        break
                    except MonobankRateLimited:
                        await asyncio.sleep(INTER_CALL_SLEEP)
                        continue
                    inserted, _ = await import_statement_items(
                        db, conn.user_id, savings.id, items
                    )
                    total_inserted += inserted
                    accounts_synced += 1
        return {"status": "ok", "accounts_synced": accounts_synced, "inserted": total_inserted}

    return asyncio.run(_run())
