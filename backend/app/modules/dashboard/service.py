"""
Dashboard business logic and data aggregation.
"""
from datetime import datetime, date, timedelta
from decimal import Decimal
from typing import Optional
from uuid import UUID

from sqlalchemy import and_, func, select, or_
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.portfolio.models import PortfolioAsset
from app.modules.savings.models import SavingsAccount
from app.modules.installments.models import Installment
from app.modules.income.models import IncomeSource, IncomeFrequency
from app.modules.expenses.models import Expense
from app.modules.subscriptions.models import Subscription
from app.modules.goals.models import Goal
from app.modules.dashboard.schemas import (
    NetWorthResponse,
    CashFlowResponse,
    FinancialHealthResponse,
    FinancialHealthBreakdown,
    RecentActivityItem,
    UpcomingPayment,
    FinancialAlert,
    IncomeVsExpensesChartResponse,
    IncomeVsExpensesDataPoint,
    ExpenseByCategoryChartResponse,
    ExpenseByCategoryDataPoint,
    MonthlySpendingChartResponse,
    MonthlySpendingDataPoint,
    NetWorthTrendChartResponse,
    NetWorthTrendDataPoint,
    IncomeBreakdownChartResponse,
    IncomeBreakdownDataPoint,
)
from app.services.currency_service import CurrencyService


async def get_user_display_currency(db: AsyncSession, user_id: UUID) -> str:
    """Get user's preferred display currency"""
    from app.models.user_preferences import UserPreferences
    prefs_result = await db.execute(
        select(UserPreferences).where(UserPreferences.user_id == user_id)
    )
    user_prefs = prefs_result.scalar_one_or_none()
    return user_prefs.display_currency if user_prefs and user_prefs.display_currency else "USD"


async def get_net_worth(db: AsyncSession, user_id: UUID) -> NetWorthResponse:
    """
    Calculate net worth = (Portfolio + Savings) - Installments.

    Assets = Portfolio current value + Savings balance
    Liabilities = Installments remaining balance
    Net Worth = Assets - Liabilities

    All amounts are converted to user's display currency.
    """
    # Get user's display currency
    display_currency = await get_user_display_currency(db, user_id)
    currency_service = CurrencyService(db)

    # Get all portfolio assets with their currencies
    portfolio_query = select(PortfolioAsset).where(
        and_(
            PortfolioAsset.user_id == user_id,
            PortfolioAsset.is_active == True
        )
    )
    portfolio_result = await db.execute(portfolio_query)
    portfolio_assets = portfolio_result.scalars().all()

    # Convert portfolio values to display currency
    portfolio_value = Decimal('0')
    for asset in portfolio_assets:
        if asset.current_value:
            if asset.currency == display_currency:
                portfolio_value += asset.current_value
            else:
                converted = await currency_service.convert_amount(
                    asset.current_value, asset.currency, display_currency
                )
                if converted:
                    portfolio_value += converted

    # Get all savings accounts with their currencies
    savings_query = select(SavingsAccount).where(
        and_(
            SavingsAccount.user_id == user_id,
            SavingsAccount.is_active == True
        )
    )
    savings_result = await db.execute(savings_query)
    savings_accounts = savings_result.scalars().all()

    # Convert savings balances to display currency
    savings_balance = Decimal('0')
    for account in savings_accounts:
        if account.current_balance:
            if account.currency == display_currency:
                savings_balance += account.current_balance
            else:
                converted = await currency_service.convert_amount(
                    account.current_balance, account.currency, display_currency
                )
                if converted:
                    savings_balance += converted

    # Get all installments with their currencies
    installments_query = select(Installment).where(
        and_(
            Installment.user_id == user_id,
            Installment.is_active == True
        )
    )
    installments_result = await db.execute(installments_query)
    installments = installments_result.scalars().all()

    # Convert installment balances to display currency
    total_debt = Decimal('0')
    for installment in installments:
        if installment.remaining_balance:
            if installment.currency == display_currency:
                total_debt += installment.remaining_balance
            else:
                converted = await currency_service.convert_amount(
                    installment.remaining_balance, installment.currency, display_currency
                )
                if converted:
                    total_debt += converted

    # Calculate totals
    total_assets = portfolio_value + savings_balance
    total_liabilities = total_debt
    net_worth = total_assets - total_liabilities

    return NetWorthResponse(
        total_assets=total_assets,
        total_liabilities=total_liabilities,
        net_worth=net_worth,
        portfolio_value=portfolio_value,
        savings_balance=savings_balance,
        total_debt=total_debt,
        currency=display_currency
    )


async def get_cash_flow(
    db: AsyncSession,
    user_id: UUID,
    month: Optional[int] = None,
    year: Optional[int] = None,
    start_date: Optional[datetime] = None,
    end_date: Optional[datetime] = None
) -> CashFlowResponse:
    """
    Calculate cash flow for a period = Income - Expenses - Subscriptions - Installments.

    Can be called with either:
    1. month/year parameters (legacy) - calculates for that month
    2. start_date/end_date parameters - calculates for that date range
    3. no parameters - uses current month

    For date-based calculation:
    - Income: All active recurring sources (monthly equivalents)
    - Expenses: Date-filtered (one-time + recurring for period)
    - Subscriptions: All active (monthly equivalents)
    - Installments: All active (monthly payments)

    All amounts are converted to user's display currency.
    """
    # Handle date parameters
    if start_date and end_date:
        # Use provided date range
        start_date = start_date.replace(tzinfo=None)
        end_date = end_date.replace(tzinfo=None)
        target_month = start_date.month
        target_year = start_date.year
    elif month and year:
        # Legacy: convert month/year to date range
        start_date = datetime(year, month, 1).replace(tzinfo=None)
        # Last day of month
        if month == 12:
            end_date = datetime(year, 12, 31, 23, 59, 59).replace(tzinfo=None)
        else:
            end_date = (datetime(year, month + 1, 1) - timedelta(days=1)).replace(hour=23, minute=59, second=59, tzinfo=None)
        target_month = month
        target_year = year
    else:
        # Default to current month
        now = datetime.utcnow()
        target_month = now.month
        target_year = now.year
        start_date = datetime(target_year, target_month, 1).replace(tzinfo=None)
        if target_month == 12:
            end_date = datetime(target_year, 12, 31, 23, 59, 59).replace(tzinfo=None)
        else:
            end_date = (datetime(target_year, target_month + 1, 1) - timedelta(days=1)).replace(hour=23, minute=59, second=59, tzinfo=None)

    # Get user's display currency
    display_currency = await get_user_display_currency(db, user_id)
    currency_service = CurrencyService(db)

    # Frequency multipliers for calculating monthly equivalents
    frequency_to_monthly = {
        'daily': Decimal('30'),
        'weekly': Decimal('4.33333'),
        'biweekly': Decimal('2.16667'),
        'monthly': Decimal('1'),
        'quarterly': Decimal('0.333333'),
        'annually': Decimal('0.083333'),
    }

    # Get active income sources that overlap with the specified period
    # An income source overlaps if:
    # - For one-time: date falls within the period
    # - For recurring: start_date <= period_end AND (end_date is NULL OR end_date >= period_start)
    income_query = select(IncomeSource).where(
        and_(
            IncomeSource.user_id == user_id,
            IncomeSource.is_active == True,
            IncomeSource.deleted_at.is_(None),
            or_(
                # For one-time: date must fall within period
                and_(
                    IncomeSource.frequency == IncomeFrequency.ONE_TIME,
                    IncomeSource.date.isnot(None),
                    IncomeSource.date >= start_date,
                    IncomeSource.date <= end_date
                ),
                # For recurring: start_date <= period_end AND (end_date is NULL OR end_date >= period_start)
                and_(
                    IncomeSource.frequency != IncomeFrequency.ONE_TIME,
                    IncomeSource.start_date.isnot(None),
                    IncomeSource.start_date <= end_date,
                    or_(
                        IncomeSource.end_date.is_(None),
                        IncomeSource.end_date >= start_date
                    )
                )
            )
        )
    )
    income_result = await db.execute(income_query)
    income_sources = income_result.scalars().all()

    # Convert income to monthly equivalent in display currency
    total_income = Decimal('0')
    for source in income_sources:
        monthly_amount = source.calculate_monthly_amount()
        if monthly_amount:
            if source.currency == display_currency:
                total_income += monthly_amount
            else:
                converted = await currency_service.convert_amount(
                    monthly_amount, source.currency, display_currency
                )
                if converted:
                    total_income += converted

    # Get active expenses that overlap with the specified period
    # An expense overlaps if:
    # - For one-time: date falls within the period
    # - For recurring: start_date <= period_end AND (end_date is NULL OR end_date >= period_start)
    expenses_query = select(Expense).where(
        and_(
            Expense.user_id == user_id,
            Expense.is_active == True,
            or_(
                # For one-time: date must fall within period
                and_(
                    Expense.frequency == 'one_time',
                    Expense.date.isnot(None),
                    Expense.date >= start_date,
                    Expense.date <= end_date
                ),
                # For recurring: start_date <= period_end AND (end_date is NULL OR end_date >= period_start)
                and_(
                    Expense.frequency != 'one_time',
                    Expense.start_date.isnot(None),
                    Expense.start_date <= end_date,
                    or_(
                        Expense.end_date.is_(None),
                        Expense.end_date >= start_date
                    )
                )
            )
        )
    )
    expenses_result = await db.execute(expenses_query)
    expenses = expenses_result.scalars().all()

    # Calculate monthly expenses equivalent
    monthly_expenses = Decimal('0')
    for expense in expenses:
        if expense.amount:
            # Convert amount to display currency
            if expense.currency == display_currency:
                converted_amount = expense.amount
            else:
                converted_amount = await currency_service.convert_amount(
                    expense.amount, expense.currency, display_currency
                )
                if converted_amount is None:
                    converted_amount = expense.amount

            amount = Decimal(str(converted_amount))

            # Calculate monthly equivalent based on frequency
            if expense.frequency == 'one_time':
                # One-time expenses are already filtered by query
                monthly_expenses += amount
            else:
                # Recurring expenses: convert to monthly equivalent
                multiplier = frequency_to_monthly.get(expense.frequency, Decimal('1'))
                monthly_equiv = amount * multiplier
                monthly_expenses += monthly_equiv

    # Get active subscriptions that overlap with the specified period
    # A subscription overlaps if:
    # - start_date <= period_end AND
    # - (end_date is NULL OR end_date >= period_start)
    subscriptions_query = select(Subscription).where(
        and_(
            Subscription.user_id == user_id,
            Subscription.is_active == True,
            Subscription.start_date <= end_date,
            or_(
                Subscription.end_date.is_(None),
                Subscription.end_date >= start_date
            )
        )
    )
    subscriptions_result = await db.execute(subscriptions_query)
    subscriptions = subscriptions_result.scalars().all()

    # Frequency multipliers to convert to monthly
    frequency_to_monthly = {
        "monthly": 1,
        "quarterly": Decimal("0.333333"),
        "annually": Decimal("0.083333"),
        "biannually": Decimal("0.166667"),
    }

    # Convert subscriptions to monthly equivalent in display currency
    monthly_subscriptions = Decimal('0')
    for subscription in subscriptions:
        if subscription.amount:
            # Calculate monthly equivalent
            multiplier = frequency_to_monthly.get(subscription.frequency, Decimal('1'))
            monthly_amount = subscription.amount * multiplier

            if subscription.currency == display_currency:
                monthly_subscriptions += monthly_amount
            else:
                converted = await currency_service.convert_amount(
                    monthly_amount, subscription.currency, display_currency
                )
                if converted:
                    monthly_subscriptions += converted

    # Get active installments that overlap with the specified period
    # An installment overlaps if:
    # - start_date <= period_end AND
    # - (end_date is NULL OR end_date >= period_start)
    installments_query = select(Installment).where(
        and_(
            Installment.user_id == user_id,
            Installment.is_active == True,
            Installment.start_date <= end_date,
            or_(
                Installment.end_date.is_(None),
                Installment.end_date >= start_date
            )
        )
    )
    installments_result = await db.execute(installments_query)
    installments = installments_result.scalars().all()

    # Installment frequency multipliers to convert to monthly
    installment_frequency_to_monthly = {
        "monthly": Decimal("1"),
        "biweekly": Decimal("2.16667"),  # ~26 payments / 12 months
        "weekly": Decimal("4.33333"),    # ~52 payments / 12 months
    }

    # Convert installments to monthly equivalent in display currency
    monthly_installments = Decimal('0')
    for installment in installments:
        # Check if installment is paid off
        is_paid_off = installment.payments_made >= installment.number_of_payments

        # Only include if not paid off
        if installment.amount_per_payment and not is_paid_off:
            # Calculate monthly equivalent
            multiplier = installment_frequency_to_monthly.get(installment.frequency, Decimal('1'))
            monthly_amount = installment.amount_per_payment * multiplier

            if installment.currency == display_currency:
                monthly_installments += monthly_amount
            else:
                converted = await currency_service.convert_amount(
                    monthly_amount, installment.currency, display_currency
                )
                if converted:
                    monthly_installments += converted

    # Get all active taxes
    from app.modules.taxes.models import Tax
    taxes_query = select(Tax).where(
        and_(
            Tax.user_id == user_id,
            Tax.is_active == True,
            Tax.deleted_at.is_(None)
        )
    )
    taxes_result = await db.execute(taxes_query)
    taxes = taxes_result.scalars().all()

    # Tax frequency multipliers to convert to monthly
    tax_frequency_to_monthly = {
        "monthly": Decimal("1"),
        "quarterly": Decimal("0.333333"),  # Divide by 3
        "annually": Decimal("0.083333"),   # Divide by 12
    }

    # Convert taxes to monthly equivalent in display currency
    # Only calculate taxes if there's income in the period
    monthly_taxes = Decimal('0')
    if total_income > 0:
        for tax in taxes:
            if tax.tax_type == "fixed" and tax.fixed_amount:
                # Fixed amount taxes: convert to display currency and monthly equivalent
                if tax.currency == display_currency:
                    amount_in_display = tax.fixed_amount
                else:
                    converted = await currency_service.convert_amount(
                        tax.fixed_amount, tax.currency, display_currency
                    )
                    amount_in_display = converted if converted else tax.fixed_amount

                # Calculate monthly equivalent based on frequency
                multiplier = tax_frequency_to_monthly.get(tax.frequency, Decimal('1'))
                monthly_amount = amount_in_display * multiplier
                monthly_taxes += monthly_amount

            elif tax.tax_type == "percentage" and tax.percentage:
                # Percentage-based taxes: calculate as percentage of period income
                tax_amount = (total_income * tax.percentage) / Decimal("100")
                monthly_taxes += tax_amount

    # Calculate net cash flow
    net_cash_flow = total_income - monthly_expenses - monthly_subscriptions - monthly_installments - monthly_taxes

    # Calculate savings rate
    savings_rate = (net_cash_flow / total_income * Decimal('100')) if total_income > 0 else Decimal('0')

    return CashFlowResponse(
        monthly_income=total_income,
        monthly_expenses=monthly_expenses,
        monthly_subscriptions=monthly_subscriptions,
        monthly_installments=monthly_installments,
        monthly_taxes=monthly_taxes,
        net_cash_flow=net_cash_flow,
        savings_rate=savings_rate,
        currency=display_currency,
        month=target_month,
        year=target_year
    )


async def get_financial_health_score(
    db: AsyncSession,
    user_id: UUID
) -> FinancialHealthResponse:
    """
    Calculate financial health score (0-100) based on multiple factors.

    Components (20 points each):
    1. Emergency Fund: Savings >= 3-6 months of expenses
    2. Debt-to-Income Ratio: Total debt / monthly income < 36%
    3. Savings Rate: % of income saved (20%+ is excellent)
    4. Investment Diversity: Multiple asset types in portfolio
    5. Goals Progress: Average progress towards financial goals
    """
    # Get cash flow for calculations
    cash_flow = await get_cash_flow(db, user_id)
    net_worth = await get_net_worth(db, user_id)

    # 1. Emergency Fund Score (20 points)
    # Target: 3-6 months of expenses saved
    monthly_expenses_total = cash_flow.monthly_expenses + cash_flow.monthly_subscriptions + cash_flow.monthly_installments + cash_flow.monthly_taxes
    target_emergency_fund = monthly_expenses_total * Decimal('3')

    if target_emergency_fund > 0:
        emergency_fund_ratio = net_worth.savings_balance / target_emergency_fund
        emergency_fund_score = min(int(emergency_fund_ratio * 20), 20)
    else:
        emergency_fund_score = 20  # If no expenses, max score

    emergency_fund_breakdown = {
        "current_savings": float(net_worth.savings_balance),
        "target_fund": float(target_emergency_fund),
        "months_covered": float(net_worth.savings_balance / monthly_expenses_total) if monthly_expenses_total > 0 else 0
    }

    # 2. Debt-to-Income Ratio Score (20 points)
    # Target: <36% is good, <20% is excellent
    if cash_flow.monthly_income > 0:
        debt_to_income_ratio = (net_worth.total_debt / cash_flow.monthly_income) * Decimal('100')
        if debt_to_income_ratio <= 20:
            debt_to_income_score = 20
        elif debt_to_income_ratio <= 36:
            debt_to_income_score = int(20 - ((debt_to_income_ratio - 20) / 16 * 10))
        else:
            debt_to_income_score = max(int(10 - (debt_to_income_ratio - 36) / 5), 0)
    else:
        debt_to_income_ratio = Decimal('0')
        debt_to_income_score = 20 if net_worth.total_debt == 0 else 0

    debt_to_income_breakdown = {
        "ratio": float(debt_to_income_ratio),
        "total_debt": float(net_worth.total_debt),
        "monthly_income": float(cash_flow.monthly_income)
    }

    # 3. Savings Rate Score (20 points)
    # Target: 20%+ is excellent
    savings_rate = cash_flow.savings_rate
    if savings_rate >= 20:
        savings_rate_score = 20
    elif savings_rate >= 10:
        savings_rate_score = int(10 + (savings_rate - 10) / 10 * 10)
    elif savings_rate > 0:
        savings_rate_score = int(savings_rate / 10 * 10)
    else:
        savings_rate_score = 0

    savings_rate_breakdown = {
        "rate": float(savings_rate),
        "monthly_savings": float(cash_flow.net_cash_flow)
    }

    # 4. Investment Diversity Score (20 points)
    # Count unique asset types in portfolio
    asset_types_query = select(func.count(func.distinct(PortfolioAsset.asset_type))).where(
        and_(
            PortfolioAsset.user_id == user_id,
            PortfolioAsset.is_active == True
        )
    )
    asset_types_result = await db.execute(asset_types_query)
    unique_asset_types = asset_types_result.scalar() or 0

    # Score: 5 points per asset type, max 20
    investment_diversity_score = min(unique_asset_types * 5, 20)

    investment_diversity_breakdown = {
        "unique_asset_types": unique_asset_types,
        "portfolio_value": float(net_worth.portfolio_value)
    }

    # 5. Goals Progress Score (20 points)
    # Average progress of all goals (active OR completed)
    goals_query = select(func.avg(Goal.progress_percentage)).where(
        and_(
            Goal.user_id == user_id,
            or_(
                Goal.is_active == True,
                Goal.is_completed == True
            )
        )
    )
    goals_result = await db.execute(goals_query)
    avg_goal_progress = goals_result.scalar() or Decimal('0')

    goals_progress_score = int(float(avg_goal_progress) / 100 * 20)

    goals_progress_breakdown = {
        "average_progress": float(avg_goal_progress),
    }

    # Calculate total score
    total_score = (
        emergency_fund_score +
        debt_to_income_score +
        savings_rate_score +
        investment_diversity_score +
        goals_progress_score
    )

    # Determine rating
    if total_score >= 80:
        rating = "Excellent"
    elif total_score >= 60:
        rating = "Good"
    elif total_score >= 40:
        rating = "Fair"
    else:
        rating = "Needs Improvement"

    breakdown = FinancialHealthBreakdown(
        emergency_fund=emergency_fund_breakdown,
        debt_to_income=debt_to_income_breakdown,
        savings_rate=savings_rate_breakdown,
        investment_diversity=investment_diversity_breakdown,
        goals_progress=goals_progress_breakdown
    )

    return FinancialHealthResponse(
        score=total_score,
        emergency_fund_score=emergency_fund_score,
        debt_to_income_score=debt_to_income_score,
        savings_rate_score=savings_rate_score,
        investment_diversity_score=investment_diversity_score,
        goals_progress_score=goals_progress_score,
        breakdown=breakdown,
        rating=rating
    )


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

    # Sort all activities by date and limit
    activities.sort(key=lambda x: x.date, reverse=True)
    return activities[:limit]


async def get_upcoming_payments(
    db: AsyncSession,
    user_id: UUID,
    days: int = 7
) -> list[UpcomingPayment]:
    """
    Get upcoming subscription renewals and installment payments.

    Returns payments due in the next N days.
    """
    today = date.today()
    end_date = today + timedelta(days=days)
    payments = []

    # Note: Neither Subscriptions nor Installments have next_payment_date in their models
    # Future enhancement: Calculate next payment date from start_date/first_payment_date + frequency + payments_made
    # For now, return empty list

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
                title=f"Goal Almost Complete!",
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


# ============================================================================
# Analytics Functions for Charts
# ============================================================================

async def get_income_vs_expenses_chart(
    db: AsyncSession,
    user_id: UUID,
    start_date: datetime,
    end_date: datetime
) -> IncomeVsExpensesChartResponse:
    """
    Get income vs expenses chart data for the specified period.
    Uses the same logic as Cash Flow widget to ensure consistency.
    All amounts are converted to user's display currency.
    """
    from calendar import month_abbr
    from dateutil.relativedelta import relativedelta
    from datetime import timedelta

    # Remove timezone info to match database datetimes
    start_date = start_date.replace(tzinfo=None)
    end_date = end_date.replace(tzinfo=None)

    data_points = []
    current = start_date.replace(day=1)

    while current <= end_date:
        month_start = current
        month_end = (current + relativedelta(months=1)).replace(day=1) - timedelta(days=1)
        month_end = min(month_end, end_date)

        # Adjust month_start to respect the actual start_date if we're in the first month
        if current.year == start_date.year and current.month == start_date.month:
            month_start = start_date

        # Get cash flow data for this specific month
        cash_flow = await get_cash_flow(db, user_id, start_date=month_start, end_date=month_end)

        # Calculate total expenses (sum of all expense categories)
        # This matches exactly what Income Allocation widget shows
        total_expenses = (
            cash_flow.monthly_expenses +
            cash_flow.monthly_subscriptions +
            cash_flow.monthly_installments +
            cash_flow.monthly_taxes
        )

        # Format month label
        month_label = f"{month_abbr[current.month]} {current.year}"

        # Debug logging for October 2025
        if current.month == 10 and current.year == 2025:
            import logging
            logger = logging.getLogger(__name__)
            logger.info(f"=== Income vs Expenses DEBUG for {month_label} ===")
            logger.info(f"Monthly Income: {cash_flow.monthly_income}")
            logger.info(f"Monthly Expenses (total): {total_expenses}")
            logger.info(f"Breakdown:")
            logger.info(f"  Expenses: {cash_flow.monthly_expenses}")
            logger.info(f"  Subscriptions: {cash_flow.monthly_subscriptions}")
            logger.info(f"  Installments: {cash_flow.monthly_installments}")
            logger.info(f"  Taxes: {cash_flow.monthly_taxes}")

        data_points.append(IncomeVsExpensesDataPoint(
            month=month_label,
            income=cash_flow.monthly_income,
            expenses=total_expenses
        ))

        current += relativedelta(months=1)

    return IncomeVsExpensesChartResponse(data=data_points)


async def get_subscriptions_by_category_chart(
    db: AsyncSession,
    user_id: UUID,
    start_date: datetime,
    end_date: datetime
) -> ExpenseByCategoryChartResponse:
    """
    Get subscription breakdown by category (monthly equivalents) for the specified period.
    Shows active subscriptions that overlap with the period, grouped by category.
    All amounts are converted to user's display currency.
    """
    # Remove timezone info to match database datetimes
    start_date = start_date.replace(tzinfo=None)
    end_date = end_date.replace(tzinfo=None)

    # Get user's display currency
    display_currency = await get_user_display_currency(db, user_id)
    currency_service = CurrencyService(db)

    # Frequency multipliers for calculating monthly equivalents
    frequency_to_monthly = {
        'monthly': Decimal('1'),
        'quarterly': Decimal('0.333333'),  # Divide by 3
        'annually': Decimal('0.083333'),   # Divide by 12
        'biannually': Decimal('0.166667'), # Divide by 6
    }

    # Query active subscriptions that overlap with the specified period
    # A subscription overlaps if:
    # - start_date <= period_end AND
    # - (end_date is NULL OR end_date >= period_start)
    query = select(Subscription).where(
        and_(
            Subscription.user_id == user_id,
            Subscription.is_active == True,
            Subscription.start_date <= end_date,
            or_(
                Subscription.end_date.is_(None),
                Subscription.end_date >= start_date
            )
        )
    )

    result = await db.execute(query)
    subscriptions = result.scalars().all()

    # Group by category and convert to display currency
    category_totals = {}
    for subscription in subscriptions:
        # Use category or "Uncategorized"
        category = subscription.category or "Uncategorized"

        if subscription.amount:
            # Convert to display currency first
            if subscription.currency == display_currency:
                amount_in_display = subscription.amount
            else:
                amount_in_display = await currency_service.convert_amount(
                    subscription.amount, subscription.currency, display_currency
                )
                if not amount_in_display:
                    amount_in_display = Decimal('0')

            # Calculate monthly equivalent
            multiplier = frequency_to_monthly.get(subscription.frequency, Decimal('1'))
            monthly_amount = amount_in_display * multiplier

            if category not in category_totals:
                category_totals[category] = Decimal('0')
            category_totals[category] += monthly_amount

    # Calculate total and percentages
    total = sum(category_totals.values())

    if total == 0:
        return ExpenseByCategoryChartResponse(data=[], total=Decimal('0'))

    data_points = [
        ExpenseByCategoryDataPoint(
            category=category,
            amount=amount,
            percentage=float((amount / total) * 100)
        )
        for category, amount in category_totals.items()
    ]

    # Sort by amount descending
    data_points.sort(key=lambda x: x.amount, reverse=True)

    return ExpenseByCategoryChartResponse(data=data_points, total=total)


async def get_installments_by_category_chart(
    db: AsyncSession,
    user_id: UUID,
    start_date: datetime,
    end_date: datetime
) -> ExpenseByCategoryChartResponse:
    """
    Get installment breakdown by category (monthly equivalents) for the specified period.
    Shows active installments that overlap with the period, grouped by category.
    All amounts are converted to user's display currency.
    """
    # Remove timezone info to match database datetimes
    start_date = start_date.replace(tzinfo=None)
    end_date = end_date.replace(tzinfo=None)

    # Get user's display currency
    display_currency = await get_user_display_currency(db, user_id)
    currency_service = CurrencyService(db)

    # Frequency multipliers for calculating monthly equivalents
    frequency_to_monthly = {
        'monthly': Decimal('1'),
        'biweekly': Decimal('2.16667'),    # ~26 payments per year / 12
        'weekly': Decimal('4.33333'),      # ~52 weeks per year / 12
    }

    # Query active installments that overlap with the specified period
    # An installment overlaps if:
    # - start_date <= period_end AND
    # - (end_date is NULL OR end_date >= period_start)
    query = select(Installment).where(
        and_(
            Installment.user_id == user_id,
            Installment.is_active == True,
            Installment.start_date <= end_date,
            or_(
                Installment.end_date.is_(None),
                Installment.end_date >= start_date
            )
        )
    )

    result = await db.execute(query)
    installments = result.scalars().all()

    # Group by category and convert to display currency
    category_totals = {}
    for installment in installments:
        # Use category or "Uncategorized"
        category = installment.category or "Uncategorized"

        if installment.amount_per_payment:
            # Convert to display currency first
            if installment.currency == display_currency:
                amount_in_display = installment.amount_per_payment
            else:
                amount_in_display = await currency_service.convert_amount(
                    installment.amount_per_payment, installment.currency, display_currency
                )
                if not amount_in_display:
                    amount_in_display = Decimal('0')

            # Calculate monthly equivalent
            multiplier = frequency_to_monthly.get(installment.frequency, Decimal('1'))
            monthly_amount = amount_in_display * multiplier

            if category not in category_totals:
                category_totals[category] = Decimal('0')
            category_totals[category] += monthly_amount

    # Calculate total and percentages
    total = sum(category_totals.values())

    if total == 0:
        return ExpenseByCategoryChartResponse(data=[], total=Decimal('0'))

    data_points = [
        ExpenseByCategoryDataPoint(
            category=category,
            amount=amount,
            percentage=float((amount / total) * 100)
        )
        for category, amount in category_totals.items()
    ]

    # Sort by amount descending
    data_points.sort(key=lambda x: x.amount, reverse=True)

    return ExpenseByCategoryChartResponse(data=data_points, total=total)


async def get_monthly_spending_chart(
    db: AsyncSession,
    user_id: UUID,
    start_date: datetime,
    end_date: datetime
) -> MonthlySpendingChartResponse:
    """
    Get monthly spending patterns for the specified period.
    Uses the same logic as Cash Flow widget to ensure consistency.
    All amounts are converted to user's display currency.
    """
    from calendar import month_abbr
    from dateutil.relativedelta import relativedelta
    from datetime import timedelta

    # Remove timezone info to match database datetimes
    start_date = start_date.replace(tzinfo=None)
    end_date = end_date.replace(tzinfo=None)

    data_points = []
    current = start_date.replace(day=1)

    while current <= end_date:
        month_start = current
        month_end = (current + relativedelta(months=1)).replace(day=1) - timedelta(days=1)
        month_end = min(month_end, end_date)

        # Adjust month_start to respect the actual start_date if we're in the first month
        if current.year == start_date.year and current.month == start_date.month:
            month_start = start_date

        # Get cash flow data for this specific month
        cash_flow = await get_cash_flow(db, user_id, start_date=month_start, end_date=month_end)

        # Calculate total expenses (sum of all expense categories)
        # This matches exactly what Income Allocation widget shows
        total_expenses = (
            cash_flow.monthly_expenses +
            cash_flow.monthly_subscriptions +
            cash_flow.monthly_installments +
            cash_flow.monthly_taxes
        )

        # Format month label
        month_label = f"{month_abbr[current.month]} {current.year}"

        data_points.append(MonthlySpendingDataPoint(
            month=month_label,
            amount=total_expenses
        ))

        current += relativedelta(months=1)

    # Calculate total and average
    total = sum(dp.amount for dp in data_points)
    average = total / len(data_points) if data_points else Decimal('0')

    return MonthlySpendingChartResponse(
        data=data_points,
        average=average,
        total=total
    )


async def get_net_worth_trend_chart(
    db: AsyncSession,
    user_id: UUID,
    start_date: datetime,
    end_date: datetime
) -> NetWorthTrendChartResponse:
    """
    Get net worth trend for the specified period.

    Note: This is a simplified version that calculates current net worth
    for each month. For historical accuracy, you would need to store
    snapshots of portfolio values and account balances.

    All amounts are converted to user's display currency.
    """
    from calendar import month_abbr
    from dateutil.relativedelta import relativedelta

    # Remove timezone info to match database datetimes
    start_date = start_date.replace(tzinfo=None)
    end_date = end_date.replace(tzinfo=None)

    # Get user's display currency
    display_currency = await get_user_display_currency(db, user_id)
    currency_service = CurrencyService(db)

    # Get current net worth as the baseline (already in display currency)
    current_net_worth_data = await get_net_worth(db, user_id)
    current_total_assets = Decimal(current_net_worth_data.total_assets)
    current_total_liabilities = Decimal(current_net_worth_data.total_liabilities)
    baseline_liquid_assets = Decimal(current_net_worth_data.portfolio_value) + Decimal(current_net_worth_data.savings_balance)

    data_points = []
    current = start_date.replace(day=1)
    cumulative_cash_flow = Decimal('0')

    while current <= end_date:
        month_start = current
        month_end = (current + relativedelta(months=1)).replace(day=1) - timedelta(days=1)
        month_end = min(month_end, end_date)

        # Calculate income for this month
        monthly_income = Decimal('0')

        # One-time income
        onetime_income_query = select(IncomeSource).where(
            and_(
                IncomeSource.user_id == user_id,
                IncomeSource.is_active == True,
                IncomeSource.deleted_at.is_(None),
                IncomeSource.frequency == 'one_time',
                IncomeSource.date.is_not(None),
                IncomeSource.date >= month_start,
                IncomeSource.date <= month_end
            )
        )
        onetime_result = await db.execute(onetime_income_query)
        onetime_sources = onetime_result.scalars().all()
        for source in onetime_sources:
            if source.amount:
                if source.currency == display_currency:
                    monthly_income += source.amount
                else:
                    converted = await currency_service.convert_amount(
                        source.amount, source.currency, display_currency
                    )
                    if converted:
                        monthly_income += converted

        # Recurring income
        recurring_income_query = select(IncomeSource).where(
            and_(
                IncomeSource.user_id == user_id,
                IncomeSource.is_active == True,
                IncomeSource.deleted_at.is_(None),
                IncomeSource.frequency != 'one_time',
                IncomeSource.start_date.is_not(None),
                IncomeSource.start_date <= month_end,
                or_(
                    IncomeSource.end_date.is_(None),
                    IncomeSource.end_date >= month_start
                )
            )
        )
        recurring_result = await db.execute(recurring_income_query)
        recurring_sources = recurring_result.scalars().all()
        for source in recurring_sources:
            monthly_amount = source.calculate_monthly_amount()
            if monthly_amount:
                if source.currency == display_currency:
                    monthly_income += monthly_amount
                else:
                    converted = await currency_service.convert_amount(
                        monthly_amount, source.currency, display_currency
                    )
                    if converted:
                        monthly_income += converted

        # Calculate expenses for this month
        expense_query = select(Expense).where(
            and_(
                Expense.user_id == user_id,
                or_(
                    and_(
                        Expense.date.is_not(None),
                        Expense.date >= month_start,
                        Expense.date <= month_end
                    ),
                    and_(
                        Expense.start_date.is_not(None),
                        Expense.start_date >= month_start,
                        Expense.start_date <= month_end
                    )
                ),
            )
        )
        expense_result = await db.execute(expense_query)
        expenses = expense_result.scalars().all()

        # Convert expenses to display currency
        monthly_expenses = Decimal('0')
        for expense in expenses:
            if expense.amount:
                if expense.currency == display_currency:
                    monthly_expenses += expense.amount
                else:
                    converted = await currency_service.convert_amount(
                        expense.amount, expense.currency, display_currency
                    )
                    if converted:
                        monthly_expenses += converted

        # Update cumulative cash flow
        cumulative_cash_flow += (monthly_income - monthly_expenses)

        # Calculate net worth for this month
        # Assets = baseline liquid assets + cumulative cash flow
        month_assets = baseline_liquid_assets + cumulative_cash_flow
        # Liabilities remain constant (we don't track historical changes)
        month_liabilities = current_total_liabilities
        month_net_worth = month_assets - month_liabilities

        # Format month label
        month_label = f"{month_abbr[current.month]} {current.year}"

        data_points.append(NetWorthTrendDataPoint(
            month=month_label,
            net_worth=month_net_worth,
            assets=month_assets,
            liabilities=month_liabilities
        ))

        current += relativedelta(months=1)

    return NetWorthTrendChartResponse(data=data_points)



async def get_income_breakdown_chart(
    db: AsyncSession,
    user_id: UUID,
    start_date: datetime,
    end_date: datetime
) -> IncomeBreakdownChartResponse:
    """
    Get income breakdown showing how monthly income is allocated for the specified period.
    Shows: Expenses, Subscriptions, Installments, Taxes, and Net Savings.
    All amounts are converted to user's display currency.
    """
    # Get cash flow data for the specified period
    cash_flow = await get_cash_flow(db, user_id, start_date=start_date, end_date=end_date)
    
    # Calculate percentages
    total_income = cash_flow.monthly_income
    
    data_points = []
    
    if total_income > 0:
        # Expenses
        if cash_flow.monthly_expenses > 0:
            expense_pct = float((cash_flow.monthly_expenses / total_income) * 100)
            data_points.append(IncomeBreakdownDataPoint(
                category="Expenses",
                amount=cash_flow.monthly_expenses,
                percentage=expense_pct
            ))
        
        # Subscriptions
        if cash_flow.monthly_subscriptions > 0:
            subscription_pct = float((cash_flow.monthly_subscriptions / total_income) * 100)
            data_points.append(IncomeBreakdownDataPoint(
                category="Subscriptions",
                amount=cash_flow.monthly_subscriptions,
                percentage=subscription_pct
            ))
        
        # Installments
        if cash_flow.monthly_installments > 0:
            installment_pct = float((cash_flow.monthly_installments / total_income) * 100)
            data_points.append(IncomeBreakdownDataPoint(
                category="Installments",
                amount=cash_flow.monthly_installments,
                percentage=installment_pct
            ))

        # Taxes
        if cash_flow.monthly_taxes > 0:
            tax_pct = float((cash_flow.monthly_taxes / total_income) * 100)
            data_points.append(IncomeBreakdownDataPoint(
                category="Taxes",
                amount=cash_flow.monthly_taxes,
                percentage=tax_pct
            ))

        # Net Savings (what's left)
        if cash_flow.net_cash_flow > 0:
            savings_pct = float((cash_flow.net_cash_flow / total_income) * 100)
            data_points.append(IncomeBreakdownDataPoint(
                category="Net Savings",
                amount=cash_flow.net_cash_flow,
                percentage=savings_pct
            ))
    
    return IncomeBreakdownChartResponse(
        data=data_points,
        total_income=total_income,
        currency=cash_flow.currency
    )

