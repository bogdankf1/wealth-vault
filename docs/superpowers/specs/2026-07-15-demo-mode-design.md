# Demo Mode — "Try the demo" per-visitor sandbox

**Date:** 2026-07-15
**Status:** Approved (design) — pending implementation plan

## 1. Goal

Let anyone try Wealth Vault with a rich, realistic, pre-populated account **without signing in**, by
opening a shareable link or clicking a button on the login screen. Each visitor gets their **own
isolated throwaway account** (a private clone of a golden template) so they can browse *and* freely
add / edit / delete / use the AI agent's write actions without affecting other visitors or the owner's
real data. Demo accounts self-destruct after a TTL.

Primary use case: send `yourapp.com/demo` to people so they can evaluate the product hands-on.

## 2. Non-goals (v1)

- **No read-only mode.** Demo users are full `USER`-role accounts, isolated by the existing per-user
  query scoping. They can write freely because their data is disposable.
- **No pre-baked user pool.** Clone happens on demand (~1s). Revisit only if latency becomes a problem.
- **No conversion CTA in the banner.** v1 banner is a plain notice + "Exit demo". A "Sign up" CTA can
  be added later.
- **Do not remove** the existing `demo@wealthvault.app` / `make_demo_token.py` / `/agent-demo` /
  `NEXT_PUBLIC_DEV_AGENT_TOKEN` machinery — it stays for the eval harness. Demo Mode is additive.
- **No new billing behavior.** Payment/checkout actions must be inert for demo users (see §8).

## 3. High-level flow

```
Visitor
  │  opens yourapp.com/demo   (or clicks "Explore the live demo" on /login)
  ▼
Frontend: POST /api/v1/auth/demo        ── public, rate-limited
  ▼
Backend:
  1. create throwaway user (is_demo=true, demo_expires_at=now+24h, tier=wealth)
  2. clone golden template data → new user (FK-remapped)
  3. mint JWT (sub = new user id), 24h expiry
  4. return { access_token, user }
  ▼
Frontend: signIn('credentials', { accessToken, user })   → NextAuth session
  ▼
redirect → /dashboard   (fully populated, private to this visitor)
  ▼
persistent "Demo mode" banner above the navbar, with [Exit demo]
```

## 4. The golden template

A **dedicated, hidden template user** — `demo-template@wealthvault.app` — that is:

- Populated by a **committed, deterministic seed script** (`app/scripts/seed_demo_template.py`), built
  from the dataset already crafted for `bohdankf1@gmail.com` (20 savings accounts, 25 portfolio assets,
  55 expenses, 20 subscriptions, 3 income sources + 10 income transactions, 10 account transactions,
  5 goals + 4 links, 4 debts + 5 payments, 4 taxes + 5 payments, 6 budgets).
- **Never logged into and never handed out** — the `/auth/demo` endpoint only ever *reads* from it.
- Marked so cleanup never deletes it (it is not `is_demo`; it is a fixed, well-known user id).

Rationale over reusing `bohdankf1`: version-controlled + reproducible, the clone always reads a
never-mutated source, and it avoids a confusing near-twin of the owner's real `bogdankf1` account.

**Migration note:** convert the ad-hoc SQL used to seed `bohdankf1` into the committed
`seed_demo_template.py`, pointed at the fixed template user id. Run once per environment.

## 5. Backend

### 5.1 Schema migration (Alembic)

Add two columns to `users`:

| column | type | default | purpose |
|---|---|---|---|
| `is_demo` | boolean | `false` | flags cloned demo accounts (cron cleanup + banner) |
| `demo_expires_at` | timestamptz | `null` | when this demo account should be purged |

Backfill: existing rows `is_demo=false`. No index strictly required at demo scale; add a partial index
`WHERE is_demo` if cleanup scans get slow.

### 5.2 `POST /api/v1/auth/demo`

New public route in `app/api/v1/auth.py`.

1. **Rate limit** (slowapi, per IP) — e.g. `@limiter.limit("5/hour")`.
2. **Capacity cap** — count live demo users (`is_demo AND demo_expires_at > now()`); if `>= MAX_LIVE_DEMOS`
   (e.g. 200), return `503` with a friendly "demo at capacity, try again shortly".
3. Create user: `email=f"demo+{uuid4().hex}@wealthvault.app"`, `name="Demo User"`, `role=USER`,
   `tier_id=<wealth tier>`, `is_demo=True`, `demo_expires_at=now()+24h`, `google_id=None`.
   (Note: `users.email` and `users.google_id` have **no uniqueness constraint** in this DB, so no
   collision handling needed — but a unique email is used anyway for traceability.)
4. Call the **clone service** (§5.3) to copy template data into the new user.
5. Mint JWT via `create_access_token({"sub": str(new_user.id), "email": ..., "role": "USER",
   "tier": "wealth"}, expires_delta=timedelta(hours=24))`.
6. Return `TokenResponse { access_token, user }` (same shape as `/auth/google`).

`get_current_user` already accepts this token unchanged (only `sub` matters; it re-loads the user).

### 5.3 Clone service — `app/modules/demo/clone.py`

Copies all per-user financial rows from `template_user_id` → `new_user_id`, generating a fresh UUID for
every row and **remapping foreign keys** to the newly-created rows. Runs inside one transaction.

**Insert order + FK remaps** (each parent builds an `old_id → new_id` map used by its children):

| # | table | FK columns to remap |
|---|---|---|
| 1 | `savings_accounts` | — (only `user_id`) |
| 2 | `income_sources` | `target_account_id` → savings map |
| 3 | `goals` | — |
| 4 | `portfolio_assets` | `payment_account_id`, `dividend_account_id` → savings map |
| 5 | `debts` | `deposit_account_id` → savings map |
| 6 | `taxes` | `payment_account_id` → savings map, `income_source_id` → income_sources map |
| 7 | `subscriptions` | `payment_account_id` → savings map |
| 8 | `account_transactions` | `account_id` → savings map, `source_id` → remap-if-present-else-null |
| 9 | `expenses` | `payment_account_id` → savings map, `account_transaction_id` → acct-txn map (nullable) |
| 10 | `income_transactions` | `source_id` → income map, `deposited_to_account_id` → savings map, `account_transaction_id` → acct-txn map |
| 11 | `goal_account_links` | `goal_id` → goals map, `account_id` → savings map |
| 12 | `debt_payments` | `debt_id` → debts map, `account_transaction_id` → acct-txn map |
| 13 | `tax_payments` | `tax_id` → taxes map, `account_transaction_id` → acct-txn map |
| 14 | `budgets` | — |
| 15 | `portfolio_transactions` | `asset_id` → portfolio map, `account_transaction_id`, `income_transaction_id` (nullable) |

Notes:
- Always set the new row's `user_id = new_user_id`; regenerate `created_at`/`updated_at = now()`.
- Nullable cross-references (e.g. `expenses.account_transaction_id`, `account_transactions.source_id`)
  are remapped when the referenced id is in a known map, else left `NULL`. In the current template these
  are already `NULL`, so no cycle exists in practice.
- **Skip global/reference tables** (`currencies`, `exchange_rates`, `tiers`, `features`) — shared, not
  per-user-owned.
- Optional per-user tables not in the current template (`user_preferences`, `dashboard_layouts`,
  `net_worth_snapshots`, `cash_flow_snapshots`, `ai_insights`) are copied **if present**; the service
  should be table-driven so adding a table to the template automatically includes it.

The service is designed as one bounded unit: input `(template_user_id, new_user_id, session)`, output
none (side effect: rows inserted). Independently testable (§9).

### 5.4 Cleanup cron — `app/scripts/purge_expired_demos.py`

Runs daily (existing scheduler / cron). For each user where `is_demo AND demo_expires_at < now()`:

1. Delete rows from the three **non-cascading** tables first: `income_transactions`, `income_sources`,
   `budgets` (their `user_id` FK has no `ON DELETE CASCADE`).
2. `DELETE FROM users WHERE id = <demo user>` — the remaining 30 child tables cascade automatically.

(Verified: of 36 FKs referencing `users(id)`, only `income_sources`, `income_transactions`, `budgets`,
`backups`, `support_topics`, `support_messages` lack cascade; the last three are never populated for
demo users. `currencies`/`exchange_rates` use `SET NULL` and are global.)

### 5.5 Abuse / safety

- Per-IP rate limit on `/auth/demo` (slowapi is already wired globally; add a stricter per-route limit).
- `MAX_LIVE_DEMOS` capacity cap.
- TTL keeps the `users` table bounded regardless.
- Demo users are `USER` role → no admin surface; existing per-user query scoping isolates their data.

## 6. Frontend

### 6.1 NextAuth Credentials provider

Add a second provider ("demo") alongside Google in `auth.config.ts`:

- `authorize(credentials)` receives the already-minted `access_token` + user fields (from `/auth/demo`),
  validates presence, and returns a user object carrying `accessToken`, `id`, `role`, `tier`,
  `isDemo=true`.
- **`jwt` callback**: when the sign-in came from the demo provider, store `token.accessToken`/user
  directly (do **not** re-POST to `/auth/google`, which is Google-only today). Add `token.isDemo`.
- **`session` callback**: expose `session.user.isDemo`. Extend `types/next-auth.d.ts`.

Existing `apiSlice.prepareHeaders` already reads `session.accessToken` → the whole dashboard "just works".

### 6.2 `/demo` route — `app/demo/page.tsx`

Public (outside `/dashboard`, so middleware doesn't gate it). On mount:
1. Show "Setting up your demo…" spinner.
2. `POST /api/v1/auth/demo` → `{ access_token, user }`.
3. `await signIn('credentials', { accessToken, ...user, redirect: false })`.
4. `router.replace('/dashboard')`.
On error: show a friendly retry message (covers the capacity `503`).

### 6.3 Login button — `app/login/page.tsx`

Add an **"Explore the live demo"** button below the Google button (with an "or" divider). It runs the
exact same provision-then-`signIn` flow as `/demo` (share a `startDemo()` helper).

### 6.4 Demo banner — `components/demo/demo-banner.tsx`

Slim strip rendered **above the navbar** in the dashboard layout, gated on `session.user.isDemo`:

```
🧪  Demo mode — your changes are private and reset in 24h            [ Exit demo ]
```

"Exit demo" → `signOut({ callbackUrl: '/login' })`. Keep it visually unobtrusive but always visible.

### 6.5 Billing guardrails in demo

Hide or disable upgrade/checkout entry points when `session.user.isDemo` (reuse the existing
`feature-gate` / conditional rendering) so demo users can't reach real payment providers.

## 7. Data flow summary

`/demo` or login button → `POST /auth/demo` (create user + clone + mint) → `signIn('credentials')`
(token into NextAuth session) → `/dashboard` (RTK Query sends `Bearer <demo jwt>`; backend scopes all
queries to the demo user id) → daily cron purges expired demo users.

## 8. Security considerations

- **Isolation:** enforced by existing per-endpoint `current_user.id` scoping; demo users can only see/
  touch their own clone.
- **Role:** `USER` only — no admin routes reachable.
- **Payments:** must be inert for demo users (§6.5) — no real Stripe/PayPal/Paddle calls.
- **Resource abuse:** rate limit + capacity cap + TTL bound the blast radius of the public endpoint.
- **Token exposure:** the demo JWT is short-lived (24h, matches TTL) and scoped to a disposable user;
  unlike `NEXT_PUBLIC_DEV_AGENT_TOKEN`, it is minted per visitor and never embedded in client env.

## 9. Testing

- **Clone service (unit):** clone template → assert per-table row counts equal template's; assert every
  FK on cloned rows resolves to a cloned row of the *new* user (no dangling refs, no reference back to
  the template's ids/user_id).
- **`/auth/demo` (integration):** returns a valid token; `get_current_user` resolves it; user is
  `is_demo` with populated data; respects rate limit and capacity cap.
- **Cleanup (integration):** demo user with past `demo_expires_at` is fully removed (user + all child
  rows, including the three non-cascading tables); non-expired and non-demo users untouched.
- **Frontend:** `/demo` provisions and lands on `/dashboard`; banner shows only when `isDemo`; "Exit
  demo" clears the session.

## 10. Rough effort

~1 day. The clone service is ~80% of the work; the endpoint, migration, cron, NextAuth provider,
`/demo` page, login button, and banner are each small.

## 11. Open items / future

- Optional "Sign up free" CTA in the banner (conversion).
- Optional pre-baked user pool if on-demand clone latency ever matters.
- Optional: seed `net_worth_snapshots` history into the template so trend charts populate on day one.
