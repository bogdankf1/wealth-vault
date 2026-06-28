# CI: Frontend Gate + Backend Ruff — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Close the two biggest CI gaps from the roadmap: (1) a **frontend gate** (typecheck + lint + build) — currently the frontend has *no* CI; (2) a **backend `ruff` gate** with a high-signal ruleset, fixing the real defects it surfaces. (Black formatting is intentionally deferred — 155-file churn, cosmetic.)

**Architecture:** One new cheap, **no-API-key** workflow `.github/workflows/checks.yml` with two jobs — `frontend` (Node) and `backend-lint` (ruff). Ruff is configured in `backend/pyproject.toml` (`select = F, E9`; `F401` ignored in `__init__.py` re-exports), scoped to `backend/app/`. The existing `agent-evals.yml` (API-key eval gate) is untouched.

**Tech Stack:** GitHub Actions, Node 22 + Next 15 (turbopack), Python 3.11 + ruff 0.7.3 (already in `backend/requirements.txt`).

**Evidence this is feasible (measured 2026-06-28):**
- Frontend `tsc --noEmit` → 0 errors; `eslint .` → 0 errors / 411 warnings; `next build` → exit 0. Gate is green today (gate on errors; warnings allowed).
- `ruff check --select F backend/app/` → 184 errors: 131 F401 (unused import), 27 F541 (empty f-string), 19 F841 (unused var), 3 F811 (redefinition) — all auto-fixable — plus **4 F821 undefined-name**: `notifications/service.py:318,322` use `Decimal` with no import (**real bug**); `dashboard/service.py:1843,1906` are quoted return annotations (`-> "FinancialProjectionsResponse"`) imported locally inside the function (**false positives**).

**Scope:** the two gates + the F-defect fixes. **Out of scope:** black, AI safety-eval suite, dependency scanning, cost/latency budgets (separate roadmap items); linting `backend/` root one-off scripts and `tests/`/`evals/` (gate targets `app/`).

**Branch:** create `feat/ci-lint-and-frontend-gate` off `main` before CHK-1.

**Env for local checks:** backend ruff via `~/.cache/wv-ai-venv/bin/ruff`; pytest via `PYTHONPATH=. ~/.cache/wv-ai-venv/bin/python -m pytest tests/ -q` from `backend/`. Frontend via `npx --no-install` from `frontend/`.

---

## Task CHK-1: Adopt ruff (config + autofix + fix the 4 F821) — backend green

**Files:**
- Create: `backend/pyproject.toml` (ruff config)
- Modify (autofix): files under `backend/app/` flagged by ruff F-rules
- Modify (manual): `backend/app/modules/notifications/service.py`, `backend/app/modules/dashboard/service.py`

- [ ] **Step 1: Add ruff config** — create `backend/pyproject.toml`:

```toml
[tool.ruff]
target-version = "py311"
line-length = 100

[tool.ruff.lint]
# Start high-signal: F = pyflakes (real defects), E9 = syntax errors. Expand later.
select = ["F", "E9"]

[tool.ruff.lint.per-file-ignores]
# __init__.py re-exports names without using them locally.
"__init__.py" = ["F401"]
```

- [ ] **Step 2: Baseline the finding count** (so the autofix delta is verifiable)

Run from `backend/`:
```bash
~/.cache/wv-ai-venv/bin/ruff check app/ 2>&1 | tail -2
```
Expected: ~150 errors (F-rules minus the `__init__.py` F401 now ignored), most fixable.

- [ ] **Step 3: Auto-fix the safe findings**

Run:
```bash
~/.cache/wv-ai-venv/bin/ruff check app/ --fix
```
Expected: removes unused imports/vars, fixes empty f-strings & redefinitions. Leaves the 4 F821 (not auto-fixable).

- [ ] **Step 4: Fix the real bug — missing `Decimal` import**

In `backend/app/modules/notifications/service.py`, confirm `Decimal` is used (lines ~318/322) but not imported, and add the import with the other stdlib imports near the top:
```python
from decimal import Decimal
```
(If a `from decimal import ...` line already exists, add `Decimal` to it instead.)

- [ ] **Step 5: Fix the 2 false-positive F821 (quoted forward-ref annotations)**

In `backend/app/modules/dashboard/service.py`, the methods return quoted annotations `-> "FinancialProjectionsResponse"` / `-> "GoalProjectionsResponse"` whose classes are imported *inside* the functions. Make the names resolvable to the linter with a `TYPE_CHECKING` block. Near the top imports add:
```python
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from app.modules.dashboard.schemas import (
        FinancialProjectionsResponse,
        GoalProjectionsResponse,
    )
```
(If `TYPE_CHECKING` is already imported, just add the `if TYPE_CHECKING:` import block. Leave the existing in-function imports as-is — they're the runtime path.)

- [ ] **Step 6: Confirm ruff is clean**

Run:
```bash
~/.cache/wv-ai-venv/bin/ruff check app/ 2>&1 | tail -2
```
Expected: `All checks passed!` (0 errors). If any F821 remain, resolve them (real undefined name → import it; genuine false positive → `# noqa: F821` with a comment).

- [ ] **Step 7: Verify the autofix broke nothing** (the import removals are the risk)

Run all three from `backend/`:
```bash
PYTHONPATH=. ~/.cache/wv-ai-venv/bin/python -c "import app.main"          # app still imports
PYTHONPATH=. ~/.cache/wv-ai-venv/bin/python create_all_tables.py          # all models still registered (DB up on :5434)
PYTHONPATH=. ~/.cache/wv-ai-venv/bin/python -m pytest tests/ -q           # 38 tests still pass
```
Expected: import OK; `create_all_tables` completes; **38 passed**. If a test/import fails because a *needed* import was removed (side-effect import), restore it with a trailing `# noqa: F401` and re-run.

- [ ] **Step 8: Commit**

```bash
git add backend/pyproject.toml backend/app
git commit -m "chore(backend): adopt ruff (F+E9), autofix, fix Decimal import + forward-ref annotations"
```

---

## Task CHK-2: Add the `checks.yml` workflow (frontend gate + backend ruff)

**Files:**
- Create: `.github/workflows/checks.yml`

- [ ] **Step 1: Confirm the gated commands pass locally** (so the workflow will be green)

From `frontend/`:
```bash
npx --no-install tsc --noEmit && echo TSC_OK
npx --no-install eslint . && echo ESLINT_OK
```
From `backend/`:
```bash
~/.cache/wv-ai-venv/bin/ruff check app/ && echo RUFF_OK
```
Expected: `TSC_OK`, `ESLINT_OK`, `RUFF_OK`. (`next build` was verified exit 0 separately.)

- [ ] **Step 2: Create `.github/workflows/checks.yml`**

```yaml
name: checks

# Cheap, no-API-key gates that the agent-evals workflow doesn't cover:
# frontend typecheck/lint/build and backend ruff. Runs on every PR + push to main.
on:
  pull_request:
  push:
    branches: [main]

permissions:
  contents: read

jobs:
  frontend:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: frontend
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '22'
          cache: npm
          cache-dependency-path: frontend/package-lock.json
      - name: Install deps
        run: npm ci
      - name: Typecheck
        run: npx tsc --noEmit
      - name: Lint
        run: npx eslint .
      - name: Build
        # Dummy build-time env so Next doesn't fail on missing public/auth vars.
        env:
          NEXT_PUBLIC_API_URL: http://localhost:8000
          NEXTAUTH_URL: http://localhost:3000
          AUTH_SECRET: ci-dummy-secret
          NEXTAUTH_SECRET: ci-dummy-secret
        run: npm run build

  backend-lint:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: backend
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: '3.11'
          cache: pip
      - name: Install ruff
        run: pip install ruff==0.7.3
      - name: Ruff
        run: ruff check app/
```

- [ ] **Step 3: Validate the workflow YAML**

Run:
```bash
python3 -c "import yaml; yaml.safe_load(open('.github/workflows/checks.yml')); print('checks.yml: valid YAML')"
```
Expected: `checks.yml: valid YAML`.

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/checks.yml
git commit -m "ci: add checks workflow (frontend typecheck/lint/build + backend ruff)"
```

- [ ] **Step 5: Note for the PR**

The `frontend` build step uses dummy env; if the first CI run fails on a *different* missing build-time var, add it to the `env:` block (the failure log names it). `eslint` gates on errors only (411 pre-existing warnings are allowed); tightening to `--max-warnings` is a future cleanup.

---

## Self-review (done at write time)

- **Scope coverage:** Roadmap A1 (frontend gate) → CHK-2 `frontend` job; A2 (backend lint) → CHK-1 config + CHK-2 `backend-lint` job. Black (A-group) explicitly deferred. Real defects ruff found are fixed in CHK-1.
- **Placeholders:** none — exact config, commands, and the real file/line fixes are specified.
- **Risk handling:** the F401 autofix risk (removing side-effect/re-export imports) is mitigated by ignoring `F401` in `__init__.py` and by Step 7's import + `create_all_tables` + pytest verification, with an explicit `# noqa` fallback.
- **Consistency:** ruff version (0.7.3) matches `backend/requirements.txt`; node 22 matches the existing `agent-evals.yml`; gate targets `backend/app/` consistently in config-intent and the CI command.
- **No-API-cost:** `checks.yml` needs no secrets, so it runs on all PRs (incl. forks) without the eval workflow's key requirements.
