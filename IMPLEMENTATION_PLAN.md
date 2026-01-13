# Wealth Vault - Comprehensive Implementation Plan

> **Document Purpose**: This document contains the complete implementation plan to address all functionality gaps identified in the January 2026 audit. Reference this file when continuing work on any phase.

> **Last Updated**: January 13, 2026

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

### Status: NOT STARTED

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

### Status: NOT STARTED

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

### Status: NOT STARTED

---

## Phase 10: Tax Module Enhancement

### Overview
Add tax brackets, deductions, and better income integration.

### 10.1 Database Changes

#### 10.1.1 Create Tax Bracket Table
**Migration:** Create `tax_brackets` table
```python
class TaxBracket(Base):
    __tablename__ = "tax_brackets"

    id = Column(UUID, primary_key=True)
    user_id = Column(UUID, ForeignKey("users.id"))

    name = Column(String(100))  # e.g., "Federal 2025", "California State"
    jurisdiction = Column(String(50))  # federal, state, local
    tax_year = Column(Integer)
    filing_status = Column(String(30))  # single, married_joint, married_separate, head_of_household

    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime)
```

#### 10.1.2 Create Tax Bracket Rate Table
**Migration:** Create `tax_bracket_rates` table
```python
class TaxBracketRate(Base):
    __tablename__ = "tax_bracket_rates"

    id = Column(UUID, primary_key=True)
    bracket_id = Column(UUID, ForeignKey("tax_brackets.id"))

    min_income = Column(Numeric(12, 2))
    max_income = Column(Numeric(12, 2), nullable=True)  # null = no upper limit
    rate = Column(Numeric(5, 2))  # Percentage

    order = Column(Integer)  # For sorting brackets
```

#### 10.1.3 Create Tax Deduction Table
**Migration:** Create `tax_deductions` table
```python
class TaxDeduction(Base):
    __tablename__ = "tax_deductions"

    id = Column(UUID, primary_key=True)
    user_id = Column(UUID, ForeignKey("users.id"))

    name = Column(String(100))
    category = Column(String(50))  # standard, itemized, above_the_line
    deduction_type = Column(String(50))  # mortgage_interest, charitable, medical, etc.

    amount = Column(Numeric(12, 2))
    tax_year = Column(Integer)

    # Link to expense if applicable
    expense_id = Column(UUID, ForeignKey("expenses.id"), nullable=True)

    notes = Column(Text, nullable=True)
    created_at = Column(DateTime)
```

#### 10.1.4 Update Expense Model
**Migration:** Add columns to `expenses`
```python
is_tax_deductible = Column(Boolean, default=False)
tax_category = Column(String(50), nullable=True)
```

### 10.2 Backend Changes

#### 10.2.1 Create Tax Calculation Service
**File to create:** `backend/app/modules/taxes/calculation_service.py`
```python
Functions:
- calculate_tax_with_brackets(income, brackets)
- calculate_effective_tax_rate(income, brackets)
- calculate_taxable_income(gross_income, deductions)
- get_standard_deduction(filing_status, tax_year)
- estimate_quarterly_payment(annual_tax)
```

#### 10.2.2 Update Tax Service
**File:** `backend/app/modules/taxes/service.py`
- Add bracket management functions
- Add deduction management functions
- Update tax calculation to use brackets

#### 10.2.3 Update Tax Router
**File:** `backend/app/modules/taxes/router.py`
- Add CRUD for tax brackets
- Add CRUD for deductions
- Add GET `/taxes/calculate` - Calculate tax with brackets
- Add GET `/taxes/summary/{year}` - Annual tax summary

### 10.3 Frontend Changes

#### 10.3.1 Create Tax Bracket Management
**Files to create:**
- `frontend/components/taxes/tax-bracket-form.tsx`
- `frontend/app/dashboard/taxes/brackets/page.tsx`

#### 10.3.2 Create Deduction Management
**Files to create:**
- `frontend/components/taxes/deduction-form.tsx`
- `frontend/app/dashboard/taxes/deductions/page.tsx`

#### 10.3.3 Update Tax Overview
**File:** `frontend/app/dashboard/taxes/overview/page.tsx`
- Show effective tax rate
- Show bracket visualization
- Show deductions summary

### Status: NOT STARTED

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

### Status: NOT STARTED

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

### Status: NOT STARTED

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
| 6 | NOT STARTED | - | - | Installment enhancement |
| 7 | NOT STARTED | - | - | Debt enhancement |
| 8 | NOT STARTED | - | - | Portfolio enhancement |
| 9 | NOT STARTED | - | - | Goals integration |
| 10 | NOT STARTED | - | - | Tax enhancement |
| 11 | NOT STARTED | - | - | Dashboard enhancement |
| 12 | NOT STARTED | - | - | Billing automation |

### Current Focus
**Next Phase to Start:** Phase 6 - Installments Module Enhancement

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
*Last updated: January 13, 2026 - Phase 5 (Subscriptions Module) completed with detail page and payment history*
