# Level D #1b — Edit / Delete an Expense Design

**Date:** 2026-06-29
**Status:** Approved (forks chosen). Builds on Level D v1/v2 + #1a. Last action slice before this catalog area pauses.

## Goal
Let the agent **edit** (amount / category / name) and **delete** an existing expense, via the same propose → confirm → atomic-commit spine. The new wrinkle vs the creates: the agent must **resolve which expense** the user means (a read), and **disambiguate** when several match.

## Approved decisions
- Scope: **edit + delete both**.
- Disambiguation when multiple match: **list the candidates and ask which** (a clarification turn; no proposal until it resolves to one).
- Editable fields: **amount, category, name** (not date).

## Design

### 1. Service layer — `commit` param (atomic-friendly)
`update_expense(db, user_id, expense_id, ExpenseUpdate, commit: bool = True)` and `delete_expense(db, user_id, expense_id, commit: bool = True)`. `commit=False` → apply change + `flush` (no commit; skip the payment backfill + the `ExpenseEvents.UPDATED` dispatch on update). Both already fetch via the **user-scoped** `get_expense` and return `None`/`False` if the expense isn't the caller's — that's the ownership guard.

**Delete is a HARD/permanent delete** (`db.delete`), not soft. The confirm summary must say so ("Delete … — this can't be undone."). The propose→confirm + disambiguation are the guards; consistent with the app's existing delete behavior.

### 2. Action layer (`actions.py`) — two new whitelisted actions
- `update_expense` → `UpdateExpenseArgs(expense_id: UUID, name?, amount(>0)?, category?)` → builds `ExpenseUpdate(**only-provided)`, calls `update_expense(user_id, expense_id, ..., commit=False)`. If the service returns `None` (not found/owned) → raise `ActionError` (404/400). Returns `{entity_type: "expense", id, ...}`.
- `delete_expense` → `DeleteExpenseArgs(expense_id: UUID)` → calls `delete_expense(user_id, expense_id, commit=False)`; `False` → `ActionError`. Returns `{entity_type: "expense", id}`.

`commit_action` is unchanged (generic, atomic, idempotent). The audit row's `created_entity_id` records the **affected** expense id (the field is a plain UUID, no FK, so it's fine even after a delete). **Cross-tenant safety:** even if a confirm POST carried another user's `expense_id`, the service's `user_id` scoping rejects it → `ActionError`. The `expense_id` in args is therefore safe to trust only because the service re-checks ownership.

### 3. Proposal layer (`nodes.py`) — resolve + disambiguate
Extend `ActionProposal` with edit/delete fields and `action_type` Literal (now 6): add
`match_text` (name/merchant to find), `match_amount` (amount to help find), and update changes `new_name` / `new_amount` / `new_category`.

`propose_action` branches by action_type:
- **create_\*** (unchanged): pure builders, no DB.
- **update_expense / delete_expense:** open a session and run a **user-scoped** candidate search — `Expense` where `user_id`, `name ILIKE %match_text%`, optional `amount == match_amount`, active, ordered by date desc, limit ~6. Then:
  - **0 candidates** → clarification answer ("I couldn't find an expense matching '…'."), `proposed_action: None`.
  - **1 candidate** → build `proposed_action = {action_type, args: {expense_id, +changes for update}, idempotency_key, summary}`; summary names the specific expense (and "can't be undone" for delete).
  - **many** → clarification answer **listing** the candidates (name · amount · date), asking which; `proposed_action: None`. The follow-up turn re-runs with the refined query (history gives context) → narrows to one.

The router (`ROUTE_SYSTEM` `action` bullet) gains "edit/delete an existing expense" and drops it from the refuse list. Disambiguation reply ("the $4.50 one") is itself an `action`-routed follow-up that re-resolves.

### 4. Frontend
No change. The confirm card already renders `proposed_action.summary` generically; update/delete summaries render as-is.

### 5. Safety / evals
- Whitelist + auth-scoped `user_id` + service ownership re-check + re-validation unchanged. Propose still performs only a **read** (no write). Injection can't edit/delete (needs user intent + a click; and the target is found within the user's own data only).
- Evals: propose `update_expense` (route action, type, no write), propose `delete_expense` (type, summary mentions can't-undo), and a disambiguation case (a vague request that matches multiple → `proposed_action: None`, clarification lists options). All in `run_eval_assertions.py` + `promptfooconfig.yaml` (satisfies the #3 coverage gate for the two new action_types).
- `commit_action` tests: update happy-path (fields changed, one audit), delete happy-path (row gone, one audit), not-owned/missing → `ActionError`, idempotent replay.

## Out of scope
- Editing income/subscriptions/goals (only expense edit/delete here).
- Bulk edit/delete ("delete all my coffee expenses").
- Undo / soft-delete restoration (delete is permanent).
- Editing date or recurring-schedule fields.

## Risks / decisions
- **Hard delete is irreversible** — mitigated by disambiguation + an explicit "can't be undone" confirm; matches the app's existing delete.
- **Resolution quality** depends on the LLM extracting good `match_text`/`match_amount`; the disambiguation turn is the safety net when it's vague. Candidate search is name-ILIKE + optional exact amount (kept simple; no fuzzy/semantic match in v1).
- **propose_action now does a DB read** for update/delete (it was pure before) — acceptable; it's a user-scoped read, no write.
