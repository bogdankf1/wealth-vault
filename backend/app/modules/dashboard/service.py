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
from app.modules.income.models import IncomeSource
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
    year: Optional[int] = None
) -> CashFlowResponse:
    """
    Calculate monthly cash flow = Income - Expenses - Subscriptions.

    If month/year not specified, use current month.
    All amounts are converted to user's display currency.
    """
    # Default to current month/year
    now = datetime.utcnow()
    target_month = month or now.month
    target_year = year or now.year

    # Get user's display currency
    display_currency = await get_user_display_currency(db, user_id)
    currency_service = CurrencyService(db)

    # Get all active income sources with their currencies
    income_query = select(IncomeSource).where(
        and_(
            IncomeSource.user_id == user_id,
            IncomeSource.is_active == True,
            IncomeSource.deleted_at.is_(None)
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

    # Get all active expenses
    expenses_query = select(Expense).where(
        and_(
            Expense.user_id == user_id,
            Expense.is_active == True
        )
    )
    expenses_result = await db.execute(expenses_query)
    expenses = expenses_result.scalars().all()

    # Convert expenses to monthly equivalent in display currency
    monthly_expenses = Decimal('0')
    for expense in expenses:
        monthly_amount = expense.monthly_equivalent
        if monthly_amount:
            if expense.currency == display_currency:
                monthly_expenses += monthly_amount
            else:
                converted = await currency_service.convert_amount(
                    monthly_amount, expense.currency, display_currency
                )
                if converted:
                    monthly_expenses += converted

    # Get all active subscriptions
    subscriptions_query = select(Subscription).where(
        and_(
            Subscription.user_id == user_id,
            Subscription.is_active == True
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

    # Get all active installments
    installments_query = select(Installment).where(
        and_(
            Installment.user_id == user_id,
            Installment.is_active == True
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
        if installment.amount_per_payment:
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

    # Calculate net cash flow
    net_cash_flow = total_income - monthly_expenses - monthly_subscriptions - monthly_installments

    # Calculate savings rate
    savings_rate = (net_cash_flow / total_income * Decimal('100')) if total_income > 0 else Decimal('0')

    return CashFlowResponse(
        monthly_income=total_income,
        monthly_expenses=monthly_expenses,
        monthly_subscriptions=monthly_subscriptions,
        monthly_installments=monthly_installments,
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
    monthly_expenses_total = cash_flow.monthly_expenses + cash_flow.monthly_subscriptions + cash_flow.monthly_installments
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
    Groups data by month.
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

    data_points = []
    current = start_date.replace(day=1)

    while current <= end_date:
        month_start = current
        month_end = (current + relativedelta(months=1)).replace(day=1) - timedelta(days=1)
        month_end = min(month_end, end_date)

        # Calculate income for this month
        monthly_income = Decimal('0')

        # Get one-time income sources that fall in this month
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

        # Get recurring income sources that are active in this month
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

        # Format month label
        month_label = f"{month_abbr[current.month]} {current.year}"

        data_points.append(IncomeVsExpensesDataPoint(
            month=month_label,
            income=monthly_income,
            expenses=monthly_expenses
        ))

        current += relativedelta(months=1)

    return IncomeVsExpensesChartResponse(data=data_points)


async def get_expense_by_category_chart(
    db: AsyncSession,
    user_id: UUID,
    start_date: datetime,
    end_date: datetime
) -> ExpenseByCategoryChartResponse:
    """
    Get expense breakdown by category for the specified period.
    All amounts are converted to user's display currency.
    """
    # Remove timezone info to match database datetimes
    start_date = start_date.replace(tzinfo=None)
    end_date = end_date.replace(tzinfo=None)

    # Get user's display currency
    display_currency = await get_user_display_currency(db, user_id)
    currency_service = CurrencyService(db)

    # Query all expenses (need individual items for currency conversion)
    query = select(Expense).where(
        and_(
            Expense.user_id == user_id,
            or_(
                and_(
                    Expense.date.is_not(None),
                    Expense.date >= start_date,
                    Expense.date <= end_date
                ),
                and_(
                    Expense.start_date.is_not(None),
                    Expense.start_date >= start_date,
                    Expense.start_date <= end_date
                )
            )
        )
    )

    result = await db.execute(query)
    expenses = result.scalars().all()

    # Group by category and convert to display currency
    category_totals = {}
    for expense in expenses:
        category = expense.category
        if expense.amount:
            if expense.currency == display_currency:
                amount = expense.amount
            else:
                amount = await currency_service.convert_amount(
                    expense.amount, expense.currency, display_currency
                )
                if not amount:
                    amount = Decimal('0')

            if category not in category_totals:
                category_totals[category] = Decimal('0')
            category_totals[category] += amount

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

    data_points = []
    current = start_date.replace(day=1)

    while current <= end_date:
        month_start = current
        month_end = (current + relativedelta(months=1)).replace(day=1) - timedelta(days=1)
        month_end = min(month_end, end_date)

        # Get all expenses for this month
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
        monthly_amount = Decimal('0')
        for expense in expenses:
            if expense.amount:
                if expense.currency == display_currency:
                    monthly_amount += expense.amount
                else:
                    converted = await currency_service.convert_amount(
                        expense.amount, expense.currency, display_currency
                    )
                    if converted:
                        monthly_amount += converted

        # Format month label
        month_label = f"{month_abbr[current.month]} {current.year}"

        data_points.append(MonthlySpendingDataPoint(
            month=month_label,
            amount=monthly_amount
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
