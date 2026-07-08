"""Expense payment processing and due/overdue queries."""
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
from .common import convert_expense_to_display_currency, logger

async def pay_expense(
    db: AsyncSession,
    user_id: UUID,
    expense_id: UUID,
    pay_request: PayExpenseRequest
) -> PayExpenseResponse:
    """
    Mark expense as paid and optionally deduct from linked account.

    Args:
        db: Database session
        user_id: User ID
        expense_id: Expense ID to pay
        pay_request: Payment request with optional account_id, amount, payment_method

    Returns:
        PayExpenseResponse with payment details

    Raises:
        ValueError: If expense not found or already paid
        InsufficientFundsError: If account has insufficient balance
    """
    from app.modules.savings.transaction_service import TransactionService, InsufficientFundsError

    # Get expense
    result = await db.execute(
        select(Expense).where(
            Expense.id == expense_id,
            Expense.user_id == user_id
        )
    )
    expense = result.scalar_one_or_none()

    if not expense:
        raise ValueError("Expense not found")

    if expense.status == ExpenseStatus.PAID.value:
        raise ValueError("Expense is already paid")

    # Determine payment details
    account_id = pay_request.account_id or expense.payment_account_id
    amount = pay_request.amount or expense.amount
    payment_method = pay_request.payment_method or expense.payment_method

    now = datetime.utcnow()
    account_transaction_id = None

    # If account specified, create withdrawal transaction
    if account_id:
        from app.modules.savings.models import SavingsAccount
        from app.services.currency_service import CurrencyService

        transaction_service = TransactionService(db)

        # Get account to check currency
        account_result = await db.execute(
            select(SavingsAccount).where(SavingsAccount.id == account_id)
        )
        account = account_result.scalar_one_or_none()

        # Handle currency conversion if needed
        source_currency = None
        exchange_rate = None
        if account and expense.currency and expense.currency != account.currency:
            source_currency = expense.currency
            currency_service = CurrencyService(db)
            exchange_rate = await currency_service.get_exchange_rate(
                expense.currency, account.currency
            )
            if not exchange_rate:
                logger.warning(
                    f"Could not get exchange rate from {expense.currency} to {account.currency} "
                    f"for expense {expense_id}, using 1:1"
                )
                exchange_rate = Decimal("1")

        try:
            # Create withdrawal from the linked account
            transaction = await transaction_service.create_withdrawal(
                account_id=account_id,
                user_id=user_id,
                amount=Decimal(str(amount)),
                description=pay_request.description or f"Payment for expense: {expense.name}",
                source_type="expense",
                source_id=expense_id,
                transaction_date=now,
                category=expense.category,
                source_currency=source_currency,
                exchange_rate=exchange_rate,
            )
            account_transaction_id = transaction.id
            logger.info(f"Created withdrawal transaction {transaction.id} for expense {expense_id}")
        except InsufficientFundsError as e:
            raise InsufficientFundsError(str(e))

    # Update expense status
    expense.status = ExpenseStatus.PAID.value
    expense.paid_date = now
    expense.paid_amount = amount
    expense.account_transaction_id = account_transaction_id
    expense.payment_method = payment_method
    expense.updated_at = now

    await db.commit()
    await db.refresh(expense)

    logger.info(f"Expense {expense_id} marked as paid")

    return PayExpenseResponse(
        expense_id=expense_id,
        account_transaction_id=account_transaction_id,
        paid_amount=amount,
        paid_date=now,
        status=ExpenseStatus.PAID.value,
        message="Expense paid successfully" + (
            " and deducted from account" if account_transaction_id else ""
        )
    )

async def get_pending_expenses(
    db: AsyncSession,
    user_id: UUID,
    skip: int = 0,
    limit: int = 100
) -> tuple[List[Expense], int]:
    """Get all pending expenses for a user."""
    query = select(Expense).where(
        and_(
            Expense.user_id == user_id,
            Expense.status == ExpenseStatus.PENDING.value,
            Expense.is_active == True,
            Expense.deleted_at.is_(None)
        )
    )

    # Get total count
    count_query = select(func.count()).select_from(query.subquery())
    total = await db.scalar(count_query)

    # Apply pagination and ordering
    query = query.order_by(
        func.coalesce(Expense.date, Expense.start_date).asc()
    ).offset(skip).limit(limit)

    result = await db.execute(query)
    expenses = result.scalars().all()

    # Convert to display currency
    for expense in expenses:
        await convert_expense_to_display_currency(db, user_id, expense)

    return list(expenses), total or 0

async def get_overdue_expenses(
    db: AsyncSession,
    user_id: UUID,
    skip: int = 0,
    limit: int = 100
) -> tuple[List[Expense], int]:
    """Get all overdue expenses for a user."""
    query = select(Expense).where(
        and_(
            Expense.user_id == user_id,
            Expense.status == ExpenseStatus.OVERDUE.value,
            Expense.is_active == True,
            Expense.deleted_at.is_(None)
        )
    )

    # Get total count
    count_query = select(func.count()).select_from(query.subquery())
    total = await db.scalar(count_query)

    # Apply pagination and ordering
    query = query.order_by(
        func.coalesce(Expense.date, Expense.start_date).asc()
    ).offset(skip).limit(limit)

    result = await db.execute(query)
    expenses = result.scalars().all()

    # Convert to display currency
    for expense in expenses:
        await convert_expense_to_display_currency(db, user_id, expense)

    return list(expenses), total or 0

async def mark_expenses_overdue(db: AsyncSession) -> int:
    """
    Mark pending expenses as overdue if their due date has passed.
    This is typically called by a Celery task.

    Returns:
        Number of expenses marked as overdue
    """
    now = datetime.utcnow()

    # Find pending expenses where the due date has passed
    result = await db.execute(
        select(Expense).where(
            and_(
                Expense.status == ExpenseStatus.PENDING.value,
                Expense.is_active == True,
                Expense.deleted_at.is_(None),
                # For one-time expenses, check date
                # For recurring expenses, check start_date
                func.coalesce(Expense.date, Expense.start_date) < now
            )
        )
    )
    expenses = result.scalars().all()

    count = 0
    for expense in expenses:
        expense.status = ExpenseStatus.OVERDUE.value
        expense.updated_at = now
        count += 1

    if count > 0:
        await db.commit()
        logger.info(f"Marked {count} expenses as overdue")

    return count
