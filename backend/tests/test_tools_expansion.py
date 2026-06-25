import pytest
from uuid import UUID
from app.modules.agent.tools import (
    portfolio_summary, debts_summary, installments_summary,
    taxes_summary, budget_status, goals_progress,
    compare_spending, financial_ratios, affordability,
)

@pytest.mark.asyncio
async def test_portfolio_summary_totals(db, user_id):
    r = await portfolio_summary(db, user_id)
    assert r["total_value"] == 10700.00
    assert r["total_invested"] == 7500.00
    assert r["total_return"] == 3200.00
    assert len(r["holdings"]) == 3 and r["cited_ids"]

@pytest.mark.asyncio
async def test_portfolio_summary_stocks_only(db, user_id):
    r = await portfolio_summary(db, user_id, asset_type="stock")
    assert r["total_value"] == 2200.00

@pytest.mark.asyncio
async def test_debts_summary(db, user_id):
    r = await debts_summary(db, user_id)
    assert r["total_outstanding"] == 1300.00 and r["count"] == 2
    assert any(d["debtor"] == "Jordan Lee" for d in r["overdue"])

@pytest.mark.asyncio
async def test_installments_summary(db, user_id):
    r = await installments_summary(db, user_id)
    assert r["total_remaining"] == 18600.00
    assert r["monthly_obligation"] == 450.00 and r["active_count"] == 1

@pytest.mark.asyncio
async def test_taxes_summary(db, user_id):
    r = await taxes_summary(db, user_id)
    names = {t["name"] for t in r["items"]}
    assert "Federal Income Tax" in names and "Self-Employment Tax" in names
    fed = next(t for t in r["items"] if t["name"] == "Federal Income Tax")
    assert fed["percentage"] == 22.0

@pytest.mark.asyncio
async def test_budget_status_may(db, user_id):
    r = await budget_status(db, user_id, start="2026-05-01", end="2026-06-01")
    by = {b["category"]: b for b in r["budgets"]}
    assert by["Dining"]["spent"] == 76.50 and by["Dining"]["over"] is True
    assert by["Groceries"]["spent"] == 140.95 and by["Groceries"]["over"] is False

@pytest.mark.asyncio
async def test_goals_progress(db, user_id):
    r = await goals_progress(db, user_id)
    ef = next(g for g in r["goals"] if g["name"] == "Emergency Fund")
    assert ef["target"] == 10000.0 and ef["current"] == 6000.0 and ef["pct"] == 60.0

@pytest.mark.asyncio
async def test_compare_spending_total(db, user_id):
    r = await compare_spending(db, user_id, start_a="2026-05-01", end_a="2026-06-01",
                               start_b="2026-04-01", end_b="2026-05-01")
    assert r["a"]["total"] == 1123.25
    assert r["b"]["total"] == 1355.95
    assert r["delta"] == -232.70

@pytest.mark.asyncio
async def test_financial_ratios_may(db, user_id):
    r = await financial_ratios(db, user_id, start="2026-05-01", end="2026-06-01")
    assert r["income"] == 6500.00
    assert r["expenses"] == 1123.25
    assert r["savings_rate"] == 82.72
    assert r["debt_to_income"] == 6.92

@pytest.mark.asyncio
async def test_affordability(db, user_id):
    r = await affordability(db, user_id, amount=1200, start="2026-05-01", end="2026-06-01")
    assert r["disposable_monthly"] == 4851.78
    assert r["can_afford"] is True
