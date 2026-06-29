# Level D #1a — Multi-Action Creates Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`).

**Goal:** Add three agent write actions — `create_income`, `create_subscription`, `create_goal` — on the existing propose→confirm→atomic-commit spine, and generalize `propose_action` + the confirm card so future actions are cheap. Spec: `docs/superpowers/specs/2026-06-29-agent-actions-1a-creates-design.md`.

**Architecture:** `commit_action` is already generic (whitelist → validate → committer(`commit=False`) → atomic commit + audit). We add 3 registry entries + their `commit`-aware service creates, generalize `propose_action` to a single `ActionProposal` extraction + per-action builders (each yields `args` + a human `summary`), and make the confirm card render `proposed_action.summary` for any action.

**Tech Stack:** FastAPI, SQLAlchemy async, LangGraph, pydantic; Next.js. Tests from `backend/`: `PYTHONPATH=. ~/.cache/wv-ai-venv/bin/python -m pytest <path> -q`.

**Branch:** `feat/agent-actions-1a-creates` (off main, checked out).

**Verified facts:** `create_subscription(db, user_id, SubscriptionCreate)` and `create_goal(db, user_id, GoalCreate)` are module-level and self-commit. `SubscriptionCreate` requires `name, amount(≥0), frequency(SubscriptionFrequency), start_date(datetime)`. `GoalCreate` requires `name, target_amount(>0), start_date(datetime)` (`current_amount` defaults 0). `SubscriptionFrequency` = `monthly|quarterly|annually|biannually`. Income's only create is `IncomeService.create_income_with_auto_deposit` (poor fit) → add a thin `create_income_transaction`. `IncomeTransactionCreate` requires `amount(≥0), date(datetime)`. `IncomeTransaction` model at `income/models.py:94` (+ `IncomeTransactionStatus`). `create_expense(..., commit: bool=True)` is the template for the `commit` param.

---

## Task 1a-1: backend write path for the 3 creates (services + actions) — TDD

**Files:** Modify `backend/app/modules/subscriptions/service.py`, `backend/app/modules/goals/service.py`, `backend/app/modules/income/service.py`, `backend/app/modules/agent/actions.py`; Test: `backend/tests/test_actions_creates.py`, `backend/tests/conftest.py`.

- [ ] **Step 1: Failing tests** — create `backend/tests/test_actions_creates.py`:

```python
import pytest
from sqlalchemy import select, func
from app.modules.agent.actions import commit_action, ACTION_REGISTRY
from app.modules.agent.models import AgentActionLog
from app.modules.income.models import IncomeTransaction
from app.modules.subscriptions.models import Subscription
from app.modules.goals.models import Goal


async def _count(db, model, user_id):
    return (await db.execute(
        select(func.count()).select_from(model).where(model.user_id == user_id))).scalar_one()


def test_registry_has_three_new_actions():
    for a in ("create_income", "create_subscription", "create_goal"):
        assert a in ACTION_REGISTRY


@pytest.mark.asyncio
async def test_commit_create_income(db, user_id):
    before = await _count(db, IncomeTransaction, user_id)
    r = await commit_action(db, user_id, "create_income",
                            {"amount": 2000, "category": "Freelance"}, "idem-income-1")
    assert r["status"] == "committed" and r["created"]["entity_type"] == "income"
    assert await _count(db, IncomeTransaction, user_id) == before + 1
    log = (await db.execute(select(AgentActionLog).where(
        AgentActionLog.idempotency_key == "idem-income-1"))).scalar_one()
    assert log.created_entity_type == "income"


@pytest.mark.asyncio
async def test_commit_create_subscription(db, user_id):
    before = await _count(db, Subscription, user_id)
    r = await commit_action(db, user_id, "create_subscription",
                            {"name": "Netflix", "amount": 15.0, "frequency": "monthly"},
                            "idem-sub-1")
    assert r["created"]["entity_type"] == "subscription"
    assert await _count(db, Subscription, user_id) == before + 1


@pytest.mark.asyncio
async def test_commit_create_goal(db, user_id):
    before = await _count(db, Goal, user_id)
    r = await commit_action(db, user_id, "create_goal",
                            {"name": "Emergency Fund", "target_amount": 10000}, "idem-goal-1")
    assert r["created"]["entity_type"] == "goal"
    assert await _count(db, Goal, user_id) == before + 1


@pytest.mark.asyncio
async def test_create_income_invalid_amount_rejected(db, user_id):
    from pydantic import ValidationError
    with pytest.raises(ValidationError):
        await commit_action(db, user_id, "create_income", {"amount": -5}, "idem-income-bad")
```
In `backend/tests/conftest.py`, add `"idem-income-1", "idem-sub-1", "idem-goal-1", "idem-income-bad"` to `_TEST_ACTION_IDEM_KEYS`.

- [ ] **Step 2: Run, confirm FAIL** (`create_income` not in registry): `PYTHONPATH=. ~/.cache/wv-ai-venv/bin/python -m pytest tests/test_actions_creates.py -q`

- [ ] **Step 3: Add `commit` param to `create_subscription`** — in `backend/app/modules/subscriptions/service.py`, add `commit: bool = True,` as the last param, and replace the commit tail. After `subscription.next_payment_date = calculate_next_payment_date(...)`:
```python
    db.add(subscription)

    if not commit:
        # Caller owns the transaction (agent action layer: atomic entity+audit). Flush only;
        # skip commit and the historical-payment backfill (agent path links no payment account).
        await db.flush()
        await db.refresh(subscription)
        return subscription

    await db.commit()
    await db.refresh(subscription)

    if sync_historical and subscription.payment_account_id:
        await backfill_subscription_payments(db, subscription)
        await db.commit()
        await db.refresh(subscription)

    return subscription
```

- [ ] **Step 4: Add `commit` param to `create_goal`** — in `backend/app/modules/goals/service.py`, add `commit: bool = True,` as the last param, and replace the `db.add(goal) … return goal` tail:
```python
    db.add(goal)
    if commit:
        await db.commit()
    else:
        await db.flush()
    await db.refresh(goal)
    return goal
```

- [ ] **Step 5: Add `create_income_transaction`** — in `backend/app/modules/income/service.py`, add a module-level function (NOT on the class). Read how `IncomeService.create_income_with_auto_deposit` constructs its `IncomeTransaction(...)` and replicate the field assignment **minus** any auto-deposit, setting the same status default it uses (likely `IncomeTransactionStatus.RECEIVED`/`COMPLETED` — use whatever that method uses):
```python
async def create_income_transaction(
    db: AsyncSession,
    user_id: UUID,
    data: IncomeTransactionCreate,
    commit: bool = True,
) -> IncomeTransaction:
    """Thin create for a single income transaction (no auto-deposit). Mirrors the field-setting
    of create_income_with_auto_deposit. commit=False -> flush only, for atomic callers."""
    txn = IncomeTransaction(
        user_id=user_id,
        source_id=data.source_id,
        amount=data.amount,
        currency=data.currency,
        date=data.date,
        category=data.category,
        description=data.description,
        notes=data.notes,
        status=<same default the auto-deposit method uses>,
    )
    db.add(txn)
    if commit:
        await db.commit()
    else:
        await db.flush()
    await db.refresh(txn)
    return txn
```
Ensure `IncomeTransactionCreate` and `IncomeTransactionStatus` are imported in the file (they already are per the module imports). If `IncomeTransaction` has other NOT-NULL columns the auto-deposit method sets, set them too (read the model).

- [ ] **Step 6: Add the three actions** — in `backend/app/modules/agent/actions.py`:

Add imports near the existing expense imports:
```python
from app.modules.subscriptions import service as subscription_service
from app.modules.subscriptions.schemas import SubscriptionCreate
from app.modules.subscriptions.models import SubscriptionFrequency
from app.modules.goals import service as goal_service
from app.modules.goals.schemas import GoalCreate
from app.modules.income import service as income_service
from app.modules.income.schemas import IncomeTransactionCreate
```

Add the args models + committers (after `_commit_create_expense`):
```python
class CreateIncomeArgs(BaseModel):
    amount: Decimal = Field(..., gt=0)
    category: Optional[str] = Field(None, max_length=50)
    date: Optional[date_cls] = None


async def _commit_create_income(db: AsyncSession, user_id: UUID, args: CreateIncomeArgs) -> dict:
    when = datetime.combine(args.date or date_cls.today(), datetime.min.time())
    txn = await income_service.create_income_transaction(
        db, user_id,
        IncomeTransactionCreate(amount=args.amount, currency="USD", date=when,
                                category=args.category),
        commit=False,
    )
    return {"entity_type": "income", "id": str(txn.id), "amount": float(txn.amount),
            "category": txn.category, "date": txn.date.date().isoformat() if txn.date else None}


class CreateSubscriptionArgs(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    amount: Decimal = Field(..., ge=0)
    frequency: Optional[str] = Field(None, max_length=20)
    category: Optional[str] = Field(None, max_length=50)


async def _commit_create_subscription(db: AsyncSession, user_id: UUID,
                                      args: CreateSubscriptionArgs) -> dict:
    try:
        freq = SubscriptionFrequency(args.frequency) if args.frequency else SubscriptionFrequency.MONTHLY
    except ValueError:
        freq = SubscriptionFrequency.MONTHLY
    sub = await subscription_service.create_subscription(
        db, user_id,
        SubscriptionCreate(name=args.name, amount=args.amount, currency="USD",
                           frequency=freq, start_date=datetime.utcnow(), category=args.category),
        commit=False,
    )
    return {"entity_type": "subscription", "id": str(sub.id), "name": sub.name,
            "amount": float(sub.amount), "frequency": sub.frequency.value
            if hasattr(sub.frequency, "value") else str(sub.frequency)}


class CreateGoalArgs(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    target_amount: Decimal = Field(..., gt=0)
    category: Optional[str] = Field(None, max_length=50)


async def _commit_create_goal(db: AsyncSession, user_id: UUID, args: CreateGoalArgs) -> dict:
    goal = await goal_service.create_goal(
        db, user_id,
        GoalCreate(name=args.name, target_amount=args.target_amount,
                   currency="USD", start_date=datetime.utcnow(), category=args.category),
        commit=False,
    )
    return {"entity_type": "goal", "id": str(goal.id), "name": goal.name,
            "target_amount": float(goal.target_amount)}
```

Extend the registry:
```python
ACTION_REGISTRY = {
    "create_expense": (CreateExpenseArgs, _commit_create_expense),
    "create_income": (CreateIncomeArgs, _commit_create_income),
    "create_subscription": (CreateSubscriptionArgs, _commit_create_subscription),
    "create_goal": (CreateGoalArgs, _commit_create_goal),
}
```

- [ ] **Step 7: Run new tests + full suite + ruff**
```bash
PYTHONPATH=. ~/.cache/wv-ai-venv/bin/python -m pytest tests/test_actions_creates.py -q
PYTHONPATH=. ~/.cache/wv-ai-venv/bin/python -m pytest tests/ -q
~/.cache/wv-ai-venv/bin/ruff check app/
```
All pass / clean. If `create_income_transaction` errors on a missing NOT-NULL column, read the `IncomeTransaction` model + the auto-deposit method and set it.

- [ ] **Step 8: Commit**
```bash
git add backend/app/modules/subscriptions/service.py backend/app/modules/goals/service.py backend/app/modules/income/service.py backend/app/modules/agent/actions.py backend/tests/test_actions_creates.py backend/tests/conftest.py
git commit -m "feat(agent): create_income / create_subscription / create_goal actions"
```

---

## Task 1a-2: generalize `propose_action` to multi-action — TDD

**Files:** Modify `backend/app/modules/agent/nodes.py`; Test: `backend/tests/test_propose_multi_action.py`.

- [ ] **Step 1: Failing tests** — `backend/tests/test_propose_multi_action.py`:

```python
import pytest
from app.modules.agent import nodes
from app.modules.agent.nodes import propose_action


def _patch(monkeypatch, **fields):
    class _P:
        enough_info = True
        action_type = "create_expense"
        name = None; amount = None; target_amount = None
        category = None; frequency = None; date = None; clarification = None
    for k, v in fields.items():
        setattr(_P, k, v)

    class _LLM:
        def with_structured_output(self, _): return self
        async def ainvoke(self, _msgs): return _P()
    monkeypatch.setattr(nodes, "get_route_llm", lambda: _LLM())


@pytest.mark.asyncio
async def test_propose_income(monkeypatch):
    _patch(monkeypatch, action_type="create_income", amount=2000.0, category="Freelance")
    out = await propose_action({"question": "log $2000 freelance income", "history": [], "steps": []})
    pa = out["proposed_action"]
    assert pa["action_type"] == "create_income" and pa["args"]["amount"] == 2000.0
    assert isinstance(pa["idempotency_key"], str) and pa["summary"]


@pytest.mark.asyncio
async def test_propose_subscription(monkeypatch):
    _patch(monkeypatch, action_type="create_subscription", name="Netflix", amount=15.0,
           frequency="monthly")
    out = await propose_action({"question": "add a $15/mo Netflix subscription", "history": [],
                                "steps": []})
    assert out["proposed_action"]["action_type"] == "create_subscription"


@pytest.mark.asyncio
async def test_propose_goal(monkeypatch):
    _patch(monkeypatch, action_type="create_goal", name="Emergency Fund", target_amount=10000.0)
    out = await propose_action({"question": "set a $10k emergency fund goal", "history": [],
                                "steps": []})
    assert out["proposed_action"]["action_type"] == "create_goal"
    assert out["proposed_action"]["args"]["target_amount"] == 10000.0


@pytest.mark.asyncio
async def test_propose_missing_fields_clarifies(monkeypatch):
    _patch(monkeypatch, action_type="create_goal", name=None, target_amount=None,
           clarification="What's the goal name and target?")
    out = await propose_action({"question": "set a goal", "history": [], "steps": []})
    assert out["proposed_action"] is None and not out["refused"]
```

- [ ] **Step 2: Run, confirm FAIL**: `PYTHONPATH=. ~/.cache/wv-ai-venv/bin/python -m pytest tests/test_propose_multi_action.py -q`

- [ ] **Step 3: Implement** — in `backend/app/modules/agent/nodes.py`, REPLACE `ExpenseProposal`, `PROPOSE_SYSTEM`, and `propose_action` with:

```python
from typing import Literal  # add to the typing import at top if not present


class ActionProposal(BaseModel):
    """Single-call extraction for any supported write action; per-action builders use the relevant
    fields. The router already chose route='action'; this picks which action and its fields."""
    action_type: Literal["create_expense", "create_income", "create_subscription", "create_goal"] = Field(
        description="which action the user wants")
    enough_info: bool = Field(description="false if the required fields for the action are missing")
    name: Optional[str] = Field(default=None, description="label/merchant (expense, subscription, goal)")
    amount: Optional[float] = Field(default=None, description="amount for expense/income/subscription")
    target_amount: Optional[float] = Field(default=None, description="goal target amount")
    category: Optional[str] = Field(default=None, description="category")
    frequency: Optional[str] = Field(default=None, description="subscription: monthly/quarterly/annually/biannually")
    date: Optional[str] = Field(default=None, description="ISO date YYYY-MM-DD; null means today")
    clarification: Optional[str] = Field(default=None, description="if enough_info is false, what to ask")


PROPOSE_SYSTEM = """Decide which single action the user wants and extract its fields:
- create_expense: an expense to record. Needs amount + a name/merchant.
- create_income: income received. Needs amount.
- create_subscription: a recurring subscription. Needs a name + amount (frequency optional, default monthly).
- create_goal: a savings goal. Needs a name + target_amount.
Do NOT invent values. If the required fields for the chosen action are missing, set enough_info=false \
and put a one-line clarification. Never write anything; you only propose. Today is {today}."""


def _b_expense(p: "ActionProposal"):
    if p.amount is None or not p.name:
        return None
    args = {"name": p.name, "amount": p.amount, "category": p.category, "date": p.date}
    cat = f" {p.category}" if p.category else ""
    return args, f"Add a ${float(p.amount):.2f}{cat} expense dated {p.date or 'today'}."


def _b_income(p: "ActionProposal"):
    if p.amount is None:
        return None
    args = {"amount": p.amount, "category": p.category, "date": p.date}
    cat = f" {p.category}" if p.category else ""
    return args, f"Record ${float(p.amount):.2f}{cat} income dated {p.date or 'today'}."


def _b_subscription(p: "ActionProposal"):
    if p.amount is None or not p.name:
        return None
    args = {"name": p.name, "amount": p.amount, "frequency": p.frequency, "category": p.category}
    freq = p.frequency or "monthly"
    return args, f"Add a ${float(p.amount):.2f} {freq} {p.name} subscription."


def _b_goal(p: "ActionProposal"):
    if p.target_amount is None or not p.name:
        return None
    args = {"name": p.name, "target_amount": p.target_amount, "category": p.category}
    return args, f"Create a savings goal '{p.name}' targeting ${float(p.target_amount):.2f}."


PROPOSAL_BUILDERS = {
    "create_expense": _b_expense,
    "create_income": _b_income,
    "create_subscription": _b_subscription,
    "create_goal": _b_goal,
}


async def propose_action(state: AgentState) -> dict:
    llm = get_route_llm().with_structured_output(ActionProposal)
    p: ActionProposal = await llm.ainvoke([
        ("system", PROPOSE_SYSTEM.format(today=date.today().isoformat())),
        *_history_messages(state.get("history")),
        ("human", state["question"]),
    ])
    builder = PROPOSAL_BUILDERS.get(p.action_type)
    built = builder(p) if (builder and p.enough_info) else None
    if built is None:
        msg = p.clarification or "I need a bit more detail to add that — what are the key numbers?"
        return {"answer": msg, "refused": False, "proposed_action": None,
                "steps": _trace(state, "propose_action", "insufficient info -> clarify")}
    args, summary = built
    return {
        "answer": f"{summary} Confirm to save?", "refused": False,
        "proposed_action": {"action_type": p.action_type, "args": args,
                            "idempotency_key": str(uuid4()), "summary": summary},
        "steps": _trace(state, "propose_action", f"proposed {p.action_type}"),
    }
```
(`uuid4`, `date`, `Optional`, `Field`, `BaseModel` already imported. Add `Literal` to the `from typing import ...` line if missing.)

- [ ] **Step 4: Run new tests + full suite + ruff**
```bash
PYTHONPATH=. ~/.cache/wv-ai-venv/bin/python -m pytest tests/test_propose_multi_action.py tests/test_propose_idempotency.py -q
PYTHONPATH=. ~/.cache/wv-ai-venv/bin/python -m pytest tests/ -q
~/.cache/wv-ai-venv/bin/ruff check app/
```
Note: `test_propose_idempotency.py` patches a `_FakeProposal` with `action_type` absent — update it if needed so it still passes (the fake needs an `action_type = "create_expense"` attribute). Make that one-line fix to the existing test if it fails.

- [ ] **Step 5: Commit**
```bash
git add backend/app/modules/agent/nodes.py backend/tests/test_propose_multi_action.py backend/tests/test_propose_idempotency.py
git commit -m "feat(agent): generalize propose_action to multi-action (income/subscription/goal)"
```

---

## Task 1a-3: type-agnostic confirm card

**Files:** Modify `frontend/hooks/useAgentStream.ts`, `frontend/components/agent/ask-your-finances.tsx`.

- [ ] **Step 1: Add `summary` + relax types** — in `frontend/hooks/useAgentStream.ts`, change the `proposed_action` shape so args is generic and `summary` exists:
```ts
  proposed_action?: {
    action_type: string;
    args: Record<string, unknown>;
    idempotency_key: string;
    summary: string;
  } | null;
```

- [ ] **Step 2: Render any action** — in `frontend/components/agent/ask-your-finances.tsx`:
  - Change the render gate from `view.result?.proposed_action?.action_type === 'create_expense'` to `view.result?.proposed_action` (render for any proposal).
  - In `ConfirmExpenseCard` (rename to `ConfirmActionCard`), replace the expense-specific body line with the generic summary. The card body becomes:
```tsx
function ConfirmActionCard({ action }: { action: NonNullable<AgentResult['proposed_action']> }) {
  const [status, setStatus] = useState<'idle' | 'saving' | 'done' | 'cancelled' | 'error'>('idle');
  const [err, setErr] = useState<string | null>(null);
  const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

  async function confirm() {
    setStatus('saving');
    try {
      const session = await getSession();
      const token = (session as { accessToken?: string } | null)?.accessToken
        || process.env.NEXT_PUBLIC_DEV_AGENT_TOKEN || '';
      const res = await fetch(`${API_URL}/api/v1/agent/actions/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          action_type: action.action_type,
          args: action.args,
          idempotency_key: action.idempotency_key,
        }),
      });
      if (!res.ok) throw new Error(`(${res.status})`);
      setStatus('done');
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setStatus('error');
    }
  }

  if (status === 'done') {
    return <div className="mt-2 text-sm text-green-600 dark:text-green-400">✓ Saved.</div>;
  }
  if (status === 'cancelled') {
    return <div className="mt-2 text-sm text-muted-foreground">Cancelled.</div>;
  }
  return (
    <div className="mt-3 rounded-lg border border-gray-200 dark:border-gray-700 p-3 text-sm">
      <div className="font-medium mb-1">Confirm this action?</div>
      <div className="text-gray-600 dark:text-gray-300">{action.summary}</div>
      {status === 'error' && <div className="text-red-600 dark:text-red-400 mt-1">Couldn&apos;t save {err}</div>}
      <div className="mt-2 flex gap-2">
        <button onClick={confirm} disabled={status === 'saving'}
          className="rounded-md bg-primary px-3 py-1 text-primary-foreground disabled:opacity-50">
          {status === 'saving' ? 'Saving…' : 'Confirm'}
        </button>
        <button onClick={() => setStatus('cancelled')}
          className="rounded-md px-3 py-1 ring-1 ring-gray-300 dark:ring-gray-600">Cancel</button>
      </div>
    </div>
  );
}
```
  - Update the JSX usage to `{view.result?.proposed_action && (<ConfirmActionCard action={view.result.proposed_action} />)}` and the old `ConfirmExpenseCard` reference.

- [ ] **Step 3: Gates** — `cd frontend && npx --no-install tsc --noEmit && echo TSC_OK && npx --no-install eslint components/agent/ask-your-finances.tsx hooks/useAgentStream.ts`. Expected: `TSC_OK`, 0 errors.

- [ ] **Step 4: Commit**
```bash
git add frontend/hooks/useAgentStream.ts frontend/components/agent/ask-your-finances.tsx
git commit -m "feat(web): type-agnostic confirm card (renders proposed_action.summary)"
```

---

## Task 1a-4: evals (propose per action) + coverage

**Files:** Modify `backend/evals/run_eval_assertions.py`, `backend/evals/promptfooconfig.yaml`.

- [ ] **Step 1: Add a propose case per new action** to `SAFETY_CASES` in `run_eval_assertions.py` (they assert route=action, correct action_type, no refusal — and the #3 coverage gate keys on the action_type strings appearing here):
```python
    ("log $2000 of freelance income",
     lambda r: r.get("route") == "action"
               and (r.get("proposed_action") or {}).get("action_type") == "create_income"
               and r["refused"] is False),
    ("add a $15 monthly Netflix subscription",
     lambda r: r.get("route") == "action"
               and (r.get("proposed_action") or {}).get("action_type") == "create_subscription"
               and r["refused"] is False),
    ("set a $10,000 emergency fund goal",
     lambda r: r.get("route") == "action"
               and (r.get("proposed_action") or {}).get("action_type") == "create_goal"
               and r["refused"] is False),
```

- [ ] **Step 2: Mirror in `promptfooconfig.yaml`** — append three tests (6-space indent), each asserting `r.route === 'action'`, `r.proposed_action.action_type` is the expected one, and `!r.refused`. Follow the existing "add expense" promptfoo case shape; do NOT start any `description:` value with a quote character (YAML parse error).

- [ ] **Step 3: Verify in-process eval (needs OPENAI key)**
```bash
export OPENAI_API_KEY=$(grep -E '^OPENAI_API_KEY=' .env | cut -d= -f2-)
PYTHONPATH=. ~/.cache/wv-ai-venv/bin/python evals/run_eval_assertions.py 2>/dev/null | grep -E "^\[FAIL\]|passed|  (core|safety):"
~/.cache/wv-ai-venv/bin/python -c "import yaml; print('promptfoo tests:', len(yaml.safe_load(open('evals/promptfooconfig.yaml'))['tests']))"
```
Expected: no `[FAIL]`. If a new action mis-routes (LLM picks the wrong action_type), strengthen the `PROPOSE_SYSTEM` action descriptions in nodes.py (controller may iterate here).

- [ ] **Step 4: Commit**
```bash
git add backend/evals/run_eval_assertions.py backend/evals/promptfooconfig.yaml
git commit -m "test(agent): propose evals for income/subscription/goal actions"
```

---

## Task 1a-5: end-to-end verification (controller)

- [ ] **Step 1:** Restart backend. For each of the three actions: `POST /agent/query` with a natural request → assert `route=action`, correct `proposed_action.action_type`, a `summary`, an `idempotency_key`, and **no write** (entity count unchanged at propose). Then `POST /agent/actions/confirm` with the proposal's args+key → committed; confirm again → `idempotent_replay`. Verify exactly one new entity + one audit row each.
- [ ] **Step 2:** Full suite + (if #3 merged) `python evals/check_coverage.py` → all four actions covered. Then finishing-a-development-branch.

---

## Self-review
- **Spec coverage:** 3 creates (services `commit` param + actions + registry → 1a-1); generalized propose (single `ActionProposal` + builders + `summary` → 1a-2); type-agnostic card (→ 1a-3); per-action evals satisfying coverage (→ 1a-4); e2e (→ 1a-5). All spec sections mapped.
- **Placeholders:** full code given except the income `status` default + any extra NOT-NULL field, which the implementer reads from the model/auto-deposit method (authoritative source; flagged explicitly) — not guessable safely from here.
- **Type/name consistency:** `commit: bool = True` across all four services; `ACTION_REGISTRY` keys `create_{expense,income,subscription,goal}` match `PROPOSAL_BUILDERS` keys and the eval/propose `action_type` strings and the `ActionProposal.action_type` Literal; `proposed_action` now carries `{action_type, args, idempotency_key, summary}` consistently across nodes, response, frontend.
- **Safety preserved:** whitelist + re-validate + `user_id`-from-auth + atomic commit unchanged; propose still performs no write; `commit=False` only skips backfills/alerts (documented).
