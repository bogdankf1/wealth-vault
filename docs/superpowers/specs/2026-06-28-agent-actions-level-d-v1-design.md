# Design — Level D v1: Agent Actions ("Add an Expense")

**Date:** 2026-06-28
**Status:** Approved (design); pending implementation plan
**Builds on:** the read-only agent (LangGraph `classify → compute/retrieve → synthesize → validate`, typed user-scoped tools, SSE streaming) and the safety-eval suite. Context seed: `docs/agent-actions-next-session.md`.

## Goal

Let the chat agent **take one action** — create an expense — through a **propose → confirm → commit** flow, establishing the machinery (and safety pattern) that later action types extend. This is slice 1 of the Level-D phase; v1 ships exactly one action type.

## Spine (safety thesis)

**The LLM only PROPOSES a typed action; a separate deterministic endpoint is the SOLE writer and COMMITS only after an explicit user confirm.** This mirrors the existing thesis ("the LLM never computes the number") and is the central safety mechanism: every write is server-validated, user-scoped, and user-confirmed.

## Locked decisions

- **v1 scope:** one action type — `create_expense` (create only). No updates, no deletes.
- **Flow:** two HTTP calls — a propose turn (agent, no write) and a deterministic confirm/commit endpoint (no LLM).
- **Mechanism:** a new `action` route + `propose_action` node (graph: `classify → propose_action → END`), NOT a write-tool in the read-tool registry — keeps writes off the compute/grounding/validate path.
- **Trust model:** the commit endpoint re-validates the proposed args from scratch (client payload is untrusted input); `user_id` always comes from the auth token, never the payload. No HMAC-signing of the proposal — the user only ever acts on their own data within the whitelist, so re-validation is sufficient.
- **Whitelist:** `create_expense` only. No writes to accounts / savings / Monobank-linked rows.
- **Idempotency + audit:** an idempotency key dedupes double-commit; every commit attempt writes an `AgentActionLog` row.

## Flow

### 1. Propose (existing agent turn — `POST /api/v1/agent/query` and `/stream`)
- Router (`route_node`) gains a `"action"` route: a request expressing intent to add/record an expense ("add a $40 groceries expense yesterday", "log $12 lunch") routes to `action`.
- `propose_action` node uses an LLM structured-output call to extract a typed `ProposedAction` `{action_type: "create_expense", args: {...}}` from the NL. **It performs no DB write.**
- If required args can't be extracted (e.g. no amount), the node returns a clarifying question and **no** `proposed_action` (so no card renders).
- Otherwise the node sets `answer` to a short confirmation prompt ("Add a $40.00 Groceries expense dated 2026-06-27? Confirm to save.") and puts the structured proposal in state.
- `format_result` / SSE `done` event include a new `proposed_action` field (null on non-action turns).

### 2. Confirm / commit (new endpoint `POST /api/v1/agent/actions/confirm` — deterministic, no LLM)
- Auth required; `user_id` from the token.
- Request body: `{ action_type: str, args: dict, idempotency_key: str }`.
- Steps: (a) `action_type` must be in the whitelist (v1: `create_expense`) else 400; (b) coerce/validate `args` against `CreateExpenseArgs` (strict) else 422; (c) if `idempotency_key` already committed for this user → return the prior result (no second write); (d) commit via `expenses.service.create_expense(db, user_id, ExpenseCreate(...))`; (e) write/finalize the `AgentActionLog` row; (f) return `{ status: "committed", action_type, created: {entity_type: "expense", id, ...summary}, idempotency_key }`.

## New components (small, single-responsibility)

- **`backend/app/modules/agent/actions.py`** — the action layer, isolated from the read tools:
  - `CreateExpenseArgs` (Pydantic): `name: str`, `amount: Decimal > 0`, `category: str | None`, `date: date | None` (defaults today), `currency` fixed "USD" v1; maps to a one-time expense (`frequency=ONE_TIME`).
  - `ACTION_REGISTRY: dict[str, ActionSpec]` — whitelist mapping `action_type → (args_model, committer)`. v1 has one entry.
  - `async def commit_action(db, user_id, action_type, args, idempotency_key) -> dict` — the deterministic dispatcher (whitelist check → validate → idempotency check → commit → audit). The ONLY write path.
- **Routing + node** in `nodes.py`: `RouteDecision.route` gains the literal `"action"` (the router only *classifies*; it does not extract args); `ROUTE_SYSTEM` updated so add/record/log-an-expense intent routes to `action` while pure questions stay read-only. The new `propose_action` node does its own structured-output call to produce the typed `proposed_action` and writes it to `AgentState` (new `proposed_action` field); `route_decider` maps `"action"` → `propose_action`.
- **`AgentActionLog`** model (`backend/app/modules/agent/models.py`, new) + alembic migration: `id, user_id (FK), action_type, args (JSONB), status ("committed"|"failed"), created_entity_type, created_entity_id, idempotency_key, error, created_at`. Unique constraint on `(user_id, idempotency_key)`.
- **`agent/router.py`** — `POST /agent/actions/confirm` (request/response Pydantic models) calling `commit_action`.
- **`graph.py`** — register `propose_action`; `classify` conditional edges gain `"action": "propose_action"`; `propose_action → END`; `format_result` carries `proposed_action`; `NODE_LABELS["propose_action"] = "Preparing an action…"`.
- **Frontend** `components/agent/ask-your-finances.tsx` (+ `hooks/useAgentStream.ts` type) — when `result.proposed_action` is set, render an inline **confirm card** (fields + Confirm/Cancel); Confirm → `POST /agent/actions/confirm` with a client-generated `idempotency_key`; show "✓ Added" / error; Cancel dismisses.

## Data flow

`user NL → /stream → classify(route=action) → propose_action (LLM extract, no write) → done{proposed_action} → UI confirm card → user clicks Confirm → /agent/actions/confirm {action_type,args,key} → commit_action (validate+create_expense+audit) → {committed, created} → UI "✓ Added"`.

## Safety & threat model

- **Sole writer:** only `commit_action` writes; it ignores any `user_id` in the payload and uses the authenticated one. No write path through the read tools or the synthesizer.
- **Whitelist + schema:** unknown `action_type` or invalid args never write. v1 cannot touch accounts/savings/Monobank.
- **Confirmation:** a write needs (1) the user's NL intent → a proposal, and (2) an explicit click on a card showing the exact fields — so a prompt-injection in retrieved data cannot cause a write, and a wrong amount/category is caught by the human.
- **Idempotency:** `(user_id, idempotency_key)` unique → retried stream / double-click commits once.
- **Audit:** every attempt logged (committed or failed) for trust/debugging and future undo.

## Error handling

- Propose: missing/ambiguous args → clarifying question, no `proposed_action`.
- Confirm: whitelist miss → 400; args invalid → 422; duplicate key → 200 with the prior result; commit exception → audit row `status="failed"` + 500 with a safe message.

## Testing & evals

- **Key-free unit** (`backend/tests/test_actions.py`): `commit_action` create_expense happy path (row created, `AgentActionLog` written, correct summary returned); unknown action_type rejected (no write); invalid args rejected (no write); idempotency (same key twice → one expense); tenant scoping (uses passed `user_id`, ignores any in args).
- **Agent evals** (both surfaces): `"add a $40 groceries expense"` → `route == "action"`, `proposed_action.action_type == "create_expense"`, args amount 40 / category groceries, `refused == false`, and **propose performs no write** (assert expense count unchanged after a propose-only call).
- **Safety evals:** a propose turn never writes; a poisoned-document question never yields a `proposed_action`.
- Confirm endpoint exercised through `commit_action` (deterministic, no API key).

## Out of scope (v1)

Updates/deletes; budgets/goals actions; multi-action batch; undo UI; HMAC-signed proposals; non-USD. These are later Level-D slices that extend `ACTION_REGISTRY` once the spine is proven.

## Verification

End-to-end: a propose turn returns a correct `proposed_action` with no write; the confirm endpoint creates the expense, writes the audit row, and is idempotent; the inline card commits on confirm and shows success; unit + agent + safety evals green; the read-only suite unaffected.
