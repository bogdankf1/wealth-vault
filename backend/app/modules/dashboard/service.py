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


async def get_net_worth(db: AsyncSession, user_id: UUID) -> NetWorthResponse:
    """
    Calculate net worth = (Portfolio + Savings) - Installments.

    Assets = Portfolio current value + Savings balance
    Liabilities = Installments remaining balance
    Net Worth = Assets - Liabilities
    """
    # Get portfolio total value
    portfolio_query = select(func.sum(PortfolioAsset.current_value)).where(
        and_(
            PortfolioAsset.user_id == user_id,
            PortfolioAsset.is_active == True
        )
    )
    portfolio_result = await db.execute(portfolio_query)
    portfolio_value = portfolio_result.scalar() or Decimal('0')

    # Get savings total balance
    savings_query = select(func.sum(SavingsAccount.current_balance)).where(
        and_(
            SavingsAccount.user_id == user_id,
            SavingsAccount.is_active == True
        )
    )
    savings_result = await db.execute(savings_query)
    savings_balance = savings_result.scalar() or Decimal('0')

    # Get total debt (installments remaining balance)
    installments_query = select(func.sum(Installment.remaining_balance)).where(
        and_(
            Installment.user_id == user_id,
            Installment.is_active == True
        )
    )
    installments_result = await db.execute(installments_query)
    total_debt = installments_result.scalar() or Decimal('0')

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
        currency="USD"
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
    """
    # Default to current month/year
    now = datetime.utcnow()
    target_month = month or now.month
    target_year = year or now.year

    # Calculate monthly income (recurring sources only)
    income_query = select(func.sum(IncomeSource.amount)).where(
        and_(
            IncomeSource.user_id == user_id,
            IncomeSource.is_active == True,
            IncomeSource.frequency.in_(['monthly', 'annual', 'weekly', 'biweekly'])
        )
    )
    income_result = await db.execute(income_query)
    total_income = income_result.scalar() or Decimal('0')

    # Get expenses for the target month
    start_date = datetime(target_year, target_month, 1)
    if target_month == 12:
        end_date = datetime(target_year + 1, 1, 1)
    else:
        end_date = datetime(target_year, target_month + 1, 1)

    expenses_query = select(func.sum(Expense.amount)).where(
        and_(
            Expense.user_id == user_id,
            Expense.date >= start_date,
            Expense.date < end_date
        )
    )
    expenses_result = await db.execute(expenses_query)
    monthly_expenses = expenses_result.scalar() or Decimal('0')

    # Calculate monthly subscriptions
    subscriptions_query = select(func.sum(Subscription.amount)).where(
        and_(
            Subscription.user_id == user_id,
            Subscription.is_active == True,
            Subscription.frequency.in_(['monthly', 'annually'])
        )
    )
    subscriptions_result = await db.execute(subscriptions_query)
    monthly_subscriptions = subscriptions_result.scalar() or Decimal('0')

    # Calculate net cash flow
    net_cash_flow = total_income - monthly_expenses - monthly_subscriptions

    # Calculate savings rate
    savings_rate = (net_cash_flow / total_income * Decimal('100')) if total_income > 0 else Decimal('0')

    return CashFlowResponse(
        monthly_income=total_income,
        monthly_expenses=monthly_expenses,
        monthly_subscriptions=monthly_subscriptions,
        net_cash_flow=net_cash_flow,
        savings_rate=savings_rate,
        currency="USD",
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
    monthly_expenses_total = cash_flow.monthly_expenses + cash_flow.monthly_subscriptions
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
    """
    from calendar import month_abbr
    from dateutil.relativedelta import relativedelta

    # Remove timezone info to match database datetimes
    start_date = start_date.replace(tzinfo=None)
    end_date = end_date.replace(tzinfo=None)

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
            monthly_income += source.amount

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
            monthly_income += source.calculate_monthly_amount()

        # Calculate expenses for this month
        expense_query = select(func.sum(Expense.amount)).where(
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
        monthly_expenses = expense_result.scalar() or Decimal('0')

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
    """
    # Remove timezone info to match database datetimes
    start_date = start_date.replace(tzinfo=None)
    end_date = end_date.replace(tzinfo=None)

    # Query expenses grouped by category
    query = select(
        Expense.category,
        func.sum(Expense.amount).label('total_amount')
    ).where(
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
    ).group_by(Expense.category)

    result = await db.execute(query)
    category_data = result.all()

    # Calculate total and percentages
    total = sum(row.total_amount for row in category_data)

    if total == 0:
        return ExpenseByCategoryChartResponse(data=[], total=Decimal('0'))

    data_points = [
        ExpenseByCategoryDataPoint(
            category=row.category,
            amount=row.total_amount,
            percentage=float((row.total_amount / total) * 100)
        )
        for row in category_data
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
    """
    from calendar import month_abbr
    from dateutil.relativedelta import relativedelta

    # Remove timezone info to match database datetimes
    start_date = start_date.replace(tzinfo=None)
    end_date = end_date.replace(tzinfo=None)

    data_points = []
    current = start_date.replace(day=1)

    while current <= end_date:
        month_start = current
        month_end = (current + relativedelta(months=1)).replace(day=1) - timedelta(days=1)
        month_end = min(month_end, end_date)

        # Calculate expenses for this month
        expense_query = select(func.sum(Expense.amount)).where(
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
        monthly_amount = expense_result.scalar() or Decimal('0')

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
    """
    from calendar import month_abbr
    from dateutil.relativedelta import relativedelta

    # Remove timezone info to match database datetimes
    start_date = start_date.replace(tzinfo=None)
    end_date = end_date.replace(tzinfo=None)

    # Get current net worth as the baseline
    current_net_worth_data = await get_net_worth(db, user_id)
    current_total_assets = Decimal(current_net_worth_data.total_assets)
    current_total_liabilities = Decimal(current_net_worth_data.total_liabilities)

    # Get savings account balances (these are part of assets)
    savings_query = select(func.sum(SavingsAccount.current_balance)).where(
        SavingsAccount.user_id == user_id
    )
    savings_result = await db.execute(savings_query)
    current_savings = savings_result.scalar() or Decimal('0')

    # Get portfolio value (these are part of assets)
    portfolio_query = select(func.sum(PortfolioAsset.current_value)).where(
        PortfolioAsset.user_id == user_id
    )
    portfolio_result = await db.execute(portfolio_query)
    current_portfolio = portfolio_result.scalar() or Decimal('0')

    # Calculate the baseline liquid assets (savings + portfolio)
    baseline_liquid_assets = current_savings + current_portfolio

    data_points = []
    current = start_date.replace(day=1)
    cumulative_cash_flow = Decimal('0')

    while current <= end_date:
        month_start = current
        month_end = (current + relativedelta(months=1)).replace(day=1) - timedelta(days=1)
        month_end = min(month_end, end_date)

        # Calculate income for this month (reuse logic from income_vs_expenses)
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
            monthly_income += source.amount

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
            monthly_income += source.calculate_monthly_amount()

        # Calculate expenses for this month
        expense_query = select(func.sum(Expense.amount)).where(
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
        monthly_expenses = expense_result.scalar() or Decimal('0')

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
