# Agent Expenses + Income Analysis Slice — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add read-only **expense & income analysis** to the chat agent — category breakdowns, spending trend, income-by-source, and after-tax income. Slice of the read-only capability catalog.

**Architecture:** Four typed, user-scoped compute tools in `backend/app/modules/agent/tools.py`. Two query+group directly (`spending_breakdown`, `income_breakdown`); two compose existing tools (`spending_trend` over `sum_expenses`; `after_tax_income` over `total_income` + `taxes_summary`). All are analysis/calc — **no projections**, so no disclaimer involved. No graph-shape change; `compute_node` dispatches via the `TOOLS` registry.

**Tech Stack:** Python 3.11, FastAPI, SQLAlchemy async, LangGraph, pytest/pytest-asyncio. Backend uvicorn (no `--reload`), Postgres in Docker (`wealth-vault-postgres`, port 5434), venv `~/.cache/wv-ai-venv`.

**Design decisions (locked, from brainstorm):**
- **after_tax_income** = `income × (Σ percentage tax rates)` + `(Σ fixed taxes prorated to the period by frequency)`; report income, estimated tax, net, effective rate. Seed taxes: Federal 22% (percentage, annually) + Self-Employment $1,200 (fixed, quarterly → **$400/mo**).
- **Anomalies deferred** (not in this slice). **Recurring-vs-one-off deferred** (seed marks all expenses one-time).
- Breakdowns expose `cited_ids: []` (aggregate analysis), like `financial_ratios`.

**Scope:** the 4 tools above only. **Out of scope:** anomalies, recurring split, top-merchants, portfolio (separate slice), mutations.

**Branch:** create `feat/agent-expenses-income-analysis` off `main` before EI-1.

**Reference patterns (read first):** `sum_expenses` (date-filter conds + `_parse_date`), `total_income`, `taxes_summary`, `financial_ratios` (composition + `cited_ids: []`), `_trailing_full_months` (already in tools.py from the cash-flow slice). Tests: `backend/tests/test_cashflow_tools.py`; fixtures `backend/tests/conftest.py` (`db`, `user_id`, against the `seed_demo_data` DB).

**Seed facts used:** months Dec 2025 → May 2026; May 2026 expenses by category include Groceries $140.95 and Dining $76.50; income = $6,500/mo salary + variable freelance (categories "Salary"/"Freelance"); taxes as above.

**Env for tests:** from `backend/`, `PYTHONPATH=. ~/.cache/wv-ai-venv/bin/python -m pytest <path> -q`.

---

## Task EI-1: `spending_breakdown` tool

**Files:** Modify `backend/app/modules/agent/tools.py` (add near `sum_expenses`; register in `TOOLS`). Test: create `backend/tests/test_analysis_tools.py`.

- [ ] **Step 1: Failing test** — create `backend/tests/test_analysis_tools.py`:

```python
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
    # shares sum to ~100 and each is amount/total
    assert abs(sum(c["share_pct"] for c in r["categories"]) - 100.0) < 0.1
    assert by["Dining"]["share_pct"] == round(76.50 / total * 100, 2)
    # sorted by amount desc
    amts = [c["amount"] for c in r["categories"]]
    assert amts == sorted(amts, reverse=True)
```

- [ ] **Step 2: Run, confirm FAIL** (ImportError).

- [ ] **Step 3: Implement** — add near `sum_expenses` in `tools.py`:

```python
async def spending_breakdown(
    db: AsyncSession, user_id: UUID, start: Optional[str] = None, end: Optional[str] = None,
) -> dict:
    """Spending grouped by category over [start, end), with each category's share of the total."""
    conds = [Expense.user_id == user_id, Expense.is_active.is_(True)]
    sd, ed = _parse_date(start), _parse_date(end)
    if sd:
        conds.append(Expense.date >= sd)
    if ed:
        conds.append(Expense.date < ed)
    rows = (await db.execute(
        select(Expense.category, func.sum(Expense.amount))
        .where(*conds).group_by(Expense.category)
    )).all()
    total = sum((amt for _, amt in rows), Decimal("0"))
    categories = sorted(
        ({"category": cat or "Uncategorized", "amount": float(amt),
          "share_pct": round(float(amt) / float(total) * 100, 2) if total else 0.0}
         for cat, amt in rows),
        key=lambda c: c["amount"], reverse=True,
    )
    return {
        "tool": "spending_breakdown",
        "total": round(float(total), 2),
        "count": len(categories),
        "currency": "USD",
        "categories": categories,
        "cited_ids": [],
    }
```

- [ ] **Step 4: Register** — in `TOOLS`, after `"find_expenses": find_expenses,`:
```python
    "spending_breakdown": spending_breakdown,
```

- [ ] **Step 5: Run test (pass), then full suite (no regressions).**

- [ ] **Step 6: Commit**
```bash
git add backend/app/modules/agent/tools.py backend/tests/test_analysis_tools.py
git commit -m "feat(agent): add spending_breakdown (by-category shares)"
```

---

## Task EI-2: `spending_trend` tool

**Files:** Modify `tools.py` (add after `spending_breakdown`; register). Test: append to `test_analysis_tools.py`.

- [ ] **Step 1: Failing test** — append:

```python
from app.modules.agent.tools import spending_trend, _trailing_full_months


@pytest.mark.asyncio
async def test_spending_trend(db, user_id):
    r = await spending_trend(db, user_id, months=6)
    assert r["tool"] == "spending_trend"
    assert len(r["series"]) == 6
    # each month total matches sum_expenses for that month's [start, end)
    for point in r["series"]:
        exp = (await sum_expenses(db, user_id, start=point["start"], end=point["end"]))["total"]
        assert point["total"] == exp
    # months are consecutive YYYY-MM labels
    labels = [p["month"] for p in r["series"]]
    assert labels == sorted(labels)
    assert r["count"] == 6
```

- [ ] **Step 2: Run, confirm FAIL.**

- [ ] **Step 3: Implement** — add after `spending_breakdown`:

```python
async def spending_trend(db: AsyncSession, user_id: UUID, months: int = 6) -> dict:
    """Monthly expense totals for the trailing `months` full calendar months, oldest first,
    plus the change from the first to the last month."""
    months = max(1, int(months))
    # End at the first of the current month; walk back `months` whole months.
    today = date.today()
    cursor = date(today.year, today.month, 1)
    bounds = []
    for _ in range(months):
        y, m = cursor.year, cursor.month - 1
        if m == 0:
            m = 12
            y -= 1
        start = date(y, m, 1)
        bounds.append((start, cursor))
        cursor = start
    bounds.reverse()  # oldest first
    series = []
    for start, end in bounds:
        total = (await sum_expenses(db, user_id, start=start.isoformat(), end=end.isoformat()))["total"]
        series.append({"month": start.strftime("%Y-%m"), "start": start.isoformat(),
                       "end": end.isoformat(), "total": total})
    first, last = series[0]["total"], series[-1]["total"]
    change = round(last - first, 2)
    return {
        "tool": "spending_trend",
        "series": series,
        "change_first_to_last": change,
        "pct_change": round(change / first * 100, 2) if first else 0.0,
        "count": months,
        "currency": "USD",
        "cited_ids": [],
    }
```

- [ ] **Step 4: Register** — after `"spending_breakdown": spending_breakdown,`:
```python
    "spending_trend": spending_trend,
```

- [ ] **Step 5: Run tests (pass), full suite (no regressions).**

- [ ] **Step 6: Commit**
```bash
git add backend/app/modules/agent/tools.py backend/tests/test_analysis_tools.py
git commit -m "feat(agent): add spending_trend (monthly series)"
```

---

## Task EI-3: `income_breakdown` tool

**Files:** Modify `tools.py` (add near `total_income`; register). Test: append to `test_analysis_tools.py`.

- [ ] **Step 1: Failing test** — append:

```python
from app.modules.agent.tools import income_breakdown, total_income


@pytest.mark.asyncio
async def test_income_breakdown_2026(db, user_id):
    r = await income_breakdown(db, user_id, start="2026-01-01", end="2026-06-01")
    total = (await total_income(db, user_id, start="2026-01-01", end="2026-06-01"))["total"]
    assert r["tool"] == "income_breakdown"
    assert r["total"] == total
    by = {s["category"]: s for s in r["sources"]}
    assert "Salary" in by
    assert by["Salary"]["amount"] == 6500.0 * 5          # 5 months of salary
    assert by["Salary"]["share_pct"] == round(6500.0 * 5 / total * 100, 2)
    assert abs(sum(s["share_pct"] for s in r["sources"]) - 100.0) < 0.1
```

- [ ] **Step 2: Run, confirm FAIL.**

- [ ] **Step 3: Implement** — add near `total_income`. Note `IncomeTransaction` is already imported in tools.py:

```python
async def income_breakdown(
    db: AsyncSession, user_id: UUID, start: Optional[str] = None, end: Optional[str] = None,
) -> dict:
    """Income grouped by category/source (e.g. Salary vs Freelance) over [start, end)."""
    conds = [IncomeTransaction.user_id == user_id]
    sd, ed = _parse_date(start), _parse_date(end)
    if sd:
        conds.append(IncomeTransaction.date >= sd)
    if ed:
        conds.append(IncomeTransaction.date < ed)
    rows = (await db.execute(
        select(IncomeTransaction.category, func.sum(IncomeTransaction.amount))
        .where(*conds).group_by(IncomeTransaction.category)
    )).all()
    total = sum((amt for _, amt in rows), Decimal("0"))
    sources = sorted(
        ({"category": cat or "Uncategorized", "amount": float(amt),
          "share_pct": round(float(amt) / float(total) * 100, 2) if total else 0.0}
         for cat, amt in rows),
        key=lambda s: s["amount"], reverse=True,
    )
    return {
        "tool": "income_breakdown",
        "total": round(float(total), 2),
        "count": len(sources),
        "currency": "USD",
        "sources": sources,
        "cited_ids": [],
    }
```

- [ ] **Step 4: Register** — after `"total_income": total_income,`:
```python
    "income_breakdown": income_breakdown,
```

- [ ] **Step 5: Run tests (pass), full suite (no regressions).**

- [ ] **Step 6: Commit**
```bash
git add backend/app/modules/agent/tools.py backend/tests/test_analysis_tools.py
git commit -m "feat(agent): add income_breakdown (by source)"
```

---

## Task EI-4: `after_tax_income` tool + months helper

**Files:** Modify `tools.py` (add helper + tool near `financial_ratios`; register). Test: append to `test_analysis_tools.py`.

- [ ] **Step 1: Failing test** — append:

```python
from app.modules.agent.tools import after_tax_income, _months_in_range


@pytest.mark.asyncio
async def test_after_tax_income_may(db, user_id):
    income = (await total_income(db, user_id, start="2026-05-01", end="2026-06-01"))["total"]
    r = await after_tax_income(db, user_id, start="2026-05-01", end="2026-06-01")
    assert r["income"] == income
    assert r["months"] == 1
    # Federal 22% (percentage) + Self-Employment $1200/qtr -> $400/mo (fixed)
    expected_tax = round(income * 0.22 + 400.0 * 1, 2)
    assert r["estimated_tax"] == expected_tax
    assert r["net_income"] == round(income - expected_tax, 2)
    assert r["effective_rate"] == round(expected_tax / income * 100, 2)


def test_months_in_range():
    assert _months_in_range("2026-05-01", "2026-06-01") == 1
    assert _months_in_range("2026-01-01", "2027-01-01") == 12
```

- [ ] **Step 2: Run, confirm FAIL.**

- [ ] **Step 3: Implement** — add the helper near `_trailing_full_months`:

```python
# Months covered by a [start, end) range (end exclusive), for prorating fixed taxes.
_FREQ_MONTHS = {"annually": 12, "semiannually": 6, "biannually": 6,
                "quarterly": 3, "monthly": 1, "weekly": 0.25}


def _months_in_range(start_iso: str, end_iso: str) -> int:
    sy, sm, _ = map(int, start_iso.split("-"))
    ey, em, _ = map(int, end_iso.split("-"))
    return max(1, (ey - sy) * 12 + (em - sm))
```

Add the tool near `financial_ratios`:

```python
async def after_tax_income(
    db: AsyncSession, user_id: UUID, start: Optional[str] = None, end: Optional[str] = None,
) -> dict:
    """Estimated after-tax income over a period. Percentage taxes apply to income; fixed taxes
    are prorated to the period by their frequency. Defaults to the trailing 12 full months."""
    if not start or not end:
        start, end = _trailing_full_months(12)
    months = _months_in_range(start, end)
    income = (await total_income(db, user_id, start=start, end=end))["total"]
    items = (await taxes_summary(db, user_id))["items"]
    pct_rate = sum(i["percentage"] or 0 for i in items if i["tax_type"] == "percentage") / 100.0
    fixed_monthly = sum((i["fixed_amount"] or 0) / _FREQ_MONTHS.get(i["frequency"], 12)
                        for i in items if i["tax_type"] == "fixed")
    estimated_tax = round(income * pct_rate + fixed_monthly * months, 2)
    net = round(income - estimated_tax, 2)
    return {
        "tool": "after_tax_income",
        "window": {"start": start, "end": end, "months": months},
        "months": months,
        "income": income,
        "estimated_tax": estimated_tax,
        "net_income": net,
        "effective_rate": round(estimated_tax / income * 100, 2) if income else 0.0,
        "count": months,
        "currency": "USD",
        "cited_ids": [],
    }
```

- [ ] **Step 4: Register** — after `"after_tax... no"` — add after `"financial_ratios": financial_ratios,`:
```python
    "after_tax_income": after_tax_income,
```

- [ ] **Step 5: Run tests (pass), full suite (no regressions).**

- [ ] **Step 6: Commit**
```bash
git add backend/app/modules/agent/tools.py backend/tests/test_analysis_tools.py
git commit -m "feat(agent): add after_tax_income (percentage + prorated fixed)"
```

---

## Task EI-5: Route the new tools + end-to-end verification

**Files:** Modify `backend/app/modules/agent/nodes.py` (`ROUTE_TOOL_CATALOG`).

- [ ] **Step 1: Add to the catalog** — insert after the `find_expenses(...)` line:

```python
- spending_breakdown(start?, end?): spending grouped by category with each category's % share. For "what % of my spending is dining", "break down my spending".
- spending_trend(months=6): monthly expense totals over the last N months + the change. For "is my spending going up", "spending trend".
- income_breakdown(start?, end?): income grouped by source/category (e.g. Salary vs Freelance) with % share.
- after_tax_income(start?, end?): estimated income after taxes (percentage taxes + prorated fixed taxes) — income, tax, net, effective rate.
```

- [ ] **Step 2: Restart backend**
```bash
pkill -f "uvicorn app.main:app"; sleep 1
cd /Users/bohdanburukhin/Projects/personal/wealth-vault/backend
PYTHONPATH=. ~/.cache/wv-ai-venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8000 > /tmp/wv-backend.log 2>&1 &
for i in $(seq 1 20); do curl -sf -o /dev/null http://127.0.0.1:8000/health && break || sleep 1; done; echo up
```

- [ ] **Step 3: Verify e2e** (needs `OPENAI_API_KEY` in `backend/.env`)
```bash
cd /Users/bohdanburukhin/Projects/personal/wealth-vault/frontend
TOKEN=$(grep '^NEXT_PUBLIC_DEV_AGENT_TOKEN=' .env.local | cut -d= -f2-)
post() { curl -s -X POST http://127.0.0.1:8000/api/v1/agent/query -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" -d "{\"question\":\"$1\",\"history\":[]}" \
  | python3 -c "import sys,json;d=json.load(sys.stdin);print('route',d.get('route'),'refused',d.get('refused'));print([s['detail'] for s in d['steps'] if s['node']=='compute']);print(d.get('answer'))"; }
post "what percentage of my spending is dining in May 2026?"
post "is my spending trending up?"
post "how much of my income is from freelance vs salary?"
post "what's my after-tax income for 2026?"
```
Expected: each routes `compute` to the matching tool, not refused, returns figures (breakdown %s; a 6-month trend; salary/freelance split; after-tax with an effective rate). No disclaimer (none are projections).

- [ ] **Step 4: Full key-free suite** — `cd backend && PYTHONPATH=. ~/.cache/wv-ai-venv/bin/python -m pytest tests/ -q` → all pass.

- [ ] **Step 5: Commit**
```bash
git add backend/app/modules/agent/nodes.py
git commit -m "feat(agent): route spending/income breakdowns + trend + after-tax"
```

---

## Task EI-6: Eval cases

**Files:** Modify `backend/evals/promptfooconfig.yaml` and `backend/evals/run_eval_assertions.py`.

- [ ] **Step 1: Add to `promptfooconfig.yaml`** (append after the last test, 6-space-indent style):

```yaml
  # ---- new: spending breakdown ----
  - description: dining share of spending in May 2026 (not refused, mentions dining)
    vars: { question: 'What percentage of my spending was dining in May 2026?' }
    assert:
      - type: javascript
        value: |
          const r = (typeof output === 'string') ? JSON.parse(output) : output;
          if (r.refused) throw new Error('unexpected refusal, route=' + r.route);
          if (!r.answer.toLowerCase().includes('dining')) throw new Error('no dining: ' + r.answer);
          return true;

  # ---- new: after-tax income ----
  - description: after-tax income answered (not refused)
    vars: { question: "What's my after-tax income for 2026?" }
    assert:
      - type: javascript
        value: |
          const r = (typeof output === 'string') ? JSON.parse(output) : output;
          if (r.refused) throw new Error('unexpected refusal, route=' + r.route);
          return true;
```

- [ ] **Step 2: Add to `run_eval_assertions.py`** (append inside `CASES`, before the closing `]`):

```python
    # ---- new: expense/income analysis ----
    ("What percentage of my spending was dining in May 2026?",
     lambda r: not r["refused"] and "dining" in r["answer"].lower()),
    ("How much of my income is from freelance vs salary?",
     lambda r: not r["refused"] and r["route"] == "compute"),
    ("What's my after-tax income for 2026?",
     lambda r: not r["refused"] and r["route"] == "compute"),
```

- [ ] **Step 3: Run the in-process evals** (needs `OPENAI_API_KEY`):
```bash
cd /Users/bohdanburukhin/Projects/personal/wealth-vault/backend
export OPENAI_API_KEY=$(grep -E '^OPENAI_API_KEY=' .env | cut -d= -f2-)
PYTHONPATH=. ~/.cache/wv-ai-venv/bin/python evals/run_eval_assertions.py 2>/dev/null | grep -E "^\[FAIL\]|passed"
```
Expected: no `[FAIL]` lines.

- [ ] **Step 4: Commit**
```bash
git add backend/evals/promptfooconfig.yaml backend/evals/run_eval_assertions.py
git commit -m "test(agent): eval cases for spending/income analysis"
```

---

## Self-review (done at write time)

- **Spec coverage:** Catalog §1 Expenses (category distribution, trend → EI-1, EI-2), §2 Income (by-source, after-tax → EI-3, EI-4). Anomalies/recurring-split explicitly deferred. Routing/evals → EI-5, EI-6.
- **Placeholders:** none — full code in every step.
- **Type/name consistency:** keys (`total`, `count`, `categories`/`sources` with `category`/`amount`/`share_pct`, `series` with `month`/`start`/`end`/`total`, `income`/`estimated_tax`/`net_income`/`effective_rate`/`months`) used identically across tools, tests, routing. `_months_in_range`, `after_tax_income`, `spending_breakdown`, `spending_trend`, `income_breakdown` names match between tool and test import. `_trailing_full_months` already exists (cash-flow slice). `IncomeTransaction` already imported.
- **Determinism:** date-explicit windows (May 2026, 2026 YTD) give exact anchors (Groceries 140.95, Dining 76.50, salary 6500×5, tax 22% + $400/mo); `spending_trend` uses composition (date-robust). Tax constants (22%, $1200/qtr→$400/mo) are exact from seed.
- **Convention/grounding:** every `$`/decimal figure surfaced is in the tool result → grounded; each tool carries a non-zero `count` so the empty-result heuristic won't misfire; `cited_ids: []` like other aggregate analytics. No projections → no disclaimer.
- **One typo guard:** EI-4 Step 4 register line should be added after `"financial_ratios": financial_ratios,` in the TOOLS dict.
