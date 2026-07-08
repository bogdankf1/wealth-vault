"""Subscription payment processing, backfill, reversal and due queries."""
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_, or_
from typing import Optional, Tuple, List
from uuid import UUID
from decimal import Decimal
from datetime import datetime
from dateutil.relativedelta import relativedelta
from app.modules.subscriptions.models import Subscription, SubscriptionPayment
from app.services.currency_service import CurrencyService
from .common import calculate_next_payment_date, calculate_period_dates, logger

async def process_subscription_payment(
    db: AsyncSession,
    subscription: Subscription,
    payment_date: datetime = None,
    notes: str = None
) -> Optional[SubscriptionPayment]:
    """
    Process a subscription payment - create expense, deduct from account, record payment.

    Returns the payment record if successful, None if failed.
    """
    from app.modules.savings.transaction_service import TransactionService
    from app.modules.expenses.models import Expense, ExpenseFrequency

    if payment_date is None:
        payment_date = datetime.utcnow()

    payment_date = payment_date.replace(tzinfo=None) if payment_date.tzinfo else payment_date
    period_start, period_end = calculate_period_dates(payment_date, subscription.frequency)

    try:
        # Create expense record for this payment
        expense = Expense(
            user_id=subscription.user_id,
            name=f"{subscription.name} - Subscription",
            description=f"Auto-generated from subscription: {subscription.name}",
            category=subscription.category or "Subscriptions",
            amount=subscription.amount,
            currency=subscription.currency,
            frequency=ExpenseFrequency.ONE_TIME,
            date=payment_date,
            is_active=True,
            status="paid",
            paid_date=payment_date,
            paid_amount=subscription.amount,
            payment_account_id=subscription.payment_account_id,
            payment_method="transfer" if subscription.payment_account_id else None,
        )
        db.add(expense)
        await db.flush()

        account_transaction_id = None

        # If auto_pay is enabled and account is linked, deduct from account
        if subscription.auto_pay and subscription.payment_account_id:
            from app.modules.savings.transaction_service import InsufficientFundsError
            from app.modules.savings.models import SavingsAccount
            from app.services.currency_service import CurrencyService
            try:
                transaction_service = TransactionService(db)

                # Get account to check currency
                account_result = await db.execute(
                    select(SavingsAccount).where(SavingsAccount.id == subscription.payment_account_id)
                )
                account = account_result.scalar_one_or_none()

                # Handle currency conversion if needed
                source_currency = None
                exchange_rate = None
                if account and subscription.currency != account.currency:
                    source_currency = subscription.currency
                    currency_service = CurrencyService(db)
                    exchange_rate = await currency_service.get_exchange_rate(
                        subscription.currency, account.currency
                    )
                    if not exchange_rate:
                        logger.warning(
                            f"Could not get exchange rate from {subscription.currency} to {account.currency} "
                            f"for subscription {subscription.id}, using 1:1"
                        )
                        exchange_rate = Decimal("1")

                transaction = await transaction_service.create_withdrawal(
                    account_id=subscription.payment_account_id,
                    user_id=subscription.user_id,
                    amount=Decimal(str(subscription.amount)),
                    description=f"Subscription payment: {subscription.name}",
                    source_type="subscription",
                    source_id=subscription.id,
                    transaction_date=payment_date,
                    category=subscription.category or "Subscriptions",
                    source_currency=source_currency,
                    exchange_rate=exchange_rate,
                )
                account_transaction_id = transaction.id
                expense.account_transaction_id = transaction.id
            except InsufficientFundsError:
                # Re-raise InsufficientFundsError to be handled by caller
                raise
            except Exception as e:
                logger.warning(f"Failed to create withdrawal for subscription {subscription.id}: {e}")
                # Continue without the withdrawal - payment still recorded

        # Create payment record
        payment = SubscriptionPayment(
            subscription_id=subscription.id,
            user_id=subscription.user_id,
            amount=subscription.amount,
            currency=subscription.currency,
            payment_date=payment_date,
            period_start=period_start,
            period_end=period_end,
            expense_id=expense.id,
            account_transaction_id=account_transaction_id,
            status="completed",
            notes=notes,
        )
        db.add(payment)

        # Update subscription dates
        subscription.last_payment_date = payment_date
        subscription.next_payment_date = calculate_next_payment_date(
            subscription.start_date,
            subscription.frequency,
            payment_date
        )

        await db.flush()

        logger.info(f"Processed subscription payment for {subscription.name}: {subscription.amount} {subscription.currency}")
        return payment

    except Exception as e:
        logger.error(f"Error processing subscription payment for {subscription.id}: {e}")
        raise

async def backfill_subscription_payments(
    db: AsyncSession,
    subscription: Subscription,
    from_date: datetime = None
) -> int:
    """
    Create historical payment records for a subscription from start_date to now.
    Used when linking a payment account with sync_historical enabled.

    Returns the number of payments created.
    """
    if from_date is None:
        from_date = subscription.start_date

    from_date = from_date.replace(tzinfo=None) if from_date.tzinfo else from_date
    now = datetime.utcnow()

    # Get existing payment dates to avoid duplicates
    existing_result = await db.execute(
        select(SubscriptionPayment.payment_date).where(
            SubscriptionPayment.subscription_id == subscription.id
        )
    )
    existing_dates = {
        row[0].date() if row[0] else None
        for row in existing_result.fetchall()
    }

    # Calculate all payment dates from start to now
    payment_dates = []
    current_date = from_date

    while current_date <= now:
        payment_dates.append(current_date)
        current_date = calculate_next_payment_date(
            from_date,
            subscription.frequency,
            current_date
        )

    payments_created = 0
    payments_skipped = 0

    for payment_date in payment_dates:
        # Skip if payment already exists for this date
        if payment_date.date() in existing_dates:
            payments_skipped += 1
            continue

        try:
            await process_subscription_payment(
                db=db,
                subscription=subscription,
                payment_date=payment_date,
                notes="Historical payment (backfilled)"
            )
            payments_created += 1
        except Exception as e:
            logger.error(f"Error creating backfill payment for {subscription.id} on {payment_date}: {e}")

    logger.info(f"Backfilled {payments_created} payments for subscription {subscription.name} (skipped {payments_skipped} existing)")
    return payments_created

async def reverse_subscription_payments(
    db: AsyncSession,
    subscription_id: UUID,
    user_id: UUID
) -> int:
    """
    Reverse all payments for a subscription (soft delete expenses, reverse transactions).
    Used when changing payment account with sync_historical.
    """
    from app.modules.savings.transaction_service import TransactionService

    # Get all payments for this subscription
    result = await db.execute(
        select(SubscriptionPayment).where(
            and_(
                SubscriptionPayment.subscription_id == subscription_id,
                SubscriptionPayment.user_id == user_id
            )
        )
    )
    payments = list(result.scalars().all())

    reversed_count = 0
    transaction_service = TransactionService(db)

    for payment in payments:
        try:
            # Reverse account transaction if exists
            if payment.account_transaction_id:
                await transaction_service.reverse_transaction(payment.account_transaction_id, user_id)

            # Soft delete the expense if exists
            if payment.expense_id:
                from app.modules.expenses.models import Expense
                expense_result = await db.execute(
                    select(Expense).where(Expense.id == payment.expense_id)
                )
                expense = expense_result.scalar_one_or_none()
                if expense:
                    expense.deleted_at = datetime.utcnow()
                    expense.is_active = False

            # Delete the payment record
            await db.delete(payment)
            reversed_count += 1

        except Exception as e:
            logger.error(f"Error reversing payment {payment.id}: {e}")

    logger.info(f"Reversed {reversed_count} payments for subscription {subscription_id}")
    return reversed_count

async def get_subscription_payments(
    db: AsyncSession,
    subscription_id: UUID,
    user_id: UUID,
    skip: int = 0,
    limit: int = 50
) -> Tuple[List[SubscriptionPayment], int]:
    """Get payment history for a subscription."""
    query = select(SubscriptionPayment).where(
        and_(
            SubscriptionPayment.subscription_id == subscription_id,
            SubscriptionPayment.user_id == user_id
        )
    ).order_by(SubscriptionPayment.payment_date.desc())

    # Get total count
    count_query = select(func.count()).select_from(query.subquery())
    total_result = await db.execute(count_query)
    total = total_result.scalar_one()

    # Apply pagination
    query = query.offset(skip).limit(limit)
    result = await db.execute(query)
    payments = list(result.scalars().all())

    return payments, total

async def get_due_subscriptions(
    db: AsyncSession,
    as_of_date: datetime = None
) -> List[Subscription]:
    """Get all subscriptions with payments due on or before the given date."""
    if as_of_date is None:
        as_of_date = datetime.utcnow()

    as_of_date = as_of_date.replace(tzinfo=None) if as_of_date.tzinfo else as_of_date

    result = await db.execute(
        select(Subscription).where(
            and_(
                Subscription.is_active == True,
                Subscription.status == "active",
                Subscription.next_payment_date <= as_of_date
            )
        )
    )

    return list(result.scalars().all())

async def get_subscriptions_for_reminder(
    db: AsyncSession,
    as_of_date: datetime = None
) -> List[Subscription]:
    """Get subscriptions that need renewal reminders."""
    if as_of_date is None:
        as_of_date = datetime.utcnow()

    as_of_date = as_of_date.replace(tzinfo=None) if as_of_date.tzinfo else as_of_date

    result = await db.execute(
        select(Subscription).where(
            and_(
                Subscription.is_active == True,
                Subscription.status == "active",
                Subscription.next_payment_date.isnot(None)
            )
        )
    )

    subscriptions = list(result.scalars().all())

    # Filter by reminder window and check if reminder was already sent
    reminders_due = []
    for sub in subscriptions:
        if sub.next_payment_date is None:
            continue

        next_payment = sub.next_payment_date.replace(tzinfo=None) if sub.next_payment_date.tzinfo else sub.next_payment_date
        days_until = (next_payment - as_of_date).days

        # Check if within reminder window
        if 0 <= days_until <= sub.reminder_days_before:
            # Check if reminder was already sent for this period
            if sub.last_reminder_at is None:
                reminders_due.append(sub)
            else:
                last_reminder = sub.last_reminder_at.replace(tzinfo=None) if sub.last_reminder_at.tzinfo else sub.last_reminder_at
                # Only send if last reminder was before the current payment window
                if last_reminder < (next_payment - relativedelta(days=sub.reminder_days_before + 1)):
                    reminders_due.append(sub)

    return reminders_due
