# Hidden Features & UI Elements

Items temporarily hidden during the mobile-first simplification (April 2026).
All changes are commented out, not deleted — easy to re-enable.

## Navigation & Pages

- **Pricing page** — hidden from sidebar and mobile nav (all resolutions)
- **Notifications page** — hidden from sidebar (all resolutions)
- **Help Center page** — hidden from sidebar (all resolutions)
- **Data Management section** (Export & Backups) — hidden from sidebar (all resolutions)
- **Admin panel link** — only visible for ADMIN role users (currently no admins)
- **Sidebar on mobile** — replaced with bottom navigation bar
- **Sidebar swipe gesture** — disabled (mobile uses bottom nav)

## Module Tabs (all 10 modules)

- **Analysis tab** — commented out in all module layouts
- **History tab** — commented out (income, expenses, subscriptions, installments)
- **Archive tab** — commented out in all module layouts
- **Import tab** — commented out (income, expenses, accounts, portfolio, subscriptions, installments); Import button in header navigates directly to import page
- **Tab bar** — auto-hides when only 1 tab remains (currently all modules)

## Page Titles & Descriptions

- **Module page titles + subtitles** — hidden on all resolutions (all 10 modules)
- **Dashboard title** ("Dashboard") and subtitle ("Your complete financial overview") — hidden
- **Settings page title** ("Settings") and subtitle ("Manage your account...") — hidden
- **All CardDescription subtitles** in settings tabs — hidden on all resolutions

## Settings Tabs & Elements

- **Subscription tab** — commented out (no pricing tiers active)
- **Help tab** — commented out
- **Page Descriptions toggle** (Appearance > Page Descriptions) — commented out
- **Google sign-in section** (Account settings) — hidden on all resolutions

## Backend / Business Logic

- **Default user tier** — changed from "starter" to "wealth" (all features unlocked)
- **Trial flow** — bypassed; all new users get wealth tier directly

## When to Re-enable

- **Pricing/Subscription/Tiers**: when ready to monetize
- **Notifications**: when push/email notification backend is implemented
- **Help Center**: when support system is ready for users
- **Data Management**: when export/backup features are polished
- **Analysis/History/Archive tabs**: when there's enough data and users to justify the complexity
- **Admin panel**: set user role to ADMIN in database when needed
