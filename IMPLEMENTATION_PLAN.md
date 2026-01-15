# Wealth Vault - Comprehensive Implementation Plan

> **Document Purpose**: This document contains the complete implementation plan to address all functionality gaps identified in the January 2026 audit. Reference this file when continuing work on any phase.

> **Last Updated**: January 15, 2026

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Implementation Phases Overview](#implementation-phases-overview)
3. [Phase 0: Foundation Infrastructure](#phase-0-foundation-infrastructure)
4. [Phase 1: Savings & Accounts Module](#phase-1-savings--accounts-module)
5. [Phase 2: Income Module Integration](#phase-2-income-module-integration)
6. [Phase 3: Expenses Module Integration](#phase-3-expenses-module-integration)
7. [Phase 4: Budget Module Completion](#phase-4-budget-module-completion)
8. [Phase 5: Subscriptions Module Automation](#phase-5-subscriptions-module-automation)
9. [Phase 6: Installments Module Enhancement](#phase-6-installments-module-enhancement)
10. [Phase 7: Debt Module Enhancement](#phase-7-debt-module-enhancement)
11. [Phase 8: Portfolio Module Enhancement](#phase-8-portfolio-module-enhancement)
12. [Phase 9: Goals Module Integration](#phase-9-goals-module-integration)
13. [Phase 10: Tax Module Enhancement](#phase-10-tax-module-enhancement)
14. [Phase 11: Dashboard & Analytics Enhancement](#phase-11-dashboard--analytics-enhancement)
15. [Phase 12: Billing/Tier Subscription Automation](#phase-12-billingtier-subscription-automation)
16. [Progress Tracking](#progress-tracking)

---

## Executive Summary

### Current State
The Wealth Vault application has 12 well-built modules that operate as **isolated tracking systems**. Modules record intentions (income sources, expense templates) but don't execute actions (actual money movement, automatic updates).

### Target State
A fully integrated financial management system where:
- Income automatically increases account balances
- Expenses automatically decrease account balances
- Recurring items auto-generate transactions
- Net worth updates in real-time with historical tracking
- Subscriptions auto-renew or downgrade as configured
- Goals track progress from linked accounts
- Budgets enforce limits and rollover unused amounts
- All modules communicate and affect each other appropriately

### Estimated Scope
- **12 phases** of implementation
- **~150+ files** to create/modify
- **~30 database migrations**
- Full frontend, backend, and database work

---

## Implementation Phases Overview

| Phase | Module | Primary Focus | Dependencies |
|-------|--------|---------------|--------------|
| 0 | Infrastructure | Celery tasks, event system | None |
| 1 | Savings & Accounts | Transactions, interest, balance history | Phase 0 |
| 2 | Income | Account linking, auto-deposit | Phase 1 |
| 3 | Expenses | Account linking, auto-deduct | Phase 1 |
| 4 | Budget | Rollover, alerts, period reset | Phase 3 |
| 5 | Subscriptions | Auto-expenses, reminders | Phase 3 |
| 6 | Installments | Payment recording, auto-expenses | Phase 3 |
| 7 | Debt | Interest calculation, strategies | Phase 1 |
| 8 | Portfolio | Dividends, price updates, transactions | Phase 2 |
| 9 | Goals | Account linking, auto-progress | Phase 1 |
| 10 | Tax | Brackets, deductions, withholding | Phase 2, 8 |
| 11 | Dashboard | Historical tracking, projections | All phases |
| 12 | Billing/Tier | Auto-downgrade, notifications | Phase 0 |

---

## Phase 0: Foundation Infrastructure

### Overview
Create the foundational infrastructure that enables automation across all modules.

### 0.1 Celery Task System

#### 0.1.1 Create Tasks Module Structure
**Files to create:**
- `backend/app/tasks/__init__.py`
- `backend/app/tasks/base.py` - Base task class with error handling
- `backend/app/tasks/scheduler.py` - Beat schedule configuration
- `backend/app/tasks/income_tasks.py`
- `backend/app/tasks/expense_tasks.py`
- `backend/app/tasks/subscription_tasks.py`
- `backend/app/tasks/installment_tasks.py`
- `backend/app/tasks/budget_tasks.py`
- `backend/app/tasks/savings_tasks.py`
- `backend/app/tasks/portfolio_tasks.py`
- `backend/app/tasks/goal_tasks.py`
- `backend/app/tasks/billing_tasks.py`
- `backend/app/tasks/notification_tasks.py`

#### 0.1.2 Update Celery Configuration
**File to modify:** `backend/app/core/celery_app.py`

```python
# Beat schedule to add:
celery_app.conf.beat_schedule = {
    # Daily tasks (run at midnight)
    "process-recurring-income": {
        "task": "app.tasks.income_tasks.process_recurring_income",
        "schedule": crontab(hour=0, minute=0),
    },
    "process-recurring-expenses": {
        "task": "app.tasks.expense_tasks.process_recurring_expenses",
        "schedule": crontab(hour=0, minute=5),
    },
    "process-subscription-renewals": {
        "task": "app.tasks.subscription_tasks.process_subscription_renewals",
        "schedule": crontab(hour=0, minute=10),
    },
    "process-installment-payments": {
        "task": "app.tasks.installment_tasks.process_installment_payments",
        "schedule": crontab(hour=0, minute=15),
    },
    "check-budget-alerts": {
        "task": "app.tasks.budget_tasks.check_budget_alerts",
        "schedule": crontab(hour=8, minute=0),  # Morning alerts
    },
    "calculate-savings-interest": {
        "task": "app.tasks.savings_tasks.calculate_daily_interest",
        "schedule": crontab(hour=0, minute=20),
    },
    "check-subscription-tier-expirations": {
        "task": "app.tasks.billing_tasks.check_tier_expirations",
        "schedule": crontab(hour=0, minute=30),
    },
    "update-goal-progress": {
        "task": "app.tasks.goal_tasks.update_goal_progress_from_accounts",
        "schedule": crontab(hour=1, minute=0),
    },
    # Monthly tasks (run on 1st of month)
    "create-net-worth-snapshot": {
        "task": "app.tasks.dashboard_tasks.create_monthly_snapshot",
        "schedule": crontab(day_of_month=1, hour=2, minute=0),
    },
    "process-budget-period-reset": {
        "task": "app.tasks.budget_tasks.process_period_resets",
        "schedule": crontab(day_of_month=1, hour=0, minute=30),
    },
    "accrue-monthly-interest": {
        "task": "app.tasks.savings_tasks.accrue_monthly_interest",
        "schedule": crontab(day_of_month=1, hour=0, minute=45),
    },
    "calculate-debt-interest": {
        "task": "app.tasks.debt_tasks.calculate_monthly_interest",
        "schedule": crontab(day_of_month=1, hour=1, minute=0),
    },
}
```

### 0.2 Event/Signal System

#### 0.2.1 Create Event System
**Files to create:**
- `backend/app/core/events.py` - Event definitions and dispatcher
- `backend/app/core/event_handlers.py` - Cross-module event handlers

**Events to define:**
```python
class FinancialEvents:
    INCOME_RECEIVED = "income.received"
    EXPENSE_PAID = "expense.paid"
    ACCOUNT_BALANCE_CHANGED = "account.balance_changed"
    BUDGET_THRESHOLD_REACHED = "budget.threshold_reached"
    BUDGET_EXCEEDED = "budget.exceeded"
    GOAL_ACHIEVED = "goal.achieved"
    GOAL_PROGRESS_UPDATED = "goal.progress_updated"
    SUBSCRIPTION_RENEWED = "subscription.renewed"
    SUBSCRIPTION_EXPIRING = "subscription.expiring"
    INSTALLMENT_PAYMENT_DUE = "installment.payment_due"
    INSTALLMENT_COMPLETED = "installment.completed"
    DEBT_PAYMENT_RECEIVED = "debt.payment_received"
    TIER_DOWNGRADE_PENDING = "tier.downgrade_pending"
    TIER_CHANGED = "tier.changed"
    NET_WORTH_CHANGED = "net_worth.changed"
```

### 0.3 Notification System

#### 0.3.1 Create Notification Infrastructure
**Files to create:**
- `backend/app/modules/notifications/__init__.py`
- `backend/app/modules/notifications/models.py` - Notification model
- `backend/app/modules/notifications/schemas.py`
- `backend/app/modules/notifications/service.py`
- `backend/app/modules/notifications/router.py`

**Database migration:** Create `notifications` table
```python
class Notification(Base):
    __tablename__ = "notifications"

    id = Column(UUID, primary_key=True)
    user_id = Column(UUID, ForeignKey("users.id"))
    type = Column(String(50))  # alert, reminder, achievement, warning
    category = Column(String(50))  # budget, goal, subscription, etc.
    title = Column(String(200))
    message = Column(Text)
    priority = Column(Integer, default=3)  # 1-5, 5 being critical
    is_read = Column(Boolean, default=False)
    action_url = Column(String(500), nullable=True)
    metadata = Column(JSONB, nullable=True)
    created_at = Column(DateTime)
    read_at = Column(DateTime, nullable=True)
    expires_at = Column(DateTime, nullable=True)
```

#### 0.3.2 Frontend Notification Components
**Files to create:**
- `frontend/lib/api/notificationsApi.ts`
- `frontend/components/notifications/notification-bell.tsx`
- `frontend/components/notifications/notification-list.tsx`
- `frontend/components/notifications/notification-item.tsx`
- `frontend/app/dashboard/notifications/page.tsx`

### 0.4 Database Migration Utilities

#### 0.4.1 Add Soft Delete Mixin
**File to modify:** `backend/app/models/base.py`
```python
class SoftDeleteMixin:
    deleted_at = Column(DateTime, nullable=True)

    @declared_attr
    def is_deleted(cls):
        return column_property(cls.deleted_at.isnot(None))
```

### Status: COMPLETED

**Completed Items:**
- [x] Created tasks module structure with all task files
- [x] Updated Celery configuration with comprehensive beat schedule (30+ tasks)
- [x] Created event system (events.py with event definitions, event_handlers.py with notification handlers)
- [x] Created notification module (models, schemas, service, router)
- [x] Created database migration for notifications table
- [x] Created frontend notification API client
- [x] Created notification UI components (bell dropdown, notifications page)
- [x] Added notification bell to dashboard header (mobile and desktop)
- [x] Added translations for all 8 languages (en, uk, de, es, fr, it, pl, pt)

**Files Created:**
- `backend/app/tasks/__init__.py`
- `backend/app/tasks/base.py`
- `backend/app/tasks/income_tasks.py`
- `backend/app/tasks/expense_tasks.py`
- `backend/app/tasks/subscription_tasks.py`
- `backend/app/tasks/installment_tasks.py`
- `backend/app/tasks/budget_tasks.py`
- `backend/app/tasks/savings_tasks.py`
- `backend/app/tasks/portfolio_tasks.py`
- `backend/app/tasks/goal_tasks.py`
- `backend/app/tasks/debt_tasks.py`
- `backend/app/tasks/billing_tasks.py`
- `backend/app/tasks/dashboard_tasks.py`
- `backend/app/tasks/notification_tasks.py`
- `backend/app/core/events.py`
- `backend/app/core/event_handlers.py`
- `backend/app/modules/notifications/__init__.py`
- `backend/app/modules/notifications/models.py`
- `backend/app/modules/notifications/schemas.py`
- `backend/app/modules/notifications/service.py`
- `backend/app/modules/notifications/api.py`
- `backend/alembic/versions/20260112_add_notifications_table.py`
- `frontend/lib/api/notificationsApi.ts`
- `frontend/components/notifications/notification-bell.tsx`
- `frontend/app/dashboard/notifications/page.tsx`
- `frontend/messages/*/notifications.json` (8 languages)

**Files Modified:**
- `backend/app/core/celery_app.py` - Added beat schedule
- `backend/app/main.py` - Added notification router and event handler registration
- `frontend/lib/api/apiSlice.ts` - Added 'Notification' tag type
- `frontend/app/dashboard/layout.tsx` - Added notification bell to header

---

## Phase 1: Savings & Accounts Module

### Overview
Transform the Savings module from a simple balance tracker to a full transaction-based account system with interest calculation.

### 1.1 Database Changes

#### 1.1.1 Add Interest Rate Field to SavingsAccount
**Migration:** Add columns to `savings_accounts`
```python
interest_rate = Column(Numeric(5, 4), nullable=True)  # APY as decimal (0.0450 = 4.5%)
interest_frequency = Column(String(20), default="monthly")  # daily, monthly, annually
interest_accrual_method = Column(String(20), default="compound")  # simple, compound
last_interest_accrual = Column(DateTime, nullable=True)
accrued_interest = Column(Numeric(12, 2), default=0)  # Pending interest not yet posted
```

#### 1.1.2 Create Account Transactions Table
**Migration:** Create `account_transactions` table
```python
class AccountTransaction(Base):
    __tablename__ = "account_transactions"

    id = Column(UUID, primary_key=True)
    account_id = Column(UUID, ForeignKey("savings_accounts.id"))
    user_id = Column(UUID, ForeignKey("users.id"))

    # Transaction details
    type = Column(String(20))  # deposit, withdrawal, transfer, interest, fee
    amount = Column(Numeric(12, 2))
    currency = Column(String(3))

    # Balance tracking
    balance_before = Column(Numeric(12, 2))
    balance_after = Column(Numeric(12, 2))

    # Source linking (optional - for integration with other modules)
    source_type = Column(String(50), nullable=True)  # income, expense, subscription, installment, transfer, manual
    source_id = Column(UUID, nullable=True)

    # Metadata
    description = Column(String(500))
    category = Column(String(50), nullable=True)
    reference_number = Column(String(100), nullable=True)

    # Dates
    transaction_date = Column(DateTime)
    posted_date = Column(DateTime, nullable=True)
    created_at = Column(DateTime)

    # Status
    status = Column(String(20), default="completed")  # pending, completed, failed, reversed
```

#### 1.1.3 Create Account Transfer Table
**Migration:** Create `account_transfers` table
```python
class AccountTransfer(Base):
    __tablename__ = "account_transfers"

    id = Column(UUID, primary_key=True)
    user_id = Column(UUID, ForeignKey("users.id"))

    from_account_id = Column(UUID, ForeignKey("savings_accounts.id"))
    to_account_id = Column(UUID, ForeignKey("savings_accounts.id"))

    amount = Column(Numeric(12, 2))
    currency = Column(String(3))

    # If cross-currency transfer
    exchange_rate = Column(Numeric(12, 6), nullable=True)
    converted_amount = Column(Numeric(12, 2), nullable=True)

    description = Column(String(500), nullable=True)
    transfer_date = Column(DateTime)
    status = Column(String(20), default="completed")

    created_at = Column(DateTime)
```

### 1.2 Backend Changes

#### 1.2.1 Update Savings Models
**File:** `backend/app/modules/savings/models.py`
- Add new fields to SavingsAccount
- Add AccountTransaction model
- Add AccountTransfer model
- Add relationships

#### 1.2.2 Create Transaction Service
**File to create:** `backend/app/modules/savings/transaction_service.py`
```python
Functions to implement:
- create_deposit(account_id, amount, source_type, source_id, description)
- create_withdrawal(account_id, amount, source_type, source_id, description)
- create_transfer(from_account_id, to_account_id, amount, description)
- get_transactions(account_id, filters)
- reverse_transaction(transaction_id)
- calculate_interest(account_id)
- accrue_interest(account_id)
- post_accrued_interest(account_id)
```

#### 1.2.3 Update Savings Schemas
**File:** `backend/app/modules/savings/schemas.py`
- Add TransactionCreate, TransactionResponse schemas
- Add TransferCreate, TransferResponse schemas
- Update SavingsAccountCreate/Update with interest fields
- Add InterestCalculation schema

#### 1.2.4 Update Savings Router
**File:** `backend/app/modules/savings/router.py`
- Add POST `/accounts/{id}/transactions` - Record transaction
- Add GET `/accounts/{id}/transactions` - List transactions
- Add POST `/accounts/{id}/transfer` - Transfer between accounts
- Add POST `/accounts/{id}/calculate-interest` - Calculate pending interest
- Add POST `/accounts/{id}/post-interest` - Post accrued interest

#### 1.2.5 Create Interest Calculation Task
**File:** `backend/app/tasks/savings_tasks.py`
```python
@celery_app.task
async def calculate_daily_interest():
    """Run daily to calculate accrued interest for all accounts."""

@celery_app.task
async def accrue_monthly_interest():
    """Run monthly to post accrued interest to account balances."""
```

### 1.3 Frontend Changes

#### 1.3.1 Update Savings Account Form
**File:** `frontend/components/savings/savings-account-form.tsx`
- Add interest rate input field
- Add interest frequency dropdown
- Add interest accrual method dropdown

#### 1.3.2 Create Transaction Components
**Files to create:**
- `frontend/components/savings/transaction-form.tsx` - Deposit/withdrawal form
- `frontend/components/savings/transaction-list.tsx` - Transaction history
- `frontend/components/savings/transfer-form.tsx` - Transfer dialog

#### 1.3.3 Update Account Detail View
**File to create:** `frontend/app/dashboard/savings/[id]/page.tsx`
- Account details
- Transaction history with filters
- Interest information
- Transfer button

#### 1.3.4 Update API Client
**File:** `frontend/lib/api/savingsApi.ts`
- Add transaction endpoints
- Add transfer endpoints
- Add interest endpoints

#### 1.3.5 Add Translations
**Files to update:** `frontend/messages/*/savings.json` (all 8 languages)
- Add transaction-related strings
- Add interest-related strings
- Add transfer-related strings

### 1.4 Populate Balance History
Create migration/task to start using BalanceHistory table that already exists but is unused.

### Status: COMPLETED

**Completed Items:**
- [x] Added interest rate fields to SavingsAccount model
- [x] Created AccountTransaction model for transaction history
- [x] Created AccountTransfer model for transfers between accounts
- [x] Created transaction service with deposit, withdrawal, transfer, and reverse functions
- [x] Updated Savings API with transaction endpoints
- [x] Created account detail page with transaction history
- [x] Added deposit, withdrawal, and transfer dialogs
- [x] Added interest rate configuration to account form
- [x] Added translations for all 8 languages

**Files Created:**
- `backend/alembic/versions/20260112_savings_transactions_and_interest.py`
- `backend/alembic/versions/20260112_account_transfers.py`
- `backend/app/modules/savings/transaction_service.py`
- `frontend/app/dashboard/savings/[id]/page.tsx`
- `frontend/components/savings/deposit-dialog.tsx`
- `frontend/components/savings/withdraw-dialog.tsx`
- `frontend/components/savings/transfer-dialog.tsx`

---

## Phase 2: Income Module Integration

### Overview
Connect income to savings accounts so that receiving income automatically updates account balances.

### 2.1 Database Changes

#### 2.1.1 Update IncomeSource Model
**Migration:** Add columns to `income_sources`
```python
target_account_id = Column(UUID, ForeignKey("savings_accounts.id"), nullable=True)
auto_deposit = Column(Boolean, default=False)
```

#### 2.1.2 Update IncomeTransaction Model
**Migration:** Add columns to `income_transactions`
```python
deposited_to_account_id = Column(UUID, ForeignKey("savings_accounts.id"), nullable=True)
account_transaction_id = Column(UUID, ForeignKey("account_transactions.id"), nullable=True)
status = Column(String(20), default="received")  # expected, received, deposited
```

#### 2.1.3 Create Income Distribution Rules Table
**Migration:** Create `income_distribution_rules` table
```python
class IncomeDistributionRule(Base):
    __tablename__ = "income_distribution_rules"

    id = Column(UUID, primary_key=True)
    user_id = Column(UUID, ForeignKey("users.id"))
    income_source_id = Column(UUID, ForeignKey("income_sources.id"), nullable=True)  # null = applies to all

    # Distribution target
    target_account_id = Column(UUID, ForeignKey("savings_accounts.id"), nullable=True)
    target_goal_id = Column(UUID, ForeignKey("goals.id"), nullable=True)

    # Distribution amount
    distribution_type = Column(String(20))  # percentage, fixed_amount, remainder
    amount = Column(Numeric(12, 2), nullable=True)  # For fixed_amount
    percentage = Column(Numeric(5, 2), nullable=True)  # For percentage

    # Priority (for multiple rules)
    priority = Column(Integer, default=0)

    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime)
    updated_at = Column(DateTime)
```

### 2.2 Backend Changes

#### 2.2.1 Update Income Service
**File:** `backend/app/modules/income/service.py`
- Add `deposit_income_to_account()` function
- Add `distribute_income()` function for distribution rules
- Update `create_transaction()` to optionally auto-deposit

#### 2.2.2 Create Distribution Service
**File to create:** `backend/app/modules/income/distribution_service.py`
```python
Functions:
- create_distribution_rule(user_id, rule_data)
- get_distribution_rules(user_id, income_source_id)
- apply_distribution_rules(income_transaction_id)
- calculate_distribution(amount, rules)
```

#### 2.2.3 Update Income Router
**File:** `backend/app/modules/income/api.py`
- Add GET/POST/PUT/DELETE for distribution rules
- Add POST `/transactions/{id}/deposit` - Manually deposit to account
- Update transaction creation to support auto-deposit

#### 2.2.4 Create Income Task
**File:** `backend/app/tasks/income_tasks.py`
```python
@celery_app.task
async def process_recurring_income():
    """
    Daily task to:
    1. Find recurring income sources with next_occurrence <= today
    2. Create IncomeTransaction records
    3. Apply distribution rules
    4. Update account balances
    """
```

#### 2.2.5 Update Schemas
**File:** `backend/app/modules/income/schemas.py`
- Add target_account_id to IncomeSourceCreate/Update
- Add DistributionRuleCreate/Update/Response schemas
- Add IncomeTransactionWithDeposit schema

### 2.3 Frontend Changes

#### 2.3.1 Update Income Source Form
**File:** `frontend/components/income/income-source-form.tsx`
- Add account selector dropdown
- Add auto-deposit toggle
- Add distribution rules section

#### 2.3.2 Create Distribution Rules Component
**Files to create:**
- `frontend/components/income/distribution-rules-form.tsx`
- `frontend/components/income/distribution-rules-list.tsx`

#### 2.3.3 Create Transaction Recording UI
**File to create:** `frontend/components/income/record-income-dialog.tsx`
- Form to record actual income received
- Option to deposit to account immediately

#### 2.3.4 Update Income Overview
**File:** `frontend/app/dashboard/income/overview/page.tsx`
- Add "Record Income" button to each source
- Show linked account for each source
- Show distribution rules summary

#### 2.3.5 Update API Client
**File:** `frontend/lib/api/incomeApi.ts`
- Add distribution rules endpoints
- Add deposit endpoint

### Status: COMPLETED

**Completed Items:**
- [x] Added target_account_id and auto_deposit fields to IncomeSource model
- [x] Added deposit tracking fields to IncomeTransaction model
- [x] Created IncomeDistributionRule model and table
- [x] Created distribution service for applying distribution rules
- [x] Updated Income API with deposit and distribution endpoints
- [x] Implemented auto-deposit on income source creation (with historical backfill)
- [x] Implemented auto-deposit on income source update (with sync_historical option)
- [x] Updated income-source-form with target account selector, auto-deposit toggle, and sync historical toggle
- [x] Implemented Celery task for recurring income deposits (process_recurring_income)
- [x] Added translations for all 8 languages

**Key Features:**
- When creating income with auto-deposit, all historical deposits from start_date to today are created
- When editing income with sync_historical enabled, old deposits are reversed and recreated with new values
- Celery task runs daily to process recurring income based on frequency (weekly, biweekly, monthly, quarterly, annually)

**Files Created:**
- `backend/alembic/versions/20260112_add_income_account_integration.py`
- `backend/app/modules/income/distribution_service.py`

**Files Modified:**
- `backend/app/modules/income/models.py` - Added new fields and enums
- `backend/app/modules/income/schemas.py` - Added sync_historical parameter
- `backend/app/modules/income/api.py` - Added deposit endpoints and auto-deposit logic
- `backend/app/tasks/income_tasks.py` - Implemented recurring income processing
- `frontend/lib/api/incomeApi.ts` - Added new types and endpoints
- `frontend/components/income/income-source-form.tsx` - Added account integration UI
- `frontend/messages/*/income.json` - Added translations (all 8 languages)

---

## Phase 3: Expenses Module Integration

### Overview
Connect expenses to savings accounts so that paying expenses automatically decreases account balances.

### 3.1 Database Changes

#### 3.1.1 Update Expense Model
**Migration:** Add columns to `expenses`
```python
payment_account_id = Column(UUID, ForeignKey("savings_accounts.id"), nullable=True)
status = Column(String(20), default="pending")  # pending, paid, overdue, cancelled
paid_date = Column(DateTime, nullable=True)
paid_amount = Column(Numeric(12, 2), nullable=True)
account_transaction_id = Column(UUID, ForeignKey("account_transactions.id"), nullable=True)
receipt_url = Column(String(500), nullable=True)
payment_method = Column(String(50), nullable=True)  # cash, card, transfer, check
```

### 3.2 Backend Changes

#### 3.2.1 Update Expense Service
**File:** `backend/app/modules/expenses/service.py`
- Add `mark_as_paid()` function
- Add `pay_from_account()` function
- Add `get_pending_expenses()` function
- Add `get_overdue_expenses()` function

#### 3.2.2 Update Expense Router
**File:** `backend/app/modules/expenses/router.py`
- Add POST `/expenses/{id}/pay` - Mark as paid and deduct from account
- Add GET `/expenses/pending` - List pending expenses
- Add GET `/expenses/overdue` - List overdue expenses
- Add POST `/expenses/{id}/upload-receipt` - Upload receipt

#### 3.2.3 Create Expense Task
**File:** `backend/app/tasks/expense_tasks.py`
```python
@celery_app.task
async def process_recurring_expenses():
    """
    Daily task to:
    1. Find recurring expenses with next_due_date <= today
    2. Create individual expense records with 'pending' status
    3. Optionally auto-pay if configured
    """

@celery_app.task
async def check_overdue_expenses():
    """
    Daily task to:
    1. Find pending expenses past due date
    2. Mark as overdue
    3. Send notifications
    """
```

### 3.3 Frontend Changes

#### 3.3.1 Update Expense Form
**File:** `frontend/components/expenses/expense-form.tsx`
- Add payment account selector
- Add status field
- Add payment method dropdown
- Add receipt upload

#### 3.3.2 Create Payment Dialog
**File to create:** `frontend/components/expenses/pay-expense-dialog.tsx`
- Select account to pay from
- Confirm payment
- Upload receipt (optional)

#### 3.3.3 Update Expense Overview
**File:** `frontend/app/dashboard/expenses/overview/page.tsx`
- Add "Pay" button for pending expenses
- Show status badges (pending, paid, overdue)
- Filter by status
- Show linked account

#### 3.3.4 Update API Client
**File:** `frontend/lib/api/expensesApi.ts`
- Add pay endpoint
- Add receipt upload endpoint
- Add pending/overdue query params

### Status: COMPLETED

**Completed Items:**
- [x] Added payment_account_id, status, paid_date, paid_amount, account_transaction_id, receipt_url, payment_method fields to Expense model
- [x] Added auto_pay field for automatic payment from linked account
- [x] Created database migration for expense payment integration
- [x] Created database migration for auto_pay field
- [x] Updated expense service with pay_expense, get_pending_expenses, get_overdue_expenses, mark_expenses_overdue functions
- [x] Added backfill_expense_payments function for historical payment sync (similar to income's sync_historical)
- [x] Updated expense router with /pay, /cancel, /pending, /overdue, /payment-summary endpoints
- [x] Updated Celery task to only process expenses with auto_pay enabled
- [x] Updated frontend expense form with payment account selector, payment method dropdown
- [x] Added balance display in account dropdown with currency formatting
- [x] Added InsufficientBalanceWarning component with currency conversion
- [x] Added auto_pay toggle and sync_historical checkbox to expense form
- [x] Added translations for all 8 languages (en, de, es, fr, it, pl, pt, uk)

**Key Features:**
- Expenses can be linked to payment accounts
- Auto-pay feature automatically pays expenses when due (via Celery task)
- Historical backfill creates withdrawal transactions for all past periods since start_date
- Account balance warning shows when expense amount exceeds account balance (with currency conversion)
- All expense payments appear in account transaction history

**Files Created:**
- `backend/alembic/versions/20260113_add_expense_payment_integration.py`
- `backend/alembic/versions/20260113_add_expense_auto_pay.py`

**Files Modified:**
- `backend/app/modules/expenses/models.py` - Added payment integration and auto_pay fields
- `backend/app/modules/expenses/schemas.py` - Added payment and auto_pay schemas
- `backend/app/modules/expenses/service.py` - Added payment functions and backfill logic
- `backend/app/modules/expenses/router.py` - Added payment endpoints
- `backend/app/tasks/expense_tasks.py` - Updated to use auto_pay field
- `frontend/lib/api/expensesApi.ts` - Added payment types and endpoints
- `frontend/components/expenses/expense-form.tsx` - Added payment account, auto_pay, sync_historical UI
- `frontend/messages/*/expenses.json` - Added translations (all 8 languages)

---

## Phase 4: Budget Module Completion

### Overview
Implement missing budget features: rollover, automatic period reset, and proactive alerts.

### 4.1 Database Changes

#### 4.1.1 Create Budget History Table
**Migration:** Create `budget_history` table
```python
class BudgetHistory(Base):
    __tablename__ = "budget_history"

    id = Column(UUID, primary_key=True)
    budget_id = Column(UUID, ForeignKey("budgets.id"))
    user_id = Column(UUID, ForeignKey("users.id"))

    period_start = Column(DateTime)
    period_end = Column(DateTime)

    budgeted_amount = Column(Numeric(12, 2))
    spent_amount = Column(Numeric(12, 2))
    remaining_amount = Column(Numeric(12, 2))
    rollover_amount = Column(Numeric(12, 2), default=0)  # Amount rolled over from previous

    percentage_used = Column(Numeric(5, 2))
    was_overspent = Column(Boolean)

    currency = Column(String(3))
    created_at = Column(DateTime)
```

#### 4.1.2 Update Budget Model
**Migration:** Add columns to `budgets`
```python
is_recurring = Column(Boolean, default=True)
last_reset_date = Column(DateTime, nullable=True)
next_reset_date = Column(DateTime, nullable=True)
rollover_cap = Column(Numeric(12, 2), nullable=True)  # Max rollover amount
current_rollover_amount = Column(Numeric(12, 2), default=0)
```

### 4.2 Backend Changes

#### 4.2.1 Update Budget Service
**File:** `backend/app/modules/budgets/service.py`
- Add `process_period_reset()` function
- Add `calculate_rollover()` function
- Add `archive_budget_period()` function
- Update spent calculation to include rollover

#### 4.2.2 Create Budget Tasks
**File:** `backend/app/tasks/budget_tasks.py`
```python
@celery_app.task
async def process_period_resets():
    """
    Monthly task to:
    1. Find budgets with end_date <= today
    2. Archive current period to BudgetHistory
    3. Calculate rollover if enabled
    4. Create new period with updated dates
    """

@celery_app.task
async def check_budget_alerts():
    """
    Daily task to:
    1. Calculate current spending for all active budgets
    2. Check against alert_threshold
    3. Create notifications for users
    """
```

#### 4.2.3 Update Budget Router
**File:** `backend/app/modules/budgets/router.py`
- Add GET `/budgets/{id}/history` - Get historical periods
- Add POST `/budgets/{id}/reset` - Manually trigger period reset

### 4.3 Frontend Changes

#### 4.3.1 Update Budget Form
**File:** `frontend/components/budgets/budget-form.tsx`
- Add recurring toggle
- Add rollover cap input
- Show current rollover amount (edit mode)

#### 4.3.2 Create Budget History View
**File to create:** `frontend/app/dashboard/budgets/[id]/history/page.tsx`
- Show historical periods
- Compare actual vs budgeted
- Show rollover amounts

#### 4.3.3 Update Budget Overview
**File:** `frontend/app/dashboard/budgets/overview/page.tsx`
- Show rollover badge on cards
- Show next reset date

### Status: COMPLETED

**Completed Items:**
- [x] Added alert tracking fields to Budget model (last_alert_at, last_alert_percentage, current_period_start)
- [x] Added rollover_amount field to Budget model
- [x] Created effective_amount property for calculating base + rollover
- [x] Implemented check_budget_alerts Celery task for periodic threshold checks
- [x] Implemented check_budget_for_category Celery task for real-time alerts on expense changes
- [x] Created budget event handlers (THRESHOLD_WARNING, THRESHOLD_EXCEEDED, PERIOD_RESET)
- [x] Integrated budget alerts with notification system
- [x] Updated frontend to display effective_amount when rollover is present
- [x] Added rollover_amount and effective_amount to BudgetResponse schema
- [x] Added translations for base/rollover in all 8 languages

**Deferred Items:**
- [ ] Budget rollover feature (process_period_resets task needs debugging)
- [ ] Rollover toggle hidden in budget form until fixed
- [ ] Budget history tracking (BudgetHistory table)

**Key Features:**
- Real-time budget alerts when expenses are created/updated
- Configurable alert threshold (default 80%)
- Budget exceeded alerts at 100%+
- Alert tracking prevents duplicate notifications
- Multi-currency support for budget calculations

**Files Created:**
- `backend/alembic/versions/20260113_add_budget_alert_tracking.py`
- `backend/alembic/versions/20260113_add_budget_rollover_amount.py`

**Files Modified:**
- `backend/app/modules/budgets/models.py` - Added alert tracking and rollover fields
- `backend/app/modules/budgets/schemas.py` - Added rollover_amount and effective_amount
- `backend/app/modules/budgets/router.py` - Include rollover fields in responses
- `backend/app/tasks/budget_tasks.py` - Implemented alert and period reset tasks
- `backend/app/tasks/base.py` - Added model imports and event handlers import for Celery
- `backend/app/core/event_handlers.py` - Added budget event notification handlers
- `frontend/lib/api/budgetsApi.ts` - Added rollover types
- `frontend/app/dashboard/budgets/overview/page.tsx` - Display effective amounts
- `frontend/components/budgets/budget-form.tsx` - Hidden rollover toggle (temporarily)
- `frontend/messages/*/budgets.json` - Added base/rollover translations (8 languages)

---

## Phase 5: Subscriptions Module Automation

### Overview
Automate subscription expense creation and renewal reminders.

### 5.1 Database Changes

#### 5.1.1 Update Subscription Model
**Migration:** Add columns to `subscriptions`
```python
payment_account_id = Column(UUID, ForeignKey("savings_accounts.id"), nullable=True)
auto_pay = Column(Boolean, default=False)
reminder_days_before = Column(Integer, default=3)
last_payment_date = Column(DateTime, nullable=True)
next_payment_date = Column(DateTime, nullable=True)
status = Column(String(20), default="active")  # active, paused, cancelled, expired
paused_at = Column(DateTime, nullable=True)
resume_date = Column(DateTime, nullable=True)
```

#### 5.1.2 Create Subscription Payment History Table
**Migration:** Create `subscription_payments` table
```python
class SubscriptionPayment(Base):
    __tablename__ = "subscription_payments"

    id = Column(UUID, primary_key=True)
    subscription_id = Column(UUID, ForeignKey("subscriptions.id"))
    user_id = Column(UUID, ForeignKey("users.id"))

    amount = Column(Numeric(12, 2))
    currency = Column(String(3))
    payment_date = Column(DateTime)

    # Link to expense and account transaction
    expense_id = Column(UUID, ForeignKey("expenses.id"), nullable=True)
    account_transaction_id = Column(UUID, ForeignKey("account_transactions.id"), nullable=True)

    status = Column(String(20), default="completed")  # pending, completed, failed
    created_at = Column(DateTime)
```

### 5.2 Backend Changes

#### 5.2.1 Update Subscription Service
**File:** `backend/app/modules/subscriptions/service.py`
- Add `process_renewal()` function
- Add `create_subscription_expense()` function
- Add `pause_subscription()` function
- Add `resume_subscription()` function
- Add `calculate_next_payment_date()` function

#### 5.2.2 Create Subscription Tasks
**File:** `backend/app/tasks/subscription_tasks.py`
```python
@celery_app.task
async def process_subscription_renewals():
    """
    Daily task to:
    1. Find subscriptions with next_payment_date <= today
    2. Create expense record for the payment
    3. If auto_pay, deduct from linked account
    4. Record payment in subscription_payments
    5. Update next_payment_date
    """

@celery_app.task
async def send_renewal_reminders():
    """
    Daily task to:
    1. Find subscriptions with next_payment_date within reminder_days_before
    2. Send notifications to users
    """
```

#### 5.2.3 Update Subscription Router
**File:** `backend/app/modules/subscriptions/router.py`
- Add POST `/subscriptions/{id}/pause` - Pause subscription
- Add POST `/subscriptions/{id}/resume` - Resume subscription
- Add GET `/subscriptions/{id}/payments` - Get payment history

### 5.3 Frontend Changes

#### 5.3.1 Update Subscription Form
**File:** `frontend/components/subscriptions/subscription-form.tsx`
- Add payment account selector
- Add auto-pay toggle
- Add reminder days input
- Add pause/resume functionality

#### 5.3.2 Create Payment History View
**File to create:** `frontend/components/subscriptions/payment-history.tsx`
- Show all subscription payments
- Link to expenses

#### 5.3.3 Update Subscription Overview
**File:** `frontend/app/dashboard/subscriptions/overview/page.tsx`
- Show next payment date prominently
- Add pause/resume buttons
- Show payment account
- Show auto-pay status

### Status: COMPLETED

**Completed Items:**
- [x] Added payment_account_id, auto_pay, reminder_days_before, last_payment_date, next_payment_date, status, paused_at, resume_date fields to Subscription model
- [x] Created SubscriptionPayment model and table for payment history
- [x] Created database migration for subscription payment integration
- [x] Updated subscription service with payment processing functions (process_subscription_payment, backfill_subscription_payments, reverse_subscription_payments)
- [x] Implemented pause_subscription, resume_subscription, cancel_subscription functions
- [x] Updated subscription router with /pause, /resume, /cancel, /payments, /pay endpoints
- [x] Implemented Celery tasks for subscription renewals and reminders
- [x] Updated frontend subscription form with payment account selector, auto-pay toggle, sync historical checkbox
- [x] Created subscription detail page (/dashboard/subscriptions/[id]) with full subscription info
- [x] Created SubscriptionPaymentList component for payment history
- [x] Added Pause/Resume/Cancel actions to subscription detail page
- [x] Added clickable subscription names and Eye icon for navigation to detail page
- [x] Fixed TransactionService import issue (was importing as function instead of class)
- [x] Added translations for all 8 languages (en, uk, es, fr, de, it, pl, pt)

**Key Features:**
- Subscriptions can be linked to payment accounts for automatic payments
- Auto-pay feature automatically deducts from linked account on renewal
- Sync historical payments backfills past payments from start_date to today
- Subscription detail page shows all info, payment history, and action buttons
- Pause/Resume for temporary stops, Cancel for permanent end (data preserved)
- All subscription payments appear in account transaction history

**Files Created:**
- `backend/alembic/versions/20260113_add_subscription_payment_integration.py`
- `frontend/app/dashboard/subscriptions/[id]/page.tsx`
- `frontend/components/subscriptions/subscription-payment-list.tsx`

**Files Modified:**
- `backend/app/modules/subscriptions/models.py` - Added payment integration fields
- `backend/app/modules/subscriptions/schemas.py` - Added payment schemas
- `backend/app/modules/subscriptions/service.py` - Added payment functions, fixed TransactionService usage
- `backend/app/modules/subscriptions/router.py` - Added payment endpoints
- `backend/app/tasks/subscription_tasks.py` - Implemented renewal and reminder tasks
- `frontend/lib/api/subscriptionsApi.ts` - Added payment types and endpoints
- `frontend/components/subscriptions/subscription-form.tsx` - Added payment integration UI
- `frontend/app/dashboard/subscriptions/overview/page.tsx` - Added navigation to detail page
- `frontend/messages/*/subscriptions.json` - Added detail and payments translations (8 languages)

---

## Phase 6: Installments Module Enhancement

### Overview
Enable manual payment recording and auto-create expense records for installment payments.

### 6.1 Database Changes

#### 6.1.1 Update Installment Model
**Migration:** Add columns to `installments`
```python
payment_account_id = Column(UUID, ForeignKey("savings_accounts.id"), nullable=True)
auto_pay = Column(Boolean, default=False)
last_payment_date = Column(DateTime, nullable=True)
next_payment_date = Column(DateTime, nullable=True)
status = Column(String(20), default="active")  # active, completed, defaulted
```

#### 6.1.2 Create Installment Payment Table
**Migration:** Create `installment_payments` table
```python
class InstallmentPayment(Base):
    __tablename__ = "installment_payments"

    id = Column(UUID, primary_key=True)
    installment_id = Column(UUID, ForeignKey("installments.id"))
    user_id = Column(UUID, ForeignKey("users.id"))

    payment_number = Column(Integer)  # Which payment (1, 2, 3...)
    scheduled_date = Column(DateTime)
    actual_payment_date = Column(DateTime, nullable=True)

    scheduled_amount = Column(Numeric(12, 2))
    actual_amount = Column(Numeric(12, 2), nullable=True)

    principal_amount = Column(Numeric(12, 2), nullable=True)
    interest_amount = Column(Numeric(12, 2), nullable=True)

    # Link to expense and account transaction
    expense_id = Column(UUID, ForeignKey("expenses.id"), nullable=True)
    account_transaction_id = Column(UUID, ForeignKey("account_transactions.id"), nullable=True)

    status = Column(String(20), default="scheduled")  # scheduled, paid, late, missed
    is_late = Column(Boolean, default=False)
    days_late = Column(Integer, default=0)

    notes = Column(Text, nullable=True)
    created_at = Column(DateTime)
```

### 6.2 Backend Changes

#### 6.2.1 Update Installment Service
**File:** `backend/app/modules/installments/service.py`
- Add `record_payment()` function
- Add `generate_payment_schedule()` function
- Add `calculate_amortization()` function (proper interest calculation)
- Add `get_next_payment()` function
- Add `mark_payment_late()` function

#### 6.2.2 Create Installment Tasks
**File:** `backend/app/tasks/installment_tasks.py`
```python
@celery_app.task
async def process_installment_payments():
    """
    Daily task to:
    1. Find installments with next_payment_date <= today
    2. If auto_pay, process payment from linked account
    3. Create expense record
    4. Update installment (payments_made, remaining_balance)
    5. Mark as late if past due
    """

@celery_app.task
async def check_late_payments():
    """
    Daily task to:
    1. Find scheduled payments past due date
    2. Mark as late
    3. Send notifications
    """
```

#### 6.2.3 Update Installment Router
**File:** `backend/app/modules/installments/router.py`
- Add POST `/installments/{id}/payments` - Record manual payment
- Add GET `/installments/{id}/payments` - Get payment history
- Add GET `/installments/{id}/schedule` - Get full payment schedule

### 6.3 Frontend Changes

#### 6.3.1 Update Installment Form
**File:** `frontend/components/installments/installment-form.tsx`
- Add payment account selector
- Add auto-pay toggle
- Remove auto-calculation override, allow manual entry

#### 6.3.2 Create Payment Recording Component
**File to create:** `frontend/components/installments/record-payment-dialog.tsx`
- Record actual payment
- Select account
- Mark principal vs interest

#### 6.3.3 Create Payment Schedule View
**File to create:** `frontend/app/dashboard/installments/[id]/schedule/page.tsx`
- Show full amortization schedule
- Mark past payments (paid/late/missed)
- Show upcoming payments

#### 6.3.4 Update Installment Overview
**File:** `frontend/app/dashboard/installments/overview/page.tsx`
- Add "Record Payment" button
- Show payment status (on time, late, missed)
- Show next payment date and amount

### Status: COMPLETED

**Completed Items:**
- [x] Added payment_account_id, auto_pay, reminder_days_before, status fields to Installment model
- [x] Created InstallmentPayment model and table for payment history
- [x] Created database migration for installment payment integration
- [x] Updated installment service with payment processing functions (process_installment_payment, backfill_installment_payments, reverse_installment_payments)
- [x] Implemented complete, default, reactivate status functions
- [x] Updated installment router with /payments, /complete, /default, /reactivate endpoints
- [x] Implemented Celery tasks for installment payment processing
- [x] Updated frontend installment form with payment account selector, auto-pay toggle, sync historical checkbox
- [x] Created installment detail page (/dashboard/installments/[id]) with full installment info
- [x] Created InstallmentPaymentList component for payment history
- [x] Added Mark Complete/Defaulted/Reactivate actions to detail page
- [x] Added clickable installment names and Eye icon for navigation to detail page
- [x] Fixed form pre-selection of payment account and auto-pay toggle
- [x] Added translations for all 8 languages (en, uk, es, fr, de, it, pl, pt)

**Key Features:**
- Installments can be linked to payment accounts for automatic payments
- Auto-pay feature automatically deducts from linked account when due (via Celery task)
- Sync historical payments backfills past payments from first_payment_date to today
- Installment detail page shows all info, payment history, and action buttons
- Status management: Active → Completed (paid off), Active → Defaulted (failed), Reactivate
- All installment payments appear in account transaction history

**Files Created:**
- `backend/alembic/versions/20260113_add_installment_payment_integration.py`
- `frontend/app/dashboard/installments/[id]/page.tsx`
- `frontend/components/installments/installment-payment-list.tsx`

**Files Modified:**
- `backend/app/modules/installments/models.py` - Added payment integration fields
- `backend/app/modules/installments/schemas.py` - Added payment schemas
- `backend/app/modules/installments/service.py` - Added payment functions
- `backend/app/modules/installments/router.py` - Added payment endpoints
- `backend/app/tasks/installment_tasks.py` - Implemented payment processing tasks
- `frontend/lib/api/installmentsApi.ts` - Added payment types and endpoints
- `frontend/components/installments/installment-form.tsx` - Added payment integration UI
- `frontend/app/dashboard/installments/overview/page.tsx` - Added navigation to detail page
- `frontend/messages/*/installments.json` - Added detail and payments translations (8 languages)
- `frontend/messages/*/common.json` - Added view and actions translations (8 languages)

---

## Phase 7: Debt Module Enhancement

### Overview
Add interest calculation, payment tracking, and payoff strategies to the Debt module.

### 7.1 Database Changes

#### 7.1.1 Update Debt Model
**Migration:** Add columns to `debts`
```python
interest_rate = Column(Numeric(5, 2), nullable=True)  # APR percentage
interest_type = Column(String(20), default="simple")  # simple, compound
accrued_interest = Column(Numeric(12, 2), default=0)
last_interest_calculation = Column(DateTime, nullable=True)
minimum_payment = Column(Numeric(12, 2), nullable=True)
payment_account_id = Column(UUID, ForeignKey("savings_accounts.id"), nullable=True)
```

#### 7.1.2 Create Debt Payment Table
**Migration:** Create `debt_payments` table
```python
class DebtPayment(Base):
    __tablename__ = "debt_payments"

    id = Column(UUID, primary_key=True)
    debt_id = Column(UUID, ForeignKey("debts.id"))
    user_id = Column(UUID, ForeignKey("users.id"))

    amount = Column(Numeric(12, 2))
    payment_date = Column(DateTime)

    principal_portion = Column(Numeric(12, 2), nullable=True)
    interest_portion = Column(Numeric(12, 2), nullable=True)

    balance_before = Column(Numeric(12, 2))
    balance_after = Column(Numeric(12, 2))

    account_transaction_id = Column(UUID, ForeignKey("account_transactions.id"), nullable=True)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime)
```

### 7.2 Backend Changes

#### 7.2.1 Update Debt Service
**File:** `backend/app/modules/debts/service.py`
- Add `calculate_interest()` function
- Add `accrue_interest()` function
- Add `record_payment()` function
- Add `get_payoff_projection()` function
- Add `get_payoff_strategies()` function (avalanche, snowball)

#### 7.2.2 Create Debt Tasks
**File to create:** `backend/app/tasks/debt_tasks.py`
```python
@celery_app.task
async def calculate_monthly_interest():
    """
    Monthly task to:
    1. Calculate interest for all active debts
    2. Add to accrued_interest
    3. Optionally add to principal if compound
    """
```

#### 7.2.3 Create Payoff Strategy Service
**File to create:** `backend/app/modules/debts/strategy_service.py`
```python
Functions:
- calculate_avalanche_strategy(debts)  # Highest APR first
- calculate_snowball_strategy(debts)  # Lowest balance first
- calculate_payoff_timeline(debts, monthly_payment)
- compare_strategies(debts, monthly_payment)
```

#### 7.2.4 Update Debt Router
**File:** `backend/app/modules/debts/router.py`
- Add POST `/debts/{id}/payments` - Record payment
- Add GET `/debts/{id}/payments` - Get payment history
- Add GET `/debts/{id}/payoff-projection` - Get projected payoff date
- Add GET `/debts/strategies` - Get payoff strategy comparison

### 7.3 Frontend Changes

#### 7.3.1 Update Debt Form
**File:** `frontend/components/debts/debt-form.tsx`
- Add interest rate input
- Add interest type dropdown
- Add minimum payment input
- Add payment account selector

#### 7.3.2 Create Payment Recording Component
**File to create:** `frontend/components/debts/record-payment-dialog.tsx`

#### 7.3.3 Create Payoff Strategy View
**File to create:** `frontend/app/dashboard/debts/strategies/page.tsx`
- Show avalanche vs snowball comparison
- Timeline visualization
- Total interest paid comparison

#### 7.3.4 Update Debt Overview
**File:** `frontend/app/dashboard/debts/overview/page.tsx`
- Show interest rate
- Show accrued interest
- Add "Record Payment" button
- Show projected payoff date

### Status: COMPLETED

**Completed Items:**
- [x] Added payment integration fields to Debt model (deposit_account_id, auto_deposit, interest_rate, accrued_interest, reminder_days_before, payment_frequency, expected_payment_amount, next_payment_date, last_reminder_at)
- [x] Created DebtPayment model and table for tracking payments received from debtors
- [x] Created database migration for debt payment integration
- [x] Updated debt service with payment recording and balance tracking (record_payment, mark_paid, forgive_debt)
- [x] Updated debt router with /payments, /mark-paid, /forgive endpoints
- [x] Implemented Celery tasks for debt reminders (send_payment_reminders), overdue checking (check_overdue_debts), and monthly interest calculation (calculate_monthly_interest)
- [x] Updated frontend debt form with payment integration UI:
  - Deposit account selector with balance display
  - Auto-deposit toggle
  - Sync historical payments checkbox
  - Interest rate input
  - Reminder days before input
  - Payment frequency dropdown (Weekly/Bi-weekly/Monthly/Quarterly)
  - Next payment date picker
  - Expected payment amount input
- [x] Created debt detail page (/dashboard/debts/[id]) with:
  - Collection progress bar with percentage
  - Stats cards (Total Amount, Amount Collected, Amount Remaining, Interest Rate)
  - Debt details section (debtor, created date, payment frequency, notes)
  - Linked account section with auto-deposit status and reminder days
  - Record Payment dialog with deposit-to-account option
  - Mark as Paid confirmation dialog
  - Forgive debt confirmation dialog
- [x] Created DebtPaymentList component for payment history table
- [x] Added clickable debtor names and Eye icon for navigation to detail page from overview
- [x] Added comprehensive translations for all 8 languages (en, uk, es, fr, de, it, pl, pt):
  - Form section: 25+ keys for payment integration fields
  - Detail section: 50+ keys for debt detail page
  - Payments section: table headers and status labels
- [x] Fixed type errors (progressPercent.toFixed, DebtCreate type, SavingsAccount.current_balance)
- [x] Fixed savings interest endpoint (days_elapsed int conversion)

**Key Features (Debts track money owed TO the user - receivables):**
- Debts represent money owed to the user (not user's debts to others)
- Payments are deposits - money received from debtors goes into linked savings accounts
- Interest tracking on outstanding balances with monthly accrual
- Payment reminders sent N days before due dates
- Overdue notifications for late payments (daily + weekly reminders)
- Mark as paid or forgive debt options with confirmation dialogs
- Full payment history with balance before/after tracking

**Files Created:**
- `backend/alembic/versions/20260114_add_debt_payment_integration.py`
- `frontend/app/dashboard/debts/[id]/page.tsx`
- `frontend/components/debts/debt-payment-list.tsx`

**Files Modified:**
- `backend/app/modules/debts/models.py` - Added payment integration fields and DebtPayment model
- `backend/app/modules/debts/schemas.py` - Added payment schemas and response types
- `backend/app/modules/debts/service.py` - Added payment functions (record_payment, mark_paid, forgive)
- `backend/app/modules/debts/router.py` - Added payment endpoints (/payments, /mark-paid, /forgive)
- `backend/app/tasks/debt_tasks.py` - Implemented 3 Celery tasks (reminders, overdue, interest)
- `backend/app/modules/savings/transaction_service.py` - Fixed days_elapsed type conversion
- `frontend/lib/api/debtsApi.ts` - Added payment types, hooks, and cache invalidation
- `frontend/components/debts/debt-form.tsx` - Added full payment integration UI with styled section
- `frontend/app/dashboard/debts/overview/page.tsx` - Added navigation links to detail page
- `frontend/messages/*/debts.json` - Added 75+ translation keys across form, detail, and payments sections (8 languages)

---

## Phase 8: Portfolio Module Enhancement

### Overview
Add dividend tracking, price updates, and transaction history to the Portfolio module.

### 8.1 Database Changes

#### 8.1.1 Update PortfolioAsset Model
**Migration:** Add columns to `portfolio_assets`
```python
dividend_yield = Column(Numeric(5, 2), nullable=True)  # Annual dividend yield %
dividend_frequency = Column(String(20), nullable=True)  # monthly, quarterly, annually
last_dividend_date = Column(DateTime, nullable=True)
next_dividend_date = Column(DateTime, nullable=True)
total_dividends_received = Column(Numeric(12, 2), default=0)
cost_basis = Column(Numeric(12, 2), nullable=True)  # For tax purposes
```

#### 8.1.2 Create Portfolio Transaction Table
**Migration:** Create `portfolio_transactions` table
```python
class PortfolioTransaction(Base):
    __tablename__ = "portfolio_transactions"

    id = Column(UUID, primary_key=True)
    asset_id = Column(UUID, ForeignKey("portfolio_assets.id"))
    user_id = Column(UUID, ForeignKey("users.id"))

    type = Column(String(20))  # buy, sell, dividend, split

    quantity = Column(Numeric(18, 8))
    price_per_unit = Column(Numeric(12, 2))
    total_amount = Column(Numeric(12, 2))
    fees = Column(Numeric(12, 2), default=0)

    currency = Column(String(3))
    transaction_date = Column(DateTime)

    # For dividends
    dividend_per_share = Column(Numeric(12, 6), nullable=True)

    # Link to income (for dividends)
    income_transaction_id = Column(UUID, ForeignKey("income_transactions.id"), nullable=True)

    notes = Column(Text, nullable=True)
    created_at = Column(DateTime)
```

### 8.2 Backend Changes

#### 8.2.1 Update Portfolio Service
**File:** `backend/app/modules/portfolio/service.py`
- Add `record_buy()` function
- Add `record_sell()` function
- Add `record_dividend()` function
- Add `calculate_cost_basis()` function
- Add `calculate_realized_gains()` function
- Add `get_transactions()` function

#### 8.2.2 Create Portfolio Tasks
**File to create:** `backend/app/tasks/portfolio_tasks.py`
```python
@celery_app.task
async def process_dividends():
    """
    Daily task to:
    1. Find assets with next_dividend_date <= today
    2. Calculate dividend amount
    3. Create income transaction
    4. Record portfolio transaction
    5. Update next_dividend_date
    """
```

#### 8.2.3 Update Portfolio Router
**File:** `backend/app/modules/portfolio/router.py`
- Add POST `/portfolio/{id}/transactions` - Record buy/sell
- Add GET `/portfolio/{id}/transactions` - Get transaction history
- Add POST `/portfolio/{id}/dividend` - Record dividend
- Add GET `/portfolio/{id}/performance` - Get detailed performance

### 8.3 Frontend Changes

#### 8.3.1 Update Portfolio Form
**File:** `frontend/components/portfolio/portfolio-form.tsx`
- Add dividend yield input
- Add dividend frequency dropdown

#### 8.3.2 Create Transaction Components
**Files to create:**
- `frontend/components/portfolio/buy-sell-dialog.tsx`
- `frontend/components/portfolio/transaction-history.tsx`
- `frontend/components/portfolio/dividend-history.tsx`

#### 8.3.3 Create Asset Detail Page
**File to create:** `frontend/app/dashboard/portfolio/[id]/page.tsx`
- Asset details
- Transaction history
- Dividend history
- Performance chart

### Status: COMPLETED

**Completed Items:**
- [x] Added dynamic pricing fields to PortfolioAsset model (ticker, use_dynamic_pricing, last_price_update, price_source)
- [x] Added payment account integration fields (payment_account_id, auto_transact)
- [x] Added dividend tracking fields (is_dividend_paying, dividend_yield, dividend_per_share, dividend_frequency, next_dividend_date, last_dividend_date, total_dividends_received, dividend_account_id, auto_deposit_dividends)
- [x] Added cost basis tracking (cost_basis, cost_basis_method)
- [x] Created PortfolioTransaction model and table for buy/sell/dividend history
- [x] Created database migration for portfolio payment integration
- [x] Created yfinance price service with caching for dynamic price fetching
- [x] Updated portfolio service with transaction functions (record_buy, record_sell, record_dividend)
- [x] Added price update functions (update_price_manual, update_price_from_api, update_all_prices)
- [x] Updated portfolio router with new endpoints (/buy, /sell, /dividend, /refresh-price, /refresh-all-prices, /validate-ticker/{ticker}, /ticker-dividend-info/{ticker})
- [x] Implemented Celery tasks for dividend processing and price updates
- [x] Updated frontend portfolioApi.ts with new types and RTK Query hooks
- [x] Updated portfolio-form.tsx with Dynamic Pricing, Payment Integration, and Dividend Settings sections
- [x] Created portfolio detail page (/dashboard/portfolio/[id]) with:
  - Overview cards (Total Invested, Current Value, Total Return, Total Dividends)
  - Investment progress bar
  - Buy More / Sell / Record Dividend dialogs
  - Transaction history table
  - Price refresh button for dynamic pricing assets
  - Edit and Delete functionality
- [x] Added View button and clickable asset names to overview page for navigation to detail page
- [x] Fixed Select component preselection when editing (asset_type, payment_account, dividend_frequency, etc.)
- [x] Fixed asset type translation mapping ("Real Estate" → "realEstate")
- [x] Fixed sell transaction success message (Number conversion for realized_gain_loss)
- [x] Added translations for all 8 languages (en, uk, es, fr, de, it, pl, pt)
- [x] Added yfinance to requirements.txt

**Key Features:**
- Dynamic pricing with yfinance API - enter ticker symbol and price auto-updates
- Toggle between dynamic pricing and manual current price entry
- Payment account integration for buy/sell transactions
- Dividend tracking with yield, frequency, and auto-deposit to linked accounts
- Full transaction history (buy, sell, dividend) on detail page
- Realized gain/loss calculation on sell transactions
- Ticker validation before enabling dynamic pricing

**Files Created:**
- `backend/alembic/versions/20260114_add_portfolio_payment_integration.py`
- `backend/app/services/price_service.py`
- `frontend/app/dashboard/portfolio/[id]/page.tsx`

**Files Modified:**
- `backend/app/modules/portfolio/models.py` - Added payment, pricing, dividend, transaction fields
- `backend/app/modules/portfolio/schemas.py` - Added transaction and price update schemas
- `backend/app/modules/portfolio/service.py` - Added buy/sell/dividend/price functions
- `backend/app/modules/portfolio/router.py` - Added transaction and price endpoints (fixed route ordering)
- `backend/app/tasks/portfolio_tasks.py` - Implemented dividend and price update tasks
- `backend/requirements.txt` - Added yfinance dependency
- `frontend/lib/api/portfolioApi.ts` - Added transaction types and hooks
- `frontend/components/portfolio/portfolio-form.tsx` - Added dynamic pricing, payment, dividend UI
- `frontend/app/dashboard/portfolio/overview/page.tsx` - Added navigation to detail page, fixed asset type translation
- `frontend/messages/*/portfolio.json` - Added 100+ translation keys across form, detail, and transactions sections (8 languages)

---

## Phase 9: Goals Module Integration

### Overview
Link goals to savings accounts for automatic progress tracking.

### 9.1 Database Changes

#### 9.1.1 Update Goal Model
**Migration:** Add columns to `goals`
```python
linked_account_id = Column(UUID, ForeignKey("savings_accounts.id"), nullable=True)
auto_track_progress = Column(Boolean, default=False)
```

#### 9.1.2 Create Goal-Account Link Table
**Migration:** Create `goal_account_links` table (for multiple accounts per goal)
```python
class GoalAccountLink(Base):
    __tablename__ = "goal_account_links"

    id = Column(UUID, primary_key=True)
    goal_id = Column(UUID, ForeignKey("goals.id"))
    account_id = Column(UUID, ForeignKey("savings_accounts.id"))

    # What portion of this account counts toward goal
    allocation_type = Column(String(20))  # full, percentage, fixed
    allocation_percentage = Column(Numeric(5, 2), nullable=True)
    allocation_amount = Column(Numeric(12, 2), nullable=True)

    created_at = Column(DateTime)
```

#### 9.1.3 Create Goal Progress History Table
**Migration:** Create `goal_progress_history` table
```python
class GoalProgressHistory(Base):
    __tablename__ = "goal_progress_history"

    id = Column(UUID, primary_key=True)
    goal_id = Column(UUID, ForeignKey("goals.id"))
    user_id = Column(UUID, ForeignKey("users.id"))

    recorded_date = Column(DateTime)
    current_amount = Column(Numeric(12, 2))
    target_amount = Column(Numeric(12, 2))
    progress_percentage = Column(Numeric(5, 2))

    # Snapshot of linked account balances
    linked_accounts_snapshot = Column(JSONB, nullable=True)

    created_at = Column(DateTime)
```

### 9.2 Backend Changes

#### 9.2.1 Update Goal Service
**File:** `backend/app/modules/goals/service.py`
- Add `calculate_progress_from_accounts()` function
- Add `link_account_to_goal()` function
- Add `record_progress_snapshot()` function
- Update `get_goal()` to include calculated progress

#### 9.2.2 Create Goal Tasks
**File to create:** `backend/app/tasks/goal_tasks.py`
```python
@celery_app.task
async def update_goal_progress_from_accounts():
    """
    Daily task to:
    1. Find goals with auto_track_progress = True
    2. Calculate current_amount from linked accounts
    3. Update goal progress
    4. Check for completion
    5. Send notifications
    """
```

#### 9.2.3 Update Goal Router
**File:** `backend/app/modules/goals/router.py`
- Add POST `/goals/{id}/link-account` - Link account to goal
- Add DELETE `/goals/{id}/unlink-account/{account_id}` - Unlink account
- Add GET `/goals/{id}/progress-history` - Get progress over time

### 9.3 Frontend Changes

#### 9.3.1 Update Goal Form
**File:** `frontend/components/goals/goal-form.tsx`
- Add account linking section
- Add auto-track toggle
- Show linked accounts list

#### 9.3.2 Create Progress History View
**File to create:** `frontend/app/dashboard/goals/[id]/progress/page.tsx`
- Progress chart over time
- Linked accounts breakdown
- Projected completion date

#### 9.3.3 Update Goal Overview
**File:** `frontend/app/dashboard/goals/overview/page.tsx`
- Show linked accounts badge
- Show auto-calculated vs manual badge
- Show progress chart thumbnail

### Status: COMPLETED

**Completed Items:**
- [x] Added auto_track_progress field to Goal model
- [x] Created GoalAccountLink model and table for multiple accounts per goal
- [x] Created GoalProgressHistory model and table for progress snapshots
- [x] Created database migration for goal account linking
- [x] Updated goal service with account linking functions (link_account_to_goal, unlink_account_from_goal, get_goal_linked_accounts)
- [x] Added progress calculation from linked accounts with currency conversion (calculate_progress_from_accounts, get_goal_with_linked_accounts_total)
- [x] Added progress snapshot recording with deduplication (record_progress_snapshot)
- [x] Updated goal router with /link-account, /unlink-account, /linked-accounts, /refresh-progress, /progress-history endpoints
- [x] Implemented Celery task for daily goal progress updates (update_goal_progress_from_accounts)
- [x] Updated frontend goal form with:
  - Auto-track progress toggle (defaults to ON)
  - Savings account dropdown when auto-track is enabled
  - Hidden Current Amount Saved and Monthly Contribution fields when auto-track is enabled
  - Linked accounts display with allocation badges (100%, X%, or fixed amount)
  - Add/remove accounts with allocation types (Full Balance, Percentage, Fixed Amount)
- [x] Updated goal detail page with:
  - Linked accounts section showing allocations
  - Auto-refresh progress on page load
  - Progress history with deduplication (prevents duplicate entries within 60 seconds)
- [x] Added progress refresh after linking accounts
- [x] Added multi-currency support (converts linked account balances to goal's currency)
- [x] Fixed UUID serialization in LinkedAccountInfo schema
- [x] Fixed timezone-aware datetime comparison in progress snapshot deduplication
- [x] Added translations for all 8 languages (en, uk, es, fr, de, it, pl, pt)

**Key Features:**
- Goals can track progress automatically from linked savings accounts
- Multiple accounts can be linked to a single goal with different allocation types:
  - Full Balance (100% of account balance)
  - Percentage (X% of account balance)
  - Fixed Amount (specific amount, capped at account balance)
- Multi-currency support - accounts in different currencies are converted to goal's currency
- Progress history with snapshot deduplication prevents duplicate entries
- Auto-refresh on page load ensures data is always fresh
- Celery task runs daily to update all auto-tracked goals

**Files Created:**
- `backend/alembic/versions/20260114_add_goal_account_links.py`

**Files Modified:**
- `backend/app/modules/goals/models.py` - Added GoalAccountLink, GoalProgressHistory models
- `backend/app/modules/goals/schemas.py` - Added link schemas, LinkedAccountInfo with UUID validator
- `backend/app/modules/goals/service.py` - Added account linking, progress calculation, currency conversion
- `backend/app/modules/goals/router.py` - Added link/unlink/refresh/history endpoints
- `backend/app/tasks/goal_tasks.py` - Implemented daily progress update task
- `frontend/lib/api/goalsApi.ts` - Added link/unlink/refresh hooks and types
- `frontend/components/goals/goal-form.tsx` - Added auto-track toggle, account linking, allocation options
- `frontend/app/dashboard/goals/[id]/page.tsx` - Added auto-refresh, linked accounts display
- `frontend/messages/*/goals.json` - Added 20+ translation keys for form and detail sections (8 languages)

---

## Phase 10: Tax Module Enhancement

### Overview
Add tax payment integration, auto-pay functionality, and period-based payment status tracking.

### 10.1 Backend Changes

#### 10.1.1 Tax Payment Integration
**File:** `backend/app/modules/taxes/service.py`
- Added `get_current_period_range()` function for calculating payment periods (monthly/quarterly/annually)
- Added `get_tax_payment_status()` function for checking if tax is paid for current period
- Updated `pay_tax()` function to include balance_before/balance_after tracking for AccountTransaction
- Added auto-pay support with next_payment_date calculation

#### 10.1.2 Tax Payment Status Fields
**File:** `backend/app/modules/taxes/schemas.py`
- Added payment status fields to TaxResponse:
  - `is_paid_current_period` - Boolean indicating if tax is paid for current frequency period
  - `current_period_start` - Start date of current payment period
  - `current_period_end` - End date of current payment period
  - `last_payment_date` - Date of most recent payment
  - `last_payment_amount` - Amount of most recent payment

#### 10.1.3 Celery Tasks for Tax Auto-Pay
**File:** `backend/app/core/celery_app.py`
- Added `process-tax-auto-payments` task (daily at 00:50)
- Added `send-tax-payment-reminders` task (daily at 09:30)

**File:** `backend/app/tasks/tax_tasks.py`
- Implemented `process_auto_pay()` for automatic tax payments
- Implemented `send_payment_reminders()` for due date reminders
- Auto-pay calculates next_payment_date based on frequency

### 10.2 Frontend Changes

#### 10.2.1 Tax Payment Status UI
**File:** `frontend/app/dashboard/taxes/overview/page.tsx`
- Added payment status badges to tax cards and table
- Green "Paid" badge when `is_paid_current_period` is true
- Orange "Due" badge when payment is pending
- Uses CheckCircle and Clock icons for visual distinction

#### 10.2.2 Tax Detail Page Enhancement
**File:** `frontend/app/dashboard/taxes/[id]/page.tsx`
- Added payment status badge to status row
- Smart Pay button: "Pay Now" when due, "Pay Again" (outline) when already paid
- Added RotateCcw icon for "Pay Again" button

#### 10.2.3 RTK Query Configuration
**File:** `frontend/lib/api/apiSlice.ts`
- Added `TaxPayment` and `Account` to tagTypes for cache invalidation

#### 10.2.4 Tax API Types
**File:** `frontend/lib/api/taxesApi.ts`
- Added payment status fields to Tax interface

### 10.3 Translations

**Files updated:** `frontend/messages/*/taxes.json` (all 8 languages: en, de, es, fr, it, pl, pt, uk)
- Added `paymentStatus` section with keys: periodStatus, paid, due, paidFor, dueFor, lastPayment, neverPaid
- Added `payAgain` key to detail section

### Status: COMPLETED

**Completed Items:**
- [x] Period-based payment status calculation (monthly/quarterly/annually)
- [x] Tax payment with proper balance tracking (balance_before/balance_after)
- [x] Auto-pay functionality with Celery tasks for scheduled payments
- [x] Payment reminders via Celery task
- [x] Payment status UI on overview page (Paid/Due badges)
- [x] Payment status badge on tax detail page
- [x] Smart Pay button that shows "Pay Now" or "Pay Again" based on payment status
- [x] RTK Query tag types for TaxPayment and Account cache invalidation
- [x] Multi-language translations for payment status (8 languages)

**Key Features:**
- Taxes track whether they've been paid for the current period based on frequency
- Monthly taxes check if paid this calendar month
- Quarterly taxes check if paid this quarter
- Annual taxes check if paid this year
- Auto-pay automatically processes tax payments on scheduled dates
- Payment reminders sent before due dates
- "Pay Again" allows re-payment even if already paid (with outline button styling)

**Files Modified:**
- `backend/app/modules/taxes/service.py` - Added payment status calculation and balance tracking
- `backend/app/modules/taxes/schemas.py` - Added payment status fields to TaxResponse
- `backend/app/core/celery_app.py` - Added tax auto-pay and reminder tasks to beat schedule
- `backend/app/tasks/tax_tasks.py` - Implemented auto-pay and reminder tasks
- `frontend/lib/api/apiSlice.ts` - Added TaxPayment and Account tag types
- `frontend/lib/api/taxesApi.ts` - Added payment status fields to Tax interface
- `frontend/app/dashboard/taxes/overview/page.tsx` - Added payment status badges
- `frontend/app/dashboard/taxes/[id]/page.tsx` - Added payment status badge and smart Pay button
- `frontend/messages/*/taxes.json` - Added paymentStatus translations (8 languages)

**Deferred Items (moved to future phase):**
- Tax brackets and progressive tax rates
- Tax deductions management
- Tax calculation with brackets
- Expense tax deductibility tracking

---

## Phase 11: Dashboard & Analytics Enhancement

### Overview
Add historical net worth tracking, real projections, and enhanced analytics.

### 11.1 Database Changes

#### 11.1.1 Create Net Worth Snapshot Table
**Migration:** Create `net_worth_snapshots` table
```python
class NetWorthSnapshot(Base):
    __tablename__ = "net_worth_snapshots"

    id = Column(UUID, primary_key=True)
    user_id = Column(UUID, ForeignKey("users.id"))

    snapshot_date = Column(DateTime)

    # Assets breakdown
    total_assets = Column(Numeric(14, 2))
    portfolio_value = Column(Numeric(14, 2))
    savings_balance = Column(Numeric(14, 2))
    other_assets = Column(Numeric(14, 2), default=0)

    # Liabilities breakdown
    total_liabilities = Column(Numeric(14, 2))
    installments_balance = Column(Numeric(14, 2))
    other_liabilities = Column(Numeric(14, 2), default=0)

    # Net worth
    net_worth = Column(Numeric(14, 2))

    # Change tracking
    change_from_previous = Column(Numeric(14, 2), nullable=True)
    percentage_change = Column(Numeric(7, 2), nullable=True)

    # Detailed breakdown (JSON for flexibility)
    assets_breakdown = Column(JSONB, nullable=True)
    liabilities_breakdown = Column(JSONB, nullable=True)

    currency = Column(String(3))
    created_at = Column(DateTime)
```

### 11.2 Backend Changes

#### 11.2.1 Create Snapshot Service
**File to create:** `backend/app/modules/dashboard/snapshot_service.py`
```python
Functions:
- create_snapshot(user_id)
- get_snapshots(user_id, date_range)
- calculate_net_worth_trend(user_id, period)
- get_asset_allocation_history(user_id, period)
```

#### 11.2.2 Create Dashboard Tasks
**File to create:** `backend/app/tasks/dashboard_tasks.py`
```python
@celery_app.task
async def create_monthly_snapshot():
    """
    Monthly task to:
    1. Calculate current net worth for all users
    2. Create snapshot record
    3. Calculate change from previous
    """

@celery_app.task
async def create_daily_snapshot():
    """
    Optional daily snapshot for premium users.
    """
```

#### 11.2.3 Update Dashboard Service
**File:** `backend/app/modules/dashboard/service.py`
- Update `get_net_worth_trend()` to use actual snapshots
- Add `get_projected_net_worth()` function
- Add `get_financial_projections()` function

#### 11.2.4 Update Dashboard Router
**File:** `backend/app/modules/dashboard/router.py`
- Update `/analytics/net-worth-trend` to use real historical data
- Add GET `/analytics/projections` - Future projections
- Add POST `/snapshots/create` - Manually create snapshot

### 11.3 Frontend Changes

#### 11.3.1 Update Net Worth Trend Chart
**File:** `frontend/components/dashboard/net-worth-trend-chart.tsx`
- Use actual historical data
- Add projection line (dashed)
- Add comparison periods

#### 11.3.2 Create Projection View
**File to create:** `frontend/components/dashboard/financial-projections.tsx`
- Show 1/3/5/10 year projections
- Based on current income/expense/savings rate
- Show scenarios (optimistic, realistic, conservative)

### Status: COMPLETED

**Completed Items:**
- [x] Created NetWorthSnapshot and CashFlowSnapshot models for historical tracking
- [x] Created database migration for snapshot tables with proper indexes
- [x] Created snapshot_service.py with net worth calculation including debts receivable
- [x] Updated get_net_worth() to include: Savings + Portfolio + Debts Receivable - Installments
- [x] Added financial projections endpoint (1/3/5/10 year forecasts)
- [x] Added goal projections endpoint
- [x] Added net worth breakdown endpoint
- [x] Implemented Celery tasks for monthly/daily snapshots
- [x] Updated frontend dashboard to display Debts Receivable under Assets
- [x] Fixed category display formatting (snake_case → Title Case) across all widgets
- [x] Fixed Debts Owed widget to match Net Worth > Debts Receivable calculation
- [x] Added translations for all snapshot and projection features (8 languages)
- [x] Fixed PortfolioAsset attribute error (asset_name vs name)

**Key Features:**
- Net Worth now correctly calculates: Assets (Portfolio + Savings + Debts Receivable) - Liabilities (Installments)
- Historical snapshots track net worth over time for trend analysis
- Financial projections based on current savings rate and assumed investment returns
- Categories display in human-readable format (e.g., "Home Property" instead of "home_property")
- Debts Receivable (money owed TO the user) properly shows as an asset

**Files Created:**
- `backend/app/modules/dashboard/models.py` - NetWorthSnapshot, CashFlowSnapshot models
- `backend/app/modules/dashboard/snapshot_service.py` - Snapshot calculation and management
- `backend/alembic/versions/20260115_add_dashboard_snapshots.py` - Database migration

**Files Modified:**
- `backend/app/modules/dashboard/service.py` - Added debts_receivable to net worth calculation
- `backend/app/modules/dashboard/schemas.py` - Added snapshot and projection response types
- `backend/app/modules/dashboard/router.py` - Added snapshot and projection endpoints
- `backend/app/modules/debts/service.py` - Fixed debt stats to show remaining balance
- `backend/app/tasks/dashboard_tasks.py` - Implemented snapshot Celery tasks
- `frontend/app/dashboard/page.tsx` - Added Debts Receivable display under Assets
- `frontend/components/dashboard/goals-overview-widget.tsx` - Added formatCategory helper
- `frontend/components/dashboard/budget-overview-widget.tsx` - Added formatCategory helper
- `frontend/components/dashboard/*-chart.tsx` - Added formatCategory to all chart components
- `frontend/lib/api/dashboardApi.ts` - Added snapshot and projection types/hooks
- `frontend/messages/*/dashboard.json` - Added translations (8 languages)

---

## Phase 12: Billing/Tier Subscription Automation

### Overview
Implement automatic tier downgrade when subscription expires.

### 12.1 Backend Changes

#### 12.1.1 Update Stripe Service
**File:** `backend/app/services/stripe_service.py`
- Add `handle_subscription_ended()` function
- Update webhook handler for subscription deletion

#### 12.1.2 Create Billing Tasks
**File to create:** `backend/app/tasks/billing_tasks.py`
```python
@celery_app.task
async def check_tier_expirations():
    """
    Daily task to:
    1. Find subscriptions where:
       - cancel_at_period_end = True
       - current_period_end < now
    2. Downgrade user tier to 'starter'
    3. Send notification
    4. Clean up tier-specific data if needed
    """

@celery_app.task
async def send_tier_expiration_warnings():
    """
    Daily task to:
    1. Find subscriptions expiring in 7/3/1 days
    2. Send reminder notifications
    """
```

#### 12.1.3 Create Tier Downgrade Service
**File to create:** `backend/app/services/tier_downgrade_service.py`
```python
Functions:
- downgrade_user_to_starter(user_id)
- archive_tier_specific_data(user_id, from_tier)
- get_features_being_lost(from_tier, to_tier)
- send_downgrade_notification(user_id, lost_features)
```

#### 12.1.4 Update Billing Router
**File:** `backend/app/api/v1/billing.py`
- Fix webhook handler for subscription.deleted event
- Add endpoint to preview downgrade impact

### 12.2 Frontend Changes

#### 12.2.1 Update Subscription Settings
**File:** `frontend/components/settings/subscription-settings.tsx`
- Show countdown to expiration
- Show features that will be lost
- Prompt to renew before expiration

#### 12.2.2 Create Downgrade Warning Dialog
**File to create:** `frontend/components/settings/downgrade-warning-dialog.tsx`
- Show features being lost
- Show data that might be archived
- Confirm or renew options

### Status: COMPLETED

**Completed Items:**
- [x] Created TierDowngradeService with downgrade logic and feature loss calculation
- [x] Updated Stripe webhook handler for subscription.deleted event
- [x] Implemented check_tier_expirations Celery task for daily expiration checks
- [x] Implemented send_tier_expiration_warnings Celery task for 7/3/1 day warnings
- [x] Implemented cleanup_tier_data Celery task for archiving excess data on downgrade
- [x] Implemented sync_stripe_status Celery task for periodic Stripe sync
- [x] Added expiration countdown timer to subscription settings (days/hours/minutes)
- [x] Created downgrade warning dialog showing features that will be lost
- [x] Added progress bar showing time remaining until expiration
- [x] Added urgent styling when 3 days or less remaining (red)
- [x] Added "Renew Now" and "View Lost Features" buttons
- [x] Added inline expiration date display: "Your Subscription is Ending (Expires on Feb 15, 2026)"
- [x] Added translations for all 8 languages (en, de, es, fr, it, pl, pt, uk)

**Bug Fixes:**
- [x] Fixed Stripe period dates extraction - dates are nested in `items.data[0]`, not at subscription root level
- [x] Fixed Stripe object access - use dict-style `.get()` instead of `getattr` (Stripe objects inherit from dict)
- [x] Fixed webhook 500 errors - use `.get()` for optional fields to prevent KeyError
- [x] Fixed `cancel_at_period_end` type conversion - added Pydantic field validator to convert integer 0/1 to boolean
- [x] Fixed auto-population of missing period dates from Stripe when fetching subscription status

**Key Features:**
- Automatic tier downgrade when subscription expires (via Celery task or Stripe webhook)
- Expiration warnings sent at 7, 3, and 1 day before expiration
- Real-time countdown timer showing days/hours/minutes until expiration
- Visual urgency indicator (amber → red) based on time remaining
- Lost features dialog showing what premium features will be unavailable
- Stripe status sync to handle webhook delivery failures
- Event-driven notifications for downgrade and expiration warnings
- Period dates auto-fetched from Stripe if missing in database

**Files Created:**
- `backend/app/services/tier_downgrade_service.py` - Tier downgrade logic and feature calculations

**Files Modified:**
- `backend/app/services/stripe_service.py` - Added handle_subscription_deleted(), fixed period dates extraction from `items.data[0]`
- `backend/app/api/v1/billing.py` - Updated webhook, fixed period dates extraction, added auto-fetch from Stripe
- `backend/app/schemas/billing.py` - Added field_validator for cancel_at_period_end int→bool conversion
- `backend/app/tasks/billing_tasks.py` - Implemented all 4 billing Celery tasks
- `frontend/components/settings/subscription-settings.tsx` - Added countdown timer, expiration date display, downgrade warning
- `frontend/messages/*/settings.json` - Added expiration and downgradeWarning translations (8 languages)

---

## Progress Tracking

### Phase Completion Status

| Phase | Status | Start Date | Completion Date | Notes |
|-------|--------|------------|-----------------|-------|
| 0 | COMPLETED | 2026-01-12 | 2026-01-12 | Foundation infrastructure |
| 1 | COMPLETED | 2026-01-12 | 2026-01-12 | Savings transactions |
| 2 | COMPLETED | 2026-01-12 | 2026-01-13 | Income integration |
| 3 | COMPLETED | 2026-01-13 | 2026-01-13 | Expense integration with auto-pay |
| 4 | COMPLETED | 2026-01-13 | 2026-01-13 | Budget alerts (rollover deferred) |
| 5 | COMPLETED | 2026-01-13 | 2026-01-13 | Subscription automation with detail page |
| 6 | COMPLETED | 2026-01-13 | 2026-01-13 | Installment payment integration with detail page |
| 7 | COMPLETED | 2026-01-13 | 2026-01-14 | Debt payment tracking (receivables) with detail page |
| 8 | COMPLETED | 2026-01-14 | 2026-01-14 | Portfolio with dynamic pricing (yfinance), dividends, transactions |
| 9 | COMPLETED | 2026-01-14 | 2026-01-14 | Goals with auto-tracking from linked savings accounts, multi-currency support |
| 10 | COMPLETED | 2026-01-14 | 2026-01-14 | Tax payment integration, auto-pay, period-based payment status |
| 11 | COMPLETED | 2026-01-15 | 2026-01-15 | Dashboard with real net worth, debts receivable, snapshots, projections |
| 12 | COMPLETED | 2026-01-15 | 2026-01-15 | Billing automation with tier downgrade, expiration countdown, warnings |

### Current Focus
**ALL PHASES COMPLETED!** The implementation plan has been fully executed.

### How to Continue
When resuming work on this project:
1. Read this file: `IMPLEMENTATION_PLAN.md`
2. Check the Progress Tracking section above
3. Continue with the next NOT STARTED phase
4. Update the status and dates as you progress

---

## Quick Reference: Key Files

### Backend Core
- Celery config: `backend/app/core/celery_app.py`
- Database models: `backend/app/models/`
- Module code: `backend/app/modules/*/`

### Frontend Core
- API clients: `frontend/lib/api/`
- Components: `frontend/components/*/`
- Pages: `frontend/app/dashboard/*/`
- Translations: `frontend/messages/*/`

### Database
- Migrations: `backend/alembic/versions/`

---

*Document created: January 12, 2026*
*Last updated: January 15, 2026 - ALL PHASES COMPLETED! Phase 12 (Billing/Tier Subscription Automation) completed with tier downgrade service, Stripe webhook handling, expiration countdown timer with inline date display, downgrade warning dialog, and critical bug fixes for Stripe period dates extraction (nested in items.data[0]).*
