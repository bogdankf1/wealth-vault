# Agent Cash Flow + Projections Slice — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add read-only **cash flow** Q&A and two **projections** (cash runway, balance projection) to the chat agent — slice 2 of the read-only capability catalog.

**Architecture:** Three new typed, user-scoped compute tools in `backend/app/modules/agent/tools.py`, each **composing existing tools** (`total_income`, `sum_expenses`, `list_subscriptions`, `installments_summary`, `net_worth`) — same pattern as `financial_ratios`/`affordability`. The two projection tools set `projection: True`, so the already-shipped disclaimer scaffold (`_with_projection_disclaimer` in nodes.py) appends the standard disclaimer automatically. No graph-shape change; `compute_node` dispatches via the `TOOLS` registry.

**Tech Stack:** Python 3.11, FastAPI, SQLAlchemy async, LangGraph, pytest/pytest-asyncio. Backend: uvicorn (no `--reload`), Postgres in Docker (`wealth-vault-postgres`, port 5434), venv `~/.cache/wv-ai-venv`.

**Design decisions (locked, from brainstorm):**
- **Outflow = expenses + active subscriptions + installment payments.** Net flow = income − outflow.
- **Window = trailing 3 full calendar months** relative to `date.today()` (e.g. today 2026-06-27 → Mar/Apr/May 2026, i.e. `[2026-03-01, 2026-06-01)`). Averages divide the window total by `months`.
- **Runway interpretation = "if income stopped, savings cover N months of outflow"** = `net_worth ÷ outflow_avg`. (The demo runs a surplus, so a net-burn runway would be infinite; this framing is the demoable one and is stated in the answer.)
- Recurring monthly is constant and exactly known: subscriptions $74.97 + car-loan installment $450.00 = **$524.97**.
- **No seed change** — the seed already has 6 months (Dec 2025 → May 2026); the trailing-3 window is covered.

**Known limitation (acceptable, mirrors existing time-awareness):** the window is `today`-relative, so if run long after the seeded data (≈ after Aug 2026) the window has no data and figures read as 0. Tests are written to be date-robust (they re-derive expectations from the same window), so they pass regardless of date.

**Scope:** cash flow + the two projections only. **Out of scope:** other catalog slices (expenses/income analysis, portfolio) — separate plans; mutations (Level D).

**Branch:** create `feat/agent-cashflow-projections` off `main` before Task 1.

**Reference patterns (read first):** `financial_ratios` and `affordability` in `tools.py` (composition + `cited_ids: []`); the `TOOLS` registry; `savings_projection` (the `projection: True` flag); tests in `backend/tests/test_savings_tools.py`; fixtures in `backend/tests/conftest.py` (`db`, `user_id`, against the `seed_demo_data` DB).

**Env for tests:** from `backend/`, `PYTHONPATH=. ~/.cache/wv-ai-venv/bin/python -m pytest <path> -q`.

---

## Task 1: `cash_flow` tool + trailing-window helper

**Files:**
- Modify: `backend/app/modules/agent/tools.py` (add `date` to the datetime import; add helper + `cash_flow`; register in `TOOLS`)
- Test: `backend/tests/test_cashflow_tools.py` (create)

- [ ] **Step 1: Write the failing test**

Create `backend/tests/test_cashflow_tools.py`:

```python
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
    # start/end are ISO first-of-month strings; end is exclusive and 3 months after start
    assert start.endswith("-01") and end.endswith("-01")
    sy, sm, _ = map(int, start.split("-"))
    ey, em, _ = map(int, end.split("-"))
    assert (ey - sy) * 12 + (em - sm) == 3
```

- [ ] **Step 2: Run it, confirm FAIL** — `ImportError: cannot import name 'cash_flow'` (or `_trailing_full_months`).

Run: `PYTHONPATH=. ~/.cache/wv-ai-venv/bin/python -m pytest tests/test_cashflow_tools.py -q`

- [ ] **Step 3: Add `date` to the datetime import**

In `tools.py`, change:
```python
from datetime import datetime
```
to:
```python
from datetime import datetime, date
```

- [ ] **Step 4: Implement the helper + `cash_flow`**

Add near the other module-level helpers (e.g. just after `_parse_date`):

```python
def _trailing_full_months(months: int) -> tuple[str, str]:
    """ISO [start, end) covering the `months` full calendar months before the current month.
    today 2026-06-27, months=3 -> ('2026-03-01', '2026-06-01'). `end` is exclusive."""
    today = date.today()
    end = date(today.year, today.month, 1)
    y, m = end.year, end.month - months
    while m <= 0:
        m += 12
        y -= 1
    return date(y, m, 1).isoformat(), end.isoformat()
```

Add `cash_flow` near `financial_ratios`/`affordability`:

```python
async def cash_flow(db: AsyncSession, user_id: UUID, months: int = 3) -> dict:
    """Average monthly cash flow over the trailing `months` full calendar months. Outflow =
    expenses + active subscriptions + installment payments. Composes existing tools."""
    months = max(1, int(months))
    start, end = _trailing_full_months(months)
    income = (await total_income(db, user_id, start=start, end=end))["total"]
    expenses = (await sum_expenses(db, user_id, start=start, end=end))["total"]
    subs = (await list_subscriptions(db, user_id))["monthly_total"]
    debt = (await installments_summary(db, user_id))["monthly_obligation"]
    income_avg = round(income / months, 2)
    expenses_avg = round(expenses / months, 2)
    recurring_monthly = round(subs + debt, 2)
    outflow_avg = round(expenses_avg + recurring_monthly, 2)
    net_flow_avg = round(income_avg - outflow_avg, 2)
    return {
        "tool": "cash_flow",
        "window": {"start": start, "end": end, "months": months},
        "income_avg": income_avg,
        "expenses_avg": expenses_avg,
        "recurring_monthly": recurring_monthly,
        "outflow_avg": outflow_avg,
        "net_flow_avg": net_flow_avg,
        "count": months,  # non-zero so compute_node's empty-result heuristic won't misfire
        "currency": "USD",
        "cited_ids": [],
    }
```

- [ ] **Step 5: Register in `TOOLS`** — add (after `"affordability": affordability,`):
```python
    "cash_flow": cash_flow,
```

- [ ] **Step 6: Run the tests, confirm 2 pass. Run full suite (`pytest tests/ -q`) — no regressions.**

- [ ] **Step 7: Commit**
```bash
git add backend/app/modules/agent/tools.py backend/tests/test_cashflow_tools.py
git commit -m "feat(agent): add cash_flow tool (trailing-3-month net flow)"
```

---

## Task 2: `cash_runway` + `balance_projection` tools

**Files:**
- Modify: `backend/app/modules/agent/tools.py` (add both after `cash_flow`; register in `TOOLS`)
- Test: `backend/tests/test_cashflow_tools.py` (append)

- [ ] **Step 1: Append failing tests**

```python
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
```

- [ ] **Step 2: Run, confirm FAIL** (ImportError: cash_runway / balance_projection).

- [ ] **Step 3: Implement both, after `cash_flow`:**

```python
async def cash_runway(db: AsyncSession, user_id: UUID) -> dict:
    """How many months liquid savings would cover outflow IF income stopped:
    net_worth / monthly outflow. A projection (carries the standard disclaimer)."""
    cf = await cash_flow(db, user_id)
    liquid = (await net_worth(db, user_id))["total"]
    outflow = cf["outflow_avg"]
    runway = round(liquid / outflow, 1) if outflow > 0 else None
    return {
        "tool": "cash_runway",
        "projection": True,
        "liquid_balance": liquid,
        "monthly_outflow": outflow,
        "runway_months": runway,
        "assumption": "assumes income stops; savings cover average monthly outflow",
        "count": 1,  # non-zero so the empty-result heuristic won't misfire
        "currency": "USD",
        "cited_ids": [],
    }


async def balance_projection(db: AsyncSession, user_id: UUID, months: int = 12) -> dict:
    """Projected savings balance: current net worth + average monthly net cash flow × months.
    A projection (carries the standard disclaimer)."""
    months = max(0, int(months))
    cf = await cash_flow(db, user_id)
    current = (await net_worth(db, user_id))["total"]
    net = cf["net_flow_avg"]
    projected = round(current + net * months, 2)
    return {
        "tool": "balance_projection",
        "projection": True,
        "months": months,
        "current_balance": current,
        "net_flow_monthly": net,
        "projected_balance": projected,
        "change": round(projected - current, 2),
        "count": months or 1,  # non-zero so the empty-result heuristic won't misfire
        "currency": "USD",
        "cited_ids": [],
    }
```

- [ ] **Step 4: Register in `TOOLS`** — add after `"cash_flow": cash_flow,`:
```python
    "cash_runway": cash_runway,
    "balance_projection": balance_projection,
```

- [ ] **Step 5: Run the tests (4 pass in file). Run full suite — no regressions.**

- [ ] **Step 6: Commit**
```bash
git add backend/app/modules/agent/tools.py backend/tests/test_cashflow_tools.py
git commit -m "feat(agent): add cash_runway + balance_projection (projections)"
```

---

## Task 3: Route the new tools + end-to-end verification

**Files:**
- Modify: `backend/app/modules/agent/nodes.py` (`ROUTE_TOOL_CATALOG`)

- [ ] **Step 1: Add to the router catalog** — insert after the `affordability(...)` line:

```python
- cash_flow(months=3): average monthly income vs outflow (expenses + subscriptions + loan payments) over the trailing N full months — net cash flow / burn rate.
- cash_runway(): how many months your savings would cover outflow if income stopped (net worth ÷ monthly outflow). A PROJECTION.
- balance_projection(months=12): projected savings balance from current net cash flow. A PROJECTION. For "what will my balance be in N months/years".
```

- [ ] **Step 2: Restart the backend**
```bash
pkill -f "uvicorn app.main:app"; sleep 1
cd /Users/bohdanburukhin/Projects/personal/wealth-vault/backend
PYTHONPATH=. ~/.cache/wv-ai-venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8000 > /tmp/wv-backend.log 2>&1 &
for i in $(seq 1 20); do curl -sf -o /dev/null http://127.0.0.1:8000/health && break || sleep 1; done; echo up
```

- [ ] **Step 3: Verify e2e (needs `OPENAI_API_KEY`, in `backend/.env`)**
```bash
cd /Users/bohdanburukhin/Projects/personal/wealth-vault/frontend
TOKEN=$(grep '^NEXT_PUBLIC_DEV_AGENT_TOKEN=' .env.local | cut -d= -f2-)
post() { curl -s -X POST http://127.0.0.1:8000/api/v1/agent/query -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" -d "{\"question\":\"$1\",\"history\":[]}" \
  | python3 -c "import sys,json;d=json.load(sys.stdin);print('route',d.get('route'),'refused',d.get('refused'));print([s['detail'] for s in d['steps'] if s['node']=='compute']);print(d.get('answer'))"; }
post "what's my monthly cash flow?"
post "how long would my savings last if my income stopped?"
post "what will my balance be in 2 years?"
```
Expected:
- Q1 → `cash_flow`, states a net monthly figure; **no** disclaimer.
- Q2 → `cash_runway`, a month count, mentions the income-stops assumption, **ends with the disclaimer**.
- Q3 → `balance_projection` (months≈24), a projected balance, **disclaimer present**.

- [ ] **Step 4: Full key-free suite** — `cd backend && PYTHONPATH=. ~/.cache/wv-ai-venv/bin/python -m pytest tests/ -q` → all pass.

- [ ] **Step 5: Commit**
```bash
git add backend/app/modules/agent/nodes.py
git commit -m "feat(agent): route cash_flow + cash_runway + balance_projection"
```

---

## Task 4: Eval cases

**Files:**
- Modify: `backend/evals/promptfooconfig.yaml` and `backend/evals/run_eval_assertions.py`

- [ ] **Step 1: Add cases to `promptfooconfig.yaml`** (append after the last test, matching the existing 6-space-indented style):

```yaml
  # ---- new: cash flow (read) ----
  - description: monthly cash flow answered (not refused)
    vars: { question: "What's my monthly cash flow?" }
    assert:
      - type: javascript
        value: |
          const r = (typeof output === 'string') ? JSON.parse(output) : output;
          if (r.refused) throw new Error('unexpected refusal, route=' + r.route);
          return true;

  # ---- new: cash runway projection carries the disclaimer ----
  - description: cash runway answers with the projection disclaimer
    vars: { question: 'How long would my savings last if my income stopped?' }
    assert:
      - type: javascript
        value: |
          const r = (typeof output === 'string') ? JSON.parse(output) : output;
          if (r.refused) throw new Error('unexpected refusal, route=' + r.route);
          if (!r.answer.toLowerCase().includes('not financial advice'))
            throw new Error('missing disclaimer: ' + r.answer);
          return true;
```

- [ ] **Step 2: Add the matching cases to `run_eval_assertions.py`** (append inside `CASES`, before the closing `]`):

```python
    # ---- new: cash flow + runway projection ----
    ("What's my monthly cash flow?",
     lambda r: not r["refused"]),
    ("How long would my savings last if my income stopped?",
     lambda r: not r["refused"] and "not financial advice" in r["answer"].lower()),
```

- [ ] **Step 3: Run the in-process evals** (needs `OPENAI_API_KEY`; backend not required — it runs the graph in-process):
```bash
cd /Users/bohdanburukhin/Projects/personal/wealth-vault/backend
export OPENAI_API_KEY=$(grep -E '^OPENAI_API_KEY=' .env | cut -d= -f2-)
PYTHONPATH=. ~/.cache/wv-ai-venv/bin/python evals/run_eval_assertions.py 2>/dev/null | grep -E "^\[FAIL\]|passed"
```
Expected: all cases pass (no `[FAIL]` lines).

- [ ] **Step 4: Commit**
```bash
git add backend/evals/promptfooconfig.yaml backend/evals/run_eval_assertions.py
git commit -m "test(agent): eval cases for cash flow + runway"
```

---

## Self-review (done at write time)

- **Spec coverage:** Catalog §12 (Cash flow: net flow, burn rate [Calc] + runway, projected balance [Project]) → Tasks 1-2. Projection disclaimer policy → satisfied by reusing the shipped scaffold (`projection: True`). Routing/evals → Tasks 3-4.
- **Placeholders:** none — every step has concrete code/commands.
- **Type/name consistency:** return keys (`net_flow_avg`, `outflow_avg`, `recurring_monthly`, `runway_months`, `projected_balance`, `net_flow_monthly`, `projection`, `count`) are used identically across tools, tests, and routing text. `cash_flow` is called by both `cash_runway` and `balance_projection` with the same shape they assert on. `_trailing_full_months` name matches between tool and test import.
- **Grounding:** every `$`-figure the tools surface (`income_avg`, `outflow_avg`, `net_flow_avg`, `liquid_balance`, `projected_balance`, etc.) is in the tool result → grounded by `_extract_nums`. `runway_months` is a 1-decimal count (not matched by the money regex), so it won't trip grounding. Disclaimer is appended deterministically and contains no figures.
- **Convention:** all three tools include a non-zero `count` so `compute_node`'s empty-result heuristic won't misfire (the issue caught in the savings final review) and `cited_ids: []` like the other composed analytics tools.
