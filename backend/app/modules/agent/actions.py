"""Level D action layer — the ONLY write path the agent can trigger.

The LLM proposes a typed action; this module re-validates and commits it deterministically,
user-scoped, with an audit-log row. v1 whitelist: create_expense only.
"""
from datetime import date as date_cls, datetime
from decimal import Decimal
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.agent.models import AgentActionLog
from app.modules.expenses import service as expense_service
from app.modules.expenses.models import ExpenseFrequency
from app.modules.expenses.schemas import ExpenseCreate


class ActionError(Exception):
    """Unknown action_type (caller maps to HTTP 400). Arg validation raises pydantic ValidationError."""


class CreateExpenseArgs(BaseModel):
    """Strict args for create_expense, re-validated at commit (independent of the LLM proposal)."""
    name: str = Field(..., min_length=1, max_length=100)
    amount: Decimal = Field(..., gt=0)
    category: Optional[str] = Field(None, max_length=50)
    date: Optional[date_cls] = None  # one-time expense date; defaults to today


async def _commit_create_expense(db: AsyncSession, user_id: UUID, args: CreateExpenseArgs) -> dict:
    when = datetime.combine(args.date or date_cls.today(), datetime.min.time())
    expense = await expense_service.create_expense(
        db, user_id,
        ExpenseCreate(name=args.name, amount=args.amount, category=args.category,
                      currency="USD", frequency=ExpenseFrequency.ONE_TIME, date=when),
        commit=False,
    )
    return {"entity_type": "expense", "id": str(expense.id), "name": expense.name,
            "amount": float(expense.amount), "category": expense.category,
            "date": expense.date.date().isoformat() if expense.date else None}


# Whitelist: action_type -> (args model, committer). The agent can ONLY do what's listed here.
ACTION_REGISTRY = {
    "create_expense": (CreateExpenseArgs, _commit_create_expense),
}


async def commit_action(db: AsyncSession, user_id: UUID, action_type: str,
                        args: dict, idempotency_key: str) -> dict:
    """Validate + commit a proposed action idempotently and atomically, with an audit row. Sole
    write path; user_id comes from the caller (auth), never from `args`. The entity and its audit
    row commit in ONE transaction; the (user_id, idempotency_key) unique constraint is the
    concurrency guard, so a losing racer's entity rolls back too (no orphan)."""
    spec = ACTION_REGISTRY.get(action_type)
    if spec is None:
        raise ActionError(f"unknown action_type '{action_type}'")
    args_model, committer = spec
    validated = args_model.model_validate(args)  # pydantic ValidationError -> caller maps to 422

    replay = await _existing_replay(db, user_id, action_type, idempotency_key)
    if replay is not None:
        return replay

    try:
        created = await committer(db, user_id, validated)  # commit=False: entity not yet committed
        db.add(AgentActionLog(
            user_id=user_id, action_type=action_type, args=args, status="committed",
            created_entity_type=created["entity_type"], created_entity_id=UUID(created["id"]),
            idempotency_key=idempotency_key,
        ))
        await db.commit()  # atomic: entity + audit together
    except IntegrityError:
        # A concurrent request with the same key won the race. Roll back (drops our just-created
        # entity AND audit) and return the winner's committed result.
        await db.rollback()
        replay = await _existing_replay(db, user_id, action_type, idempotency_key)
        if replay is not None:
            return replay
        raise
    return {"status": "committed", "action_type": action_type, "created": created,
            "idempotency_key": idempotency_key}


async def _existing_replay(db: AsyncSession, user_id: UUID, action_type: str,
                           idempotency_key: str) -> Optional[dict]:
    """Return the idempotent-replay payload for a prior committed action with this key, or None."""
    existing = (await db.execute(select(AgentActionLog).where(
        AgentActionLog.user_id == user_id,
        AgentActionLog.idempotency_key == idempotency_key,
    ))).scalar_one_or_none()
    if existing is None:
        return None
    return {"status": "committed", "action_type": action_type,
            "created": {"entity_type": existing.created_entity_type,
                        "id": str(existing.created_entity_id)},
            "idempotency_key": idempotency_key, "idempotent_replay": True}
