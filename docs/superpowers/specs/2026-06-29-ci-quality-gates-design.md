# Quality/Safety CI Gates Design (groundedness + cost/latency + dep/secret scanning)

**Date:** 2026-06-29
**Status:** Approved (forks chosen). Roadmap items B2 (groundedness), B3 (cost/latency budgets), A4 (dependency/secret scanning) from `docs/roadmap/2026-06-28-ci-and-ai-checks.md`.

## Goal
Add three automated quality/safety gates that protect the agent without flaking: a **groundedness regression** gate, **cost/latency** capture + a token budget, and **dependency/secret scanning** — extending the existing in-process eval harness and `checks.yml`.

## Approved decisions (from investigation)
- **Token capture is feasible** via a `langchain_core.callbacks.BaseCallbackHandler` reading `on_llm_end`'s `response.llm_output["token_usage"]` — verified it captures across both LLM calls including the structured-output router.
- **Dependency audit is report-only** (pip-audit shows 5 pre-existing `starlette` CVEs); **secret scan (gitleaks) blocks** (repo is clean — `.env` is gitignored, only `.env.example` tracked).
- **Latency is report-only** (CI-network-variable); the hard token gate is a **per-case average** ceiling (auto-scales with case count).

## Design

### B2 — Groundedness regression (`backend/evals/run_eval_assertions.py`)
Mirror `validate_node` independently, so an ungrounded `$`-figure is caught even if the validate node is ever weakened/bypassed. Reuse the validator helpers (`_extract_nums`, `_derivable`, `_numbers_in`, `_question_numbers`, `GROUNDING_CONSTANTS`):
```
grounded(question, r):
  results = r["computed"] or []            # format_result exposes computed as the results list
  if not results: return True              # nothing numeric to ground against -> skip
  base = ∪ _extract_nums(results) | _question_numbers(question) | GROUNDING_CONSTANTS
  return all(_derivable(n, base) for n in _numbers_in(r["answer"]))
```
Run it on every case that produced tool results; count `grounded: X/Y`; **hard-fail** if any case is ungrounded. Surfaced as its own line.

### B3 — Cost/latency budgets (`backend/evals/run_eval_assertions.py` + `graph.py` + `ci_summary.py`)
- `graph.py`: add `callbacks: list | None = None` to `run_agent`, threaded into `get_graph().ainvoke(state, config={"callbacks": callbacks})`. Backward-compatible (defaults to no callbacks → no config).
- `run_eval_assertions.py`: a `UsageHandler(BaseCallbackHandler)` accumulating prompt/completion tokens; per case, time it with `perf_counter` and pass a handler. Accumulate totals.
- Write to `evals/inproc-summary.json`: `tokens: {prompt, completion, total}`, `avg_tokens_per_case`, `wall_ms_total`, `wall_ms_max`.
- **Hard-fail** if `avg_tokens_per_case > TOKEN_BUDGET_PER_CASE` (a generous constant ≈ 3× the current ~1.6k, e.g. **5000**) — catches prompt bloat / model misconfig. **Latency: report-only** (no fail).
- `ci_summary.py`: add a "Cost / latency" row (avg tokens/case + total wall time) and a "Groundedness" row to the sticky PR comment, read best-effort from `inproc-summary.json`.

### A4 — Dependency/secret scanning (`.github/workflows/checks.yml`, new `security` job)
- **gitleaks (blocking):** install the binary (curl the release tarball) and run `gitleaks dir . --no-banner --redact`. Scans the checked-out tree (gitignored `.env` is absent in CI → clean). If `.env.example` placeholders trip it, add a minimal `.gitleaks.toml` allowlist.
- **pip-audit (report-only):** `pip install pip-audit && pip-audit -r backend/requirements.txt` with `continue-on-error: true`.
- **npm audit (report-only):** `npm audit --audit-level=high` in `frontend/` with `continue-on-error: true`.

## Out of scope
- Determinism check (B5), seed-drift guard (B6), runtime tool-coverage (B4-runtime) — deferred.
- Fixing the pre-existing `starlette` CVEs (separate dependency-upgrade task; the audit will surface them report-only).
- A latency hard-gate / trend artifact storage across runs.

## Risks / decisions
- **Token budget staleness:** per-case average (not absolute total) auto-scales as eval cases grow.
- **Groundedness false-positives:** reusing the exact validator logic (same `_derivable`) means the gate matches runtime behavior — no new false-fails vs what the agent already enforces.
- **gitleaks on `.env.example`:** placeholders shouldn't match; allowlist if needed (handled at implementation).
- **Token capture for the streamed synth:** the eval uses the non-streaming `run_agent` (synth via `ainvoke`), so `on_llm_end` fires with usage — verified.
