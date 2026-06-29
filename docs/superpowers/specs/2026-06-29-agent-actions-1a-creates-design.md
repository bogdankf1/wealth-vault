# Level D #1a — Multi-Action Creates (income, subscription, goal) Design

**Date:** 2026-06-29
**Status:** Approved (design). Builds on Level D v1 (create_expense) + v2 hardening (atomic commit_action, per-proposal idempotency key). #1b (edit/delete) is a separate later slice.

## Goal
Let the agent propose **add income**, **add subscription**, and **add a savings goal** — reusing the propose → confirm → atomic-commit spine. Generalize `propose_action` so it routes among action types and so future actions are cheap; make the confirm card type-agnostic.

## Design

### 1. Service layer — atomic-friendly creates
Each committer must create its entity **without committing** (so `commit_action` commits entity + audit in one transaction, per v2 hardening). Mirror the `create_expense(commit=...)` pattern:
- `subscriptions/service.py: create_subscription(..., commit: bool = True)` — `commit=False` → `add → flush → refresh`, skip the historical-payment backfill.
- `goals/service.py: create_goal(..., commit: bool = True)` — `commit=False` → `add → flush → refresh`.
- `income/service.py: create_income_transaction(db, user_id, data: IncomeTransactionCreate, commit: bool = True)` — **new** thin module-level create (the existing `IncomeService.create_income_with_auto_deposit` is a poor fit: it self-commits, returns a tuple, and does auto-deposit the agent path doesn't need). Inserts an `IncomeTransaction`; `commit=False` → `add → flush → refresh`.

The `commit=True` default keeps every existing caller byte-for-byte unchanged.

### 2. Action layer (`actions.py`) — three new whitelisted actions
Add to `ACTION_REGISTRY` (keeps `commit_action` generic — whitelist → validate → committer(commit=False) → atomic commit + audit, unchanged):
- `create_income` → `CreateIncomeArgs(amount > 0, category?, date?)` → builds `IncomeTransactionCreate(amount, currency="USD", date=date or today, category)`, calls `create_income_transaction(commit=False)`, returns `{entity_type: "income", id, amount, category, date}`.
- `create_subscription` → `CreateSubscriptionArgs(name, amount ≥ 0, frequency?, category?)` → builds `SubscriptionCreate(name, amount, currency="USD", frequency=frequency or MONTHLY, start_date=today, category)`, calls `create_subscription(commit=False)`, returns `{entity_type: "subscription", id, name, amount, frequency}`.
- `create_goal` → `CreateGoalArgs(name, target_amount > 0, category?)` → builds `GoalCreate(name, target_amount, current_amount=0, currency="USD", start_date=today, category)`, calls `create_goal(commit=False)`, returns `{entity_type: "goal", id, name, target_amount}`.

`SubscriptionFrequency` values: `monthly` (default), `quarterly`, `annually`, `biannually`. Args re-validated server-side independent of the LLM, as today.

### 3. Proposal layer (`nodes.py`) — generalize `propose_action`
Replace the expense-only extraction with a single multi-action extraction + per-action builders:
- **One** structured-output call returning `ActionProposal`:
  ```
  action_type: Literal["create_expense","create_income","create_subscription","create_goal"]
  enough_info: bool
  name|amount|target_amount|category|frequency|date: Optional[...]   # the union of fields
  clarification: Optional[str]
  ```
- A `PROPOSAL_BUILDERS` dict keyed by `action_type`, each `build(p) -> (args: dict, summary: str) | None` (None = required field missing → clarify). E.g. `create_income` needs `amount`; `create_goal` needs `name` + `target_amount`.
- `propose_action`: extract → if `not enough_info` / unknown type / builder returns None → return a clarification answer (`proposed_action: None`). Else return:
  ```
  proposed_action = {action_type, args, idempotency_key: uuid4(), summary}
  answer = f"{summary} Confirm to save?"
  ```
- The router (`route_node`) is unchanged — it still picks route `action`; `propose_action` decides *which* action.

### 4. Frontend — type-agnostic confirm card
The card currently renders expense-specific fields and only for `create_expense`. Change it to render `proposed_action.summary` (a human string the backend already builds) + Confirm/Cancel for **any** `proposed_action`. New actions then need zero frontend changes. The confirm POST is unchanged (`{action_type, args, idempotency_key}`). Add `summary: string` to the `proposed_action` type.

### 5. Safety / evals
- Whitelist + `user_id`-from-auth + re-validation unchanged → injection/poisoned-doc still can't write (propose needs user intent + a click).
- One propose eval per new action (route `action`, correct `action_type`, **no write** at propose time) in both `run_eval_assertions.py` and `promptfooconfig.yaml`, so the #3 action-coverage gate is satisfied for every `ACTION_REGISTRY` key.
- `commit_action` unit tests per new action (happy path one-entity-one-audit; idempotency + concurrency already covered generically).

## Out of scope (→ #1b or later)
- Edit / delete of any entity (needs target-entity resolution + delete-safety).
- Income auto-deposit, subscription payment backfill, goal account-linking via the agent.
- Updating existing income sources / recurring schedules.

## Risks / decisions
- **One vs many LLM calls in propose:** chose a single `ActionProposal` extraction (cheaper, lower latency) over classify-then-extract; per-action `build()` validates required fields.
- **Income service fit:** add a thin `create_income_transaction` rather than retrofit the auto-deposit method — keeps the atomic `commit=False` path simple and avoids touching deposit logic.
- **Goal model** extends `Base` (not `BaseModel`); `goal.id` is read after `flush + refresh` for the audit FK (same as the committed path does today).
