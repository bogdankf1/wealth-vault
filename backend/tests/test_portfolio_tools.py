import pytest
from app.modules.agent.tools import portfolio_allocation, portfolio_projection


@pytest.mark.asyncio
async def test_portfolio_allocation(db, user_id):
    r = await portfolio_allocation(db, user_id)
    assert r["tool"] == "portfolio_allocation"
    assert r["total_value"] == 10700.0
    assert r["count"] == 3
    by = {h["symbol"]: h for h in r["holdings"]}
    assert by["AAPL"]["allocation_pct"] == round(2200 / 10700 * 100, 2)
    assert by["BTC"]["return_pct"] == 50.0
    vals = [h["value"] for h in r["holdings"]]
    assert vals == sorted(vals, reverse=True)
    assert r["concentration"]["symbol"] == "BTC"
    assert r["concentration"]["allocation_pct"] == round(6000 / 10700 * 100, 2)
    assert r["best_performer"]["symbol"] == "BTC" and r["best_performer"]["return_pct"] == 50.0
    assert r["worst_performer"]["symbol"] == "VOO" and r["worst_performer"]["return_pct"] == 25.0
    assert abs(sum(t["allocation_pct"] for t in r["by_type"]) - 100.0) < 0.1
    crypto = next(t for t in r["by_type"] if t["asset_type"] == "crypto")
    assert crypto["allocation_pct"] == round(6000 / 10700 * 100, 2)


@pytest.mark.asyncio
async def test_portfolio_projection_default(db, user_id):
    r = await portfolio_projection(db, user_id, years=10)
    assert r["projection"] is True
    assert r["current_value"] == 10700.0
    assert r["annual_return"] == 0.07
    assert r["years"] == 10
    expected = round(10700.0 * (1 + 0.07) ** 10, 2)
    assert r["projected_value"] == expected
    assert r["gain"] == round(expected - 10700.0, 2)
    assert r["count"] == 1


@pytest.mark.asyncio
async def test_portfolio_projection_zero_rate(db, user_id):
    r = await portfolio_projection(db, user_id, years=5, annual_return=0.0)
    assert r["projected_value"] == 10700.0
    assert r["gain"] == 0.0
