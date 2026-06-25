"""
Monobank business logic: connect/disconnect, discover & link accounts,
import statements into AccountTransaction rows.
"""
from __future__ import annotations

import logging
import secrets
import uuid
from datetime import datetime, timezone
from decimal import Decimal
from typing import Any, Dict, List, Optional, Tuple

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.monobank.client import (
    MonobankClient,
    MonobankInvalidToken,
    currency_alpha,
    minor_to_decimal,
)
from app.modules.monobank.models import MonobankConnection, MonobankConnectionStatus
from app.modules.monobank.schemas import MonoAccount, MonoAccountList
from app.modules.savings.models import (
    AccountTransaction,
    SavingsAccount,
    TransactionStatus,
    TransactionType,
)
from app.core.encryption import decrypt_token, encrypt_token


logger = logging.getLogger(__name__)

EXTERNAL_SOURCE = "monobank"


# Mono account "type" -> our AccountType string.
MONO_TYPE_TO_ACCOUNT_TYPE: Dict[str, str] = {
    "black": "personal",
    "white": "personal",
    "platinum": "personal",
    "iron": "personal",
    "yellow": "personal",
    "eAid": "personal",
    "fop": "business",
}


def _format_account_title(acc: Dict[str, Any]) -> str:
    masked = acc.get("maskedPan") or []
    last4 = masked[0][-4:] if masked else None
    currency = currency_alpha(int(acc.get("currencyCode", 980)))
    if acc.get("type") == "fop":
        return f"Mono FOP · {currency}"
    if last4:
        return f"Mono ···{last4} · {currency}"
    return f"Mono {acc.get('type', 'account')} · {currency}"


async def _get_connection(db: AsyncSession, user_id: uuid.UUID) -> Optional[MonobankConnection]:
    result = await db.execute(
        select(MonobankConnection).where(MonobankConnection.user_id == user_id)
    )
    return result.scalar_one_or_none()


async def connect(
    db: AsyncSession,
    user_id: uuid.UUID,
    raw_token: str,
    client: MonobankClient,
) -> MonobankConnection:
    """Validate the token via client-info, then persist (or replace) the connection."""
    info = await client.get_client_info(raw_token)  # raises MonobankInvalidToken on bad token

    existing = await _get_connection(db, user_id)
    encrypted = encrypt_token(raw_token)
    webhook_secret = secrets.token_urlsafe(32)

    if existing is None:
        conn = MonobankConnection(
            user_id=user_id,
            encrypted_token=encrypted,
            webhook_secret=webhook_secret,
            mono_client_id=info.get("clientId"),
            mono_client_name=info.get("name"),
            permissions=info.get("permissions"),
            status=MonobankConnectionStatus.ACTIVE.value,
        )
        db.add(conn)
    else:
        existing.encrypted_token = encrypted
        existing.mono_client_id = info.get("clientId")
        existing.mono_client_name = info.get("name")
        existing.permissions = info.get("permissions")
        existing.status = MonobankConnectionStatus.ACTIVE.value
        existing.last_error = None
        # keep the existing webhook_secret so a re-connect doesn't break a registered webhook
        conn = existing

    await db.commit()
    await db.refresh(conn)
    return conn


async def disconnect(db: AsyncSession, user_id: uuid.UUID) -> bool:
    conn = await _get_connection(db, user_id)
    if conn is None:
        return False
    await db.delete(conn)
    await db.commit()
    return True


async def get_connection(db: AsyncSession, user_id: uuid.UUID) -> Optional[MonobankConnection]:
    return await _get_connection(db, user_id)


async def list_mono_accounts(
    db: AsyncSession,
    user_id: uuid.UUID,
    client: MonobankClient,
) -> MonoAccountList:
    """Hit Mono client-info live, decorate with which accounts are already linked."""
    conn = await _get_connection(db, user_id)
    if conn is None:
        raise ValueError("Monobank connection not found for user")

    token = decrypt_token(conn.encrypted_token)
    info = await client.get_client_info(token)

    # Pre-fetch existing links to mark up the response.
    linked = {
        row.external_id: str(row.id)
        for row in (
            await db.execute(
                select(SavingsAccount).where(
                    SavingsAccount.user_id == user_id,
                    SavingsAccount.external_source == EXTERNAL_SOURCE,
                )
            )
        ).scalars()
    }

    accounts: List[MonoAccount] = []
    for acc in info.get("accounts", []):
        accounts.append(MonoAccount(
            mono_account_id=acc["id"],
            kind="account",
            type=acc.get("type"),
            title=_format_account_title(acc),
            iban=acc.get("iban"),
            masked_pan=(acc.get("maskedPan") or [None])[0],
            currency=currency_alpha(int(acc["currencyCode"])),
            balance=float(minor_to_decimal(int(acc["balance"]))),
            credit_limit=float(minor_to_decimal(int(acc.get("creditLimit", 0)))),
            linked_savings_account_id=linked.get(acc["id"]),
        ))

    jars: List[MonoAccount] = []
    for jar in info.get("jars", []):
        jars.append(MonoAccount(
            mono_account_id=jar["id"],
            kind="jar",
            type="jar",
            title=jar.get("title") or "Jar",
            iban=None,
            masked_pan=None,
            currency=currency_alpha(int(jar["currencyCode"])),
            balance=float(minor_to_decimal(int(jar["balance"]))),
            credit_limit=0,
            linked_savings_account_id=linked.get(jar["id"]),
        ))

    return MonoAccountList(accounts=accounts, jars=jars)


async def link_mono_account(
    db: AsyncSession,
    user_id: uuid.UUID,
    mono_account_id: str,
    *,
    savings_account_id: Optional[uuid.UUID] = None,
    client: MonobankClient,
) -> SavingsAccount:
    """
    Link a Mono account/jar to a SavingsAccount. Creates a new SavingsAccount
    if `savings_account_id` is None. Idempotent: re-linking the same Mono
    account returns the existing row.
    """
    conn = await _get_connection(db, user_id)
    if conn is None:
        raise ValueError("Monobank connection not found for user")

    # Has this Mono account already been linked?
    existing_link = (
        await db.execute(
            select(SavingsAccount).where(
                SavingsAccount.user_id == user_id,
                SavingsAccount.external_source == EXTERNAL_SOURCE,
                SavingsAccount.external_id == mono_account_id,
            )
        )
    ).scalar_one_or_none()
    if existing_link is not None:
        return existing_link

    # Pull live data so we get current balance/title.
    token = decrypt_token(conn.encrypted_token)
    info = await client.get_client_info(token)
    mono_obj = _find_mono_account(info, mono_account_id)
    if mono_obj is None:
        raise ValueError(f"Mono account {mono_account_id} not found for this user")

    currency = currency_alpha(int(mono_obj["currencyCode"]))
    balance = minor_to_decimal(int(mono_obj["balance"]))

    if savings_account_id is not None:
        savings = await db.get(SavingsAccount, savings_account_id)
        if savings is None or savings.user_id != user_id:
            raise ValueError("Target SavingsAccount not found or not owned by user")
        if savings.external_id is not None:
            raise ValueError("Target SavingsAccount is already linked to an external source")
        savings.external_source = EXTERNAL_SOURCE
        savings.external_id = mono_account_id
        savings.current_balance = balance
        savings.currency = currency
        savings.institution = savings.institution or "Monobank"
    else:
        # Auto-create.
        kind = "jar" if mono_obj.get("_kind") == "jar" else (mono_obj.get("type") or "personal")
        savings = SavingsAccount(
            user_id=user_id,
            name=_savings_name_for_mono(mono_obj),
            account_type=MONO_TYPE_TO_ACCOUNT_TYPE.get(kind, "personal"),
            institution="Monobank",
            account_number_last4=(mono_obj.get("maskedPan") or [None])[0][-4:] if mono_obj.get("maskedPan") else None,
            current_balance=balance,
            currency=currency,
            external_source=EXTERNAL_SOURCE,
            external_id=mono_account_id,
        )
        db.add(savings)

    await db.commit()
    await db.refresh(savings)
    return savings


def _find_mono_account(info: Dict[str, Any], mono_account_id: str) -> Optional[Dict[str, Any]]:
    for acc in info.get("accounts", []):
        if acc.get("id") == mono_account_id:
            return acc
    for jar in info.get("jars", []):
        if jar.get("id") == mono_account_id:
            jar["_kind"] = "jar"
            return jar
    return None


def _savings_name_for_mono(mono_obj: Dict[str, Any]) -> str:
    if mono_obj.get("_kind") == "jar":
        return f"Mono jar · {mono_obj.get('title') or 'Untitled'}"
    return _format_account_title(mono_obj)


async def import_statement_items(
    db: AsyncSession,
    user_id: uuid.UUID,
    savings_account_id: uuid.UUID,
    items: List[Dict[str, Any]],
) -> Tuple[int, int]:
    """
    Upsert statement items into AccountTransaction. Returns (inserted, skipped).

    Idempotent via the unique index on (user_id, external_source, external_id).
    Mono returns newest-first; we process in chronological order so balance_before
    is correct.
    """
    if not items:
        return (0, 0)

    savings = await db.get(SavingsAccount, savings_account_id)
    if savings is None or savings.user_id != user_id:
        raise ValueError("SavingsAccount not found or not owned by user")

    items_sorted = sorted(items, key=lambda x: x["time"])
    inserted = 0
    skipped = 0
    running_balance: Optional[Decimal] = None

    for item in items_sorted:
        amount = minor_to_decimal(int(item["amount"]))
        post_balance = minor_to_decimal(int(item["balance"]))
        pre_balance = post_balance - amount
        if running_balance is None:
            running_balance = pre_balance

        tx_type = TransactionType.DEPOSIT.value if amount > 0 else TransactionType.WITHDRAWAL.value
        description_parts = []
        if item.get("counterName"):
            description_parts.append(item["counterName"])
        if item.get("description"):
            description_parts.append(item["description"])
        if item.get("comment"):
            description_parts.append(item["comment"])
        description = " — ".join(description_parts) or None

        stmt = pg_insert(AccountTransaction.__table__).values(
            id=uuid.uuid4(),
            account_id=savings_account_id,
            user_id=user_id,
            transaction_type=tx_type,
            amount=abs(amount),
            currency=currency_alpha(int(item.get("currencyCode", 980))),
            balance_before=pre_balance,
            balance_after=post_balance,
            source_type="bank_import",
            description=description,
            category=_category_from_mcc(item.get("mcc")),
            reference_number=item["id"],
            transaction_date=datetime.fromtimestamp(int(item["time"]), tz=timezone.utc),
            posted_date=(
                None if item.get("hold") else datetime.fromtimestamp(int(item["time"]), tz=timezone.utc)
            ),
            status=(
                TransactionStatus.PENDING.value if item.get("hold")
                else TransactionStatus.COMPLETED.value
            ),
            external_source=EXTERNAL_SOURCE,
            external_id=item["id"],
        ).on_conflict_do_nothing(
            index_elements=["user_id", "external_source", "external_id"],
        )
        result = await db.execute(stmt)
        if result.rowcount and result.rowcount > 0:
            inserted += 1
        else:
            skipped += 1

    # Update the account's current_balance from the most recent item.
    if items_sorted:
        latest_balance = minor_to_decimal(int(items_sorted[-1]["balance"]))
        # only move it forward — webhook ordering can race with periodic sync
        if savings.current_balance != latest_balance:
            savings.current_balance = latest_balance

    await db.commit()
    return (inserted, skipped)


# Coarse MCC -> category mapping. AI categorization can refine downstream.
_MCC_BUCKETS = [
    (5411, 5499, "Groceries"),
    (5811, 5814, "Dining"),
    (4111, 4131, "Transit"),
    (4511, 4511, "Travel"),
    (4900, 4900, "Utilities"),
    (5912, 5912, "Pharmacy"),
    (5921, 5921, "Alcohol"),
    (5999, 5999, "Retail"),
    (6010, 6011, "ATM"),
    (6051, 6051, "Transfers"),
    (7832, 7841, "Entertainment"),
]


def _category_from_mcc(mcc: Optional[int]) -> Optional[str]:
    if mcc is None:
        return None
    for lo, hi, name in _MCC_BUCKETS:
        if lo <= mcc <= hi:
            return name
    return None
