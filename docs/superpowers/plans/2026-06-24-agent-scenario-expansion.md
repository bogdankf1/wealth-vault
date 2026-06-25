# Agent Scenario Expansion — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Broaden the financial agent to answer across all domains (portfolio, debts, installments, taxes, budgets, goals) plus analytics, light grounded guidance, capability and time-aware questions — keeping every number exact and audited.

**Architecture:** Extend the existing explicit LangGraph graph (`route → compute/retrieve → synthesize → validate`). Add typed, user-scoped compute tools (per-domain + deterministic analytics) registered in `TOOLS`; update the router catalog; add a `capability` route and a time-awareness helper; widen the seed + evals. No ReAct loop, no text-to-SQL. Actions (mutations) are explicitly out of scope.

**Tech Stack:** FastAPI, SQLAlchemy 2.0 async, Postgres+pgvector, LangGraph + langchain-openai, Promptfoo, pytest.

---

## Conventions (every new tool follows these — from existing `app/modules/agent/tools.py`)

- Signature `async def name(db: AsyncSession, user_id: UUID, **typed_args) -> dict`.
- `user_id` is ALWAYS injected into the `WHERE` from the authenticated request — never from the model.
- Return a dict of **exact** values (`round(float(x), 2)`) plus `"cited_ids": [str(id), …]` (cap 50). Use `Decimal` for money sums; reuse `_parse_date(iso)` for date args; `end` is exclusive.
- Register every tool in the `TOOLS` dict and add it to `ROUTE_TOOL_CATALOG` (Task 11).
- All demo data is USD.

## Ground truth (produced by Task 1 seed; every tool test asserts these)

| Datum | Value |
|---|---|
| Portfolio total value / invested / return | 10,700.00 / 7,500.00 / 3,200.00 (42.67%) |
| In stocks (asset_type=stock, AAPL) | 2,200.00 |
| Debts outstanding (Σ amount−paid, active) | 1,300.00 (Alex 500 + Jordan 800); Jordan overdue |
| Installment remaining / monthly obligation | 18,600.00 / 450.00 (1 active: Car Loan) |
| Taxes configured | Federal Income 22% (annually); Self-Employment $1,200 (quarterly) |
| Budget May 2026 | Groceries 300 / spent 140.95 (under); Dining 60 / 76.50 (over); Transport 100 / 71.40 (under) |
| Goals | Emergency Fund 6,000/10,000 (60%); Hawaii 1,500/5,000 (30%) |
| Total spend May vs April 2026 | 1,123.25 vs 1,355.95 (Δ −232.70, −17.16%) |
| Savings rate (May) | income 6,500 − expenses 1,123.25 = 5,376.75 → 82.72%; debt-to-income 450/6,500 = 6.92% |
| Affordability $1,200 (May) | disposable 6,500 − 1,123.25 − 74.97 (subs) − 450 (loan) = 4,851.78 → can afford |

## File Structure

- **Modify** `backend/app/scripts/seed_demo_data.py` — add portfolio/debts/installments/taxes/budgets/goals constants + inserts + ground-truth prints.
- **Modify** `backend/app/scripts/seed_account.py` — same data in `insert_financial_data(...)`.
- **Modify** `backend/app/modules/agent/tools.py` — 9 new tool functions + `TOOLS` registration.
- **Modify** `backend/app/modules/agent/nodes.py` — router catalog/prompt, capability route, time-awareness, refusal wording.
- **Modify** `backend/app/modules/agent/graph.py` — wire the `capability` node.
- **Modify** `backend/app/modules/agent/state.py` — no new fields expected (verify).
- **Create** `backend/tests/test_tools_expansion.py` — unit tests for the 9 new tools.
- **Modify** `backend/evals/run_eval_assertions.py` + `backend/evals/promptfooconfig.yaml` — new eval cases.
- **Modify** `frontend/components/agent/ask-your-finances.tsx` — refresh suggested-prompt chips.

> Run all backend commands from `backend/` with the venv + env loaded:
> `cd backend && export PYTHONPATH=. && export $(grep -E '^(DATABASE_URL|SECRET_KEY|OPENAI_API_KEY)=' .env | xargs)`; tools = `~/.cache/wv-ai-venv/bin/{python,pytest}`. (Docker DB must be up.)

---

## Task 1: Extend the demo seed (new-domain data + ground truth)

**Files:**
- Modify: `backend/app/scripts/seed_demo_data.py`
- Modify: `backend/app/scripts/seed_account.py`

- [ ] **Step 1: Add model imports** to both files' import blocks.

```python
from app.modules.portfolio.models import PortfolioAsset
from app.modules.debts.models import Debt
from app.modules.installments.models import Installment
from app.modules.taxes.models import Tax, TaxType, TaxFrequency
from app.modules.budgets.models import Budget, BudgetPeriod
from app.modules.goals.models import Goal
```

- [ ] **Step 2: In `seed_demo_data.py` `seed()`, after the parsed-documents block and before `await session.commit()`, insert the new domains** (and add the identical block to `seed_account.py`'s `insert_financial_data(session, user_id)`):

```python
        # --- portfolio ---
        for name, symbol, atype, qty, buy, cur in [
            ("Apple Inc.", "AAPL", "stock", "10", "150.00", "220.00"),
            ("Vanguard S&P 500", "VOO", "etf", "5", "400.00", "500.00"),
            ("Bitcoin", "BTC", "crypto", "0.1", "40000.00", "60000.00"),
        ]:
            q, b, c = _d(qty), _d(buy), _d(cur)
            session.add(PortfolioAsset(
                user_id=DEMO_USER_ID, asset_name=name, symbol=symbol, ticker=symbol,
                asset_type=atype, quantity=q, purchase_price=b, current_price=c,
                currency="USD", purchase_date=datetime(2025, 6, 1),
                total_invested=q * b, current_value=q * c, total_return=q * (c - b),
                is_active=True,
            ))

        # --- debts (money owed TO the user) ---
        for debtor, amount, paid, due in [
            ("Alex Rivera", "500.00", "0.00", datetime(2026, 7, 1)),
            ("Jordan Lee", "1200.00", "400.00", datetime(2026, 5, 1)),
        ]:
            session.add(Debt(
                user_id=DEMO_USER_ID, debtor_name=debtor, amount=_d(amount),
                amount_paid=_d(paid), currency="USD", is_active=True, is_paid=False,
                due_date=due,
            ))

        # --- installments (loans the user owes) ---
        session.add(Installment(
            user_id=DEMO_USER_ID, name="Car Loan", category="Auto",
            total_amount=_d("24000.00"), amount_per_payment=_d("450.00"), currency="USD",
            interest_rate=_d("5.50"), frequency="monthly", number_of_payments=60,
            payments_made=12, start_date=datetime(2025, 6, 1),
            first_payment_date=datetime(2025, 7, 1), is_active=True, status="active",
            remaining_balance=_d("18600.00"), next_payment_date=datetime(2026, 7, 1),
        ))

        # --- taxes ---
        session.add(Tax(
            user_id=DEMO_USER_ID, name="Federal Income Tax", tax_type=TaxType.percentage,
            frequency=TaxFrequency.annually, percentage=_d("22.00"), currency="USD", is_active=True,
        ))
        session.add(Tax(
            user_id=DEMO_USER_ID, name="Self-Employment Tax", tax_type=TaxType.fixed,
            frequency=TaxFrequency.quarterly, fixed_amount=_d("1200.00"), currency="USD", is_active=True,
        ))

        # --- budgets (monthly) ---
        for name, category, amount in [
            ("Monthly Groceries", "Groceries", "300.00"),
            ("Monthly Dining", "Dining", "60.00"),
            ("Monthly Transport", "Transport", "100.00"),
        ]:
            session.add(Budget(
                user_id=DEMO_USER_ID, name=name, category=category, amount=_d(amount),
                currency="USD", period=BudgetPeriod.monthly, start_date=datetime(2025, 12, 1),
                is_active=True, alert_threshold=80,
            ))

        # --- goals ---
        for name, target, current, contrib in [
            ("Emergency Fund", "10000.00", "6000.00", "500.00"),
            ("Hawaii 2026", "5000.00", "1500.00", "250.00"),
        ]:
            session.add(Goal(
                user_id=DEMO_USER_ID, name=name, target_amount=_d(target),
                current_amount=_d(current), currency="USD", monthly_contribution=_d(contrib),
                start_date=datetime(2026, 1, 1), is_active=True,
            ))
```

> NOTE: verify exact `Budget.period` enum member names and `Goal` required columns against the model files before running (Task 1 Step 4 will surface mismatches). `_d` is the existing Decimal helper.

- [ ] **Step 3: Extend `_wipe()` in `seed_demo_data.py`** to clear the new tables for the demo user (add to the model tuple, children-safe order):

```python
    for model in (DocumentEmbedding, ParsedDocument, PortfolioAsset, Debt, Installment,
                  Tax, Budget, Goal, IncomeTransaction, IncomeSource, Expense,
                  Subscription, SavingsAccount):
        await session.execute(delete(model).where(model.user_id == user_id))
```
And in `seed_account.py`'s wipe loop, add the same six models.

- [ ] **Step 4: Run the seed and verify it succeeds** (fix any enum/column mismatches surfaced):

Run: `~/.cache/wv-ai-venv/bin/python -m app.scripts.seed_demo_data`
Expected: `✅` with no traceback; prints the existing GROUND TRUTH block.

- [ ] **Step 5: Add ground-truth prints** for the new domains in `_print_ground_truth(session, uid)` (after the existing prints), so eval authors have exact numbers:

```python
    pf = await _scalar(session, select(func.coalesce(func.sum(PortfolioAsset.current_value), 0))
                       .where(PortfolioAsset.user_id == uid, PortfolioAsset.is_active == True))
    debts = await _scalar(session, select(func.coalesce(func.sum(Debt.amount - Debt.amount_paid), 0))
                          .where(Debt.user_id == uid, Debt.is_active == True, Debt.is_paid == False))
    print(f"portfolio_value         : {pf}")
    print(f"debts_outstanding       : {debts}")
```

- [ ] **Step 6: Re-run seed + verify the new numbers**

Run: `~/.cache/wv-ai-venv/bin/python -m app.scripts.seed_demo_data`
Expected: `portfolio_value : 10700.00`, `debts_outstanding : 1300.00`.

- [ ] **Step 7: Commit**

```bash
git add backend/app/scripts/seed_demo_data.py backend/app/scripts/seed_account.py
git commit -m "feat(agent): seed portfolio/debts/installments/taxes/budgets/goals demo data"
```

---

## Task 2: `portfolio_summary` tool

**Files:**
- Modify: `backend/app/modules/agent/tools.py`
- Test: `backend/tests/test_tools_expansion.py`

- [ ] **Step 1: Write the failing test** (create the file; reuse the `db`/`user_id` fixtures from `tests/conftest.py`):

```python
import pytest
from app.modules.agent.tools import portfolio_summary

@pytest.mark.asyncio
async def test_portfolio_summary_totals(db, user_id):
    r = await portfolio_summary(db, user_id)
    assert r["total_value"] == 10700.00
    assert r["total_invested"] == 7500.00
    assert r["total_return"] == 3200.00
    assert len(r["holdings"]) == 3
    assert r["cited_ids"]

@pytest.mark.asyncio
async def test_portfolio_summary_stocks_only(db, user_id):
    r = await portfolio_summary(db, user_id, asset_type="stock")
    assert r["total_value"] == 2200.00  # AAPL only
```

- [ ] **Step 2: Run it — expect failure** (`ImportError: cannot import name 'portfolio_summary'`)

Run: `~/.cache/wv-ai-venv/bin/python -m pytest tests/test_tools_expansion.py -q`

- [ ] **Step 3: Implement the tool** in `tools.py` (add import `from app.modules.portfolio.models import PortfolioAsset` at top):

```python
async def portfolio_summary(db: AsyncSession, user_id: UUID, asset_type: Optional[str] = None) -> dict:
    """Holdings, total value, and return. Optional asset_type filter (e.g. 'stock', 'etf', 'crypto')."""
    conds = [PortfolioAsset.user_id == user_id, PortfolioAsset.is_active.is_(True)]
    if asset_type:
        conds.append(func.lower(PortfolioAsset.asset_type) == asset_type.lower())
    rows = (await db.execute(
        select(PortfolioAsset.id, PortfolioAsset.asset_name, PortfolioAsset.symbol,
               PortfolioAsset.asset_type, PortfolioAsset.current_value,
               PortfolioAsset.total_invested, PortfolioAsset.total_return).where(*conds)
    )).all()
    value = sum((r.current_value or Decimal("0") for r in rows), Decimal("0"))
    invested = sum((r.total_invested or Decimal("0") for r in rows), Decimal("0"))
    ret = sum((r.total_return or Decimal("0") for r in rows), Decimal("0"))
    return {
        "tool": "portfolio_summary",
        "total_value": round(float(value), 2),
        "total_invested": round(float(invested), 2),
        "total_return": round(float(ret), 2),
        "return_pct": round(float(ret / invested * 100), 2) if invested else 0.0,
        "currency": "USD",
        "holdings": [{"name": r.asset_name, "symbol": r.symbol, "asset_type": r.asset_type,
                      "value": float(r.current_value or 0), "return": float(r.total_return or 0)}
                     for r in rows],
        "cited_ids": [str(r.id) for r in rows[:_CITED_CAP]],
        "filters": {"asset_type": asset_type},
    }
```

- [ ] **Step 4: Register in `TOOLS`** (add `"portfolio_summary": portfolio_summary,`).

- [ ] **Step 5: Run tests — expect pass**

Run: `~/.cache/wv-ai-venv/bin/python -m pytest tests/test_tools_expansion.py -q`
Expected: 2 passed.

- [ ] **Step 6: Commit** — `git commit -am "feat(agent): portfolio_summary tool"`

---

## Task 3: `debts_summary` tool

**Files:** Modify `tools.py`; Test `tests/test_tools_expansion.py`

- [ ] **Step 1: Failing test**

```python
from app.modules.agent.tools import debts_summary

@pytest.mark.asyncio
async def test_debts_summary(db, user_id):
    r = await debts_summary(db, user_id)
    assert r["total_outstanding"] == 1300.00
    assert r["count"] == 2
    assert any(d["debtor"] == "Jordan Lee" for d in r["overdue"])
```

- [ ] **Step 2: Run — expect ImportError.**

- [ ] **Step 3: Implement** (add `from app.modules.debts.models import Debt`; `from datetime import datetime` already imported):

```python
async def debts_summary(db: AsyncSession, user_id: UUID) -> dict:
    """Money owed TO the user: outstanding totals + overdue list."""
    rows = (await db.execute(
        select(Debt.id, Debt.debtor_name, Debt.amount, Debt.amount_paid, Debt.due_date)
        .where(Debt.user_id == user_id, Debt.is_active.is_(True), Debt.is_paid.is_(False))
    )).all()
    now = datetime.utcnow()
    items, overdue, total = [], [], Decimal("0")
    for r in rows:
        out = (r.amount or Decimal("0")) - (r.amount_paid or Decimal("0"))
        total += out
        entry = {"debtor": r.debtor_name, "amount": float(r.amount or 0),
                 "paid": float(r.amount_paid or 0), "outstanding": float(out),
                 "due_date": r.due_date.date().isoformat() if r.due_date else None, "id": str(r.id)}
        items.append(entry)
        if r.due_date and r.due_date < now:
            overdue.append(entry)
    return {"tool": "debts_summary", "total_outstanding": round(float(total), 2),
            "count": len(rows), "currency": "USD", "items": items, "overdue": overdue,
            "cited_ids": [str(r.id) for r in rows[:_CITED_CAP]]}
```

- [ ] **Step 4: Register in `TOOLS`.**
- [ ] **Step 5: Run tests — expect pass.**
- [ ] **Step 6: Commit** — `git commit -am "feat(agent): debts_summary tool"`

---

## Task 4: `installments_summary` tool

**Files:** Modify `tools.py`; Test `tests/test_tools_expansion.py`

- [ ] **Step 1: Failing test**

```python
from app.modules.agent.tools import installments_summary

@pytest.mark.asyncio
async def test_installments_summary(db, user_id):
    r = await installments_summary(db, user_id)
    assert r["total_remaining"] == 18600.00
    assert r["monthly_obligation"] == 450.00
    assert r["active_count"] == 1
```

- [ ] **Step 2: Run — expect ImportError.**
- [ ] **Step 3: Implement** (add `from app.modules.installments.models import Installment`):

```python
async def installments_summary(db: AsyncSession, user_id: UUID) -> dict:
    """Active loans the user owes: remaining balance + monthly obligation."""
    rows = (await db.execute(
        select(Installment.id, Installment.name, Installment.remaining_balance,
               Installment.amount_per_payment, Installment.frequency,
               Installment.next_payment_date)
        .where(Installment.user_id == user_id, Installment.is_active.is_(True))
    )).all()
    remaining = sum((r.remaining_balance or Decimal("0") for r in rows), Decimal("0"))
    monthly = sum((r.amount_per_payment or Decimal("0") for r in rows if r.frequency == "monthly"), Decimal("0"))
    return {"tool": "installments_summary", "active_count": len(rows),
            "total_remaining": round(float(remaining), 2),
            "monthly_obligation": round(float(monthly), 2), "currency": "USD",
            "items": [{"name": r.name, "remaining": float(r.remaining_balance or 0),
                       "amount_per_payment": float(r.amount_per_payment or 0),
                       "next_payment_date": r.next_payment_date.date().isoformat() if r.next_payment_date else None,
                       "id": str(r.id)} for r in rows],
            "cited_ids": [str(r.id) for r in rows[:_CITED_CAP]]}
```

- [ ] **Step 4: Register in `TOOLS`. Step 5: tests pass. Step 6: commit** `feat(agent): installments_summary tool`.

---

## Task 5: `taxes_summary` tool

**Files:** Modify `tools.py`; Test `tests/test_tools_expansion.py`

- [ ] **Step 1: Failing test**

```python
from app.modules.agent.tools import taxes_summary

@pytest.mark.asyncio
async def test_taxes_summary(db, user_id):
    r = await taxes_summary(db, user_id)
    names = {t["name"] for t in r["items"]}
    assert "Federal Income Tax" in names and "Self-Employment Tax" in names
    fed = next(t for t in r["items"] if t["name"] == "Federal Income Tax")
    assert fed["percentage"] == 22.0
```

- [ ] **Step 2: Run — expect ImportError.**
- [ ] **Step 3: Implement** (add `from app.modules.taxes.models import Tax`):

```python
async def taxes_summary(db: AsyncSession, user_id: UUID) -> dict:
    """Configured taxes (rates / fixed amounts)."""
    rows = (await db.execute(
        select(Tax.id, Tax.name, Tax.tax_type, Tax.fixed_amount, Tax.percentage,
               Tax.frequency, Tax.next_payment_date)
        .where(Tax.user_id == user_id, Tax.is_active.is_(True))
    )).all()
    return {"tool": "taxes_summary", "count": len(rows), "currency": "USD",
            "items": [{"name": r.name, "tax_type": str(r.tax_type.value if hasattr(r.tax_type, "value") else r.tax_type),
                       "fixed_amount": float(r.fixed_amount) if r.fixed_amount is not None else None,
                       "percentage": float(r.percentage) if r.percentage is not None else None,
                       "frequency": str(r.frequency.value if hasattr(r.frequency, "value") else r.frequency),
                       "id": str(r.id)} for r in rows],
            "cited_ids": [str(r.id) for r in rows[:_CITED_CAP]]}
```

- [ ] **Step 4: Register. Step 5: tests pass. Step 6: commit** `feat(agent): taxes_summary tool`.

---

## Task 6: `budget_status` tool (budget vs actual)

**Files:** Modify `tools.py`; Test `tests/test_tools_expansion.py`

- [ ] **Step 1: Failing test** (May 2026 window; Dining is over, Groceries under):

```python
from app.modules.agent.tools import budget_status

@pytest.mark.asyncio
async def test_budget_status_may(db, user_id):
    r = await budget_status(db, user_id, start="2026-05-01", end="2026-06-01")
    by = {b["category"]: b for b in r["budgets"]}
    assert by["Dining"]["spent"] == 76.50 and by["Dining"]["over"] is True
    assert by["Groceries"]["spent"] == 140.95 and by["Groceries"]["over"] is False
```

- [ ] **Step 2: Run — expect ImportError.**
- [ ] **Step 3: Implement** (add `from app.modules.budgets.models import Budget`; `Expense` already imported):

```python
async def budget_status(db: AsyncSession, user_id: UUID,
                        category: Optional[str] = None,
                        start: Optional[str] = None, end: Optional[str] = None) -> dict:
    """Budget vs actual spend per category over [start, end)."""
    bconds = [Budget.user_id == user_id, Budget.is_active.is_(True)]
    if category:
        bconds.append(func.lower(Budget.category) == category.lower())
    budgets = (await db.execute(
        select(Budget.id, Budget.name, Budget.category, Budget.amount).where(*bconds)
    )).all()
    sd, ed = _parse_date(start), _parse_date(end)
    out = []
    for b in budgets:
        econds = [Expense.user_id == user_id, Expense.is_active.is_(True),
                  func.lower(Expense.category) == (b.category or "").lower()]
        if sd:
            econds.append(Expense.date >= sd)
        if ed:
            econds.append(Expense.date < ed)
        spent = (await db.execute(
            select(func.coalesce(func.sum(Expense.amount), 0)).where(*econds)
        )).scalar() or Decimal("0")
        amount = b.amount or Decimal("0")
        out.append({"name": b.name, "category": b.category, "amount": float(amount),
                    "spent": round(float(spent), 2), "remaining": round(float(amount - spent), 2),
                    "burn_pct": round(float(spent / amount * 100), 2) if amount else 0.0,
                    "over": spent > amount, "id": str(b.id)})
    return {"tool": "budget_status", "currency": "USD", "budgets": out,
            "cited_ids": [b["id"] for b in out]}
```

- [ ] **Step 4: Register. Step 5: tests pass. Step 6: commit** `feat(agent): budget_status tool`.

---

## Task 7: `goals_progress` tool

**Files:** Modify `tools.py`; Test `tests/test_tools_expansion.py`

- [ ] **Step 1: Failing test**

```python
from app.modules.agent.tools import goals_progress

@pytest.mark.asyncio
async def test_goals_progress(db, user_id):
    r = await goals_progress(db, user_id)
    ef = next(g for g in r["goals"] if g["name"] == "Emergency Fund")
    assert ef["target"] == 10000.0 and ef["current"] == 6000.0 and ef["pct"] == 60.0
```

- [ ] **Step 2: Run — expect ImportError.**
- [ ] **Step 3: Implement** (add `from app.modules.goals.models import Goal`):

```python
async def goals_progress(db: AsyncSession, user_id: UUID, name: Optional[str] = None) -> dict:
    """Progress toward savings goals."""
    conds = [Goal.user_id == user_id, Goal.is_active.is_(True)]
    if name:
        conds.append(func.lower(Goal.name).like(f"%{name.lower()}%"))
    rows = (await db.execute(
        select(Goal.id, Goal.name, Goal.target_amount, Goal.current_amount,
               Goal.monthly_contribution).where(*conds)
    )).all()
    goals = []
    for r in rows:
        target = r.target_amount or Decimal("0")
        current = r.current_amount or Decimal("0")
        goals.append({"name": r.name, "target": float(target), "current": float(current),
                      "pct": round(float(current / target * 100), 2) if target else 0.0,
                      "monthly_contribution": float(r.monthly_contribution or 0), "id": str(r.id)})
    return {"tool": "goals_progress", "goals": goals, "currency": "USD",
            "cited_ids": [g["id"] for g in goals]}
```

- [ ] **Step 4: Register. Step 5: tests pass. Step 6: commit** `feat(agent): goals_progress tool`.

---

## Task 8: `compare_spending` analytics tool

**Files:** Modify `tools.py`; Test `tests/test_tools_expansion.py`

- [ ] **Step 1: Failing test** (total May vs April):

```python
from app.modules.agent.tools import compare_spending

@pytest.mark.asyncio
async def test_compare_spending_total(db, user_id):
    r = await compare_spending(db, user_id, start_a="2026-05-01", end_a="2026-06-01",
                               start_b="2026-04-01", end_b="2026-05-01")
    assert r["a"]["total"] == 1123.25
    assert r["b"]["total"] == 1355.95
    assert r["delta"] == -232.70
```

- [ ] **Step 2: Run — expect ImportError.**
- [ ] **Step 3: Implement** (reuses `sum_expenses`):

```python
async def compare_spending(db: AsyncSession, user_id: UUID,
                          start_a: str, end_a: str, start_b: str, end_b: str,
                          category: Optional[str] = None) -> dict:
    """Compare spending between two periods (optionally one category)."""
    a = await sum_expenses(db, user_id, category=category, start=start_a, end=end_a)
    b = await sum_expenses(db, user_id, category=category, start=start_b, end=end_b)
    delta = round(a["total"] - b["total"], 2)
    pct = round((delta / b["total"] * 100), 2) if b["total"] else 0.0
    return {"tool": "compare_spending", "category": category or "all",
            "a": {"label": f"{start_a}..{end_a}", "total": a["total"]},
            "b": {"label": f"{start_b}..{end_b}", "total": b["total"]},
            "delta": delta, "pct_change": pct, "currency": "USD",
            "cited_ids": (a["cited_ids"] + b["cited_ids"])[:_CITED_CAP]}
```

- [ ] **Step 4: Register. Step 5: tests pass. Step 6: commit** `feat(agent): compare_spending tool`.

---

## Task 9: `financial_ratios` analytics tool

**Files:** Modify `tools.py`; Test `tests/test_tools_expansion.py`

- [ ] **Step 1: Failing test** (May: income 6500, expenses 1123.25):

```python
from app.modules.agent.tools import financial_ratios

@pytest.mark.asyncio
async def test_financial_ratios_may(db, user_id):
    r = await financial_ratios(db, user_id, start="2026-05-01", end="2026-06-01")
    assert r["income"] == 6500.00
    assert r["expenses"] == 1123.25
    assert r["savings_rate"] == 82.72
    assert r["debt_to_income"] == 6.92
```

- [ ] **Step 2: Run — expect ImportError.**
- [ ] **Step 3: Implement** (reuses `total_income`, `sum_expenses`, `installments_summary`):

```python
async def financial_ratios(db: AsyncSession, user_id: UUID,
                          start: Optional[str] = None, end: Optional[str] = None) -> dict:
    """Savings rate + debt-to-income over [start, end). Debt = installment obligations."""
    income = (await total_income(db, user_id, start=start, end=end))["total"]
    expenses = (await sum_expenses(db, user_id, start=start, end=end))["total"]
    debt = (await installments_summary(db, user_id))["monthly_obligation"]
    savings = round(income - expenses, 2)
    return {"tool": "financial_ratios", "income": income, "expenses": expenses,
            "savings": savings,
            "savings_rate": round(savings / income * 100, 2) if income else 0.0,
            "debt_to_income": round(debt / income * 100, 2) if income else 0.0,
            "currency": "USD", "cited_ids": []}
```

- [ ] **Step 4: Register. Step 5: tests pass. Step 6: commit** `feat(agent): financial_ratios tool`.

---

## Task 10: `affordability` analytics tool

**Files:** Modify `tools.py`; Test `tests/test_tools_expansion.py`

- [ ] **Step 1: Failing test**

```python
from app.modules.agent.tools import affordability

@pytest.mark.asyncio
async def test_affordability(db, user_id):
    r = await affordability(db, user_id, amount=1200, start="2026-05-01", end="2026-06-01")
    assert r["disposable_monthly"] == 4851.78
    assert r["can_afford"] is True
```

- [ ] **Step 2: Run — expect ImportError.**
- [ ] **Step 3: Implement** (disposable = income − expenses − active subs − installment obligation):

```python
async def affordability(db: AsyncSession, user_id: UUID, amount: float,
                       start: Optional[str] = None, end: Optional[str] = None) -> dict:
    """Can the user afford `amount`? Disposable = income − expenses − subscriptions − loan payments."""
    income = (await total_income(db, user_id, start=start, end=end))["total"]
    expenses = (await sum_expenses(db, user_id, start=start, end=end))["total"]
    subs = (await list_subscriptions(db, user_id))["monthly_total"]
    debt = (await installments_summary(db, user_id))["monthly_obligation"]
    disposable = round(income - expenses - subs - debt, 2)
    return {"tool": "affordability", "amount": round(float(amount), 2),
            "disposable_monthly": disposable,
            "can_afford": amount <= disposable,
            "months_to_afford": round(float(amount) / disposable, 1) if disposable > 0 else None,
            "currency": "USD", "cited_ids": []}
```

- [ ] **Step 4: Register. Step 5: tests pass. Step 6: commit** `feat(agent): affordability tool`.

- [ ] **Step 7: Run the whole new suite** — `~/.cache/wv-ai-venv/bin/python -m pytest tests/test_tools_expansion.py -q` → all pass.

---

## Task 11: Router catalog + prompt for the new tools

**Files:** Modify `backend/app/modules/agent/nodes.py`

- [ ] **Step 1: Extend `ROUTE_TOOL_CATALOG`** — append entries describing each new tool + args (mirror the existing format), e.g.:

```
- portfolio_summary(asset_type?): holdings, total value, return. asset_type e.g. 'stock','etf','crypto'.
- debts_summary(): money owed TO the user — outstanding + overdue.
- installments_summary(): loans the user owes — remaining balance + monthly payment.
- taxes_summary(): configured taxes (rates / fixed amounts).
- budget_status(category?, start?, end?): budget vs actual spend per category over [start,end).
- goals_progress(name?): progress toward savings goals.
- compare_spending(start_a,end_a,start_b,end_b,category?): spending across two periods.
- financial_ratios(start?,end?): savings rate + debt-to-income.
- affordability(amount, start?, end?): whether the user can afford `amount`.
```

- [ ] **Step 2: Add a one-line routing hint** to `ROUTE_SYSTEM` compute bullet: "Domain questions (investments/portfolio, debts, loans/installments, taxes, budgets, goals) and analytics (compare periods, savings rate, 'can I afford X') are compute — pick the matching tool(s)."

- [ ] **Step 3: Manual check (no unit test — routing is LLM).** Run `agent_smoke`-style:

Run (API + token up): one query each — "how much do I have in stocks?", "do I have debts?", "am I over my dining budget?", "can I afford a $1,200 purchase?"
Expected: `route: compute`, `refused: false`, correct figures. (Captured as evals in Task 14.)

- [ ] **Step 4: Commit** — `git commit -am "feat(agent): route new domain + analytics tools"`

---

## Task 12: Capability route ("what can you do")

**Files:** Modify `backend/app/modules/agent/nodes.py`, `graph.py`

- [ ] **Step 1: Add `"capability"` to the route literal** in `RouteDecision.route` and the `ROUTE_SYSTEM` choices ("capability: the user asks what you can do / help → list domains").

- [ ] **Step 2: Add a `capability_node`** in `nodes.py`:

```python
CAPABILITIES = (
    "I can answer questions about your Wealth Vault data: spending & income, accounts & net "
    "worth, subscriptions, portfolio/investments, debts owed to you, loans/installments, taxes, "
    "budgets (vs actual), and goals. I can compare periods, compute savings rate / debt-to-income, "
    "check affordability, and do simple what-if math — always from your real figures. I can't give "
    "market or product advice."
)

async def capability_node(state: AgentState) -> dict:
    return {"answer": CAPABILITIES, "refused": False,
            "steps": _trace(state, "capability", "described capabilities")}
```

- [ ] **Step 3: Wire it in `graph.py`** — `b.add_node("capability", nodes.capability_node)`, add `"capability": "capability"` to the `classify` conditional map, and `b.add_edge("capability", END)`.

- [ ] **Step 4: Test via API** — "what can you do?" → `refused: false`, mentions portfolio/budgets/goals.

- [ ] **Step 5: Commit** — `git commit -am "feat(agent): capability route for 'what can you do'"`

---

## Task 13: Time-awareness + grounded guidance (synthesis)

**Files:** Modify `backend/app/modules/agent/nodes.py`

> Implements the level-C guidance line and time-awareness — both are `SYNTH_SYSTEM` changes, so they live together. (The refusal policy is already narrowed to advice/off-topic/untracked from earlier work; Task 11 confirms it.)

- [ ] **Step 1: Add a helper** that returns the user's data coverage:

```python
async def _data_range(db, user_id) -> tuple[Optional[str], Optional[str]]:
    from app.modules.expenses.models import Expense
    row = (await db.execute(
        select(func.min(Expense.date), func.max(Expense.date)).where(Expense.user_id == user_id)
    )).first()
    fmt = lambda d: d.date().isoformat() if d else None
    return (fmt(row[0]), fmt(row[1])) if row else (None, None)
```

- [ ] **Step 2: In `compute_node`, when every tool result is empty** (all `total`/`count` zero), attach a `data_range` note to the computed payload so synthesis can explain it:

```python
    empty = all((r.get("total", 0) in (0, 0.0) and r.get("count", 0) == 0) for r in results) if results else False
    extra = {}
    if empty:
        async with AsyncSessionLocal() as db2:
            lo, hi = await _data_range(db2, user_id)
        extra = {"data_range": {"from": lo, "to": hi}}
    return {"computed": {"results": results, "cited_ids": cited, **extra}, ...}
```

- [ ] **Step 3: Add two rules to `SYNTH_SYSTEM`**:
  - Time-aware: "If results are empty and a `data_range` is given, say there's no data in that range and state the coverage (from–to) rather than implying zero."
  - Guidance (level C): "You MAY add ONE short, data-grounded observation or nudge when clearly relevant (e.g. 'that's about 2× last month', 'you're at 90% of this budget', 'cancelling Netflix would save $11.99/mo'). Keep it factual and about THEIR data — never market/product/tax advice or product recommendations."

- [ ] **Step 4: Test via API** — "what did I spend last week?" → answer notes the data spans Dec 2025–May 2026 (today is June 2026), not a bare "no expenses". "Am I over my dining budget?" → states the figure and may add a one-line nudge; never refuses.

- [ ] **Step 5: Commit** — `git commit -am "feat(agent): time-aware responses + grounded observations/nudges"`

---

## Task 14: Evals for the new scenarios

**Files:** Modify `backend/evals/run_eval_assertions.py`, `backend/evals/promptfooconfig.yaml`

- [ ] **Step 1: Add cases to `run_eval_assertions.py` `CASES`** (assert on the answer text, normalized):

```python
    ("How much do I have in stocks?", lambda r: "2,200" in r["answer"] or "2200" in norm(r["answer"])),
    ("How much is owed to me in total?", lambda r: "1,300" in r["answer"] or "1300" in norm(r["answer"])),
    ("What's the remaining balance on my car loan?", lambda r: "18,600" in r["answer"] or "18600" in norm(r["answer"])),
    ("Am I over my dining budget this month?", lambda r: not r["refused"] and ("over" in r["answer"].lower())),
    ("How's my emergency fund?", lambda r: "60" in norm(r["answer"])),
    ("Did I spend more in May or April 2026?", lambda r: not r["refused"]),
    ("What's my savings rate in May 2026?", lambda r: "82" in norm(r["answer"])),
    ("Can I afford a $1,200 purchase?", lambda r: not r["refused"] and ("afford" in r["answer"].lower())),
    ("What can you do?", lambda r: r["refused"] is False and "budget" in r["answer"].lower()),
    ("What did I spend last week?", lambda r: not r["refused"]),   # time-aware: explains range
    ("Should I buy NVIDIA stock?", lambda r: r["refused"] is True),  # market advice → refuse
```

- [ ] **Step 2: Run the in-process suite** — `~/.cache/wv-ai-venv/bin/python evals/run_eval_assertions.py` → all pass (iterate router/prompt if a case fails).

- [ ] **Step 3: Mirror the key cases into `promptfooconfig.yaml`** (same questions, JS assertions on `output` as in the existing cases).

- [ ] **Step 4: Commit** — `git commit -am "test(agent): evals for new domains + analytics + refusal"`

---

## Task 15: Frontend — refresh suggested-prompt chips

**Files:** Modify `frontend/components/agent/ask-your-finances.tsx`

- [ ] **Step 1: Replace `SUGGESTIONS`** with cross-domain examples:

```ts
const SUGGESTIONS = [
  'How much do I have in stocks?',
  'Am I over my dining budget this month?',
  "How's my emergency fund goal?",
  'Can I afford a $1,200 purchase?',
];
```

- [ ] **Step 2: Verify in the browser** — chips render; clicking each returns a grounded answer.

- [ ] **Step 3: Commit** — `git commit -am "feat(web): cross-domain suggested prompts"`

---

## Final verification

- [ ] `~/.cache/wv-ai-venv/bin/python -m pytest tests/ -q` → all pass (existing 9 + new tool tests).
- [ ] `~/.cache/wv-ai-venv/bin/python evals/run_eval_assertions.py` → all pass.
- [ ] `( cd evals && AGENT_TOKEN=$(...) npx promptfoo@0.121.17 eval )` → 100%.
- [ ] `agent_smoke` + manual `/dashboard/ask` across all domains.
- [ ] Push branch → CI gate green → sticky PR comment shows the expanded pass count.

## Notes for the executor

- Verify exact enum member names (`TaxType`, `TaxFrequency`, `BudgetPeriod`) and any required NOT-NULL columns on `Goal`/`Installment` against the model files before running Task 1; adjust the seed kwargs to match (the seed run in Task 1 Step 4 surfaces these).
- Keep all new tools deterministic and USD; the grounding/arithmetic validator already covers any derived figures synthesis produces.
- D (actions/mutations) is out of scope — do not add write tools.
