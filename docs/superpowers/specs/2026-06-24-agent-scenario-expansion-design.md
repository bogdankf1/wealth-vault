# Design — Financial Agent: Scenario Expansion

**Date:** 2026-06-24
**Status:** Approved (design); pending implementation plan
**Builds on:** the agent shipped in PR #3 (`feat/ai-financial-agent`) — LangGraph `StateGraph`
(route → compute/retrieve/hybrid/refuse → synthesize → validate), typed user-scoped compute
tools, pgvector RAG, grounding + what-if arithmetic validator, SSE streaming.

## Context & goal

Real testing showed the agent refuses or can't answer many in-scope questions: portfolio
("how much in stocks"), debts, installments, taxes, budgets, goals, capability questions
("what can you do"), and it doesn't explain empty date ranges. The data models for all of these
already exist; the gaps are **compute tools + routing + seed data + evals**. Goal: make the
chatbot broadly useful across every domain, with analytics and light guidance, while keeping the
build's thesis intact — explicit/inspectable graph, typed tools, exact (audited) numbers.

## Locked decisions

- **Mandate:** A + B + C now — broad factual Q&A, analytics, and observations + gentle nudges.
  **D (actions/mutations)** is a later phase; leave a clean seam, build nothing.
- **Guidance line (C):** data-grounded observations + mild factual nudges ("Dining is 2× last
  month", "you're at 90% of your Food budget", "cancelling Netflix saves $11.99/mo"). **Never**
  market / product / tax advice → those stay on the refuse list.
- **Architecture:** expand the explicit graph — typed per-domain tools + **deterministic analytics
  tools** (analytics return audited numbers, not LLM math). No ReAct loop, no text-to-SQL.
- **Currency:** demo stays all-USD (multi-currency analytics is future).
- **Determinism:** all new tools are parameterized + user-scoped + return `cited_ids`; ground
  truth comes from a deterministic seed.

## Scenario catalog (defines "done")

Each class must answer with exact figures + citations (or refuse correctly):

| Class | Example questions |
|---|---|
| Portfolio | "how much do I have in stocks?", "what's my portfolio worth / total return?", "which holdings do I own?" |
| Debts | "do I have debts?", "how much is owed to me / outstanding?", "anything overdue?" |
| Installments | "what loans do I have?", "remaining balance on my car loan?", "monthly loan payments?" |
| Taxes | "what taxes am I set up for?", "what's my income tax rate?" |
| Budgets | "am I over my Food budget?", "how much of my budgets have I used?" |
| Goals | "how's my emergency fund?", "progress on my goals?" |
| Analytics (B) | "am I spending more on dining than last month?", "what's my savings rate?", "debt-to-income?", "can I afford a $1,200 purchase?" |
| Guidance (C) | grounded nudges appended to factual answers (per the C line) |
| Meta | "what can you do?" → capability summary (NOT refused) |
| Time-aware | range with no data → "no expenses then; your data spans <min>–<max>" |
| What-if | already shipped (`$320.50 − $190 = $130.50`) |
| Refuse | "should I buy NVDA?", "what's the weather?", untracked data |

## New typed tools (`app/modules/agent/tools.py`)

All async, `user_id` injected server-side, parameterized, return exact values + `cited_ids`.

**Per-domain:**
- `portfolio_summary(asset_type?)` → `{total_value, total_invested, total_return, return_pct, holdings:[{name,symbol,asset_type,value,return}], cited_ids}`. "in stocks" → `asset_type="stock"`.
- `debts_summary()` → `{total_outstanding (Σ amount−amount_paid, active & unpaid), count, items:[{debtor,amount,paid,outstanding,due_date}], overdue:[…], cited_ids}`.
- `installments_summary()` → `{active_count, total_remaining (Σ remaining_balance), monthly_obligation (Σ amount_per_payment, monthly), items:[{name,remaining,amount_per_payment,next_payment_date}], cited_ids}`.
- `taxes_summary()` → `{items:[{name,tax_type,fixed_amount|percentage,frequency,next_payment_date}], cited_ids}`.
- `budget_status(category?, period?)` → `{budgets:[{name,category,amount,spent,remaining,burn_pct,over}], cited_ids}` — joins `budgets` with summed `expenses` for the category/period.
- `goals_progress(name?)` → `{goals:[{name,target,current,pct,monthly_contribution,eta?}], cited_ids}`.

**Analytics (deterministic):**
- `compare_spending(category?, start_a, end_a, start_b, end_b)` → `{a:{label,total}, b:{label,total}, delta, pct_change, cited_ids}`.
- `financial_ratios(start?, end?)` → `{income, expenses, savings, savings_rate, debt_to_income, cited_ids}`.
- `affordability(amount, period?)` → `{disposable_monthly, can_afford, months_to_afford, basis, cited_ids}` (income − recurring outflows over the period).

Existing tools (`sum_expenses`, `total_income`, `net_worth`, `list_subscriptions`, `find_expenses`) are unchanged.

## Routing & graph (`app/modules/agent/nodes.py`, `graph.py`)

- **Router catalog** updated with all tools + arg shapes; routes analytic intents to multiple
  tools in one pass (e.g. "this month vs last" → `compare_spending`; "can I afford" → `affordability`/`financial_ratios`).
- **Capability route:** a new branch for meta questions → a maintained capabilities summary node
  (lists the domains it can answer), instead of refusing.
- **Time-awareness:** a small helper exposing the user's data date-range (min/max across expenses
  & income); when a compute returns empty for a date filter, synthesize states the coverage range
  rather than a bare "no data".
- **Guidance (C):** synthesize prompt allows grounded observations/nudges; refusal policy narrowed
  to market/product/tax advice + off-topic + untracked data.
- **Validator unchanged:** grounding + arithmetic re-derivation still applies (covers analytic
  deltas/ratios not produced by a deterministic tool).
- **D-seam (future, not built):** an `action` route + a confirmation-gated mutation tool node
  attaches at the router; documented, not implemented.

## Seed data (extend `app/scripts/seed_demo_data.py` + `seed_account.py`)

Add deterministic, all-USD demo data for the demo user (and `seed_account` for a real user):
- **Portfolio:** AAPL (10 @ 150 → 220), VOO (5 @ 400 → 500), BTC (0.1 @ 40k → 60k).
- **Debts (owed to user):** 2 entries, one with a partial payment, one overdue.
- **Installments:** a car loan (e.g. 60 payments, N made, monthly payment) → known remaining.
- **Taxes:** a % income tax + a fixed quarterly tax.
- **Budgets:** Groceries (under), Dining (over vs May actual $76.50), Entertainment.
- **Goals:** Emergency Fund (partial), a vacation goal (partial).

Seed prints an extended **GROUND TRUTH** block; those numbers feed the eval cases. Embeddings
backfill already covers any new free-text (descriptions) generically.

## Evals (`backend/evals/` + `backend/tests/`)

Add cases per class (ground truth from the extended seed):
- Per-domain exact: portfolio value, debt outstanding, installment remaining, budget over/under,
  goal %, taxes configured.
- Analytics: a `compare_spending` case, savings rate, an affordability case.
- Meta: "what can you do?" → `refused == false` and mentions multiple domains.
- Time-aware: a no-data range → answer references the coverage span, doesn't fabricate.
- Refuse: a market-advice question → `refused == true`.
- `pytest` unit tests for each new deterministic tool (exact aggregates + tenant scoping).

These extend the existing Promptfoo config, in-process runner, and pytest suite; the CI gate +
sticky PR comment cover them automatically.

## UX (light, `frontend/components/agent/`)

- Refresh suggested-prompt chips to showcase new domains (portfolio / budgets / goals / "can I
  afford…").
- Citations already render generically across `source_table`s.
No structural frontend change.

## Out of scope (this phase)

- **Actions / mutations (D)** — clean seam only.
- **Multi-currency analytics** — demo stays USD.
- **Deep iterative multi-step reasoning** — common multi-tool questions are handled in one router
  pass; a bounded re-query loop is noted as future if needed.

## Verification

End-to-end: extend seed → backfill → `agent_smoke` shows each new class routing correctly →
`run_eval_assertions` + Promptfoo 100% on the expanded set → `pytest` green on new tools →
exercise in the `/dashboard/ask` panel across domains. CI gate + sticky comment confirm in PR.
