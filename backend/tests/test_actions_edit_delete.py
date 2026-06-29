import pytest
import pytest_asyncio
from uuid import uuid4
from sqlalchemy import select, delete
from app.modules.agent.actions import commit_action, ACTION_REGISTRY, ActionError
from app.modules.agent.models import AgentActionLog
from app.modules.expenses.models import Expense

_KEYS = ("idem-seed-x", "idem-upd-1", "idem-del-1", "idem-upd-missing", "idem-del-missing")


@pytest_asyncio.fixture(autouse=True)
async def _cleanup(db, user_id):
    yield
    logs = (await db.execute(select(AgentActionLog).where(
        AgentActionLog.user_id == user_id,
        AgentActionLog.idempotency_key.in_(_KEYS)))).scalars().all()
    for lg in logs:
        if lg.created_entity_id is not None:
            await db.execute(delete(Expense).where(Expense.id == lg.created_entity_id))
    await db.execute(delete(AgentActionLog).where(
        AgentActionLog.user_id == user_id, AgentActionLog.idempotency_key.in_(_KEYS)))
    await db.commit()


async def _seed_expense(db, user_id) -> str:
    r = await commit_action(db, user_id, "create_expense",
                            {"name": "EditMe", "amount": 50, "category": "Misc"}, "idem-seed-x")
    return r["created"]["id"]


def test_registry_has_update_and_delete():
    assert "update_expense" in ACTION_REGISTRY and "delete_expense" in ACTION_REGISTRY


@pytest.mark.asyncio
async def test_update_expense_changes_fields(db, user_id):
    eid = await _seed_expense(db, user_id)
    r = await commit_action(db, user_id, "update_expense",
                            {"expense_id": eid, "amount": 75, "category": "Updated"}, "idem-upd-1")
    assert r["status"] == "committed" and r["created"]["entity_type"] == "expense"
    exp = (await db.execute(select(Expense).where(Expense.id == eid))).scalar_one()
    assert float(exp.amount) == 75.0 and exp.category == "Updated"


@pytest.mark.asyncio
async def test_delete_expense_removes_row(db, user_id):
    eid = await _seed_expense(db, user_id)
    r = await commit_action(db, user_id, "delete_expense", {"expense_id": eid}, "idem-del-1")
    assert r["status"] == "committed"
    assert (await db.execute(select(Expense).where(Expense.id == eid))).scalar_one_or_none() is None


@pytest.mark.asyncio
async def test_update_missing_expense_raises(db, user_id):
    with pytest.raises(ActionError):
        await commit_action(db, user_id, "update_expense",
                            {"expense_id": str(uuid4()), "amount": 5}, "idem-upd-missing")


@pytest.mark.asyncio
async def test_delete_missing_expense_raises(db, user_id):
    with pytest.raises(ActionError):
        await commit_action(db, user_id, "delete_expense",
                            {"expense_id": str(uuid4())}, "idem-del-missing")
