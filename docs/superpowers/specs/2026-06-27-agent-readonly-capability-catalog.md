# Spec — Chatbot Read-Only Capability Catalog

**Date:** 2026-06-27
**Status:** Approved (catalog); implementation deferred (separate plan, later session)
**Builds on:**
- Read-only agent shipped in PR #3 — LangGraph `route → compute/retrieve/hybrid/refuse → synthesize → validate`, typed user-scoped tools, pgvector RAG, grounding + what-if arithmetic, SSE streaming.
- Scenario expansion: `docs/superpowers/specs/2026-06-24-agent-scenario-expansion-design.md`.
- **Not** this doc: actions/mutations (Level D) live in `docs/agent-actions-next-session.md`.

## Goal

Widen the range of questions the chatbot can answer, staying strictly **read-only**: **read, calculate, analyze, and project/forecast** across every module. This catalog defines the target capability surface; tools/routing/seed/evals come in a later implementation plan.

## Inclusion rule

In scope: read / calculate / analyze / project.
**Out of scope:**
- Mutations — create / update / edit / delete. These are Level D (`agent-actions-next-session.md`).
- Advice / recommendations — what to buy/sell/invest, tax strategy. These stay on the **refuse** list. (Data-grounded *factual* nudges — e.g. "cancelling Netflix saves $143.88/yr" — are allowed, per guidance line C.)

Tags used below: ✅ already answerable · 🆕 new · capability **[Read] / [Calc] / [Analyze] / [Project]**.

## Architecture fit (unchanged thesis)

New capabilities extend the existing explicit graph with **typed, deterministic, user-scoped tools** that return exact values + `cited_ids`. The LLM never computes the numbers; the validator grounds every figure. Projections are computed by deterministic tools (or grounded arithmetic), never free-form LLM guessing.

---

## A. Per-module scenarios

### 1. Expenses
- ✅ [Read/Calc] Total spend; by category; by date range — "how much on groceries in May?"
- ✅ [Analyze] Largest expenses / rankings — "my biggest purchase last month?"
- 🆕 [Analyze] Category distribution / share — "what % of my spending is dining?"
- 🆕 [Analyze] Trend over time (monthly series) — "is my spending trending up?"
- 🆕 [Analyze] Recurring vs one-off split; top merchants; average daily/weekly burn
- 🆕 [Analyze] Anomalies / outliers — "any unusually large charges this month?"

### 2. Income
- ✅ [Read/Calc] Total income over a range
- 🆕 [Analyze] By-source breakdown — "how much from salary vs freelance?"
- 🆕 [Analyze] Income trend / stability month-over-month
- 🆕 [Calc] After-tax / net income (cross with taxes)

### 3. Subscriptions
- ✅ [Read/Calc] List + combined monthly + yearly total
- 🆕 [Analyze] By category; most expensive; % of income; renewals due soon
- 🆕 [Analyze] Potential savings as a factual nudge — "cancelling X saves $Y/yr" (not a recommendation)

### 4. Savings ⚠️ *no agent tool today — highest-value gap*
- 🆕 [Read] Accounts & balances; total saved; interest earned to date
- 🆕 [Analyze] Contribution rate; deposit / withdrawal history
- 🆕 [Project] Projected balance at current contributions + stored APY

### 5. Portfolio
- ✅ [Read/Calc] Value, invested, total return, holdings; "how much in stocks?"
- 🆕 [Analyze] Allocation %; concentration risk; best/worst performer; unrealized gain; dividend income

### 6. Debts (owed to the user)
- ✅ [Read] Outstanding; overdue
- 🆕 [Analyze] Aging; who owes most; collection rate

### 7. Installments (loans the user owes)
- ✅ [Read/Calc] Remaining balance; monthly obligation
- 🆕 [Project] Payoff date; remaining interest; months left

### 8. Taxes
- ✅ [Read] Configured taxes & rates
- 🆕 [Calc] Effective tax rate; estimated tax for a period; next tax due

### 9. Budgets
- ✅ [Read/Analyze] Budget vs actual; burn %; over/under
- 🆕 [Analyze] Overall utilization; categories with no budget
- 🆕 [Project] Month-end projection — "at this pace I'll exceed Food by $X"

### 10. Goals
- ✅ [Read/Analyze] Target, current, %, monthly contribution
- 🆕 [Project] ETA at current pace; required monthly to hit by a date; shortfall; impact of an extra contribution

### 11. Accounts / Net worth
- ✅ [Read] Net worth (sum of balances)
- 🆕 [Analyze] Breakdown by account; assets vs liabilities; liquidity
- 🆕 [Project] Net-worth trajectory at current net cash flow

### 12. Cash flow *(cross-module lens, new)*
- 🆕 [Calc] Monthly net cash flow; burn rate
- 🆕 [Project] Cash runway (balance ÷ burn); projected month-end / year-end balance

### 13. Currency / FX *(currencies now seeded)*
- 🆕 [Calc] Convert any figure; "net worth in EUR"; multi-currency holdings normalized

## B. Cross-module / whole-picture
- ✅ [Analyze] Savings rate; debt-to-income; affordability ("can I afford $1,200?")
- 🆕 [Analyze] Full financial snapshot / health summary (composite, factual)
- 🆕 [Analyze] % of income to each bucket (housing / debt / subscriptions / savings)
- 🆕 [Project] Deterministic what-if redirect — "if I cancel Netflix and add it to my Hawaii goal, new ETA?"

## C. Projections & forecasts (new capability — disclaimer on every answer)

Approved to span all three tiers, read-only and never a recommendation:

- **Tier 1 — deterministic extrapolation:** goal ETA, annualized run-rates, cash runway, debt/installment payoff date, savings growth at stored APY, budget month-end, net-worth trajectory.
- **Tier 2 — statistical forecast:** next-month / next-quarter spend from trailing average / trend; projected annual spend from YTD.
- **Tier 3 — market-assumption (heaviest disclaimer):** portfolio growth at an assumed return rate; "invest $X/mo at Y% for Z years" — explicitly hypothetical, assumptions stated.

**Disclaimer policy:** one consistent line appended to every projection —
> *Projection based on your current data and stated assumptions — not financial advice; actual results will vary.*

Tier 3 additionally: state the assumed rate/horizon and label the result "hypothetical."

## D. Cross-cutting (mostly shipped — keep)
- ✅ Capability route ("what can you do"); time-awareness (data coverage); grounded what-if arithmetic; citations.

## E. Explicitly out of scope
- ❌ Mutations (create/update/edit/delete) — Level D, `agent-actions-next-session.md`.
- ❌ Advice / recommendations (buy/sell/invest, tax strategy) — stays refused; factual nudges allowed.

---

## Implementation hints (for the later plan — not a plan)

Likely new typed tools, by gap (names indicative):
- **Savings:** `savings_summary()` — accounts, balances, total saved, interest earned, contribution rate; `savings_projection(months?, apy?)`.
- **Expenses analysis:** `spending_breakdown(start?, end?)` (by category %), `spending_trend(months?)` (monthly series), `expense_anomalies(start?, end?)`.
- **Income:** `income_breakdown(start?, end?)` (by source), `income_trend(months?)`.
- **Cash flow / projection:** `cash_flow(start?, end?)`, `cash_runway()`, `balance_projection(horizon)`.
- **Portfolio:** `portfolio_allocation()` (extends `portfolio_summary` with %/concentration), `portfolio_projection(return_rate, years)` (Tier 3).
- **Forecast:** `forecast_spending(category?, method="avg|trend")` (Tier 2).
- **FX:** `convert_amount(amount, from, to)`, and a `display_currency` option on aggregate tools.
- **Goals/budgets/installments projections:** extend existing tools (`goals_progress` → required-monthly / ETA; `budget_status` → month-end projection; `installments_summary` → payoff date).

Cross-cutting work the later plan must cover:
- Router catalog + intent routing for the new tools (esp. multi-tool projection questions).
- Synthesize prompt: projection framing + mandatory disclaimer; refusal policy unchanged (advice still refused).
- Validator: deterministic projections return audited numbers; grounded arithmetic already covers derived figures (time-constant whitelist shipped 2026-06-27).
- Seed data + GROUND TRUTH extensions for savings, multi-period history (for trends/forecasts), and FX rates; Promptfoo + pytest cases per new class.

## Verification (for the later implementation)

Per new class: route correctly → exact figure + citations (or correct refusal) → projection answers carry the disclaimer and re-derive deterministically → Promptfoo + pytest green → exercise in the `/dashboard/ask` panel.
