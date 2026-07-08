"""Dashboard recent activity, upcoming payments, alerts, and failed payments."""
from datetime import datetime, date, timedelta
from decimal import Decimal
from uuid import UUID

from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.savings.models import SavingsAccount
from app.modules.installments.models import Installment
from app.modules.income.models import IncomeSource
from app.modules.expenses.models import Expense
from app.modules.subscriptions.models import Subscription
from app.modules.goals.models import Goal
from app.modules.dashboard.schemas import (
    NetWorthResponse,
    CashFlowResponse,
    FinancialHealthResponse,
    RecentActivityItem,
    UpcomingPayment,
    FinancialAlert,
)
from app.services.currency_service import CurrencyService
from app.modules.dashboard.service.common import get_user_display_currency


async def get_recent_activity(
    db: AsyncSession,
    user_id: UUID,
    limit: int = 10
) -> list[RecentActivityItem]:
    """
    Get recent transactions from all modules.

    Aggregates:
    - Income sources (as income)
    - Expenses (as expenses)
    - Subscriptions (as recurring expenses)
    - Installments (as debt payments)
    """
    activities = []

    # Get recent income sources
    income_query = select(IncomeSource).where(
        IncomeSource.user_id == user_id
    ).order_by(IncomeSource.created_at.desc()).limit(5)
    income_result = await db.execute(income_query)
    income_sources = income_result.scalars().all()

    for source in income_sources:
        if source.created_at:
            activities.append(RecentActivityItem(
                id=source.id,
                module="income",
                type="income_source",
                name=source.name,
                amount=source.amount,
                currency=source.currency,
                date=source.created_at,
                icon="TrendingUp",
                is_positive=True
            ))

    # Get recent expenses
    expenses_query = select(Expense).where(
        Expense.user_id == user_id
    ).order_by(Expense.date.desc()).limit(5)
    expenses_result = await db.execute(expenses_query)
    expenses = expenses_result.scalars().all()

    for expense in expenses:
        if expense.date:
            activities.append(RecentActivityItem(
                id=expense.id,
                module="expenses",
                type="expense",
                name=expense.name,
                amount=expense.amount,
                currency=expense.currency,
                date=expense.date,
                icon="TrendingDown",
                is_positive=False
            ))

    # Get recent subscriptions
    subscriptions_query = select(Subscription).where(
        and_(
            Subscription.user_id == user_id,
            Subscription.is_active == True
        )
    ).order_by(Subscription.created_at.desc()).limit(3)
    subscriptions_result = await db.execute(subscriptions_query)
    subscriptions = subscriptions_result.scalars().all()

    for subscription in subscriptions:
        # Use start_date or created_at for activity feed
        activity_date = subscription.start_date or subscription.created_at
        if activity_date:
            activities.append(RecentActivityItem(
                id=subscription.id,
                module="subscriptions",
                type="subscription",
                name=subscription.name,
                amount=subscription.amount,
                currency=subscription.currency,
                date=activity_date,
                icon="Repeat",
                is_positive=False
            ))

    # Sort all activities by date and limit. Activities come from tables with mixed
    # tz-aware (BaseModel.created_at) and tz-naive (Expense/Subscription.date) datetimes,
    # which can't be compared directly — normalize the sort key to naive (the returned
    # item.date values are left untouched).
    activities.sort(
        key=lambda x: x.date.replace(tzinfo=None) if x.date and x.date.tzinfo else x.date,
        reverse=True,
    )
    return activities[:limit]


async def get_upcoming_payments(
    db: AsyncSession,
    user_id: UUID,
    days: int = 7
) -> list[UpcomingPayment]:
    """
    Get upcoming subscription renewals, installment payments, and tax payments.

    Returns payments due in the next N days.
    """
    from app.modules.taxes.models import Tax

    today = date.today()
    end_date_dt = datetime.combine(today + timedelta(days=days), datetime.max.time())
    payments = []

    # Get user's display currency for reference
    display_currency = await get_user_display_currency(db, user_id)
    currency_service = CurrencyService(db)

    # =========================================================================
    # Subscriptions with next_payment_date
    # =========================================================================
    subscriptions_query = select(Subscription).where(
        and_(
            Subscription.user_id == user_id,
            Subscription.is_active == True,
            Subscription.next_payment_date.isnot(None),
            Subscription.next_payment_date <= end_date_dt
        )
    )
    subscriptions_result = await db.execute(subscriptions_query)
    subscriptions = subscriptions_result.scalars().all()

    for sub in subscriptions:
        if sub.next_payment_date:
            due_date = sub.next_payment_date.date() if isinstance(sub.next_payment_date, datetime) else sub.next_payment_date
            days_until = (due_date - today).days

            # Convert amount to display currency
            if sub.currency == display_currency:
                amount = sub.amount
            else:
                converted = await currency_service.convert_amount(
                    sub.amount, sub.currency, display_currency
                )
                amount = converted if converted else sub.amount

            payments.append(UpcomingPayment(
                id=sub.id,
                module="subscriptions",
                name=sub.name,
                amount=amount,
                currency=display_currency,
                due_date=due_date,
                days_until_due=days_until,
                is_overdue=days_until < 0
            ))

    # =========================================================================
    # Installments with next_payment_date
    # =========================================================================
    installments_query = select(Installment).where(
        and_(
            Installment.user_id == user_id,
            Installment.is_active == True,
            Installment.next_payment_date.isnot(None),
            Installment.next_payment_date <= end_date_dt
        )
    )
    installments_result = await db.execute(installments_query)
    installments = installments_result.scalars().all()

    for inst in installments:
        if inst.next_payment_date:
            due_date = inst.next_payment_date.date() if isinstance(inst.next_payment_date, datetime) else inst.next_payment_date
            days_until = (due_date - today).days

            # Convert amount to display currency
            if inst.currency == display_currency:
                amount = inst.amount_per_payment
            else:
                converted = await currency_service.convert_amount(
                    inst.amount_per_payment, inst.currency, display_currency
                )
                amount = converted if converted else inst.amount_per_payment

            payments.append(UpcomingPayment(
                id=inst.id,
                module="installments",
                name=inst.name,
                amount=amount,
                currency=display_currency,
                due_date=due_date,
                days_until_due=days_until,
                is_overdue=days_until < 0
            ))

    # =========================================================================
    # Taxes with next_payment_date
    # =========================================================================
    taxes_query = select(Tax).where(
        and_(
            Tax.user_id == user_id,
            Tax.is_active == True,
            Tax.deleted_at.is_(None),
            Tax.next_payment_date.isnot(None),
            Tax.next_payment_date <= end_date_dt
        )
    )
    taxes_result = await db.execute(taxes_query)
    taxes = taxes_result.scalars().all()

    for tax in taxes:
        if tax.next_payment_date:
            due_date = tax.next_payment_date.date() if isinstance(tax.next_payment_date, datetime) else tax.next_payment_date
            days_until = (due_date - today).days

            # Get tax amount (fixed or calculate percentage)
            if tax.tax_type == "fixed" and tax.fixed_amount:
                amount = tax.fixed_amount
            else:
                # For percentage taxes, we'd need income data - use 0 as placeholder
                amount = Decimal('0')

            # Convert amount to display currency
            if tax.currency == display_currency:
                converted_amount = amount
            else:
                converted = await currency_service.convert_amount(
                    amount, tax.currency, display_currency
                )
                converted_amount = converted if converted else amount

            payments.append(UpcomingPayment(
                id=tax.id,
                module="taxes",
                name=tax.name,
                amount=converted_amount,
                currency=display_currency,
                due_date=due_date,
                days_until_due=days_until,
                is_overdue=days_until < 0
            ))

    # Sort by due date (earliest first, overdue at top)
    payments.sort(key=lambda x: (x.days_until_due >= 0, x.due_date))

    return payments


async def get_financial_alerts(
    db: AsyncSession,
    user_id: UUID,
    net_worth_data: NetWorthResponse,
    cash_flow_data: CashFlowResponse,
    health_data: FinancialHealthResponse
) -> list[FinancialAlert]:
    """
    Generate financial alerts/notifications based on user's financial data.

    Alerts include:
    - High spending compared to income
    - Low emergency fund
    - Goals near completion
    - Subscription renewals coming soon
    - Low savings rate
    """
    alerts = []
    alert_counter = 0

    # Alert 1: High spending (expenses > 80% of income)
    if cash_flow_data.monthly_income > 0:
        expense_ratio = (cash_flow_data.monthly_expenses / cash_flow_data.monthly_income) * 100
        if expense_ratio > 80:
            alert_counter += 1
            alerts.append(FinancialAlert(
                id=f"alert_{alert_counter}",
                type="warning",
                category="spending",
                title="High Spending Alert",
                message=f"Your expenses are {expense_ratio:.0f}% of your income this month. Consider reviewing your spending.",
                priority=4,
                actionable=True,
                action_url="/dashboard/expenses"
            ))

    # Alert 2: Low emergency fund
    if health_data.emergency_fund_score < 10:
        alert_counter += 1
        alerts.append(FinancialAlert(
            id=f"alert_{alert_counter}",
            type="danger",
            category="savings",
            title="Low Emergency Fund",
            message="Your emergency fund is below the recommended 3 months of expenses. Consider building your safety net.",
            priority=5,
            actionable=True,
            action_url="/dashboard/savings"
        ))

    # Alert 3: Low savings rate
    if cash_flow_data.savings_rate < 10 and cash_flow_data.savings_rate >= 0:
        alert_counter += 1
        alerts.append(FinancialAlert(
            id=f"alert_{alert_counter}",
            type="warning",
            category="savings",
            title="Low Savings Rate",
            message=f"You're saving {cash_flow_data.savings_rate:.1f}% of your income. Financial experts recommend at least 20%.",
            priority=3,
            actionable=True,
            action_url="/dashboard/income"
        ))

    # Alert 4: Negative cash flow
    if cash_flow_data.net_cash_flow < 0:
        alert_counter += 1
        alerts.append(FinancialAlert(
            id=f"alert_{alert_counter}",
            type="danger",
            category="spending",
            title="Negative Cash Flow",
            message=f"You're spending ${abs(cash_flow_data.net_cash_flow):.2f} more than you earn this month.",
            priority=5,
            actionable=True,
            action_url="/dashboard/expenses"
        ))

    # Alert 5: Check for goals near completion (>80%)
    goals_query = select(Goal).where(
        and_(
            Goal.user_id == user_id,
            Goal.is_active == True,
            Goal.is_completed == False,
            Goal.progress_percentage >= 80
        )
    )
    goals_result = await db.execute(goals_query)
    near_complete_goals = goals_result.scalars().all()

    if near_complete_goals:
        for goal in near_complete_goals:
            alert_counter += 1
            alerts.append(FinancialAlert(
                id=f"alert_{alert_counter}",
                type="success",
                category="goal",
                title="Goal Almost Complete!",
                message=f"'{goal.name}' is {goal.progress_percentage:.0f}% complete. You're almost there!",
                priority=2,
                actionable=True,
                action_url="/dashboard/goals"
            ))

    # Alert 6: High debt-to-income ratio
    if health_data.debt_to_income_score < 10:
        alert_counter += 1
        alerts.append(FinancialAlert(
            id=f"alert_{alert_counter}",
            type="warning",
            category="debt",
            title="High Debt-to-Income Ratio",
            message="Your debt payments are high compared to your income. Consider a debt paydown plan.",
            priority=4,
            actionable=True,
            action_url="/dashboard/installments"
        ))

    # Alert 7: No investment diversity
    if health_data.investment_diversity_score < 10:
        alert_counter += 1
        alerts.append(FinancialAlert(
            id=f"alert_{alert_counter}",
            type="info",
            category="investment",
            title="Low Investment Diversity",
            message="Consider diversifying your portfolio across different asset types to reduce risk.",
            priority=2,
            actionable=True,
            action_url="/dashboard/portfolio"
        ))

    # Alert 8: Positive achievement - Good financial health
    if health_data.score >= 80:
        alert_counter += 1
        alerts.append(FinancialAlert(
            id=f"alert_{alert_counter}",
            type="success",
            category="achievement",
            title="Excellent Financial Health!",
            message=f"Your financial health score is {health_data.score}/100. Keep up the great work!",
            priority=1,
            actionable=False
        ))

    # Sort by priority (highest first)
    alerts.sort(key=lambda x: x.priority, reverse=True)

    return alerts


async def get_failed_payments(db: AsyncSession, user_id: UUID):
    """
    Get all failed payments across expenses, installments, and subscriptions.

    Returns payments that failed due to insufficient funds and need attention.
    """
    from app.modules.expenses.models import Expense as ExpenseModel, ExpenseStatus
    from app.modules.subscriptions.models import Subscription as SubscriptionModel
    from app.modules.dashboard.schemas import FailedPaymentsResponse, FailedPaymentItem

    failed_items = []

    # Get failed expenses (status = payment_failed)
    expenses_query = select(ExpenseModel).where(
        and_(
            ExpenseModel.user_id == user_id,
            ExpenseModel.status == ExpenseStatus.PAYMENT_FAILED.value,
            ExpenseModel.deleted_at.is_(None)
        )
    )
    expenses_result = await db.execute(expenses_query)
    failed_expenses = expenses_result.scalars().all()

    for expense in failed_expenses:
        # Get account name if linked
        account_name = None
        if expense.payment_account_id:
            account_result = await db.execute(
                select(SavingsAccount.name).where(SavingsAccount.id == expense.payment_account_id)
            )
            account_name = account_result.scalar_one_or_none()

        failed_items.append(FailedPaymentItem(
            id=expense.id,
            payment_type="expense",
            name=expense.name,
            amount=expense.amount,
            currency=expense.currency,
            account_name=account_name,
            account_id=expense.payment_account_id,
            failure_date=expense.updated_at,
            status=expense.status
        ))

    # Get failed subscriptions (status = payment_failed)
    from app.modules.subscriptions.models import SubscriptionStatus
    subscriptions_query = select(SubscriptionModel).where(
        and_(
            SubscriptionModel.user_id == user_id,
            SubscriptionModel.status == SubscriptionStatus.PAYMENT_FAILED.value
        )
    )
    subscriptions_result = await db.execute(subscriptions_query)
    failed_subscriptions = subscriptions_result.scalars().all()

    for subscription in failed_subscriptions:
        # Get account name if linked
        account_name = None
        if subscription.payment_account_id:
            account_result = await db.execute(
                select(SavingsAccount.name).where(SavingsAccount.id == subscription.payment_account_id)
            )
            account_name = account_result.scalar_one_or_none()

        failed_items.append(FailedPaymentItem(
            id=subscription.id,
            payment_type="subscription",
            name=subscription.name,
            amount=subscription.amount,
            currency=subscription.currency,
            account_name=account_name,
            account_id=subscription.payment_account_id,
            failure_date=subscription.updated_at,
            status=subscription.status
        ))

    # Get failed installment payments
    # Note: Installments use InstallmentPaymentStatus.FAILED for failed payments
    from app.modules.installments.models import InstallmentPayment, InstallmentPaymentStatus

    failed_installment_payments_query = select(InstallmentPayment).where(
        InstallmentPayment.status == InstallmentPaymentStatus.FAILED.value
    ).join(Installment).where(Installment.user_id == user_id)
    failed_installment_payments_result = await db.execute(failed_installment_payments_query)
    failed_installment_payments = failed_installment_payments_result.scalars().all()

    for payment in failed_installment_payments:
        # Get the installment details
        installment_result = await db.execute(
            select(Installment).where(Installment.id == payment.installment_id)
        )
        installment = installment_result.scalar_one_or_none()

        if installment:
            # Get account name if linked
            account_name = None
            if installment.payment_account_id:
                account_result = await db.execute(
                    select(SavingsAccount.name).where(SavingsAccount.id == installment.payment_account_id)
                )
                account_name = account_result.scalar_one_or_none()

            failed_items.append(FailedPaymentItem(
                id=installment.id,
                payment_type="installment",
                name=installment.name,
                amount=payment.scheduled_amount,
                currency=installment.currency,
                account_name=account_name,
                account_id=installment.payment_account_id,
                failure_date=payment.created_at,
                status=payment.status
            ))

    # Sort by failure date (most recent first)
    failed_items.sort(key=lambda x: x.failure_date, reverse=True)

    return FailedPaymentsResponse(
        items=failed_items,
        total=len(failed_items),
        has_failed_payments=len(failed_items) > 0
    )
