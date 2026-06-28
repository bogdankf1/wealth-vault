# Agent Portfolio Analysis + Projection Slice — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add read-only **portfolio analysis** (`portfolio_allocation`) and a **Tier-3 projection** (`portfolio_projection`, assumed return + disclaimer) to the chat agent — the final slice of the read-only capability catalog's first wave.

**Architecture:** Two typed, user-scoped compute tools in `backend/app/modules/agent/tools.py`. `portfolio_allocation` queries `PortfolioAsset` directly (per-holding shares + by-type + concentration + best/worst); `portfolio_projection` composes `portfolio_summary` and sets `projection: True` so the shipped `_with_projection_disclaimer` scaffold appends the disclaimer. No graph-shape change; dispatched via `TOOLS`.

**Tech Stack:** Python 3.11, FastAPI, SQLAlchemy async, LangGraph, pytest/pytest-asyncio. Backend uvicorn (no `--reload`), Postgres in Docker (`wealth-vault-postgres`, 5434), venv `~/.cache/wv-ai-venv`.

**Design decisions (locked, from brainstorm):**
- `portfolio_projection(years=10, annual_return=0.07)`: projected value = `current_value × (1 + annual_return) ** years`. **Default 7%**, overridable; Tier-3 market assumption → relies on the standard disclaimer (`projection: True`).
- **Dividends deferred** (seed has no dividend data). Recurring/other catalog items not in scope.
- Return % per holding computed as `total_return / total_invested × 100` (consistent with `portfolio_summary`), not the stored `return_percentage` column.

**Seed facts (exact anchors):** AAPL 10 @ 150→220 (value 2200, invested 1500, return 700, +46.67%); VOO 5 @ 400→500 (value 2500, invested 2000, return 500, +25.00%); BTC 0.1 @ 40k→60k (value 6000, invested 4000, return 2000, +50.00%). Total value **10,700**; allocations AAPL 20.56% / VOO 23.36% / BTC 56.07%; concentration = BTC 56.07%; best = BTC (+50%), worst = VOO (+25%).

**Branch:** create `feat/agent-portfolio-analysis` off `main` before PF-1.

**Reference patterns (read first):** `portfolio_summary` (the existing tool to mirror/compose), `savings_projection` (the `projection: True` flag), `spending_breakdown` (share math), tests in `backend/tests/test_analysis_tools.py`; fixtures `backend/tests/conftest.py` (`db`, `user_id`, against `seed_demo_data`).

**Env for tests:** from `backend/`, `PYTHONPATH=. ~/.cache/wv-ai-venv/bin/python -m pytest <path> -q`.

---

## Task PF-1: `portfolio_allocation` tool

**Files:** Modify `backend/app/modules/agent/tools.py` (add after `portfolio_summary`; register in `TOOLS`). Test: create `backend/tests/test_portfolio_tools.py`.

- [ ] **Step 1: Failing test** — create `backend/tests/test_portfolio_tools.py`:

```python
import pytest
from app.modules.agent.tools import portfolio_allocation


@pytest.mark.asyncio
async def test_portfolio_allocation(db, user_id):
    r = await portfolio_allocation(db, user_id)
    assert r["tool"] == "portfolio_allocation"
    assert r["total_value"] == 10700.0
    assert r["count"] == 3
    by = {h["symbol"]: h for h in r["holdings"]}
    assert by["AAPL"]["allocation_pct"] == round(2200 / 10700 * 100, 2)   # 20.56
    assert by["BTC"]["return_pct"] == 50.0
    # holdings sorted by value desc
    vals = [h["value"] for h in r["holdings"]]
    assert vals == sorted(vals, reverse=True)
    # concentration = largest holding
    assert r["concentration"]["symbol"] == "BTC"
    assert r["concentration"]["allocation_pct"] == round(6000 / 10700 * 100, 2)  # 56.07
    # best / worst by return_pct
    assert r["best_performer"]["symbol"] == "BTC" and r["best_performer"]["return_pct"] == 50.0
    assert r["worst_performer"]["symbol"] == "VOO" and r["worst_performer"]["return_pct"] == 25.0
    # by asset_type shares sum ~100
    assert abs(sum(t["allocation_pct"] for t in r["by_type"]) - 100.0) < 0.1
    crypto = next(t for t in r["by_type"] if t["asset_type"] == "crypto")
    assert crypto["allocation_pct"] == round(6000 / 10700 * 100, 2)
```

- [ ] **Step 2: Run, confirm FAIL** (ImportError).

- [ ] **Step 3: Implement** — add after `portfolio_summary` in `tools.py`:

```python
async def portfolio_allocation(db: AsyncSession, user_id: UUID) -> dict:
    """Per-holding allocation %, allocation by asset type, concentration (largest holding),
    and best/worst performer by return %. Read-only analysis."""
    rows = (await db.execute(
        select(PortfolioAsset.id, PortfolioAsset.asset_name, PortfolioAsset.symbol,
               PortfolioAsset.asset_type, PortfolioAsset.current_value,
               PortfolioAsset.total_invested, PortfolioAsset.total_return)
        .where(PortfolioAsset.user_id == user_id, PortfolioAsset.is_active.is_(True))
    )).all()
    total = sum((r.current_value or Decimal("0") for r in rows), Decimal("0"))
    tot = float(total)
    holdings = []
    for r in rows:
        val = float(r.current_value or 0)
        inv = float(r.total_invested or 0)
        ret = float(r.total_return or 0)
        holdings.append({
            "name": r.asset_name, "symbol": r.symbol, "asset_type": r.asset_type,
            "value": val, "allocation_pct": round(val / tot * 100, 2) if tot else 0.0,
            "return_pct": round(ret / inv * 100, 2) if inv else 0.0, "id": str(r.id),
        })
    holdings.sort(key=lambda h: h["value"], reverse=True)
    by_type_totals = {}
    for h in holdings:
        by_type_totals[h["asset_type"]] = by_type_totals.get(h["asset_type"], 0.0) + h["value"]
    by_type = sorted(
        ({"asset_type": t, "value": round(v, 2),
          "allocation_pct": round(v / tot * 100, 2) if tot else 0.0}
         for t, v in by_type_totals.items()),
        key=lambda t: t["value"], reverse=True,
    )
    concentration = ({"name": holdings[0]["name"], "symbol": holdings[0]["symbol"],
                      "allocation_pct": holdings[0]["allocation_pct"]} if holdings else None)
    best = max(holdings, key=lambda h: h["return_pct"], default=None)
    worst = min(holdings, key=lambda h: h["return_pct"], default=None)
    pick = lambda h: {"name": h["name"], "symbol": h["symbol"], "return_pct": h["return_pct"]} if h else None
    return {
        "tool": "portfolio_allocation",
        "total_value": round(tot, 2),
        "count": len(holdings),
        "by_type": by_type,
        "concentration": concentration,
        "best_performer": pick(best),
        "worst_performer": pick(worst),
        "holdings": holdings,
        "currency": "USD",
        "cited_ids": [h["id"] for h in holdings],
    }
```

- [ ] **Step 4: Register** — in `TOOLS`, after `"portfolio_summary": portfolio_summary,`:
```python
    "portfolio_allocation": portfolio_allocation,
```

- [ ] **Step 5: Run test (pass), full suite (no regressions).**

- [ ] **Step 6: Commit**
```bash
git add backend/app/modules/agent/tools.py backend/tests/test_portfolio_tools.py
git commit -m "feat(agent): add portfolio_allocation (shares, concentration, best/worst)"
```

---

## Task PF-2: `portfolio_projection` tool

**Files:** Modify `tools.py` (add after `portfolio_allocation`; register). Test: append to `test_portfolio_tools.py`.

- [ ] **Step 1: Failing test** — append:

```python
from app.modules.agent.tools import portfolio_projection


@pytest.mark.asyncio
async def test_portfolio_projection_default(db, user_id):
    r = await portfolio_projection(db, user_id, years=10)  # default 7%
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
```

- [ ] **Step 2: Run, confirm FAIL.**

- [ ] **Step 3: Implement** — add after `portfolio_allocation`:

```python
async def portfolio_projection(
    db: AsyncSession, user_id: UUID, years: int = 10, annual_return: float = 0.07,
) -> dict:
    """Project total portfolio value forward at an ASSUMED annual return (default 7%),
    compounded yearly. Tier-3 market assumption — carries the standard disclaimer."""
    years = max(0, int(years))
    rate = float(annual_return)
    current = (await portfolio_summary(db, user_id))["total_value"]
    projected = round(current * (1 + rate) ** years, 2)
    return {
        "tool": "portfolio_projection",
        "projection": True,
        "years": years,
        "annual_return": rate,
        "current_value": current,
        "projected_value": projected,
        "gain": round(projected - current, 2),
        "count": 1,  # non-zero so the empty-result heuristic won't misfire
        "currency": "USD",
        "cited_ids": [],
    }
```

- [ ] **Step 4: Register** — after `"portfolio_allocation": portfolio_allocation,`:
```python
    "portfolio_projection": portfolio_projection,
```

- [ ] **Step 5: Run tests (pass), full suite (no regressions).**

- [ ] **Step 6: Commit**
```bash
git add backend/app/modules/agent/tools.py backend/tests/test_portfolio_tools.py
git commit -m "feat(agent): add portfolio_projection (assumed-return, Tier-3)"
```

---

## Task PF-3: Route the new tools + end-to-end verification

**Files:** Modify `backend/app/modules/agent/nodes.py` (`ROUTE_TOOL_CATALOG`).

- [ ] **Step 1: Add to the catalog** — insert after the `portfolio_summary(...)` line:

```python
- portfolio_allocation(): how the portfolio is split — per-holding & by-asset-type allocation %, concentration (largest holding), and best/worst performer.
- portfolio_projection(years=10, annual_return=0.07): projected portfolio value at an ASSUMED annual return (default 7%). A PROJECTION. For "what could my portfolio be worth in N years", "if it grows 6% a year".
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
post "how is my portfolio allocated?"
post "what's my most concentrated holding?"
post "what could my portfolio be worth in 20 years?"
post "what if my portfolio grows 5% a year for 10 years?"
```
Expected: Q1/Q2 → `portfolio_allocation`, allocation %s / BTC ~56% concentration, **no** disclaimer; Q3 → `portfolio_projection` (years≈20, 7%), a projected value, **disclaimer present**; Q4 → `portfolio_projection` (annual_return≈0.05, years≈10), **disclaimer present**.

- [ ] **Step 4: Full key-free suite** — `cd backend && PYTHONPATH=. ~/.cache/wv-ai-venv/bin/python -m pytest tests/ -q` → all pass.

- [ ] **Step 5: Commit**
```bash
git add backend/app/modules/agent/nodes.py
git commit -m "feat(agent): route portfolio_allocation + portfolio_projection"
```

---

## Task PF-4: Eval cases

**Files:** Modify `backend/evals/promptfooconfig.yaml` and `backend/evals/run_eval_assertions.py`.

- [ ] **Step 1: Add to `promptfooconfig.yaml`** (append after the last test, 6-space indent):

```yaml
  # ---- new: portfolio allocation ----
  - description: portfolio allocation answered, mentions the concentrated holding
    vars: { question: 'How is my portfolio allocated?' }
    assert:
      - type: javascript
        value: |
          const r = (typeof output === 'string') ? JSON.parse(output) : output;
          if (r.refused) throw new Error('unexpected refusal, route=' + r.route);
          return true;

  # ---- new: portfolio projection carries the disclaimer ----
  - description: portfolio projection answers with the projection disclaimer
    vars: { question: 'What could my portfolio be worth in 20 years?' }
    assert:
      - type: javascript
        value: |
          const r = (typeof output === 'string') ? JSON.parse(output) : output;
          if (r.refused) throw new Error('unexpected refusal, route=' + r.route);
          if (!r.answer.toLowerCase().includes('not financial advice'))
            throw new Error('missing disclaimer: ' + r.answer);
          return true;
```

- [ ] **Step 2: Add to `run_eval_assertions.py`** (append inside `CASES`, before the closing `]`):

```python
    # ---- new: portfolio analysis + projection ----
    ("How is my portfolio allocated?",
     lambda r: not r["refused"] and r["route"] == "compute"),
    ("What could my portfolio be worth in 20 years?",
     lambda r: not r["refused"] and "not financial advice" in r["answer"].lower()),
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
git commit -m "test(agent): eval cases for portfolio allocation + projection"
```

---

## Self-review (done at write time)

- **Spec coverage:** Catalog §5 Portfolio (allocation %, concentration, best/worst → PF-1) + §C Tier-3 projection (PF-2). Dividends explicitly deferred. Routing/evals → PF-3, PF-4.
- **Placeholders:** none — full code in every step.
- **Type/name consistency:** keys (`total_value`, `count`, `by_type`/`asset_type`/`allocation_pct`, `concentration`, `best_performer`/`worst_performer`/`return_pct`, `holdings`, `projection`, `current_value`, `projected_value`, `gain`, `annual_return`, `years`) used identically across tool, tests, and routing. `portfolio_allocation`/`portfolio_projection` names match tool/test imports. `portfolio_summary` (composed) and `PortfolioAsset` already exist/imported.
- **Determinism:** exact seed anchors (total 10,700; BTC 56.07% concentration; best BTC 50%, worst VOO 25%); projection asserted via the same closed-form (`10700 × 1.07**10`) and an exact zero-rate case.
- **Grounding:** every `$`/percent figure surfaced is in the tool result → grounded; projection `projected_value`/`current_value`/`gain` are in the result; `projection: True` triggers the disclaimer; each tool carries non-zero `count`; allocation cites holding ids, projection uses `cited_ids: []` like other composed analytics.
