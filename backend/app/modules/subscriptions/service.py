"""
Subscriptions module service layer
"""
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_, or_
from typing import Optional, Tuple, List
from uuid import UUID
from decimal import Decimal
from datetime import datetime
from dateutil.relativedelta import relativedelta
import logging

from app.modules.subscriptions.models import Subscription, SubscriptionPayment
from app.modules.subscriptions.schemas import (
    SubscriptionCreate,
    SubscriptionUpdate,
    SubscriptionStats
)
from app.services.currency_service import CurrencyService

logger = logging.getLogger(__name__)


async def get_user_display_currency(db: AsyncSession, user_id: UUID) -> str:
    """Get user's preferred display currency"""
    from app.models.user_preferences import UserPreferences
    prefs_result = await db.execute(
        select(UserPreferences).where(UserPreferences.user_id == user_id)
    )
    user_prefs = prefs_result.scalar_one_or_none()
    return user_prefs.display_currency if user_prefs and user_prefs.display_currency else "USD"


async def convert_subscription_to_display_currency(db: AsyncSession, user_id: UUID, subscription: Subscription) -> None:
    """
    Convert subscription amount to user's display currency.
    Modifies the subscription object in-place, adding display_amount and display_currency attributes.
    """
    display_currency = await get_user_display_currency(db, user_id)

    # If subscription is already in display currency, no conversion needed
    if subscription.currency == display_currency:
        subscription.display_amount = subscription.amount
        subscription.display_currency = display_currency
        # Calculate and set display_monthly_equivalent
        subscription.display_monthly_equivalent = calculate_monthly_equivalent(subscription.amount, subscription.frequency)
        return

    # Convert using currency service
    currency_service = CurrencyService(db)
    converted_amount = await currency_service.convert_amount(
        subscription.amount,
        subscription.currency,
        display_currency
    )

    # Set converted values as display values
    if converted_amount is not None:
        subscription.display_amount = converted_amount
        subscription.display_currency = display_currency

        # Also convert monthly equivalent
        monthly_amount = calculate_monthly_equivalent(subscription.amount, subscription.frequency)
        if monthly_amount:
            converted_monthly = await currency_service.convert_amount(
                monthly_amount,
                subscription.currency,
                display_currency
            )
            subscription.display_monthly_equivalent = converted_monthly if converted_monthly else monthly_amount
        else:
            subscription.display_monthly_equivalent = None
    else:
        # Fallback to original values if conversion fails
        subscription.display_amount = subscription.amount
        subscription.display_currency = subscription.currency
        subscription.display_monthly_equivalent = calculate_monthly_equivalent(subscription.amount, subscription.frequency)


def calculate_monthly_equivalent(amount: Decimal, frequency: str) -> Decimal:
    """Calculate monthly equivalent amount based on frequency"""
    frequency_to_monthly = {
        "monthly": 1,
        "quarterly": Decimal("0.333333"),
        "annually": Decimal("0.083333"),
        "biannually": Decimal("0.166667"),
    }
    multiplier = frequency_to_monthly.get(frequency, 1)
    return amount * Decimal(str(multiplier))


async def create_subscription(
    db: AsyncSession,
    user_id: UUID,
    subscription_data: SubscriptionCreate,
    commit: bool = True,
) -> Subscription:
    """Create a new subscription"""
    data = subscription_data.model_dump(exclude={'sync_historical'})
    sync_historical = subscription_data.sync_historical

    subscription = Subscription(
        user_id=user_id,
        **data
    )

    # Calculate next payment date
    subscription.next_payment_date = calculate_next_payment_date(
        subscription.start_date,
        subscription.frequency
    )

    db.add(subscription)

    if not commit:
        # Caller owns the transaction (agent action layer: atomic entity+audit). Flush only;
        # skip commit and the historical-payment backfill (agent path links no payment account).
        await db.flush()
        await db.refresh(subscription)
        return subscription

    await db.commit()
    await db.refresh(subscription)

    if sync_historical and subscription.payment_account_id:
        await backfill_subscription_payments(db, subscription)
        await db.commit()
        await db.refresh(subscription)

    return subscription


async def get_subscription(
    db: AsyncSession,
    user_id: UUID,
    subscription_id: UUID
) -> Optional[Subscription]:
    """Get a single subscription"""
    query = select(Subscription).where(
        and_(
            Subscription.id == subscription_id,
            Subscription.user_id == user_id
        )
    )
    result = await db.execute(query)
    return result.scalar_one_or_none()


async def list_subscriptions(
    db: AsyncSession,
    user_id: UUID,
    skip: int = 0,
    limit: int = 50,
    category: Optional[str] = None,
    frequency: Optional[str] = None,
    is_active: Optional[bool] = None
) -> Tuple[List[Subscription], int]:
    """List subscriptions with filters"""
    query = select(Subscription).where(Subscription.user_id == user_id)

    # Apply filters
    if category:
        query = query.where(Subscription.category == category)
    if frequency:
        query = query.where(Subscription.frequency == frequency)
    if is_active is not None:
        query = query.where(Subscription.is_active == is_active)

    # Get total count
    count_query = select(func.count()).select_from(query.subquery())
    total_result = await db.execute(count_query)
    total = total_result.scalar_one()

    # Apply pagination
    query = query.order_by(Subscription.created_at.desc())
    query = query.offset(skip).limit(limit)

    result = await db.execute(query)
    subscriptions = result.scalars().all()

    return list(subscriptions), total


async def update_subscription(
    db: AsyncSession,
    user_id: UUID,
    subscription_id: UUID,
    subscription_data: SubscriptionUpdate
) -> Optional[Subscription]:
    """Update a subscription"""
    subscription = await get_subscription(db, user_id, subscription_id)
    if not subscription:
        return None

    update_dict = subscription_data.model_dump(exclude_unset=True)
    sync_historical = update_dict.pop('sync_historical', False)
    old_payment_account_id = subscription.payment_account_id
    new_payment_account_id = update_dict.get('payment_account_id')

    # Check if payment account is being changed
    account_changing = (
        'payment_account_id' in update_dict and
        new_payment_account_id != old_payment_account_id
    )

    for key, value in update_dict.items():
        setattr(subscription, key, value)

    # Recalculate next payment date if frequency or start_date changed
    if 'frequency' in update_dict or 'start_date' in update_dict:
        subscription.next_payment_date = calculate_next_payment_date(
            subscription.start_date,
            subscription.frequency
        )

    subscription.updated_at = datetime.utcnow()
    await db.commit()
    await db.refresh(subscription)

    # Handle sync_historical request
    print(f"[DEBUG] Update subscription: sync_historical={sync_historical}, payment_account_id={subscription.payment_account_id}, auto_pay={subscription.auto_pay}")
    logger.info(f"Update subscription: sync_historical={sync_historical}, payment_account_id={subscription.payment_account_id}, auto_pay={subscription.auto_pay}")
    if sync_historical and subscription.payment_account_id:
        print(f"[DEBUG] Backfilling payments for subscription {subscription.name}, auto_pay={subscription.auto_pay}")
        logger.info(f"Backfilling payments for subscription {subscription.name}, auto_pay={subscription.auto_pay}")
        if account_changing:
            # Account is changing - reverse old payments first
            if old_payment_account_id:
                await reverse_subscription_payments(db, subscription_id, user_id)

        # Backfill payments for the current/new account
        payments_created = await backfill_subscription_payments(db, subscription)
        logger.info(f"Backfill complete: {payments_created} payments created for {subscription.name}")
        await db.commit()
        await db.refresh(subscription)

    return subscription


async def delete_subscription(
    db: AsyncSession,
    user_id: UUID,
    subscription_id: UUID
) -> bool:
    """Delete a subscription"""
    subscription = await get_subscription(db, user_id, subscription_id)
    if not subscription:
        return False

    await db.delete(subscription)
    await db.commit()
    return True


async def get_subscription_stats(
    db: AsyncSession,
    user_id: UUID,
    start_date: Optional[datetime] = None,
    end_date: Optional[datetime] = None
) -> SubscriptionStats:
    """Get subscription statistics, optionally filtered by date range"""
    # Get display currency
    display_currency = await get_user_display_currency(db, user_id)
    currency_service = CurrencyService(db)

    # Get subscriptions with optional date filtering
    if start_date and end_date:
        # Remove timezone info for comparison
        filter_start = start_date.replace(tzinfo=None)
        filter_end = end_date.replace(tzinfo=None)

        # When date filtering is applied, only get active subscriptions
        # Subscriptions overlap if: start_date <= period_end AND (end_date is NULL OR end_date >= period_start)
        query = select(Subscription).where(
            and_(
                Subscription.user_id == user_id,
                Subscription.is_active == True,
                Subscription.start_date <= filter_end,
                or_(
                    Subscription.end_date.is_(None),
                    Subscription.end_date >= filter_start
                )
            )
        )
    else:
        query = select(Subscription).where(Subscription.user_id == user_id)

    result = await db.execute(query)
    subscriptions = result.scalars().all()

    # Calculate subscription counts based on whether date filtering is applied
    if start_date and end_date:
        # When date range is provided, count only active subscriptions in range
        total_subscriptions = len(subscriptions)
        active_subscriptions = len(subscriptions)
    else:
        # When no date range, count all subscriptions and active subscriptions separately
        from sqlalchemy import case
        all_subscriptions_query = select(
            func.count(Subscription.id).label("total"),
            func.sum(
                case((Subscription.is_active == True, 1), else_=0)
            ).label("active")
        ).where(Subscription.user_id == user_id)
        all_subscriptions_result = await db.execute(all_subscriptions_query)
        all_subscriptions_stats = all_subscriptions_result.one()
        total_subscriptions = all_subscriptions_stats.total or 0
        active_subscriptions = all_subscriptions_stats.active or 0

    # Calculate costs normalized to monthly and annual
    monthly_cost = Decimal(0)
    total_annual_cost = Decimal(0)
    by_category = {}
    by_frequency = {}

    # Frequency multipliers to convert to monthly
    frequency_to_monthly = {
        "monthly": 1,
        "quarterly": 1/3,
        "annually": 1/12,
        "biannually": 1/6,
    }

    # Frequency multipliers to convert to annual
    frequency_to_annual = {
        "monthly": 12,
        "quarterly": 4,
        "annually": 1,
        "biannually": 2,
    }

    for subscription in subscriptions:
        if subscription.is_active:
            # Convert amount to display currency first
            amount_in_display = subscription.amount
            if subscription.currency != display_currency:
                converted = await currency_service.convert_amount(
                    subscription.amount,
                    subscription.currency,
                    display_currency
                )
                if converted is not None:
                    amount_in_display = converted

            # Calculate monthly cost
            multiplier = frequency_to_monthly.get(subscription.frequency, 1)
            monthly_equivalent = amount_in_display * Decimal(str(multiplier))
            monthly_cost += monthly_equivalent

            # Calculate annual cost
            annual_multiplier = frequency_to_annual.get(subscription.frequency, 12)
            annual_equivalent = amount_in_display * Decimal(str(annual_multiplier))
            total_annual_cost += annual_equivalent

            # Group by category
            if subscription.category:
                category_monthly = by_category.get(subscription.category, Decimal(0))
                by_category[subscription.category] = category_monthly + monthly_equivalent

        # Count by frequency
        freq = subscription.frequency
        by_frequency[freq] = by_frequency.get(freq, 0) + 1

    return SubscriptionStats(
        total_subscriptions=total_subscriptions,
        active_subscriptions=active_subscriptions,
        monthly_cost=monthly_cost,
        total_annual_cost=total_annual_cost,
        by_category=by_category,
        by_frequency=by_frequency
    )


async def get_subscription_history(
    db: AsyncSession,
    user_id: UUID,
    start_date: Optional[datetime] = None,
    end_date: Optional[datetime] = None
) -> dict:
    """Get subscription cost history grouped by month."""
    from collections import defaultdict
    from dateutil.relativedelta import relativedelta
    from app.modules.subscriptions.models import Subscription
    from app.modules.subscriptions.schemas import MonthlySubscriptionHistory, SubscriptionHistoryResponse
    
    # Get user's display currency
    display_currency = await get_user_display_currency(db, user_id)
    
    # Frequency multipliers for monthly cost
    frequency_to_monthly = {
        'monthly': Decimal('1'),
        'quarterly': Decimal('0.333333'),
        'biannually': Decimal('0.166667'),
        'annually': Decimal('0.083333'),
    }
    
    # Remove timezone info
    if start_date:
        start_date = start_date.replace(tzinfo=None)
    if end_date:
        end_date = end_date.replace(tzinfo=None)
    
    # Get all active subscriptions
    result = await db.execute(
        select(Subscription).where(
            Subscription.user_id == user_id,
            Subscription.is_active == True
        )
    )
    subscriptions = result.scalars().all()
    
    currency_service = CurrencyService(db)
    monthly_data = defaultdict(lambda: {"total": Decimal(0), "count": 0})
    
    for sub in subscriptions:
        # Check if subscription is within date range (if dates provided)
        if start_date and end_date:
            sub_in_range = False

            # Subscriptions are all recurring, check if start_date/end_date overlaps with range
            sub_start = sub.start_date.replace(tzinfo=None) if sub.start_date and sub.start_date.tzinfo else sub.start_date
            sub_end = sub.end_date.replace(tzinfo=None) if sub.end_date and sub.end_date.tzinfo else sub.end_date

            if sub_start:
                # Subscription starts before or during the range
                if sub_end:
                    # Has end date: check overlap
                    if sub_start <= end_date and sub_end >= start_date:
                        sub_in_range = True
                else:
                    # No end date: ongoing, check if it started before range ends
                    if sub_start <= end_date:
                        sub_in_range = True

            if not sub_in_range:
                continue

        # Convert to display currency
        if sub.currency == display_currency:
            converted_amount = sub.amount
        else:
            converted_amount = await currency_service.convert_amount(
                sub.amount, sub.currency, display_currency
            )
            if converted_amount is None:
                converted_amount = sub.amount

        amount = Decimal(str(converted_amount))

        # Calculate monthly equivalent
        multiplier = frequency_to_monthly.get(sub.frequency, Decimal('1'))
        monthly_equiv = amount * multiplier

        if not sub.start_date:
            continue
        
        sub_start = sub.start_date.replace(tzinfo=None) if sub.start_date.tzinfo else sub.start_date
        sub_end = sub.end_date.replace(tzinfo=None) if sub.end_date and sub.end_date.tzinfo else sub.end_date
        
        # Determine date range
        range_start = max(sub_start, start_date) if start_date else sub_start
        range_end = min(sub_end, end_date) if sub_end and end_date else (sub_end or end_date)
        
        # If no end date, project 12 months forward
        if not range_end:
            range_end = datetime.now() + relativedelta(months=12)
        
        # Generate months
        current_month = range_start.replace(day=1)
        end_month = range_end.replace(day=1)
        
        while current_month <= end_month:
            month_key = current_month.strftime('%Y-%m')
            monthly_data[month_key]["total"] += monthly_equiv
            monthly_data[month_key]["count"] += 1
            current_month += relativedelta(months=1)
    
    # Convert to list and sort
    history = [
        MonthlySubscriptionHistory(
            month=month,
            total=data["total"],
            count=data["count"],
            currency=display_currency
        )
        for month, data in sorted(monthly_data.items())
    ]
    
    # Calculate overall average
    total_months = len(history)
    overall_average = Decimal(0)
    if total_months > 0:
        total_sum = sum(item.total for item in history)
        overall_average = total_sum / Decimal(total_months)
    
    return SubscriptionHistoryResponse(
        history=history,
        total_months=total_months,
        overall_average=overall_average,
        currency=display_currency
    )


# ============== Payment Integration Functions ==============

def calculate_next_payment_date(start_date: datetime, frequency: str, from_date: datetime = None) -> datetime:
    """
    Calculate the next payment date based on frequency.
    If from_date is provided, calculates next date after from_date.
    """
    if from_date is None:
        from_date = datetime.utcnow()

    # Remove timezone info for comparison
    start = start_date.replace(tzinfo=None) if start_date.tzinfo else start_date
    current = from_date.replace(tzinfo=None) if from_date.tzinfo else from_date

    # Frequency to relativedelta mapping
    frequency_delta = {
        "monthly": relativedelta(months=1),
        "quarterly": relativedelta(months=3),
        "biannually": relativedelta(months=6),
        "annually": relativedelta(years=1),
    }

    delta = frequency_delta.get(frequency, relativedelta(months=1))

    # Start from the subscription start date and advance until we pass current date
    next_date = start
    while next_date <= current:
        next_date = next_date + delta

    return next_date


def calculate_period_dates(payment_date: datetime, frequency: str) -> Tuple[datetime, datetime]:
    """Calculate billing period start and end for a payment."""
    frequency_delta = {
        "monthly": relativedelta(months=1),
        "quarterly": relativedelta(months=3),
        "biannually": relativedelta(months=6),
        "annually": relativedelta(years=1),
    }

    delta = frequency_delta.get(frequency, relativedelta(months=1))
    period_start = payment_date
    period_end = payment_date + delta - relativedelta(days=1)

    return period_start, period_end


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


async def pause_subscription(
    db: AsyncSession,
    subscription: Subscription,
    resume_date: datetime = None
) -> Subscription:
    """Pause a subscription, optionally with a resume date."""
    subscription.status = "paused"
    subscription.paused_at = datetime.utcnow()
    subscription.resume_date = resume_date
    subscription.is_active = False
    subscription.updated_at = datetime.utcnow()

    await db.commit()
    await db.refresh(subscription)

    logger.info(f"Paused subscription {subscription.name}")
    return subscription


async def resume_subscription(
    db: AsyncSession,
    subscription: Subscription
) -> Subscription:
    """Resume a paused subscription."""
    subscription.status = "active"
    subscription.paused_at = None
    subscription.resume_date = None
    subscription.is_active = True
    subscription.updated_at = datetime.utcnow()

    # Recalculate next payment date from now
    subscription.next_payment_date = calculate_next_payment_date(
        subscription.start_date,
        subscription.frequency,
        datetime.utcnow()
    )

    await db.commit()
    await db.refresh(subscription)

    logger.info(f"Resumed subscription {subscription.name}")
    return subscription


async def cancel_subscription(
    db: AsyncSession,
    subscription: Subscription
) -> Subscription:
    """Cancel a subscription."""
    subscription.status = "cancelled"
    subscription.is_active = False
    subscription.end_date = datetime.utcnow()
    subscription.updated_at = datetime.utcnow()

    await db.commit()
    await db.refresh(subscription)

    logger.info(f"Cancelled subscription {subscription.name}")
    return subscription


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
