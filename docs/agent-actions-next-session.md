# Next session — add Actions (Level D) to the chat agent

> **Handoff seed (2026-06-25).** Read this at the start of a fresh session, then **brainstorm
> first** (superpowers:brainstorming) before any building. This is context, not a spec — the
> brainstorm produces the spec.

## Goal
Let the chat agent **take actions** (create / edit the user's data), not just answer — e.g.
"add a $40 groceries expense", "set a $300 monthly Food budget", "bump my Hawaii goal to $6k".

## Where we are (all shipped + merged to `main`)
- **Read-only agent:** LangGraph `route → compute → synthesize → validate` (+ retry cycle);
  typed, user-scoped read tools; pgvector RAG; SSE streaming + TTFT; Promptfoo evals + CI gate.
- **Expansion:** 9 tools across portfolio / debts / installments / taxes / budgets / goals +
  analytics (compare-periods, savings-rate & debt-to-income, affordability); capability route
  ("what can you do"); time-awareness; grounded observations/nudges.
- **Code:** `backend/app/modules/agent/{graph,nodes,tools,state,router}.py`
- **Prior spec + plan:** `docs/superpowers/specs/2026-06-24-agent-scenario-expansion-design.md`,
  `docs/superpowers/plans/2026-06-24-agent-scenario-expansion.md` (Level D is noted there as the
  deferred next phase; the graph has a documented "D-seam" where an action route attaches).

## Decisions already locked (from the prior brainstorm — don't re-litigate)
- Level D (actions) was explicitly **deferred to this next phase**.
- Actions **must be user-confirmed** — no auto-commit.
- Guidance line C (observations + gentle nudges, **never** market/product/tax advice) already shipped.

## The safety thesis (the spine — keep this central)
**The LLM PROPOSES a typed action; deterministic code COMMITS it, only after an explicit user
confirm.** This mirrors the existing thesis ("the LLM never computes the number" → "the LLM never
commits the write"). It's both the safety mechanism and the strongest interview talking point.

## Scope guardrails to settle in the brainstorm
- **Whitelist writable entities** — start with **expenses / budgets / goals** (create + update only).
  **No deletes. No writes to Monobank-linked rows or accounts.**
- **Idempotency keys** — no double-commit on a retried stream or double-confirm.
- **Audit log** of agent-initiated mutations (cheap; high trust/debugging value).

## Pitfalls to keep front of mind
- **New interaction shape:** propose → confirm → commit is **stateful / multi-turn**, vs today's
  one-shot Q&A. Needs a pending-action concept, a confirm/execute endpoint, and UI. This is the
  bulk of the work — bigger than the write tools themselves.
- **Blast radius flips:** a bad write *persists bad data* (vs just a wrong answer). Render the
  proposed change precisely so the user can catch a wrong amount/category/account.
- **Evals get harder:** need transactional setup/teardown or a sandbox user — can't assert on a string.
- **Authz** is stricter for writes; **prompt-injection** matters more (a poisoned doc could try to
  induce an action) — confirmation is the guard.

## Recommended first step
**Thin vertical slice: ONE action ("add an expense") end-to-end** through propose → confirm →
commit. Prove the loop and the safety pattern, then generalize to the rest of the whitelist.

## Open questions for the brainstorm
- Which entities in v1, and how many?
- Confirm UX: inline confirm card in the chat vs a modal? How to render the proposed diff?
- How does confirm flow over SSE — propose mid-stream, then a separate confirm/execute call?
- One action per turn, or batch multiple?
- Undo? Where does the audit log surface in the UI?

## Sequencing note
Effort is comparable to the read-only expansion. Build D on its **own branch**; land the
single-action slice before widening scope.
