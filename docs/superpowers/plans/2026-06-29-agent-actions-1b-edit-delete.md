# Level D #1b — Edit / Delete an Expense Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`).

**Goal:** Add `update_expense` and `delete_expense` agent actions, with the agent resolving *which* expense (user-scoped read) and disambiguating when several match. Spec: `docs/superpowers/specs/2026-06-29-agent-actions-1b-edit-delete-design.md`.

**Architecture:** Same propose→confirm→atomic-commit spine. New: `propose_action` does a user-scoped candidate search for update/delete (0→clarify, 1→propose, many→list+ask). `commit_action` unchanged; two new committers call the already-user-scoped `update_expense`/`delete_expense` with `commit=False`. Confirm card unchanged (renders `summary`).

**Tech Stack:** FastAPI, SQLAlchemy async, LangGraph, pydantic; Next.js. Tests from `backend/`: `PYTHONPATH=. ~/.cache/wv-ai-venv/bin/python -m pytest <path> -q`.

**Branch:** `feat/agent-actions-1b-edit-delete` (off main, checked out).

**Verified facts:** `update_expense(db, user_id, expense_id, ExpenseUpdate)` and `delete_expense(db, user_id, expense_id)` both fetch via user-scoped `get_expense` (→ `None`/`False` if not owned) and self-commit. `delete_expense` is a HARD delete (`db.delete`). `ExpenseUpdate` has optional `name/amount(>0)/category`. `AgentState.user_id` is a str (cast `UUID`). `Expense` has `name`, `amount`, `category`, `date`, `deleted_at` (BaseModel). `commit_action`/`ACTION_REGISTRY` are generic; `ActionProposal`/`PROPOSAL_BUILDERS`/`propose_action` are in nodes.py from #1a. Audit `created_entity_id` is a plain UUID (no FK) → fine after a delete.

---

## Task 1b-1: backend write path (update/delete) — TDD

**Files:** Modify `backend/app/modules/expenses/service.py`, `backend/app/modules/agent/actions.py`; Test: `backend/tests/test_actions_edit_delete.py`.

- [ ] **Step 1: Failing tests** — create `backend/tests/test_actions_edit_delete.py`:

```python
import pytest
import pytest_asyncio
from uuid import uuid4
from sqlalchemy import select, delete
from app.modules.agent.actions import commit_action, ACTION_REGISTRY, ActionError
from app.modules.agent.models import AgentActionLog
from app.modules.expenses.models import Expense

_KEYS = ("idem-seed-x", "idem-upd-1", "idem-del-1", "idem-upd-missing", "idem-del-missing")


@pytest_asyncio.fixture(autouse=True)
async def _cleanup(db, user_id):
    yield
    logs = (await db.execute(select(AgentActionLog).where(
        AgentActionLog.user_id == user_id,
        AgentActionLog.idempotency_key.in_(_KEYS)))).scalars().all()
    for lg in logs:
        if lg.created_entity_id is not None:
            await db.execute(delete(Expense).where(Expense.id == lg.created_entity_id))
    await db.execute(delete(AgentActionLog).where(
        AgentActionLog.user_id == user_id, AgentActionLog.idempotency_key.in_(_KEYS)))
    await db.commit()


async def _seed_expense(db, user_id) -> str:
    r = await commit_action(db, user_id, "create_expense",
                            {"name": "EditMe", "amount": 50, "category": "Misc"}, "idem-seed-x")
    return r["created"]["id"]


def test_registry_has_update_and_delete():
    assert "update_expense" in ACTION_REGISTRY and "delete_expense" in ACTION_REGISTRY


@pytest.mark.asyncio
async def test_update_expense_changes_fields(db, user_id):
    eid = await _seed_expense(db, user_id)
    r = await commit_action(db, user_id, "update_expense",
                            {"expense_id": eid, "amount": 75, "category": "Updated"}, "idem-upd-1")
    assert r["status"] == "committed" and r["created"]["entity_type"] == "expense"
    exp = (await db.execute(select(Expense).where(Expense.id == eid))).scalar_one()
    assert float(exp.amount) == 75.0 and exp.category == "Updated"


@pytest.mark.asyncio
async def test_delete_expense_removes_row(db, user_id):
    eid = await _seed_expense(db, user_id)
    r = await commit_action(db, user_id, "delete_expense", {"expense_id": eid}, "idem-del-1")
    assert r["status"] == "committed"
    assert (await db.execute(select(Expense).where(Expense.id == eid))).scalar_one_or_none() is None


@pytest.mark.asyncio
async def test_update_missing_expense_raises(db, user_id):
    with pytest.raises(ActionError):
        await commit_action(db, user_id, "update_expense",
                            {"expense_id": str(uuid4()), "amount": 5}, "idem-upd-missing")


@pytest.mark.asyncio
async def test_delete_missing_expense_raises(db, user_id):
    with pytest.raises(ActionError):
        await commit_action(db, user_id, "delete_expense",
                            {"expense_id": str(uuid4())}, "idem-del-missing")
```
Add the five `_KEYS` to `_TEST_ACTION_IDEM_KEYS` in `backend/tests/conftest.py`.

- [ ] **Step 2: Run, confirm FAIL**: `PYTHONPATH=. ~/.cache/wv-ai-venv/bin/python -m pytest tests/test_actions_edit_delete.py -q`

- [ ] **Step 3: `commit` param on `update_expense`** — in `backend/app/modules/expenses/service.py`, add `commit: bool = True,` as the last param of `update_expense`. After the `if 'amount' in update_data or 'frequency' in update_data:` monthly-equivalent block, replace `await db.commit(); await db.refresh(expense)` and everything through `return expense` with:
```python
    if not commit:
        # Caller owns the transaction (agent action layer: atomic entity+audit). Flush only;
        # skip the payment backfill and the budget-tracking event.
        await db.flush()
        await db.refresh(expense)
        return expense

    await db.commit()
    await db.refresh(expense)

    # Check if auto_pay is now enabled
    is_auto_pay_enabled = expense.auto_pay and expense.payment_account_id

    if sync_historical and is_auto_pay_enabled:
        await backfill_expense_payments(db, user_id, expense, skip_existing=False)
    elif is_auto_pay_enabled and not was_auto_pay_enabled:
        await backfill_expense_payments(db, user_id, expense, skip_existing=True)

    if 'amount' in update_data or 'category' in update_data:
        await event_dispatcher.dispatch(
            ExpenseEvents.UPDATED,
            user_id=user_id, expense_id=str(expense.id), category=expense.category,
            amount=float(expense.amount), currency=expense.currency, name=expense.name,
        )

    return expense
```
(Copy the existing backfill/dispatch args verbatim from the current file — the above mirrors them.)

- [ ] **Step 4: `commit` param on `delete_expense`** — add `commit: bool = True,` as the last param; replace the commit tail:
```python
    await db.delete(expense)
    if commit:
        await db.commit()
    else:
        await db.flush()
    return True
```

- [ ] **Step 5: Two new actions** — in `backend/app/modules/agent/actions.py`:

Add import:
```python
from app.modules.expenses.schemas import ExpenseUpdate
```
Add args models + committers (after the create committers):
```python
class UpdateExpenseArgs(BaseModel):
    expense_id: UUID
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    amount: Optional[Decimal] = Field(None, gt=0)
    category: Optional[str] = Field(None, max_length=50)


async def _commit_update_expense(db: AsyncSession, user_id: UUID, args: UpdateExpenseArgs) -> dict:
    fields = args.model_dump(exclude={"expense_id"}, exclude_none=True)
    expense = await expense_service.update_expense(
        db, user_id, args.expense_id, ExpenseUpdate(**fields), commit=False)
    if expense is None:
        raise ActionError(f"expense {args.expense_id} not found")
    return {"entity_type": "expense", "id": str(expense.id), "name": expense.name,
            "amount": float(expense.amount), "category": expense.category}


class DeleteExpenseArgs(BaseModel):
    expense_id: UUID


async def _commit_delete_expense(db: AsyncSession, user_id: UUID, args: DeleteExpenseArgs) -> dict:
    ok = await expense_service.delete_expense(db, user_id, args.expense_id, commit=False)
    if not ok:
        raise ActionError(f"expense {args.expense_id} not found")
    return {"entity_type": "expense", "id": str(args.expense_id)}
```
Extend the registry:
```python
    "update_expense": (UpdateExpenseArgs, _commit_update_expense),
    "delete_expense": (DeleteExpenseArgs, _commit_delete_expense),
```

- [ ] **Step 6: Run + full suite + ruff**
```bash
PYTHONPATH=. ~/.cache/wv-ai-venv/bin/python -m pytest tests/test_actions_edit_delete.py -q
PYTHONPATH=. ~/.cache/wv-ai-venv/bin/python -m pytest tests/ -q
~/.cache/wv-ai-venv/bin/ruff check app/
```

- [ ] **Step 7: Commit**
```bash
git add backend/app/modules/expenses/service.py backend/app/modules/agent/actions.py backend/tests/test_actions_edit_delete.py backend/tests/conftest.py
git commit -m "feat(agent): update_expense / delete_expense actions (user-scoped, atomic)"
```

---

## Task 1b-2: propose_action — resolve + disambiguate (TDD)

**Files:** Modify `backend/app/modules/agent/nodes.py`; Test: `backend/tests/test_propose_edit_delete.py`.

- [ ] **Step 1: Failing tests** — `backend/tests/test_propose_edit_delete.py`:

```python
import pytest
from app.modules.agent import nodes
from app.modules.agent.nodes import propose_action


def _patch_llm(monkeypatch, **fields):
    class _P:
        enough_info = True
        action_type = "update_expense"
        name = amount = target_amount = category = frequency = date = None
        match_text = match_amount = new_name = new_amount = new_category = clarification = None
    for k, v in fields.items():
        setattr(_P, k, v)

    class _LLM:
        def with_structured_output(self, _): return self
        async def ainvoke(self, _msgs): return _P()
    monkeypatch.setattr(nodes, "get_route_llm", lambda: _LLM())


class _Exp:
    def __init__(self, id, name, amount, date=None):
        self.id, self.name, self.amount, self.date, self.category = id, name, amount, date, None


@pytest.mark.asyncio
async def test_update_one_match_proposes(monkeypatch):
    _patch_llm(monkeypatch, action_type="update_expense", match_text="Netflix", new_amount=20.0)
    monkeypatch.setattr(nodes, "_find_expense_candidates",
                        lambda db, uid, text, amt: [_Exp("11111111-1111-1111-1111-111111111111", "Netflix", 15.0)])
    out = await propose_action({"question": "change my Netflix expense to $20", "history": [],
                                "steps": [], "user_id": "00000000-0000-0000-0000-0000000000d1"})
    pa = out["proposed_action"]
    assert pa["action_type"] == "update_expense"
    assert pa["args"]["expense_id"] == "11111111-1111-1111-1111-111111111111"
    assert pa["args"]["amount"] == 20.0


@pytest.mark.asyncio
async def test_delete_one_match_proposes_with_undo_warning(monkeypatch):
    _patch_llm(monkeypatch, action_type="delete_expense", match_text="coffee")
    monkeypatch.setattr(nodes, "_find_expense_candidates",
                        lambda db, uid, text, amt: [_Exp("22222222-2222-2222-2222-222222222222", "Coffee", 4.5)])
    out = await propose_action({"question": "delete my coffee expense", "history": [],
                                "steps": [], "user_id": "00000000-0000-0000-0000-0000000000d1"})
    assert out["proposed_action"]["action_type"] == "delete_expense"
    assert "undone" in out["proposed_action"]["summary"].lower()


@pytest.mark.asyncio
async def test_many_matches_disambiguates(monkeypatch):
    _patch_llm(monkeypatch, action_type="delete_expense", match_text="coffee")
    monkeypatch.setattr(nodes, "_find_expense_candidates",
                        lambda db, uid, text, amt: [_Exp("a", "Coffee", 4.5), _Exp("b", "Coffee", 3.75)])
    out = await propose_action({"question": "delete my coffee expense", "history": [],
                                "steps": [], "user_id": "00000000-0000-0000-0000-0000000000d1"})
    assert out["proposed_action"] is None and not out["refused"]


@pytest.mark.asyncio
async def test_no_match_clarifies(monkeypatch):
    _patch_llm(monkeypatch, action_type="delete_expense", match_text="yacht")
    monkeypatch.setattr(nodes, "_find_expense_candidates", lambda db, uid, text, amt: [])
    out = await propose_action({"question": "delete my yacht expense", "history": [],
                                "steps": [], "user_id": "00000000-0000-0000-0000-0000000000d1"})
    assert out["proposed_action"] is None
```
(The tests monkeypatch `_find_expense_candidates`, so they need no DB.)

- [ ] **Step 2: Run, confirm FAIL** (fields/func missing): `PYTHONPATH=. ~/.cache/wv-ai-venv/bin/python -m pytest tests/test_propose_edit_delete.py -q`

- [ ] **Step 3: Implement** — in `backend/app/modules/agent/nodes.py`:

(a) Add fields to `ActionProposal` (extend the Literal + add the edit/delete fields):
```python
    action_type: Literal["create_expense", "create_income", "create_subscription", "create_goal",
                         "update_expense", "delete_expense"] = Field(description="which action")
    ...
    match_text: Optional[str] = Field(default=None, description="for update/delete: name/merchant of the expense to find")
    match_amount: Optional[float] = Field(default=None, description="for update/delete: amount to help find the expense")
    new_name: Optional[str] = Field(default=None, description="update: new name")
    new_amount: Optional[float] = Field(default=None, description="update: new amount")
    new_category: Optional[str] = Field(default=None, description="update: new category")
```

(b) Extend `PROPOSE_SYSTEM` with two lines:
```
- update_expense: change an existing expense's amount/category/name. Put which expense in match_text \
(+match_amount if given) and the change in new_amount/new_category/new_name.
- delete_expense: remove an existing expense. Put which expense in match_text (+match_amount).
```

(c) Add the candidate search + resolver (after `propose_action`), and branch `propose_action` to it:
```python
from sqlalchemy import select  # ensure imported (it is, used elsewhere)


async def _find_expense_candidates(db, user_id, match_text, match_amount):
    from app.modules.expenses.models import Expense
    q = select(Expense).where(Expense.user_id == UUID(user_id), Expense.deleted_at.is_(None))
    if match_text:
        q = q.where(Expense.name.ilike(f"%{match_text}%"))
    if match_amount is not None:
        q = q.where(Expense.amount == match_amount)
    q = q.order_by(Expense.date.desc().nullslast()).limit(6)
    return list((await db.execute(q)).scalars().all())


def _clarify(state, msg: str) -> dict:
    return {"answer": msg, "refused": False, "proposed_action": None,
            "steps": _trace(state, "propose_action", "clarify")}


async def _propose_expense_edit(state: AgentState, p: "ActionProposal") -> dict:
    if not p.match_text and p.match_amount is None:
        return _clarify(state, "Which expense? Tell me its name or amount.")
    async with AsyncSessionLocal() as db:
        cands = await _find_expense_candidates(db, state["user_id"], p.match_text, p.match_amount)
    if not cands:
        return _clarify(state, f"I couldn't find an expense matching '{p.match_text or p.match_amount}'.")
    if len(cands) > 1:
        listing = "; ".join(
            f"{c.name} ${float(c.amount):.2f}"
            f"{(' on ' + c.date.date().isoformat()) if getattr(c, 'date', None) else ''}"
            for c in cands)
        return _clarify(state, f"I found a few matching expenses: {listing}. Which one?")
    c = cands[0]
    if p.action_type == "delete_expense":
        args = {"expense_id": str(c.id)}
        summary = f"Delete the ${float(c.amount):.2f} {c.name} expense — this can't be undone."
    else:
        changes = {}
        if p.new_name:
            changes["name"] = p.new_name
        if p.new_amount is not None:
            changes["amount"] = p.new_amount
        if p.new_category:
            changes["category"] = p.new_category
        if not changes:
            return _clarify(state, f"What should I change about the {c.name} expense?")
        args = {"expense_id": str(c.id), **changes}
        summary = (f"Update the {c.name} expense: "
                   + ", ".join(f"{k} → {v}" for k, v in changes.items()) + ".")
    return {
        "answer": f"{summary} Confirm to save?", "refused": False,
        "proposed_action": {"action_type": p.action_type, "args": args,
                            "idempotency_key": str(uuid4()), "summary": summary},
        "steps": _trace(state, "propose_action", f"proposed {p.action_type} for {c.name}"),
    }
```

(d) In `propose_action`, add the branch right after the `ActionProposal` is obtained, before the create-builder dispatch:
```python
    if p.action_type in ("update_expense", "delete_expense"):
        return await _propose_expense_edit(state, p)
```

(e) `ROUTE_SYSTEM` `action` bullet — add edit/delete and drop from refuse. Change the action bullet's tail from "Editing or deleting existing items, and creating budgets/accounts, are not yet supported → 'refuse'." to:
```
… You can also EDIT or DELETE an existing expense ("change my Netflix expense to $20", "delete \
the $4.50 coffee") — also "action". Creating budgets/accounts, and editing income/subscriptions/ \
goals, are not yet supported → "refuse".
```
(Ensure `AsyncSessionLocal` is imported in nodes.py — it is, used by other nodes.)

- [ ] **Step 4: Run + full suite + ruff**
```bash
PYTHONPATH=. ~/.cache/wv-ai-venv/bin/python -m pytest tests/test_propose_edit_delete.py tests/test_propose_multi_action.py -q
PYTHONPATH=. ~/.cache/wv-ai-venv/bin/python -m pytest tests/ -q
~/.cache/wv-ai-venv/bin/ruff check app/
```

- [ ] **Step 5: Commit**
```bash
git add backend/app/modules/agent/nodes.py backend/tests/test_propose_edit_delete.py
git commit -m "feat(agent): propose update/delete with candidate resolution + disambiguation"
```

---

## Task 1b-3: evals (update / delete / disambiguation)

**Files:** Modify `backend/evals/run_eval_assertions.py`, `backend/evals/promptfooconfig.yaml`.

- [ ] **Step 1:** The update/delete propose evals need a real expense to resolve. Add them as a small in-process block at the END of `run_eval_assertions.py`'s `main()` is overkill — instead, keep them in `SAFETY_CASES` but phrased against the SEEDED demo data (use an expense the seed always creates — pick one by inspecting `seed_demo_data`, e.g. a known recurring expense name). For each, assert `route == "action"` and `proposed_action.action_type` is correct (or, for the ambiguous case, `proposed_action is None`). Add:
```python
    ("change my <SEEDED_EXPENSE_NAME> expense amount to $123",
     lambda r: r.get("route") == "action"
               and (r.get("proposed_action") or {}).get("action_type") == "update_expense"),
    ("delete my <SEEDED_EXPENSE_NAME> expense",
     lambda r: r.get("route") == "action"
               and (r.get("proposed_action") or {}).get("action_type") in ("delete_expense", None)),
```
Replace `<SEEDED_EXPENSE_NAME>` with a real, reasonably-unique seeded expense name (read `app/scripts/seed_demo_data.py`). If a name matches multiple seeded rows, the delete case may legitimately disambiguate (`proposed_action is None`) — that's why the delete assertion allows `None`. Prefer a unique name so update resolves to one.

- [ ] **Step 2:** Mirror in `promptfooconfig.yaml` (assert `r.route === 'action'` and the action_type, allowing null for the possibly-ambiguous delete). Don't start any `description:` with a quote.

- [ ] **Step 3: Verify (needs OPENAI key)**
```bash
export OPENAI_API_KEY=$(grep -E '^OPENAI_API_KEY=' .env | cut -d= -f2-)
PYTHONPATH=. ~/.cache/wv-ai-venv/bin/python evals/run_eval_assertions.py 2>/dev/null | grep -E "^\[FAIL\]|passed|  (core|safety):"
```
No `[FAIL]`. If update mis-routes to compute, strengthen the `ROUTE_SYSTEM` edit/delete wording. NOTE: these evals create no data (propose only), so no cleanup needed.

- [ ] **Step 4: Commit**
```bash
git add backend/evals/run_eval_assertions.py backend/evals/promptfooconfig.yaml
git commit -m "test(agent): propose evals for update/delete expense"
```

---

## Task 1b-4: e2e + final review (controller)

- [ ] **Step 1:** Restart backend. Seed an expense via the agent (create_expense). Then: (a) `update_expense` — query "change my <that> expense to $X" → route=action, proposed_action update_expense with the right expense_id (no write at propose) → confirm → verify the row's amount changed; (b) `delete_expense` — query "delete my <that> expense" → propose (summary says can't-be-undone) → confirm → verify the row is gone; (c) disambiguation — create two same-name expenses, query "delete my <name> expense" → `proposed_action: None` + a listing. Reseed afterward to clean up.
- [ ] **Step 2:** Full suite + final whole-branch review (opus) focusing on: ownership re-check (cross-tenant expense_id rejected), propose does only a read, hard-delete guarded by confirm+disambiguation, atomicity preserved, no routing regression ("how's my goal" still compute), test pollution cleaned. Then finishing-a-development-branch.

---

## Self-review
- **Spec coverage:** update+delete actions (services `commit` + committers + registry → 1b-1); resolve+disambiguate (propose branch + candidate search → 1b-2); evals incl. disambiguation (→ 1b-3); e2e+review (→ 1b-4). Frontend unchanged (generic card). All spec sections mapped.
- **Placeholders:** full code except the seeded expense name in evals (must be read from `seed_demo_data.py` — flagged) and copying the exact existing backfill/dispatch args in `update_expense` (flagged — copy verbatim).
- **Type/name consistency:** `commit: bool = True` on update/delete; `ACTION_REGISTRY` keys `update_expense`/`delete_expense` match `ActionProposal.action_type` Literal, the propose branch, eval action_type strings; `args` carries `expense_id` (+changes); `_find_expense_candidates(db, user_id, match_text, match_amount)` signature matches the monkeypatch in tests.
- **Safety:** ownership enforced by the user-scoped services (forged expense_id → ActionError); propose does only a user-scoped read; delete is permanent but guarded by confirm + "can't be undone" summary + disambiguation; whitelist/auth/atomicity unchanged.
