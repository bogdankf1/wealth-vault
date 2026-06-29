import pytest
import pytest_asyncio
from sqlalchemy import select, func, delete
from app.modules.agent.actions import commit_action, ACTION_REGISTRY
from app.modules.agent.models import AgentActionLog
from app.modules.income.models import IncomeTransaction
from app.modules.subscriptions.models import Subscription
from app.modules.goals.models import Goal

# Keys used by the create-action tests below.
_CREATE_TEST_KEYS = ("idem-income-1", "idem-sub-1", "idem-goal-1", "idem-income-bad")
_ENTITY_MODELS = {"income": IncomeTransaction, "subscription": Subscription, "goal": Goal}


@pytest_asyncio.fixture(autouse=True)
async def _cleanup_created_entities(db, user_id):
    """Delete the real entities these tests create, so persistent income/subscription/goal rows
    don't pollute exact-total assertions in other test files (and CI). Runs after each test."""
    yield
    logs = (await db.execute(select(AgentActionLog).where(
        AgentActionLog.user_id == user_id,
        AgentActionLog.idempotency_key.in_(_CREATE_TEST_KEYS),
    ))).scalars().all()
    for lg in logs:
        model = _ENTITY_MODELS.get(lg.created_entity_type)
        if model is not None and lg.created_entity_id is not None:
            await db.execute(delete(model).where(model.id == lg.created_entity_id))
    await db.execute(delete(AgentActionLog).where(
        AgentActionLog.user_id == user_id,
        AgentActionLog.idempotency_key.in_(_CREATE_TEST_KEYS),
    ))
    await db.commit()


async def _count(db, model, user_id):
    return (await db.execute(
        select(func.count()).select_from(model).where(model.user_id == user_id))).scalar_one()


def test_registry_has_three_new_actions():
    for a in ("create_income", "create_subscription", "create_goal"):
        assert a in ACTION_REGISTRY


@pytest.mark.asyncio
async def test_commit_create_income(db, user_id):
    before = await _count(db, IncomeTransaction, user_id)
    r = await commit_action(db, user_id, "create_income",
                            {"amount": 2000, "category": "Freelance"}, "idem-income-1")
    assert r["status"] == "committed" and r["created"]["entity_type"] == "income"
    assert await _count(db, IncomeTransaction, user_id) == before + 1
    log = (await db.execute(select(AgentActionLog).where(
        AgentActionLog.idempotency_key == "idem-income-1"))).scalar_one()
    assert log.created_entity_type == "income"


@pytest.mark.asyncio
async def test_commit_create_subscription(db, user_id):
    before = await _count(db, Subscription, user_id)
    r = await commit_action(db, user_id, "create_subscription",
                            {"name": "Netflix", "amount": 15.0, "frequency": "monthly"},
                            "idem-sub-1")
    assert r["created"]["entity_type"] == "subscription"
    assert await _count(db, Subscription, user_id) == before + 1


@pytest.mark.asyncio
async def test_commit_create_goal(db, user_id):
    before = await _count(db, Goal, user_id)
    r = await commit_action(db, user_id, "create_goal",
                            {"name": "Emergency Fund", "target_amount": 10000}, "idem-goal-1")
    assert r["created"]["entity_type"] == "goal"
    assert await _count(db, Goal, user_id) == before + 1


@pytest.mark.asyncio
async def test_create_income_invalid_amount_rejected(db, user_id):
    from pydantic import ValidationError
    with pytest.raises(ValidationError):
        await commit_action(db, user_id, "create_income", {"amount": -5}, "idem-income-bad")
