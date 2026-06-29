# Level D v2 Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Make the agent's write path (`commit_action`) atomic and concurrency-safe, and bind the idempotency key to the proposal — closing the three Important findings from the Level D v1 final review.

**Architecture (approved design):**
- **Atomic entity + audit:** `expense_service.create_expense` gains `commit: bool = True` (backward-compatible). The agent's committer calls it with `commit=False` (flush, no commit, no side-effects); `commit_action` writes the audit row and commits **once** — entity + audit together, or neither.
- **Concurrency-safe idempotency:** keep the fast-path replay SELECT, but make the `(user_id, idempotency_key)` unique constraint the real guard. On `IntegrityError` at commit (a racer with the same key won), roll back — which also rolls back our just-created entity, so **no orphan** — then return the winner's committed row.
- **Per-proposal idempotency key:** `propose_action` generates the key server-side and includes it in `proposed_action`; the confirm card sends *that* key instead of a fresh per-click UUID, so a re-click after an error dedupes.

**Tech Stack:** FastAPI, SQLAlchemy async, LangGraph, pydantic; Next.js. Run backend tests from `backend/`: `PYTHONPATH=. ~/.cache/wv-ai-venv/bin/python -m pytest tests/ -q`.

**Branch:** `feat/agent-actions-level-d-v2-hardening` (off main, already checked out).

**Verified facts:** `BaseModel.id` is `default=uuid.uuid4` (client-side — `expense.id` is populated before flush). `create_expense` currently does `db.add → commit → refresh → (auto_pay backfill) → dispatch(ExpenseEvents.CREATED)`; the only `CREATED` subscriber enqueues a Celery budget-alert (`.delay()`, no sync DB write), and `budget_status` recomputes spend from the `expenses` table — so `commit=False` skipping the event is data-safe. Frontend key at `ask-your-finances.tsx:244` (`crypto.randomUUID()`); `proposed_action` type in `useAgentStream.ts:33`.

---

## Task LD2H-1: atomic + concurrency-safe `commit_action` (TDD)

**Files:** Modify `backend/app/modules/expenses/service.py`, `backend/app/modules/agent/actions.py`; Test: `backend/tests/test_actions.py`.

- [ ] **Step 1: Write failing tests** — append to `backend/tests/test_actions.py`:

```python
import asyncio
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool
from app.core.config import settings


@pytest.mark.asyncio
async def test_happy_path_one_expense_one_audit_atomic(db, user_id):
    before = await _expense_count(db, user_id)
    r = await commit_action(db, user_id, "create_expense",
                            {"name": "Atomic", "amount": 11}, "idem-atomic-1")
    assert r["status"] == "committed"
    assert await _expense_count(db, user_id) == before + 1
    # exactly one audit row, pointing at a real expense
    logs = (await db.execute(select(AgentActionLog).where(
        AgentActionLog.idempotency_key == "idem-atomic-1"))).scalars().all()
    assert len(logs) == 1
    exp = (await db.execute(select(Expense).where(
        Expense.id == logs[0].created_entity_id))).scalar_one()
    assert float(exp.amount) == 11.0


@pytest.mark.asyncio
async def test_concurrent_same_key_creates_one_expense(db, user_id):
    """Two concurrent commits with the same key -> exactly one expense + one audit; the loser
    rolls back (no orphan) and returns the winner's result."""
    key = "idem-race-1"
    before = await _expense_count(db, user_id)

    engine = create_async_engine(str(settings.DATABASE_URL), poolclass=NullPool)
    Session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with Session() as s1, Session() as s2:
        results = await asyncio.gather(
            commit_action(s1, user_id, "create_expense", {"name": "Race", "amount": 5}, key),
            commit_action(s2, user_id, "create_expense", {"name": "Race", "amount": 5}, key),
            return_exceptions=True,
        )
    await engine.dispose()

    assert all(not isinstance(r, Exception) for r in results), results
    assert results[0]["created"]["id"] == results[1]["created"]["id"]  # same entity
    # exactly one expense and one audit row for this key
    logs = (await db.execute(select(AgentActionLog).where(
        AgentActionLog.idempotency_key == key))).scalars().all()
    assert len(logs) == 1
    assert await _expense_count(db, user_id) == before + 1
```

Add `"idem-atomic-1"` and `"idem-race-1"` to `_TEST_ACTION_IDEM_KEYS` in `backend/tests/conftest.py` so the tests are repeatable. Also delete any stray `Race`/`Atomic` expenses left by prior runs is NOT needed (counts are relative to `before`).

- [ ] **Step 2: Run, confirm the new tests FAIL** (race test creates two expenses today / orphan):
```bash
PYTHONPATH=. ~/.cache/wv-ai-venv/bin/python -m pytest tests/test_actions.py -q
```

- [ ] **Step 3: Add `commit` param to `create_expense`** — in `backend/app/modules/expenses/service.py`, change the signature and the commit block:

Signature:
```python
async def create_expense(
    db: AsyncSession,
    user_id: UUID,
    expense_data: ExpenseCreate,
    commit: bool = True,
) -> Expense:
```

Replace the `db.add(expense) … return expense` tail with:
```python
    db.add(expense)

    if not commit:
        # Caller owns the transaction (e.g. the agent action layer commits the entity and its
        # audit row atomically). Flush to emit the INSERT and populate the row; skip the commit,
        # the payment backfill, and the budget-alert event — the caller commits, auto_pay isn't
        # set on this path, and budget_status recomputes spend from the table.
        await db.flush()
        await db.refresh(expense)
        return expense

    await db.commit()
    await db.refresh(expense)

    # If auto_pay and sync_historical are enabled, backfill historical payments
    if expense_data.auto_pay and expense_data.sync_historical and expense_data.payment_account_id:
        await backfill_expense_payments(db, user_id, expense)

    # Dispatch expense created event for budget tracking
    await event_dispatcher.dispatch(
        ExpenseEvents.CREATED,
        user_id=user_id,
        expense_id=str(expense.id),
        category=expense.category,
        amount=float(expense.amount),
        currency=expense.currency,
        name=expense.name,
    )

    return expense
```

- [ ] **Step 4: Restructure `commit_action`** — in `backend/app/modules/agent/actions.py`:

Add the import near the top:
```python
from sqlalchemy.exc import IntegrityError
```

Update the committer to defer the commit (`_commit_create_expense`): change the `create_expense(...)` call to pass `commit=False`:
```python
    expense = await expense_service.create_expense(
        db, user_id,
        ExpenseCreate(name=args.name, amount=args.amount, category=args.category,
                      currency="USD", frequency=ExpenseFrequency.ONE_TIME, date=when),
        commit=False,
    )
```

Replace the whole `commit_action` body (and add the `_existing_replay` helper just below it):
```python
async def commit_action(db: AsyncSession, user_id: UUID, action_type: str,
                        args: dict, idempotency_key: str) -> dict:
    """Validate + commit a proposed action idempotently and atomically, with an audit row. Sole
    write path; user_id comes from the caller (auth), never from `args`. The entity and its audit
    row commit in ONE transaction; the (user_id, idempotency_key) unique constraint is the
    concurrency guard, so a losing racer's entity rolls back too (no orphan)."""
    spec = ACTION_REGISTRY.get(action_type)
    if spec is None:
        raise ActionError(f"unknown action_type '{action_type}'")
    args_model, committer = spec
    validated = args_model.model_validate(args)  # pydantic ValidationError -> caller maps to 422

    replay = await _existing_replay(db, user_id, action_type, idempotency_key)
    if replay is not None:
        return replay

    try:
        created = await committer(db, user_id, validated)  # commit=False: entity not yet committed
        db.add(AgentActionLog(
            user_id=user_id, action_type=action_type, args=args, status="committed",
            created_entity_type=created["entity_type"], created_entity_id=UUID(created["id"]),
            idempotency_key=idempotency_key,
        ))
        await db.commit()  # atomic: entity + audit together
    except IntegrityError:
        # A concurrent request with the same key won the race. Roll back (drops our just-created
        # entity AND audit) and return the winner's committed result.
        await db.rollback()
        replay = await _existing_replay(db, user_id, action_type, idempotency_key)
        if replay is not None:
            return replay
        raise
    return {"status": "committed", "action_type": action_type, "created": created,
            "idempotency_key": idempotency_key}


async def _existing_replay(db: AsyncSession, user_id: UUID, action_type: str,
                           idempotency_key: str) -> Optional[dict]:
    """Return the idempotent-replay payload for a prior committed action with this key, or None."""
    existing = (await db.execute(select(AgentActionLog).where(
        AgentActionLog.user_id == user_id,
        AgentActionLog.idempotency_key == idempotency_key,
    ))).scalar_one_or_none()
    if existing is None:
        return None
    return {"status": "committed", "action_type": action_type,
            "created": {"entity_type": existing.created_entity_type,
                        "id": str(existing.created_entity_id)},
            "idempotency_key": idempotency_key, "idempotent_replay": True}
```
(`Optional` is already imported in actions.py.) Remove the old v1-hardening NOTE comment block (it no longer applies).

- [ ] **Step 5: Run the new tests + the full suite**
```bash
PYTHONPATH=. ~/.cache/wv-ai-venv/bin/python -m pytest tests/test_actions.py -q   # all pass
PYTHONPATH=. ~/.cache/wv-ai-venv/bin/python -m pytest tests/ -q                  # no regressions
~/.cache/wv-ai-venv/bin/ruff check app/                                          # clean
```
Expected: the race test passes (one expense, one audit); existing tests still green.

- [ ] **Step 6: Commit**
```bash
git add backend/app/modules/expenses/service.py backend/app/modules/agent/actions.py backend/tests/test_actions.py backend/tests/conftest.py
git commit -m "fix(agent): atomic + concurrency-safe commit_action (entity+audit one txn)"
```

---

## Task LD2H-2: per-proposal idempotency key in `propose_action` (TDD)

**Files:** Modify `backend/app/modules/agent/nodes.py`; Test: `backend/tests/` (new `test_propose_idempotency.py`) — or extend an existing nodes test if present.

- [ ] **Step 1: Write a failing test** — `backend/tests/test_propose_idempotency.py`:

```python
import pytest
from app.modules.agent.nodes import propose_action


@pytest.mark.asyncio
async def test_propose_action_includes_idempotency_key(monkeypatch):
    """The proposal carries a server-generated idempotency key so the confirm is bound to it."""
    from app.modules.agent import nodes

    class _FakeProposal:
        enough_info = True
        name = "Groceries"
        amount = 40.0
        category = "Groceries"
        date = None
        clarification = None

    class _FakeLLM:
        def with_structured_output(self, _):
            return self
        async def ainvoke(self, _msgs):
            return _FakeProposal()

    monkeypatch.setattr(nodes, "get_route_llm", lambda: _FakeLLM())
    out = await propose_action({"question": "add a $40 groceries expense", "history": [],
                                "steps": []})
    pa = out["proposed_action"]
    assert pa["action_type"] == "create_expense"
    assert isinstance(pa.get("idempotency_key"), str) and len(pa["idempotency_key"]) >= 8
```

- [ ] **Step 2: Run, confirm FAIL** (no `idempotency_key` in `proposed_action`):
```bash
PYTHONPATH=. ~/.cache/wv-ai-venv/bin/python -m pytest tests/test_propose_idempotency.py -q
```

- [ ] **Step 3: Implement** — in `backend/app/modules/agent/nodes.py`:

Add `uuid4` to the uuid import (currently `from uuid import UUID`):
```python
from uuid import UUID, uuid4
```

In `propose_action`, in the success branch, add the key to the proposed action:
```python
    args = {"name": p.name, "amount": p.amount, "category": p.category, "date": p.date}
    cat = f" {p.category}" if p.category else ""
    when = p.date or "today"
    answer = f"Add a ${float(p.amount):.2f}{cat} expense dated {when}? Confirm to save."
    return {
        "answer": answer, "refused": False,
        "proposed_action": {"action_type": "create_expense", "args": args,
                            "idempotency_key": str(uuid4())},
        "steps": _trace(state, "propose_action", f"proposed create_expense ${p.amount}"),
    }
```

- [ ] **Step 4: Verify proposed_action carries the key end to end** — `format_result` already returns `final.get("proposed_action")` (the whole dict), and both `AgentQueryResponse.proposed_action` (`dict | None`) and the SSE `done` event pass it through, so the key flows to the client unchanged. Confirm no truncation:
```bash
PYTHONPATH=. ~/.cache/wv-ai-venv/bin/python -m pytest tests/test_propose_idempotency.py -q
PYTHONPATH=. ~/.cache/wv-ai-venv/bin/python -m pytest tests/ -q   # full suite green
```

- [ ] **Step 5: Commit**
```bash
git add backend/app/modules/agent/nodes.py backend/tests/test_propose_idempotency.py
git commit -m "feat(agent): bind a server-generated idempotency key to each proposal"
```

---

## Task LD2H-3: confirm card uses the proposal's idempotency key

**Files:** Modify `frontend/hooks/useAgentStream.ts`, `frontend/components/agent/ask-your-finances.tsx`.

- [ ] **Step 1: Add `idempotency_key` to the type** — in `frontend/hooks/useAgentStream.ts`, in the `proposed_action` shape (around line 33), add the field:
```ts
  proposed_action?: {
    action_type: string;
    args: { name: string; amount: number; category?: string | null; date?: string | null };
    idempotency_key: string;
  } | null;
```

- [ ] **Step 2: Use the proposal's key** — in `frontend/components/agent/ask-your-finances.tsx`, in `ConfirmExpenseCard.confirm()`, replace the per-click UUID (line ~244):
```ts
          idempotency_key: action.idempotency_key,
```
(Remove the `crypto.randomUUID()` usage. The key now comes from the proposal, so re-clicking Confirm after an error reuses it and the server dedupes.)

- [ ] **Step 3: Verify frontend gates**
```bash
cd frontend && npx --no-install tsc --noEmit && echo TSC_OK && npx --no-install eslint components/agent/ask-your-finances.tsx
```
Expected: `TSC_OK`, 0 eslint errors.

- [ ] **Step 4: Commit**
```bash
git add frontend/hooks/useAgentStream.ts frontend/components/agent/ask-your-finances.tsx
git commit -m "feat(web): confirm card uses the proposal's idempotency key (dedupe re-clicks)"
```

---

## Task LD2H-4: end-to-end verification (controller)

- [ ] **Step 1: Restart backend, propose → confirm twice with the proposal's key → verify single write**
```bash
# (controller runs this) propose, extract proposed_action.idempotency_key, POST /actions/confirm
# twice with THAT key, assert: first committed, second idempotent_replay=true, exactly one expense.
```
Expected: the key comes from `/agent/query`'s `proposed_action.idempotency_key`; two confirms with it create exactly one expense + one audit row; second returns `idempotent_replay: true`.

- [ ] **Step 2: Full suite + eval coverage**
```bash
cd backend && PYTHONPATH=. ~/.cache/wv-ai-venv/bin/python -m pytest tests/ -q
~/.cache/wv-ai-venv/bin/python evals/check_coverage.py   # create_expense still covered
```

---

## Self-review

- **Spec coverage:** atomic entity+audit → LD2H-1 (create_expense `commit=False` + single commit); concurrency → LD2H-1 (IntegrityError → rollback → replay, with a real two-session race test); per-proposal key → LD2H-2 (generate) + LD2H-3 (frontend uses it). All three review findings covered.
- **Placeholders:** none — full code for every code step. LD2H-4 is controller verification (no placeholder code needed).
- **Type/name consistency:** `commit_action(db, user_id, action_type, args, idempotency_key)`, `_existing_replay(...)`, `create_expense(..., commit=True)`, `_commit_create_expense(..., commit=False)`, `proposed_action.idempotency_key` used identically across service, actions, nodes, tests, and frontend.
- **Safety preserved:** `commit_action` is still the sole write path; `user_id` from auth; whitelist + re-validate unchanged; `commit=False` only skips a fire-and-forget budget alert (documented), not data.
