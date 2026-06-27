import pytest
from app.modules.agent.tools import savings_summary
from app.modules.agent.tools import savings_projection


@pytest.mark.asyncio
async def test_savings_summary_totals(db, user_id):
    r = await savings_summary(db, user_id)
    assert r["tool"] == "savings_summary"
    assert r["total"] == 23820.50
    assert r["total_accrued_interest"] == 250.00
    assert r["count"] == 3
    ally = next(a for a in r["accounts"] if a["name"] == "Ally Online Savings")
    assert ally["apy"] == 0.0425
    assert ally["apy_pct"] == 4.25
    assert len(r["cited_ids"]) == 3


@pytest.mark.asyncio
async def test_savings_projection_zero_rate(db, user_id):
    # apy override of 0 -> no growth, projected == current, exact
    r = await savings_projection(db, user_id, months=12, apy=0.0)
    assert r["projection"] is True
    assert r["current_balance"] == 23820.50
    assert r["projected_balance"] == 23820.50
    assert r["interest_earned"] == 0.0
    assert len(r["cited_ids"]) == 3


@pytest.mark.asyncio
async def test_savings_projection_per_account_rate(db, user_id):
    # default: each account grows at its own APY (only Ally @ 4.25%), monthly compounding
    r = await savings_projection(db, user_id, months=12)
    expected = round(8500.0 + 15000.0 * (1 + 0.0425 / 12) ** 12 + 320.50, 2)
    assert r["projected_balance"] == pytest.approx(expected, abs=0.05)
    assert r["projected_balance"] > r["current_balance"]
    assert r["interest_earned"] == pytest.approx(round(expected - 23820.50, 2), abs=0.05)
