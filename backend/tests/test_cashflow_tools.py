import pytest
from app.modules.agent.tools import (
    cash_flow, total_income, sum_expenses, _trailing_full_months,
)


@pytest.mark.asyncio
async def test_cash_flow_composition(db, user_id):
    start, end = _trailing_full_months(3)
    inc = (await total_income(db, user_id, start=start, end=end))["total"]
    exp = (await sum_expenses(db, user_id, start=start, end=end))["total"]
    r = await cash_flow(db, user_id)
    assert r["tool"] == "cash_flow"
    assert r["recurring_monthly"] == 524.97          # subs 74.97 + installment 450.00 (constant)
    assert r["income_avg"] == round(inc / 3, 2)
    assert r["expenses_avg"] == round(exp / 3, 2)
    assert r["outflow_avg"] == round(r["expenses_avg"] + 524.97, 2)
    assert r["net_flow_avg"] == round(r["income_avg"] - r["outflow_avg"], 2)
    assert r["count"] == 3


def test_trailing_full_months_shape():
    start, end = _trailing_full_months(3)
    assert start.endswith("-01") and end.endswith("-01")
    sy, sm, _ = map(int, start.split("-"))
    ey, em, _ = map(int, end.split("-"))
    assert (ey - sy) * 12 + (em - sm) == 3


from app.modules.agent.tools import cash_runway, balance_projection, net_worth


@pytest.mark.asyncio
async def test_cash_runway(db, user_id):
    cf = await cash_flow(db, user_id)
    nw = (await net_worth(db, user_id))["total"]
    r = await cash_runway(db, user_id)
    assert r["projection"] is True
    assert r["liquid_balance"] == nw
    assert r["monthly_outflow"] == cf["outflow_avg"]
    if cf["outflow_avg"] > 0:
        assert r["runway_months"] == round(nw / cf["outflow_avg"], 1)
    assert r["count"] == 1


@pytest.mark.asyncio
async def test_balance_projection(db, user_id):
    cf = await cash_flow(db, user_id)
    nw = (await net_worth(db, user_id))["total"]
    r = await balance_projection(db, user_id, months=12)
    assert r["projection"] is True
    assert r["current_balance"] == nw
    assert r["net_flow_monthly"] == cf["net_flow_avg"]
    assert r["projected_balance"] == round(nw + cf["net_flow_avg"] * 12, 2)
    assert r["change"] == round(r["projected_balance"] - nw, 2)
    assert r["months"] == 12
