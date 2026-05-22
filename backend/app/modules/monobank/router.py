"""
FastAPI routes for Monobank integration.

User-facing routes (auth + tier-gated to Growth/Wealth):
    POST   /api/v1/integrations/monobank/connect
    DELETE /api/v1/integrations/monobank/connection
    GET    /api/v1/integrations/monobank/status
    GET    /api/v1/integrations/monobank/accounts
    POST   /api/v1/integrations/monobank/accounts/{mono_account_id}/link

Webhook (no auth — the URL secret IS the auth):
    GET    /api/v1/integrations/monobank/webhook/{secret}   (Mono's validation ping)
    POST   /api/v1/integrations/monobank/webhook/{secret}   (statement events)
"""
from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.permissions import get_current_user, require_any_tier
from app.models.user import User
from app.modules.monobank import service as mono_service
from app.modules.monobank.client import (
    MonobankClient,
    MonobankInvalidToken,
    MonobankError,
)
from app.modules.monobank.models import MonobankConnection
from app.modules.monobank.schemas import (
    ConnectRequest,
    ConnectionStatus,
    LinkAccountRequest,
    LinkAccountResponse,
    MonoAccountList,
)
from app.modules.savings.models import SavingsAccount


logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/integrations/monobank", tags=["monobank"])

_client_singleton: Optional[MonobankClient] = None


def get_mono_client() -> MonobankClient:
    global _client_singleton
    if _client_singleton is None:
        _client_singleton = MonobankClient()
    return _client_singleton


# -------------------------- user-facing routes ---------------------------


@router.post("/connect", response_model=ConnectionStatus)
@require_any_tier("growth", "wealth")
async def connect_monobank(
    payload: ConnectRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    try:
        conn = await mono_service.connect(db, current_user.id, payload.token, get_mono_client())
    except MonobankInvalidToken:
        raise HTTPException(status_code=401, detail="Monobank rejected the token. Generate a new one at https://api.monobank.ua/.")
    except MonobankError as e:
        raise HTTPException(status_code=502, detail=f"Monobank error: {e}")
    return _conn_to_status(conn)


@router.delete("/connection")
@require_any_tier("growth", "wealth")
async def disconnect_monobank(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    removed = await mono_service.disconnect(db, current_user.id)
    return {"removed": removed}


@router.get("/status", response_model=ConnectionStatus)
@require_any_tier("growth", "wealth")
async def get_status(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    conn = await mono_service.get_connection(db, current_user.id)
    if conn is None:
        return ConnectionStatus(connected=False)
    return _conn_to_status(conn)


@router.get("/accounts", response_model=MonoAccountList)
@require_any_tier("growth", "wealth")
async def list_accounts(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    try:
        return await mono_service.list_mono_accounts(db, current_user.id, get_mono_client())
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except MonobankInvalidToken:
        raise HTTPException(status_code=401, detail="Monobank rejected the stored token. Re-connect with a fresh one.")
    except MonobankError as e:
        raise HTTPException(status_code=502, detail=f"Monobank error: {e}")


@router.post("/accounts/{mono_account_id}/link", response_model=LinkAccountResponse)
@require_any_tier("growth", "wealth")
async def link_account(
    mono_account_id: str,
    payload: LinkAccountRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    try:
        savings_id = uuid.UUID(payload.savings_account_id) if payload.savings_account_id else None
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid savings_account_id")

    try:
        savings = await mono_service.link_mono_account(
            db,
            current_user.id,
            mono_account_id,
            savings_account_id=savings_id,
            client=get_mono_client(),
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except MonobankInvalidToken:
        raise HTTPException(status_code=401, detail="Monobank rejected the stored token. Re-connect with a fresh one.")

    # Kick off the backfill async — import here to avoid circular import at module load.
    from app.tasks.monobank_tasks import backfill_monobank_account

    conn = await mono_service.get_connection(db, current_user.id)
    backfill_task = backfill_monobank_account.delay(
        str(conn.id), str(savings.id), payload.backfill_months
    )

    return LinkAccountResponse(
        savings_account_id=str(savings.id),
        backfill_task_id=backfill_task.id,
    )


# -------------------------- webhook (no auth) ----------------------------


@router.get("/webhook/{secret}")
async def webhook_verify(secret: str, db: AsyncSession = Depends(get_db)):
    """Mono pings this with GET when setting the webhook; must return 200."""
    conn = await _find_connection_by_secret(db, secret)
    if conn is None:
        raise HTTPException(status_code=404, detail="Unknown webhook secret")
    return {"ok": True}


@router.post("/webhook/{secret}")
async def webhook_event(secret: str, request: Request, db: AsyncSession = Depends(get_db)):
    """
    Mono posts {type: 'StatementItem', data: {account, statementItem}}.
    Per Mono's retry policy we MUST return 200 on success; non-200 triggers
    retries at 5s/60s/600s then disables the webhook.
    """
    conn = await _find_connection_by_secret(db, secret)
    if conn is None:
        # Don't reveal what's valid — silently 404. Mono will retry then give up.
        raise HTTPException(status_code=404, detail="Unknown webhook secret")

    try:
        payload = await request.json()
    except Exception:
        logger.warning("monobank webhook: bad JSON")
        return {"ok": True}  # don't trigger Mono's retry loop on bad bodies

    if payload.get("type") != "StatementItem":
        logger.info("monobank webhook: ignoring type=%s", payload.get("type"))
        return {"ok": True}

    data = payload.get("data") or {}
    mono_account_id = data.get("account")
    item = data.get("statementItem")
    if not mono_account_id or not item:
        return {"ok": True}

    # Find the SavingsAccount this Mono account is linked to (if any).
    savings = (
        await db.execute(
            select(SavingsAccount).where(
                SavingsAccount.user_id == conn.user_id,
                SavingsAccount.external_source == mono_service.EXTERNAL_SOURCE,
                SavingsAccount.external_id == mono_account_id,
            )
        )
    ).scalar_one_or_none()
    if savings is None:
        logger.info(
            "monobank webhook: account %s not linked for user %s — ignoring",
            mono_account_id, conn.user_id,
        )
        return {"ok": True}

    try:
        await mono_service.import_statement_items(db, conn.user_id, savings.id, [item])
    except Exception:
        logger.exception("monobank webhook: failed to import statement item")
        # Still return 200 — we don't want Mono to retry forever on our bugs.
        return {"ok": True}

    conn.last_webhook_at = datetime.now(timezone.utc)
    await db.commit()
    return {"ok": True}


# -------------------------- helpers --------------------------------------


async def _find_connection_by_secret(db: AsyncSession, secret: str) -> Optional[MonobankConnection]:
    return (
        await db.execute(
            select(MonobankConnection).where(MonobankConnection.webhook_secret == secret)
        )
    ).scalar_one_or_none()


def _conn_to_status(conn: MonobankConnection) -> ConnectionStatus:
    return ConnectionStatus(
        connected=True,
        status=conn.status,
        mono_client_name=conn.mono_client_name,
        last_full_sync_at=conn.last_full_sync_at,
        last_webhook_at=conn.last_webhook_at,
        webhook_registered=bool(conn.webhook_registered_at),
        last_error=conn.last_error,
    )
