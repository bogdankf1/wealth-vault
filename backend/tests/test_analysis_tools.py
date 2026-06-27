import pytest
from app.modules.agent.tools import spending_breakdown, sum_expenses, spending_trend, _trailing_full_months
from app.modules.agent.tools import income_breakdown, total_income


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


@pytest.mark.asyncio
async def test_spending_trend(db, user_id):
    r = await spending_trend(db, user_id, months=6)
    assert r["tool"] == "spending_trend"
    assert len(r["series"]) == 6
    for point in r["series"]:
        exp = (await sum_expenses(db, user_id, start=point["start"], end=point["end"]))["total"]
        assert point["total"] == exp
    labels = [p["month"] for p in r["series"]]
    assert labels == sorted(labels)
    assert r["count"] == 6


@pytest.mark.asyncio
async def test_income_breakdown_2026(db, user_id):
    r = await income_breakdown(db, user_id, start="2026-01-01", end="2026-06-01")
    total = (await total_income(db, user_id, start="2026-01-01", end="2026-06-01"))["total"]
    assert r["tool"] == "income_breakdown"
    assert r["total"] == total
    by = {s["category"]: s for s in r["sources"]}
    assert "Salary" in by
    assert by["Salary"]["amount"] == 6500.0 * 5
    assert by["Salary"]["share_pct"] == round(6500.0 * 5 / total * 100, 2)
    assert abs(sum(s["share_pct"] for s in r["sources"]) - 100.0) < 0.1
