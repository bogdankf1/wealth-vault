"""Installment payment processing, backfill, reversal and due queries."""
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_, or_
from typing import Optional, Tuple
from uuid import UUID
from decimal import Decimal
from datetime import datetime
from dateutil.relativedelta import relativedelta
from app.modules.installments.models import Installment, InstallmentPayment
from app.services.currency_service import CurrencyService
from .common import calculate_next_installment_payment_date, calculate_remaining_balance, logger

async def process_installment_payment(
    db: AsyncSession,
    installment: Installment,
    payment_number: int = None,
    payment_date: datetime = None,
    amount: Decimal = None,
    notes: str = None
) -> Optional[InstallmentPayment]:
    """
    Process an installment payment - create expense, deduct from account, record payment.

    Returns the payment record if successful, None if failed.
    """
    from app.modules.savings.transaction_service import TransactionService
    from app.modules.expenses.models import Expense, ExpenseFrequency

    if payment_date is None:
        payment_date = datetime.utcnow()

    if amount is None:
        amount = installment.amount_per_payment

    if payment_number is None:
        payment_number = installment.payments_made + 1

    payment_date = payment_date.replace(tzinfo=None) if payment_date.tzinfo else payment_date

    # Calculate scheduled date for this payment number
    frequency_delta = {
        "weekly": relativedelta(weeks=1),
        "biweekly": relativedelta(weeks=2),
        "monthly": relativedelta(months=1),
    }
    delta = frequency_delta.get(installment.frequency, relativedelta(months=1))
    scheduled_date = installment.first_payment_date + (delta * (payment_number - 1))
    if scheduled_date.tzinfo:
        scheduled_date = scheduled_date.replace(tzinfo=None)

    # Calculate if payment is late
    is_late = payment_date.date() > scheduled_date.date()
    days_late = (payment_date.date() - scheduled_date.date()).days if is_late else None

    # Calculate principal/interest split (simple approximation)
    principal_amount = None
    interest_amount = None
    if installment.interest_rate and installment.interest_rate > 0:
        # Simple interest calculation: remaining balance * (annual rate / 12) for monthly payments
        remaining = installment.remaining_balance or installment.total_amount
        monthly_rate = installment.interest_rate / Decimal('100') / Decimal('12')
        interest_amount = remaining * monthly_rate
        principal_amount = amount - interest_amount if amount > interest_amount else Decimal('0')
    else:
        principal_amount = amount
        interest_amount = Decimal('0')

    try:
        # Create expense record for this payment
        expense = Expense(
            user_id=installment.user_id,
            name=f"{installment.name} - Payment #{payment_number}",
            description=f"Auto-generated from installment: {installment.name}",
            category=installment.category or "Installments",
            amount=amount,
            currency=installment.currency,
            frequency=ExpenseFrequency.ONE_TIME,
            date=payment_date,
            is_active=True,
            status="paid",
            paid_date=payment_date,
            paid_amount=amount,
            payment_account_id=installment.payment_account_id,
            payment_method="transfer" if installment.payment_account_id else None,
        )
        db.add(expense)
        await db.flush()

        account_transaction_id = None

        # If auto_pay is enabled and account is linked, deduct from account
        if installment.auto_pay and installment.payment_account_id:
            from app.modules.savings.transaction_service import InsufficientFundsError
            from app.modules.savings.models import SavingsAccount
            from app.services.currency_service import CurrencyService
            try:
                transaction_service = TransactionService(db)

                # Get account to check currency
                account_result = await db.execute(
                    select(SavingsAccount).where(SavingsAccount.id == installment.payment_account_id)
                )
                account = account_result.scalar_one_or_none()

                # Handle currency conversion if needed
                source_currency = None
                exchange_rate = None
                if account and installment.currency != account.currency:
                    source_currency = installment.currency
                    currency_service = CurrencyService(db)
                    exchange_rate = await currency_service.get_exchange_rate(
                        installment.currency, account.currency
                    )
                    if not exchange_rate:
                        logger.warning(
                            f"Could not get exchange rate from {installment.currency} to {account.currency} "
                            f"for installment {installment.id}, using 1:1"
                        )
                        exchange_rate = Decimal("1")

                transaction = await transaction_service.create_withdrawal(
                    account_id=installment.payment_account_id,
                    user_id=installment.user_id,
                    amount=Decimal(str(amount)),
                    description=f"Installment payment: {installment.name} (#{payment_number})",
                    source_type="installment",
                    source_id=installment.id,
                    transaction_date=payment_date,
                    category=installment.category or "Installments",
                    source_currency=source_currency,
                    exchange_rate=exchange_rate,
                )
                account_transaction_id = transaction.id
                expense.account_transaction_id = transaction.id
            except InsufficientFundsError:
                # Re-raise InsufficientFundsError to be handled by caller
                raise
            except Exception as e:
                logger.warning(f"Failed to create withdrawal for installment {installment.id}: {e}")
                # Continue without the withdrawal - payment still recorded

        # Create payment record
        payment = InstallmentPayment(
            installment_id=installment.id,
            user_id=installment.user_id,
            payment_number=payment_number,
            scheduled_date=scheduled_date,
            actual_payment_date=payment_date,
            scheduled_amount=installment.amount_per_payment,
            actual_amount=amount,
            principal_amount=principal_amount,
            interest_amount=interest_amount,
            currency=installment.currency,
            expense_id=expense.id,
            account_transaction_id=account_transaction_id,
            status="completed",
            is_late=is_late,
            days_late=days_late,
            notes=notes,
        )
        db.add(payment)

        # Update installment dates and payment count
        installment.last_payment_date = payment_date
        installment.payments_made = payment_number
        installment.remaining_balance = calculate_remaining_balance(
            installment.total_amount,
            installment.amount_per_payment,
            installment.payments_made,
            installment.interest_rate
        )
        installment.next_payment_date = calculate_next_installment_payment_date(
            installment.first_payment_date,
            installment.frequency,
            installment.number_of_payments,
            payment_date
        )

        # Check if installment is complete
        if installment.payments_made >= installment.number_of_payments:
            installment.status = "completed"
            installment.is_active = False
            installment.remaining_balance = Decimal('0')

        await db.flush()

        logger.info(f"Processed installment payment #{payment_number} for {installment.name}: {amount} {installment.currency}")
        return payment

    except Exception as e:
        logger.error(f"Error processing installment payment for {installment.id}: {e}")
        raise

async def backfill_installment_payments(
    db: AsyncSession,
    installment: Installment,
    from_date: datetime = None
) -> int:
    """
    Create historical payment records for an installment from first_payment_date to now.
    Used when linking a payment account with sync_historical enabled.

    Returns the number of payments created.
    """
    if from_date is None:
        from_date = installment.first_payment_date

    from_date = from_date.replace(tzinfo=None) if from_date.tzinfo else from_date
    now = datetime.utcnow()

    # Get existing payment numbers to avoid duplicates
    existing_result = await db.execute(
        select(InstallmentPayment.payment_number).where(
            InstallmentPayment.installment_id == installment.id
        )
    )
    existing_numbers = {row[0] for row in existing_result.fetchall()}

    # Calculate all payment dates from start to now
    frequency_delta = {
        "weekly": relativedelta(weeks=1),
        "biweekly": relativedelta(weeks=2),
        "monthly": relativedelta(months=1),
    }
    delta = frequency_delta.get(installment.frequency, relativedelta(months=1))

    payments_created = 0
    payments_skipped = 0
    payment_date = from_date

    for payment_num in range(1, installment.number_of_payments + 1):
        if payment_date > now:
            break

        if payment_num in existing_numbers:
            payments_skipped += 1
            payment_date = payment_date + delta
            continue

        try:
            await process_installment_payment(
                db=db,
                installment=installment,
                payment_number=payment_num,
                payment_date=payment_date,
                notes="Historical payment (backfilled)"
            )
            payments_created += 1
        except Exception as e:
            logger.error(f"Error creating backfill payment #{payment_num} for {installment.id}: {e}")

        payment_date = payment_date + delta

    logger.info(f"Backfilled {payments_created} payments for installment {installment.name} (skipped {payments_skipped} existing)")
    return payments_created

async def reverse_installment_payments(
    db: AsyncSession,
    installment_id: UUID,
    user_id: UUID
) -> int:
    """
    Reverse all payments for an installment (soft delete expenses, reverse transactions).
    Used when changing payment account with sync_historical.
    """
    from app.modules.savings.transaction_service import TransactionService

    # Get all payments for this installment
    result = await db.execute(
        select(InstallmentPayment).where(
            and_(
                InstallmentPayment.installment_id == installment_id,
                InstallmentPayment.user_id == user_id
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

    # Update installment - reset payments_made and recalculate
    installment_result = await db.execute(
        select(Installment).where(Installment.id == installment_id)
    )
    installment = installment_result.scalar_one_or_none()
    if installment:
        installment.payments_made = 0
        installment.last_payment_date = None
        installment.remaining_balance = installment.total_amount
        installment.next_payment_date = calculate_next_installment_payment_date(
            installment.first_payment_date,
            installment.frequency,
            installment.number_of_payments
        )

    logger.info(f"Reversed {reversed_count} payments for installment {installment_id}")
    return reversed_count

async def get_installment_payments(
    db: AsyncSession,
    installment_id: UUID,
    user_id: UUID,
    skip: int = 0,
    limit: int = 50
) -> Tuple[list[InstallmentPayment], int]:
    """Get payment history for an installment."""
    query = select(InstallmentPayment).where(
        and_(
            InstallmentPayment.installment_id == installment_id,
            InstallmentPayment.user_id == user_id
        )
    ).order_by(InstallmentPayment.payment_number.desc())

    # Get total count
    count_query = select(func.count()).select_from(query.subquery())
    total_result = await db.execute(count_query)
    total = total_result.scalar_one()

    # Apply pagination
    query = query.offset(skip).limit(limit)
    result = await db.execute(query)
    payments = list(result.scalars().all())

    return payments, total

async def get_due_installments(
    db: AsyncSession,
    as_of_date: datetime = None
) -> list[Installment]:
    """Get all installments with payments due on or before the given date."""
    if as_of_date is None:
        as_of_date = datetime.utcnow()

    as_of_date = as_of_date.replace(tzinfo=None) if as_of_date.tzinfo else as_of_date

    result = await db.execute(
        select(Installment).where(
            and_(
                Installment.is_active == True,
                Installment.status == "active",
                Installment.next_payment_date <= as_of_date
            )
        )
    )

    return list(result.scalars().all())

async def get_installments_for_reminder(
    db: AsyncSession,
    as_of_date: datetime = None
) -> list[Installment]:
    """Get installments that need payment reminders."""
    if as_of_date is None:
        as_of_date = datetime.utcnow()

    as_of_date = as_of_date.replace(tzinfo=None) if as_of_date.tzinfo else as_of_date

    result = await db.execute(
        select(Installment).where(
            and_(
                Installment.is_active == True,
                Installment.status == "active",
                Installment.next_payment_date.isnot(None)
            )
        )
    )

    installments = list(result.scalars().all())

    # Filter by reminder window and check if reminder was already sent
    reminders_due = []
    for inst in installments:
        if inst.next_payment_date is None:
            continue

        next_payment = inst.next_payment_date.replace(tzinfo=None) if inst.next_payment_date.tzinfo else inst.next_payment_date
        days_until = (next_payment - as_of_date).days

        # Check if within reminder window
        if 0 <= days_until <= inst.reminder_days_before:
            # Check if reminder was already sent for this period
            if inst.last_reminder_at is None:
                reminders_due.append(inst)
            else:
                last_reminder = inst.last_reminder_at.replace(tzinfo=None) if inst.last_reminder_at.tzinfo else inst.last_reminder_at
                # Only send if last reminder was before the current payment window
                if last_reminder < (next_payment - relativedelta(days=inst.reminder_days_before + 1)):
                    reminders_due.append(inst)

    return reminders_due
