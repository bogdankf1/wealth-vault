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
    """Validate + commit a proposed action idempotently, with an audit row. Sole write path;
    user_id comes from the caller (auth), never from `args`."""
    spec = ACTION_REGISTRY.get(action_type)
    if spec is None:
        raise ActionError(f"unknown action_type '{action_type}'")
    args_model, committer = spec

    existing = (await db.execute(select(AgentActionLog).where(
        AgentActionLog.user_id == user_id,
        AgentActionLog.idempotency_key == idempotency_key,
    ))).scalar_one_or_none()
    if existing:  # only committed rows are ever written -> a hit is an idempotent replay
        return {"status": "committed", "action_type": action_type,
                "created": {"entity_type": existing.created_entity_type,
                            "id": str(existing.created_entity_id)},
                "idempotency_key": idempotency_key, "idempotent_replay": True}

    validated = args_model.model_validate(args)  # pydantic ValidationError -> caller maps to 422
    created = await committer(db, user_id, validated)
    # Audit only committed actions (status is always "committed"; failed attempts aren't logged).
    # v2 hardening: create_expense already committed above, so this audit row is a SECOND commit
    # (entity+audit not atomic), and the idempotency check is check-then-insert (the unique
    # constraint is the concurrency backstop). Acceptable for single-user v1; revisit under load.
    db.add(AgentActionLog(
        user_id=user_id, action_type=action_type, args=args, status="committed",
        created_entity_type=created["entity_type"], created_entity_id=UUID(created["id"]),
        idempotency_key=idempotency_key,
    ))
    await db.commit()
    return {"status": "committed", "action_type": action_type, "created": created,
            "idempotency_key": idempotency_key}
