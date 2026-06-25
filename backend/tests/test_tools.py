"""
Unit tests for the agent's compute tools against the seeded ground truth.

Numbers here mirror what seed_demo_data.py prints. If the seed changes, these change.
The point: the compute arm returns EXACT figures, deterministically, with tenant scoping —
which is why the agent computes numbers instead of letting RAG guess them.
"""
import pytest

from app.modules.agent.tools import (
    sum_expenses, net_worth, list_subscriptions, total_income, find_expenses, run_tool,
)


@pytest.mark.asyncio
async def test_dining_may_2026(db, user_id):
    r = await sum_expenses(db, user_id, category="Dining", start="2026-05-01", end="2026-06-01")
    assert r["total"] == 76.50
    assert r["cited_ids"]  # cites the rows it summed


@pytest.mark.asyncio
async def test_groceries_may_2026(db, user_id):
    r = await sum_expenses(db, user_id, category="Groceries", start="2026-05-01", end="2026-06-01")
    assert r["total"] == 140.95


@pytest.mark.asyncio
async def test_total_spend_may_2026(db, user_id):
    r = await sum_expenses(db, user_id, start="2026-05-01", end="2026-06-01")
    assert r["total"] == 1123.25  # includes the $612.30 Delta flight


@pytest.mark.asyncio
async def test_net_worth(db, user_id):
    r = await net_worth(db, user_id)
    assert r["total"] == 23820.50
    assert len(r["accounts"]) == 3


@pytest.mark.asyncio
async def test_subscriptions_monthly(db, user_id):
    r = await list_subscriptions(db, user_id)
    assert r["monthly_total"] == 74.97
    assert r["count"] == 5


@pytest.mark.asyncio
async def test_income_2026(db, user_id):
    r = await total_income(db, user_id, start="2026-01-01")
    assert r["total"] == 34600.00


@pytest.mark.asyncio
async def test_find_biggest_purchase(db, user_id):
    r = await find_expenses(db, user_id, min_amount=1000, limit=5)
    assert r["items"], "expected at least one large expense"
    top = r["items"][0]
    assert top["amount"] == 2499.00
    assert "Apple" in top["name"]


@pytest.mark.asyncio
async def test_tenant_scoping_returns_nothing_for_unknown_user(db):
    from uuid import UUID
    other = UUID("00000000-0000-0000-0000-0000000000ff")
    r = await net_worth(db, other)
    assert r["total"] == 0  # never reads another tenant's rows


@pytest.mark.asyncio
async def test_run_tool_unknown_fails_soft(db, user_id):
    r = await run_tool(db, user_id, "definitely_not_a_tool", {})
    assert "error" in r and r["cited_ids"] == []
