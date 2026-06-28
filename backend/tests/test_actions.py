import pytest
from sqlalchemy import select, func
from app.modules.agent.actions import commit_action, ActionError
from app.modules.agent.models import AgentActionLog
from app.modules.expenses.models import Expense
from pydantic import ValidationError


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
