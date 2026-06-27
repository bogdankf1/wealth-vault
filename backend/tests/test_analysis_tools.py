import pytest
from app.modules.agent.tools import spending_breakdown, sum_expenses


@pytest.mark.asyncio
async def test_spending_breakdown_may(db, user_id):
    r = await spending_breakdown(db, user_id, start="2026-05-01", end="2026-06-01")
    total = (await sum_expenses(db, user_id, start="2026-05-01", end="2026-06-01"))["total"]
    assert r["tool"] == "spending_breakdown"
    assert r["total"] == total
    by = {c["category"]: c for c in r["categories"]}
    assert by["Groceries"]["amount"] == 140.95
    assert by["Dining"]["amount"] == 76.50
    assert abs(sum(c["share_pct"] for c in r["categories"]) - 100.0) < 0.1
    assert by["Dining"]["share_pct"] == round(76.50 / total * 100, 2)
    amts = [c["amount"] for c in r["categories"]]
    assert amts == sorted(amts, reverse=True)
