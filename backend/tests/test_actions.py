import asyncio
import pytest
from uuid import UUID
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool
from app.modules.agent.actions import commit_action, ActionError
from app.modules.agent.models import AgentActionLog
from app.modules.expenses.models import Expense
from app.core.config import settings
from pydantic import ValidationError


@pytest.mark.asyncio
async def test_user_id_in_args_is_ignored(db, user_id):
    """Auth scoping: a user_id smuggled into args is ignored — entity + audit use the caller's id."""
    r = await commit_action(db, user_id, "create_expense",
                            {"name": "Scoped", "amount": 2,
                             "user_id": "11111111-1111-1111-1111-111111111111"},
                            "idem-scope-1")
    log = (await db.execute(select(AgentActionLog).where(
        AgentActionLog.idempotency_key == "idem-scope-1"))).scalar_one()
    assert log.user_id == user_id
    exp = (await db.execute(select(Expense).where(
        Expense.id == UUID(r["created"]["id"])))).scalar_one()
    assert exp.user_id == user_id


async def _expense_count(db, user_id):
    return (await db.execute(
        select(func.count()).select_from(Expense).where(Expense.user_id == user_id)
    )).scalar_one()


@pytest.mark.asyncio
async def test_commit_create_expense_happy_path(db, user_id):
    before = await _expense_count(db, user_id)
    r = await commit_action(db, user_id, "create_expense",
                            {"name": "Coffee", "amount": 4.5, "category": "Coffee"},
                            "idem-happy-1")
    assert r["status"] == "committed"
    assert r["created"]["entity_type"] == "expense" and r["created"]["amount"] == 4.5
    assert await _expense_count(db, user_id) == before + 1
    log = (await db.execute(select(AgentActionLog).where(
        AgentActionLog.idempotency_key == "idem-happy-1"))).scalar_one()
    assert log.status == "committed" and str(log.created_entity_id) == r["created"]["id"]


@pytest.mark.asyncio
async def test_unknown_action_type_rejected_no_write(db, user_id):
    before = await _expense_count(db, user_id)
    with pytest.raises(ActionError):
        await commit_action(db, user_id, "delete_everything", {}, "idem-bad-1")
    assert await _expense_count(db, user_id) == before


@pytest.mark.asyncio
async def test_invalid_args_rejected_no_write(db, user_id):
    before = await _expense_count(db, user_id)
    with pytest.raises(ValidationError):
        await commit_action(db, user_id, "create_expense",
                            {"name": "X", "amount": -5}, "idem-bad-2")
    assert await _expense_count(db, user_id) == before


@pytest.mark.asyncio
async def test_idempotent_same_key_commits_once(db, user_id):
    before = await _expense_count(db, user_id)
    a = await commit_action(db, user_id, "create_expense",
                            {"name": "Tea", "amount": 3}, "idem-dup")
    b = await commit_action(db, user_id, "create_expense",
                            {"name": "Tea", "amount": 3}, "idem-dup")
    assert await _expense_count(db, user_id) == before + 1
    assert b.get("idempotent_replay") is True
    assert a["created"]["id"] == b["created"]["id"]


@pytest.mark.asyncio
async def test_happy_path_one_expense_one_audit_atomic(db, user_id):
    before = await _expense_count(db, user_id)
    r = await commit_action(db, user_id, "create_expense",
                            {"name": "Atomic", "amount": 11}, "idem-atomic-1")
    assert r["status"] == "committed"
    assert await _expense_count(db, user_id) == before + 1
    logs = (await db.execute(select(AgentActionLog).where(
        AgentActionLog.idempotency_key == "idem-atomic-1"))).scalars().all()
    assert len(logs) == 1
    exp = (await db.execute(select(Expense).where(
        Expense.id == logs[0].created_entity_id))).scalar_one()
    assert float(exp.amount) == 11.0


@pytest.mark.asyncio
async def test_concurrent_same_key_creates_one_expense(db, user_id):
    """Two concurrent commits with the same key -> exactly one expense + one audit; the loser
    rolls back (no orphan) and returns the winner's result."""
    key = "idem-race-1"
    before = await _expense_count(db, user_id)

    engine = create_async_engine(str(settings.DATABASE_URL), poolclass=NullPool)
    Session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with Session() as s1, Session() as s2:
        results = await asyncio.gather(
            commit_action(s1, user_id, "create_expense", {"name": "Race", "amount": 5}, key),
            commit_action(s2, user_id, "create_expense", {"name": "Race", "amount": 5}, key),
            return_exceptions=True,
        )
    await engine.dispose()

    assert all(not isinstance(r, Exception) for r in results), results
    assert results[0]["created"]["id"] == results[1]["created"]["id"]
    logs = (await db.execute(select(AgentActionLog).where(
        AgentActionLog.idempotency_key == key))).scalars().all()
    assert len(logs) == 1
    assert await _expense_count(db, user_id) == before + 1
