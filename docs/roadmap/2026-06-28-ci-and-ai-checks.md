# Roadmap — CI expansion (general + AI-specific)

**Status:** Partially implemented. Captured 2026-06-28. **Done:** A1 frontend gate, A2 backend lint (`checks.yml`); B1 safety/injection suite (`agent-evals`); A3 migration-consistency gate, B4 action eval-coverage check, C reseed script (this slice, 2026-06-29). **Still queued:** A4 dep/secret scanning; B2 groundedness, B3 cost/latency budgets, B5 determinism, B6 seed↔ground-truth drift; full runtime tool-coverage for B4.

**Short answer:** Yes, it makes sense. Today CI is a single agent-focused workflow; the highest-value gaps are (a) basic *general* CI (the app's non-AI code has no gate at all) and (b) a few *AI-specific* gates that extend the existing eval harness, especially around safety and drift.

## Current state (`.github/workflows/agent-evals.yml`)

One workflow, triggered on push/PR (path-filtered to backend/agent + the workflow file):
py3.11 + node22 → install deps → bootstrap schema → seed demo data → **pytest (key-free gate)** → embed backfill → **in-process eval gate** → start API → mint token → **Promptfoo eval gate** → upload results → **sticky PR comment**.

Good foundation. But it only covers the agent/backend. Observations:
- No **frontend** CI (no `tsc`/`eslint`/`next build`) — a broken build or type error ships unnoticed.
- No **backend lint/format** (ruff/black/import sort) and pytest scope is the agent `tests/` dir.
- AI gates exist (eval correctness + refusal) but don't cover **safety/injection**, **cost/latency drift**, or **eval-coverage** of new tools.

## Proposed additions

### A. General CI (parity with a normal app — do first; cheap, no API keys)
1. **Frontend gate** — `tsc --noEmit`, `eslint`, `next build` on PRs touching `frontend/**`. Highest ROI: currently zero coverage.
2. **Backend lint** — `ruff check` + format check; fast, catches dead imports/style.
3. **Migration check** — `alembic upgrade head` then `alembic check` (or autogenerate-diff is empty) on a clean DB, so models and migrations can't drift.
4. **Dependency/secret scanning** — `pip-audit`, `npm audit --audit-level=high`, and a secret scanner (gitleaks). The repo has many real-looking keys in `.env`-style files; worth a guard against committing secrets.

### B. AI-specific CI (extends the existing eval harness)
1. **Safety / prompt-injection suite** *(highest AI value)* — adversarial eval cases: "ignore previous instructions", poisoned RAG documents that try to induce an action or leak another user's data, advice-seeking phrased as data questions. Assert `refused`/no-leak/no-action. Directly defends the project's safety thesis and the future Level-D action work.
2. **Groundedness regression** — over a sample of numeric questions, assert no answer contains a `$`-figure absent from tool results (the runtime validator already enforces this; CI would catch a regression that weakens it). Cheap to assert on the structured `cited_ids`/answer.
3. **Cost & latency budgets** — record per-run total tokens and TTFT (server-measured already exists); fail or warn if p95 TTFT or tokens-per-eval exceed a budget. Catches prompt bloat and model/config regressions. Track as a trend artifact.
4. **Eval-coverage meta-check** — assert every tool in `TOOLS` (and every router branch) has ≥1 eval case, so new tools can't merge without a case. A small script diffing the registry against the eval files.
5. **Determinism check** — run the eval set twice; flag answers that differ (temperature/seed issues) on questions that should be stable.
6. **Seed↔ground-truth drift guard** — assert the seed's printed GROUND TRUTH still matches the eval expectations (we hit a stale-embedding mismatch locally this slice when a re-seed wasn't followed by `embed_backfill`).

### C. Developer-experience guard (cheap, prevents a real footgun)
- A `make reseed` (or script) that chains `seed_demo_data → embed_backfill` so a local re-seed never leaves stale/empty embeddings. CI already orders these correctly; locals don't.

## Prioritization (suggested)

1. **A1 Frontend gate** + **A2 backend lint** — biggest coverage gap, no API cost.
2. **B1 Safety/injection suite** — highest AI-value, aligns with the safety thesis and Level D.
3. **A3 migration check**, **B4 eval-coverage meta-check**, **C reseed script** — cheap correctness/DX wins.
4. **B2 groundedness**, **B3 cost/latency budgets**, **B6 drift guard** — valuable once the above land.
5. **A4 dependency/secret scanning**, **B5 determinism** — nice-to-have.

## Tradeoffs / notes
- **API cost:** B-group steps that hit the LLM cost tokens per run. Mitigate: keep them on PRs (not every push) or nightly, use the cheap model already used (`gpt-4o-mini`), cap with a small curated case set, and reuse the existing in-process runner (no server needed) where possible.
- **Flakiness:** LLM steps can be nondeterministic; keep assertions structural (route/refused/cited_ids/exact substrings) as the current evals already do, and prefer the deterministic in-process gate as the hard blocker, Promptfoo as reporting.
- **Scope creep:** A-group is standard hygiene and worth doing regardless; B-group should grow with the agent (each new slice adds eval cases anyway — B4 just enforces it).
