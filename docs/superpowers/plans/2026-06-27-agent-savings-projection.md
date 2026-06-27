# Agent Savings + Projection Slice — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add read-only **Savings** Q&A and the reusable **projection + disclaimer** capability to the chat agent — the first slice of the read-only capability catalog.

**Architecture:** Two new typed, user-scoped compute tools (`savings_summary`, `savings_projection`) in the existing LangGraph compute arm; a pure helper that appends a fixed disclaimer to any answer whose evidence carries a `projection` flag; router-catalog + seed extensions; key-free pytest as the gate. No graph-shape change — `compute_node` dispatches new tools generically via the `TOOLS` registry.

**Tech Stack:** Python 3.11, FastAPI, SQLAlchemy async, LangGraph, pytest / pytest-asyncio. Runtime: backend uvicorn (no `--reload`), Postgres in Docker (`wealth-vault-postgres`, port 5434), venv `~/.cache/wv-ai-venv`.

**Scope (this slice):** Savings module read + balance-growth projection; the disclaimer scaffold every later projection reuses. **Out of scope:** contribution-rate derivation from transactions (future), other modules' new tools, `seed_account.py` (real-user seed), Promptfoo eval is an optional final task.

**Branch:** create `feat/agent-savings-projection` off the current branch before Task 1.

**Reference patterns (read before starting):**
- Tools + `TOOLS` registry: `backend/app/modules/agent/tools.py` (mirror `net_worth` for shape, `goals_progress` for per-row float conversion).
- Nodes (synth + grounding): `backend/app/modules/agent/nodes.py` (`SYNTH_SYSTEM`, `synthesize_node`, `ROUTE_TOOL_CATALOG`).
- Tool tests: `backend/tests/test_tools_expansion.py`; fixtures `backend/tests/conftest.py` (`db`, `user_id`; tests run against the `seed_demo_data`-seeded DB).
- Seed: `backend/app/scripts/seed_demo_data.py` (`ACCOUNTS`, `seed()`, `_print_ground_truth`).

**Seeded facts this slice relies on (after Task 1):** 3 savings accounts — Chase Checking $8500.00 @ 0%, Ally Online Savings $15000.00 @ 4.25% APY (accrued interest $250.00), Cash Wallet $320.50 @ 0%. Total balance $23,820.50.

**Run-everything env (used in several steps):**
```bash
cd /Users/bohdanburukhin/Projects/personal/wealth-vault/backend
VENV=~/.cache/wv-ai-venv/bin
export PYTHONPATH=.
```

---

## Task 1: Extend seed with savings APY + accrued interest

**Files:**
- Modify: `backend/app/scripts/seed_demo_data.py` (the `ACCOUNTS` constant ~line 97-102 and the account-creation loop ~line 128-133; optional ground-truth print ~line 321-325)

- [ ] **Step 1: Add APY + accrued interest to the `ACCOUNTS` data**

Replace the `ACCOUNTS` block (currently `# (name, type, institution, balance)`):

```python
# (name, type, institution, balance, apy_decimal, accrued_interest)
ACCOUNTS = [
    ("Chase Checking", "personal", "Chase", "8500.00", "0", "0"),
    ("Ally Online Savings", "personal", "Ally Bank", "15000.00", "0.0425", "250.00"),
    ("Cash Wallet", "cash", None, "320.50", "0", "0"),
]
```

- [ ] **Step 2: Set the new fields in the account-creation loop**

Replace the accounts loop in `seed()`:

```python
        # --- accounts ---
        for name, atype, institution, balance, apy, accrued in ACCOUNTS:
            session.add(SavingsAccount(
                user_id=DEMO_USER_ID, name=name, account_type=atype,
                institution=institution, current_balance=_d(balance),
                currency="USD", is_active=True,
                interest_rate=_d(apy), accrued_interest=_d(accrued),
            ))
```

- [ ] **Step 3: Add savings facts to the GROUND TRUTH print (optional but recommended)**

In `_print_ground_truth`, after the existing `print(f"net_worth (USD)         : {net_worth}")` line, add:

```python
    print(f"savings_total (USD)     : {net_worth}  # == sum of savings_accounts")
    print(f"ally_apy                : 0.0425  # 4.25% on $15000, accrued $250.00")
```

- [ ] **Step 4: Re-seed the dev/test DB**

Run:
```bash
cd /Users/bohdanburukhin/Projects/personal/wealth-vault/backend
PYTHONPATH=. ~/.cache/wv-ai-venv/bin/python -m app.scripts.seed_demo_data
```
Expected: completes, prints the GROUND TRUTH block including the new savings lines.

- [ ] **Step 5: Verify the seeded APY in the DB**

Run:
```bash
docker exec wealth-vault-postgres psql -U postgres -d wealth_vault_dev -tAc \
"SELECT name, current_balance, interest_rate, accrued_interest FROM savings_accounts WHERE name='Ally Online Savings';"
```
Expected: `Ally Online Savings|15000.00|0.0425|250.00`

- [ ] **Step 6: Commit**

```bash
git add backend/app/scripts/seed_demo_data.py
git commit -m "chore(seed): add APY + accrued interest to demo savings accounts"
```

---

## Task 2: `savings_summary` tool

**Files:**
- Modify: `backend/app/modules/agent/tools.py` (add function near `net_worth`; add to `TOOLS` registry ~line 338-353)
- Test: `backend/tests/test_savings_tools.py` (create)

- [ ] **Step 1: Write the failing test**

Create `backend/tests/test_savings_tools.py`:

```python
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run:
```bash
cd /Users/bohdanburukhin/Projects/personal/wealth-vault/backend
PYTHONPATH=. ~/.cache/wv-ai-venv/bin/python -m pytest tests/test_savings_tools.py -q
```
Expected: FAIL — `ImportError: cannot import name 'savings_summary'`.

- [ ] **Step 3: Implement `savings_summary`**

In `backend/app/modules/agent/tools.py`, add this function immediately after `net_worth`:

```python
async def savings_summary(db: AsyncSession, user_id: UUID) -> dict:
    """Savings/cash accounts: balances, APY, accrued interest, and the combined total."""
    rows = (await db.execute(
        select(SavingsAccount.id, SavingsAccount.name, SavingsAccount.account_type,
               SavingsAccount.institution, SavingsAccount.current_balance,
               SavingsAccount.interest_rate, SavingsAccount.accrued_interest)
        .where(SavingsAccount.user_id == user_id, SavingsAccount.is_active.is_(True))
        .order_by(SavingsAccount.current_balance.desc())
    )).all()
    total = sum((r.current_balance for r in rows), Decimal("0"))
    accrued = sum((r.accrued_interest or Decimal("0") for r in rows), Decimal("0"))
    accounts = []
    for r in rows:
        rate = float(r.interest_rate or 0)
        accounts.append({
            "name": r.name, "account_type": r.account_type, "institution": r.institution,
            "balance": float(r.current_balance), "apy": rate, "apy_pct": round(rate * 100, 2),
            "accrued_interest": float(r.accrued_interest or 0), "id": str(r.id),
        })
    return {
        "tool": "savings_summary",
        "total_balance": round(float(total), 2),
        "total_accrued_interest": round(float(accrued), 2),
        "account_count": len(rows),
        "currency": "USD",
        "accounts": accounts,
        "cited_ids": [a["id"] for a in accounts],
    }
```

- [ ] **Step 4: Register the tool**

In `backend/app/modules/agent/tools.py`, add to the `TOOLS` dict (after `"net_worth": net_worth,`):

```python
    "savings_summary": savings_summary,
```

- [ ] **Step 5: Run the test to verify it passes**

Run:
```bash
PYTHONPATH=. ~/.cache/wv-ai-venv/bin/python -m pytest tests/test_savings_tools.py -q
```
Expected: PASS (1 passed).

- [ ] **Step 6: Commit**

```bash
git add backend/app/modules/agent/tools.py backend/tests/test_savings_tools.py
git commit -m "feat(agent): add savings_summary read tool"
```

---

## Task 3: `savings_projection` tool

**Files:**
- Modify: `backend/app/modules/agent/tools.py` (add function after `savings_summary`; add to `TOOLS`)
- Test: `backend/tests/test_savings_tools.py` (append)

- [ ] **Step 1: Write the failing tests**

Append to `backend/tests/test_savings_tools.py`:

```python
from app.modules.agent.tools import savings_projection


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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run:
```bash
PYTHONPATH=. ~/.cache/wv-ai-venv/bin/python -m pytest tests/test_savings_tools.py -q
```
Expected: FAIL — `ImportError: cannot import name 'savings_projection'`.

- [ ] **Step 3: Implement `savings_projection`**

In `backend/app/modules/agent/tools.py`, add immediately after `savings_summary`:

```python
async def savings_projection(
    db: AsyncSession, user_id: UUID, months: int = 12, apy: Optional[float] = None,
) -> dict:
    """Project savings balance forward with monthly compounding. Each account grows at its
    own stored APY, unless `apy` (decimal, e.g. 0.05) overrides the rate for all accounts.
    Deterministic; `projection` flag triggers the standard disclaimer in synthesis."""
    rows = (await db.execute(
        select(SavingsAccount.id, SavingsAccount.current_balance, SavingsAccount.interest_rate)
        .where(SavingsAccount.user_id == user_id, SavingsAccount.is_active.is_(True))
    )).all()
    months = max(0, int(months))
    current = sum((r.current_balance for r in rows), Decimal("0"))
    projected = Decimal("0")
    for r in rows:
        rate = Decimal(str(apy)) if apy is not None else (r.interest_rate or Decimal("0"))
        monthly = rate / Decimal("12")
        bal = r.current_balance
        for _ in range(months):
            bal = bal * (Decimal("1") + monthly)
        projected += bal
    return {
        "tool": "savings_projection",
        "projection": True,
        "months": months,
        "assumed_apy": float(apy) if apy is not None else None,  # None => per-account APY
        "current_balance": round(float(current), 2),
        "projected_balance": round(float(projected), 2),
        "interest_earned": round(float(projected - current), 2),
        "currency": "USD",
        "cited_ids": [str(r.id) for r in rows],
    }
```

- [ ] **Step 4: Register the tool**

In the `TOOLS` dict, add after `"savings_summary": savings_summary,`:

```python
    "savings_projection": savings_projection,
```

- [ ] **Step 5: Run the tests to verify they pass**

Run:
```bash
PYTHONPATH=. ~/.cache/wv-ai-venv/bin/python -m pytest tests/test_savings_tools.py -q
```
Expected: PASS (3 passed).

- [ ] **Step 6: Commit**

```bash
git add backend/app/modules/agent/tools.py backend/tests/test_savings_tools.py
git commit -m "feat(agent): add savings_projection tool (deterministic compound growth)"
```

---

## Task 4: Projection disclaimer scaffold (reused by every future projection)

**Files:**
- Modify: `backend/app/modules/agent/nodes.py` (add constant + helper near the other module-level helpers; call it in `synthesize_node`)
- Test: `backend/tests/test_projection_disclaimer.py` (create — key-free, pure helper)

- [ ] **Step 1: Write the failing test**

Create `backend/tests/test_projection_disclaimer.py`:

```python
from app.modules.agent.nodes import _with_projection_disclaimer, PROJECTION_DISCLAIMER


def test_appends_disclaimer_when_projection_flag_present():
    out = _with_projection_disclaimer(
        "Your savings could grow to $24,470.56.",
        {"results": [{"tool": "savings_projection", "projection": True}]},
    )
    assert out.endswith(PROJECTION_DISCLAIMER)
    assert "$24,470.56" in out


def test_no_disclaimer_without_projection_flag():
    draft = "Your savings total $23,820.50."
    out = _with_projection_disclaimer(draft, {"results": [{"tool": "savings_summary"}]})
    assert out == draft


def test_idempotent_when_already_present():
    draft = "Projected.\n\n" + PROJECTION_DISCLAIMER
    out = _with_projection_disclaimer(draft, {"results": [{"projection": True}]})
    assert out.count(PROJECTION_DISCLAIMER) == 1


def test_handles_missing_computed():
    assert _with_projection_disclaimer("hi", None) == "hi"
```

- [ ] **Step 2: Run the test to verify it fails**

Run:
```bash
PYTHONPATH=. ~/.cache/wv-ai-venv/bin/python -m pytest tests/test_projection_disclaimer.py -q
```
Expected: FAIL — `ImportError: cannot import name '_with_projection_disclaimer'`.

- [ ] **Step 3: Add the constant + helper**

In `backend/app/modules/agent/nodes.py`, add just above `async def synthesize_node`:

```python
PROJECTION_DISCLAIMER = (
    "Projection based on your current data and stated assumptions — "
    "not financial advice; actual results will vary."
)


def _with_projection_disclaimer(draft: str, computed) -> str:
    """Append the standard disclaimer when any evidence row is a projection. Deterministic,
    so it can't be dropped by the LLM. Reused by every projection tool (flag: projection=True)."""
    results = (computed or {}).get("results", [])
    if any(r.get("projection") for r in results) and PROJECTION_DISCLAIMER not in draft:
        return draft.rstrip() + "\n\n" + PROJECTION_DISCLAIMER
    return draft
```

- [ ] **Step 4: Call the helper in `synthesize_node`**

In `synthesize_node`, change the draft/return lines. Current:

```python
    draft = msg.content if isinstance(msg.content, str) else str(msg.content)
    return {"draft": draft, "steps": _trace(state, "synthesize", f"{len(draft)} chars")}
```

Replace with:

```python
    draft = msg.content if isinstance(msg.content, str) else str(msg.content)
    draft = _with_projection_disclaimer(draft, state.get("computed"))
    return {"draft": draft, "steps": _trace(state, "synthesize", f"{len(draft)} chars")}
```

- [ ] **Step 5: Run the test to verify it passes**

Run:
```bash
PYTHONPATH=. ~/.cache/wv-ai-venv/bin/python -m pytest tests/test_projection_disclaimer.py -q
```
Expected: PASS (4 passed).

- [ ] **Step 6: Commit**

```bash
git add backend/app/modules/agent/nodes.py backend/tests/test_projection_disclaimer.py
git commit -m "feat(agent): standard projection disclaimer appended deterministically in synthesis"
```

---

## Task 5: Route the new tools

**Files:**
- Modify: `backend/app/modules/agent/nodes.py` (`ROUTE_TOOL_CATALOG`)

- [ ] **Step 1: Add the tools to the router catalog**

In `ROUTE_TOOL_CATALOG`, insert these two lines immediately after the `net_worth()` line:

```python
- savings_summary(): savings/cash accounts — per-account balance, APY, accrued interest, and total saved. Use for "my savings", "interest rate on my savings", "how much in my Ally account".
- savings_projection(months=12, apy?): projected savings balance with monthly compounding at each account's APY (or a provided `apy` decimal like 0.05). This is a PROJECTION — use for "what will my savings be worth in N years/months", "if my rate were 5%".
```

- [ ] **Step 2: Restart the backend to load all changes**

Run:
```bash
pkill -f "uvicorn app.main:app"; sleep 1
cd /Users/bohdanburukhin/Projects/personal/wealth-vault/backend
PYTHONPATH=. ~/.cache/wv-ai-venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8000 > /tmp/wv-backend.log 2>&1 &
for i in $(seq 1 20); do curl -sf -o /dev/null http://127.0.0.1:8000/health && break || sleep 1; done; echo up
```

- [ ] **Step 3: Verify routing + answers end-to-end (needs `OPENAI_API_KEY`, already in `backend/.env`)**

Run (token from the frontend dev env):
```bash
cd /Users/bohdanburukhin/Projects/personal/wealth-vault/frontend
TOKEN=$(grep '^NEXT_PUBLIC_DEV_AGENT_TOKEN=' .env.local | cut -d= -f2-)
post() { curl -s -X POST http://127.0.0.1:8000/api/v1/agent/query -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" -d "{\"question\":\"$1\",\"history\":[]}" \
  | python3 -c "import sys,json;d=json.load(sys.stdin);print('route',d.get('route'),'| refused',d.get('refused'));print(d.get('answer'));print('tools:',[s['detail'] for s in d['steps'] if s['node']=='compute'])"; }
post "how much do I have in savings?"
post "what will my savings be worth in 5 years?"
post "what if my savings rate were 5%, value in 10 years?"
```
Expected:
- Q1 → route `compute`, `savings_summary` called, states $23,820.50 (and may mention the 4.25% Ally APY). No disclaimer.
- Q2 → route `compute`, `savings_projection` called (months≈60), a projected figure > $23,820.50, **ends with the disclaimer line**.
- Q3 → `savings_projection` with `apy≈0.05`, months≈120, projected figure, **disclaimer present**.

- [ ] **Step 4: Run the full key-free test suite (no regressions)**

Run:
```bash
cd /Users/bohdanburukhin/Projects/personal/wealth-vault/backend
PYTHONPATH=. ~/.cache/wv-ai-venv/bin/python -m pytest tests/ -q
```
Expected: all pass (existing + the new savings/disclaimer tests).

- [ ] **Step 5: Commit**

```bash
git add backend/app/modules/agent/nodes.py
git commit -m "feat(agent): route savings_summary + savings_projection"
```

---

## Task 6 (optional): Promptfoo eval cases for savings

**Files:**
- Modify: the Promptfoo cases under `backend/evals/` (match the existing case format there)

- [ ] **Step 1: Inspect the existing eval config**

Run:
```bash
ls backend/evals && sed -n '1,60p' backend/evals/*.y*ml 2>/dev/null | head -80
```
Identify the case schema (question, assertions on `route`/`refused`/answer substring).

- [ ] **Step 2: Add two cases (matching that schema)**

- A savings-summary case: question "how much do I have in savings?" → `refused == false`, answer contains `23,820.50`.
- A projection case: question "what will my savings be worth in 5 years?" → `refused == false`, answer contains `not financial advice` (the disclaimer).

- [ ] **Step 3: Run the evals** (needs `OPENAI_API_KEY`)

Run the repo's eval command (per `backend/AI_FEATURES.md`); expected: 100% on the expanded set.

- [ ] **Step 4: Commit**

```bash
git add backend/evals
git commit -m "test(agent): eval cases for savings summary + projection"
```

---

## Self-review (done at write time)

- **Spec coverage:** Catalog §4 (Savings: Read + Project) → Tasks 2, 3. Catalog §C projection disclaimer policy → Task 4. Routing/synthesis cross-cutting → Tasks 4-5. Seed extension (catalog "implementation hints") → Task 1. Other catalog modules are explicitly out of this slice.
- **Placeholders:** none — every code/step is concrete. Task 6 is marked optional and depends on the repo's eval format, so its cases are described against the existing schema rather than invented.
- **Type/name consistency:** `savings_summary`/`savings_projection` keys (`total_balance`, `projected_balance`, `interest_earned`, `projection`, `cited_ids`) are used identically in tools, tests, and the disclaimer helper; `PROJECTION_DISCLAIMER` / `_with_projection_disclaimer` names match across nodes.py and the test.
- **Determinism:** zero-rate projection asserted exactly; compound case asserted via `pytest.approx(abs=0.05)` (Decimal-iterative impl vs float closed-form differ by ≪ 1¢).
