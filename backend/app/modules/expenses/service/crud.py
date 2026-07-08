"""Expense CRUD operations and payment backfill."""
from datetime import datetime
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_
from typing import Optional, List
from uuid import UUID
from decimal import Decimal
from app.modules.expenses.models import Expense, ExpenseFrequency, ExpenseStatus
from app.modules.expenses.schemas import (
    ExpenseCreate,
    ExpenseUpdate,
    ExpenseStats,
    ExpenseHistoryResponse,
    MonthlyExpenseHistory,
    PayExpenseRequest,
    PayExpenseResponse,
    ExpensePaymentSummary
)
from app.services.currency_service import CurrencyService
from app.core.events import event_dispatcher, ExpenseEvents
from .common import calculate_monthly_equivalent, convert_expense_to_display_currency, get_frequency_interval, logger

async def backfill_expense_payments(
    db: AsyncSession,
    user_id: UUID,
    expense: Expense,
    skip_existing: bool = False
) -> int:
    """
    Backfill historical payments for a recurring expense.

    Creates withdrawal transactions for all past periods since start_date.
    Updates the expense with the most recent payment details.

    Args:
        db: Database session
        user_id: User ID
        expense: The expense to backfill
        skip_existing: If True, skip dates that already have transactions

    Returns:
        Number of payments created
    """
    from app.modules.savings.transaction_service import TransactionService
    from app.modules.savings.models import AccountTransaction, SavingsAccount
    from app.services.currency_service import CurrencyService

    if not expense.payment_account_id:
        return 0

    # Get account to check currency and prepare conversion if needed
    account_result = await db.execute(
        select(SavingsAccount).where(SavingsAccount.id == expense.payment_account_id)
    )
    account = account_result.scalar_one_or_none()
    if not account:
        return 0

    # Handle currency conversion if needed
    source_currency = None
    exchange_rate = None
    if expense.currency and expense.currency != account.currency:
        source_currency = expense.currency
        currency_service = CurrencyService(db)
        exchange_rate = await currency_service.get_exchange_rate(
            expense.currency, account.currency
        )
        if not exchange_rate:
            logger.warning(
                f"Could not get exchange rate from {expense.currency} to {account.currency} "
                f"for expense {expense.id}, using 1:1"
            )
            exchange_rate = Decimal("1")

    if expense.frequency == ExpenseFrequency.ONE_TIME:
        # For one-time expenses, just pay if date is in the past
        if expense.date and expense.date.date() <= datetime.utcnow().date():
            if expense.status != ExpenseStatus.PAID.value:
                try:
                    transaction_service = TransactionService(db)
                    transaction = await transaction_service.create_withdrawal(
                        account_id=expense.payment_account_id,
                        user_id=user_id,
                        amount=Decimal(str(expense.amount)),
                        description=f"Payment for expense: {expense.name}",
                        source_type="expense",
                        source_id=expense.id,
                        transaction_date=expense.date,
                        category=expense.category,
                        source_currency=source_currency,
                        exchange_rate=exchange_rate,
                    )

                    expense.status = ExpenseStatus.PAID.value
                    expense.paid_date = expense.date
                    expense.paid_amount = expense.amount
                    expense.account_transaction_id = transaction.id
                    await db.commit()
                    return 1
                except Exception as e:
                    logger.warning(f"Failed to backfill one-time expense {expense.id}: {e}")
                    return 0
        return 0

    # For recurring expenses
    if not expense.start_date:
        return 0

    today = datetime.utcnow().date()
    start_date = expense.start_date.replace(tzinfo=None) if expense.start_date.tzinfo else expense.start_date
    end_date = expense.end_date.replace(tzinfo=None) if expense.end_date and expense.end_date.tzinfo else expense.end_date

    # Get existing transaction dates to avoid duplicates
    existing_dates = set()
    if skip_existing:
        result = await db.execute(
            select(AccountTransaction.transaction_date).where(
                AccountTransaction.source_type == "expense",
                AccountTransaction.source_id == expense.id
            )
        )
        existing_dates = {txn_date.date() for txn_date in result.scalars().all() if txn_date}

    interval = get_frequency_interval(expense.frequency)
    current_date = start_date
    payments_created = 0
    transaction_service = TransactionService(db)

    last_payment_date = None
    last_payment_amount = None
    last_transaction_id = None

    while current_date.date() <= today:
        if end_date and current_date.date() > end_date.date():
            break

        # Skip if transaction already exists
        if current_date.date() in existing_dates:
            current_date = current_date + interval
            continue

        try:
            transaction = await transaction_service.create_withdrawal(
                account_id=expense.payment_account_id,
                user_id=user_id,
                amount=Decimal(str(expense.amount)),
                description=f"Payment for expense: {expense.name}",
                source_type="expense",
                source_id=expense.id,
                transaction_date=current_date,
                category=expense.category,
                source_currency=source_currency,
                exchange_rate=exchange_rate,
            )

            payments_created += 1
            last_payment_date = current_date
            last_payment_amount = expense.amount
            last_transaction_id = transaction.id

            logger.info(f"Created historical payment for expense {expense.id} on {current_date.date()}")

        except Exception as e:
            logger.warning(f"Failed to create payment for expense {expense.id} on {current_date.date()}: {e}")
            # Continue with next date even if one fails

        current_date = current_date + interval

    # Update expense with most recent payment details
    if payments_created > 0:
        expense.status = ExpenseStatus.PAID.value
        expense.paid_date = last_payment_date
        expense.paid_amount = last_payment_amount
        expense.account_transaction_id = last_transaction_id
        await db.commit()

    logger.info(f"Backfilled {payments_created} payments for expense {expense.id}")
    return payments_created

async def create_expense(
    db: AsyncSession,
    user_id: UUID,
    expense_data: ExpenseCreate,
    commit: bool = True,
) -> Expense:
    """Create a new expense"""

    # Calculate monthly equivalent
    monthly_equiv = calculate_monthly_equivalent(expense_data.amount, expense_data.frequency)

    expense = Expense(
        user_id=user_id,
        name=expense_data.name,
        description=expense_data.description,
        category=expense_data.category,
        amount=expense_data.amount,
        currency=expense_data.currency,
        frequency=expense_data.frequency,
        date=expense_data.date,
        start_date=expense_data.start_date,
        end_date=expense_data.end_date,
        is_active=expense_data.is_active,
        tags=expense_data.tags,
        monthly_equivalent=monthly_equiv,
        # Payment integration fields
        payment_account_id=expense_data.payment_account_id,
        payment_method=expense_data.payment_method,
        auto_pay=expense_data.auto_pay,
        status=ExpenseStatus.PENDING.value
    )

    db.add(expense)

    if not commit:
        # Caller owns the transaction (e.g. the agent action layer commits the entity and its
        # audit row atomically). Flush to emit the INSERT and populate the row, but do NOT commit.
        # Two side-effects of the committed path are deliberately skipped here:
        #  - payment backfill: moot — this path never sets auto_pay/payment_account_id.
        #  - the ExpenseEvents.CREATED dispatch: so the real-time over-budget Celery ALERT is not
        #    fired for agent-added expenses. Data stays correct (budget_status recomputes spend
        #    from the table); only the proactive alert is skipped. To restore it, dispatch
        #    ExpenseEvents.CREATED from the caller AFTER its commit.
        await db.flush()
        await db.refresh(expense)
        return expense

    await db.commit()
    await db.refresh(expense)

    # If auto_pay and sync_historical are enabled, backfill historical payments
    if expense_data.auto_pay and expense_data.sync_historical and expense_data.payment_account_id:
        await backfill_expense_payments(db, user_id, expense)

    # Dispatch expense created event for budget tracking
    await event_dispatcher.dispatch(
        ExpenseEvents.CREATED,
        user_id=user_id,
        expense_id=str(expense.id),
        category=expense.category,
        amount=float(expense.amount),
        currency=expense.currency,
        name=expense.name,
    )

    return expense

async def get_expense(
    db: AsyncSession,
    user_id: UUID,
    expense_id: UUID
) -> Optional[Expense]:
    """Get a single expense by ID"""
    result = await db.execute(
        select(Expense).where(
            Expense.id == expense_id,
            Expense.user_id == user_id
        )
    )
    expense = result.scalar_one_or_none()

    if expense:
        # Convert to user's display currency
        await convert_expense_to_display_currency(db, user_id, expense)

    return expense

async def list_expenses(
    db: AsyncSession,
    user_id: UUID,
    skip: int = 0,
    limit: int = 100,
    category: Optional[str] = None,
    is_active: Optional[bool] = None
) -> tuple[List[Expense], int]:
    """List expenses with pagination and filters"""
    query = select(Expense).where(Expense.user_id == user_id)

    # Apply filters
    if category:
        query = query.where(Expense.category == category)
    if is_active is not None:
        query = query.where(Expense.is_active == is_active)

    # Get total count
    count_query = select(func.count()).select_from(query.subquery())
    total = await db.scalar(count_query)

    # Apply pagination and ordering
    # Sort by the actual expense date (date for one-time, start_date for recurring)
    # Use COALESCE to handle both fields, with nulls last
    query = query.order_by(
        func.coalesce(Expense.date, Expense.start_date).desc(),
        Expense.created_at.desc()
    ).offset(skip).limit(limit)

    result = await db.execute(query)
    expenses = result.scalars().all()

    # Convert all expenses to user's display currency
    for expense in expenses:
        await convert_expense_to_display_currency(db, user_id, expense)

    return list(expenses), total or 0

async def update_expense(
    db: AsyncSession,
    user_id: UUID,
    expense_id: UUID,
    expense_data: ExpenseUpdate,
    commit: bool = True,
) -> Optional[Expense]:
    """Update an expense"""
    expense = await get_expense(db, user_id, expense_id)
    if not expense:
        return None

    # Track previous auto_pay state to detect if it's being enabled
    was_auto_pay_enabled = expense.auto_pay and expense.payment_account_id

    # Extract sync_historical before updating fields (it's not a model field)
    sync_historical = expense_data.sync_historical

    # Update fields (excluding sync_historical which is not a model field)
    update_data = expense_data.model_dump(exclude_unset=True, exclude={'sync_historical'})

    for field, value in update_data.items():
        setattr(expense, field, value)

    # Recalculate monthly equivalent if amount or frequency changed
    if 'amount' in update_data or 'frequency' in update_data:
        expense.monthly_equivalent = calculate_monthly_equivalent(
            expense.amount, expense.frequency
        )

    if not commit:
        # Caller owns the transaction (agent action layer: atomic entity+audit). Flush only;
        # skip the payment backfill and the budget-tracking event.
        await db.flush()
        await db.refresh(expense)
        return expense

    await db.commit()
    await db.refresh(expense)

    # Check if auto_pay is now enabled
    is_auto_pay_enabled = expense.auto_pay and expense.payment_account_id

    if sync_historical and is_auto_pay_enabled:
        await backfill_expense_payments(db, user_id, expense, skip_existing=False)
    elif is_auto_pay_enabled and not was_auto_pay_enabled:
        await backfill_expense_payments(db, user_id, expense, skip_existing=True)

    if 'amount' in update_data or 'category' in update_data:
        await event_dispatcher.dispatch(
            ExpenseEvents.UPDATED,
            user_id=user_id, expense_id=str(expense.id), category=expense.category,
            amount=float(expense.amount), currency=expense.currency, name=expense.name,
        )

    return expense

async def delete_expense(
    db: AsyncSession,
    user_id: UUID,
    expense_id: UUID,
    commit: bool = True,
) -> bool:
    """Delete an expense"""
    expense = await get_expense(db, user_id, expense_id)
    if not expense:
        return False

    await db.delete(expense)
    if commit:
        await db.commit()
    else:
        await db.flush()
    return True

async def cancel_expense(
    db: AsyncSession,
    user_id: UUID,
    expense_id: UUID
) -> Optional[Expense]:
    """Cancel an expense (set status to cancelled)."""
    result = await db.execute(
        select(Expense).where(
            Expense.id == expense_id,
            Expense.user_id == user_id
        )
    )
    expense = result.scalar_one_or_none()

    if not expense:
        return None

    expense.status = ExpenseStatus.CANCELLED.value
    expense.updated_at = datetime.utcnow()

    await db.commit()
    await db.refresh(expense)

    return expense

async def get_expense_with_account_name(
    db: AsyncSession,
    user_id: UUID,
    expense_id: UUID
) -> Optional[Expense]:
    """
    Get expense with joined payment account name for display.
    """
    from app.modules.savings.models import SavingsAccount

    result = await db.execute(
        select(Expense, SavingsAccount.name.label('payment_account_name'))
        .outerjoin(SavingsAccount, Expense.payment_account_id == SavingsAccount.id)
        .where(
            Expense.id == expense_id,
            Expense.user_id == user_id
        )
    )
    row = result.first()

    if not row:
        return None

    expense = row[0]
    expense.payment_account_name = row[1]

    # Convert to user's display currency
    await convert_expense_to_display_currency(db, user_id, expense)

    return expense

async def list_expenses_with_account_names(
    db: AsyncSession,
    user_id: UUID,
    skip: int = 0,
    limit: int = 100,
    category: Optional[str] = None,
    is_active: Optional[bool] = None,
    status: Optional[str] = None
) -> tuple[List[Expense], int]:
    """
    List expenses with pagination, filters, and joined account names.
    """
    from app.modules.savings.models import SavingsAccount

    # Build query with join
    query = (
        select(Expense, SavingsAccount.name.label('payment_account_name'))
        .outerjoin(SavingsAccount, Expense.payment_account_id == SavingsAccount.id)
        .where(
            Expense.user_id == user_id,
            Expense.deleted_at.is_(None)
        )
    )

    # Apply filters
    if category:
        query = query.where(Expense.category == category)
    if is_active is not None:
        query = query.where(Expense.is_active == is_active)
    if status:
        query = query.where(Expense.status == status)

    # Get total count
    count_query = select(func.count()).select_from(
        select(Expense).where(
            Expense.user_id == user_id,
            Expense.deleted_at.is_(None)
        ).subquery()
    )

    if category:
        count_query = select(func.count()).select_from(
            select(Expense).where(
                Expense.user_id == user_id,
                Expense.category == category,
                Expense.deleted_at.is_(None)
            ).subquery()
        )

    total = await db.scalar(count_query)

    # Apply pagination and ordering
    query = query.order_by(
        func.coalesce(Expense.date, Expense.start_date).desc(),
        Expense.created_at.desc()
    ).offset(skip).limit(limit)

    result = await db.execute(query)
    rows = result.all()

    expenses = []
    for row in rows:
        expense = row[0]
        expense.payment_account_name = row[1]
        await convert_expense_to_display_currency(db, user_id, expense)
        expenses.append(expense)

    return expenses, total or 0
