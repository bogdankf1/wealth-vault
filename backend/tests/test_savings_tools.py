import pytest
from app.modules.agent.tools import savings_summary


@pytest.mark.asyncio
async def test_savings_summary_totals(db, user_id):
    r = await savings_summary(db, user_id)
    assert r["tool"] == "savings_summary"
    assert r["total_balance"] == 23820.50
    assert r["total_accrued_interest"] == 250.00
    assert r["account_count"] == 3
    ally = next(a for a in r["accounts"] if a["name"] == "Ally Online Savings")
    assert ally["apy"] == 0.0425
    assert ally["apy_pct"] == 4.25
    assert len(r["cited_ids"]) == 3
