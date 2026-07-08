"""Dashboard analytics chart aggregations."""
from datetime import datetime, timedelta
from decimal import Decimal
from uuid import UUID

from sqlalchemy import and_, select, or_
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.installments.models import Installment
from app.modules.income.models import IncomeSource
from app.modules.expenses.models import Expense
from app.modules.subscriptions.models import Subscription
from app.modules.budgets.models import Budget
from app.modules.dashboard.schemas import (
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
from app.modules.dashboard.service.common import get_user_display_currency
from app.modules.dashboard.service.summary import get_cash_flow, get_net_worth


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
            logger.info("Breakdown:")
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


async def get_expenses_by_category_chart(
    db: AsyncSession,
    user_id: UUID,
    start_date: datetime,
    end_date: datetime
) -> ExpenseByCategoryChartResponse:
    """
    Get expense breakdown by category (monthly equivalents) for the specified period.
    Shows expenses grouped by category. Excludes subscriptions, installments, and taxes.
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
        'one_time': Decimal('1'),  # Will be divided by months in period
        'daily': Decimal('30'),
        'weekly': Decimal('4.33333'),      # ~52 weeks per year / 12
        'biweekly': Decimal('2.16667'),    # ~26 payments per year / 12
        'monthly': Decimal('1'),
        'quarterly': Decimal('0.33333'),   # 4 per year / 12
        'annually': Decimal('0.08333'),    # 1 per year / 12
    }

    # Query expenses that fall within or overlap the specified period
    # For one-time expenses: date must be within range
    # For recurring expenses: must overlap with range (start_date <= period_end AND (end_date IS NULL OR end_date >= period_start))
    query = select(Expense).where(
        and_(
            Expense.user_id == user_id,
            Expense.is_active == True,
            or_(
                # One-time expenses: date field is set and within range
                and_(
                    Expense.frequency == 'one_time',
                    Expense.date.isnot(None),
                    Expense.date >= start_date,
                    Expense.date <= end_date
                ),
                # Recurring expenses: overlap with the period
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

    result = await db.execute(query)
    expenses = result.scalars().all()

    # Group by category and convert to display currency
    category_totals = {}
    for expense in expenses:
        # Use category or "Uncategorized"
        category = expense.category or "Uncategorized"

        if expense.amount:
            # Convert to display currency first
            if expense.currency == display_currency:
                amount_in_display = expense.amount
            else:
                amount_in_display = await currency_service.convert_amount(
                    expense.amount, expense.currency, display_currency
                )
                if not amount_in_display:
                    amount_in_display = Decimal('0')

            # Calculate monthly equivalent based on frequency
            if expense.frequency == 'one_time':
                # One-time expenses are counted as-is for the month they occurred in
                monthly_amount = amount_in_display
            else:
                # Recurring expenses: convert to monthly equivalent
                multiplier = frequency_to_monthly.get(expense.frequency, Decimal('1'))
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


async def get_budgets_by_category_chart(
    db: AsyncSession,
    user_id: UUID,
    start_date: datetime,
    end_date: datetime
) -> ExpenseByCategoryChartResponse:
    """
    Get budget breakdown by category for the specified period.
    Shows active budgets grouped by category with their allocated amounts.
    All amounts are converted to user's display currency.
    """
    # Remove timezone info to match database datetimes
    start_date = start_date.replace(tzinfo=None)
    end_date = end_date.replace(tzinfo=None)

    # Get user's display currency
    display_currency = await get_user_display_currency(db, user_id)
    currency_service = CurrencyService(db)

    # Period multipliers to convert budget amounts to monthly equivalents
    period_to_monthly = {
        'monthly': Decimal('1'),
        'quarterly': Decimal('0.33333'),   # 3 months
        'yearly': Decimal('0.08333'),      # 12 months
    }

    # Query active budgets that overlap with the specified period
    # A budget overlaps if:
    # - start_date <= period_end AND
    # - (end_date is NULL OR end_date >= period_start)
    query = select(Budget).where(
        and_(
            Budget.user_id == user_id,
            Budget.is_active == True,
            Budget.start_date <= end_date,
            or_(
                Budget.end_date.is_(None),
                Budget.end_date >= start_date
            )
        )
    )

    result = await db.execute(query)
    budgets = result.scalars().all()

    # Group by category and convert to display currency
    category_totals = {}
    for budget in budgets:
        # Use category from budget
        category = budget.category or "Uncategorized"

        if budget.amount:
            # Convert to display currency first
            if budget.currency == display_currency:
                amount_in_display = budget.amount
            else:
                amount_in_display = await currency_service.convert_amount(
                    budget.amount, budget.currency, display_currency
                )
                if not amount_in_display:
                    amount_in_display = Decimal('0')

            # Convert to monthly equivalent based on budget period
            multiplier = period_to_monthly.get(budget.period, Decimal('1'))
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


async def get_net_worth_trend_from_snapshots(
    db: AsyncSession,
    user_id: UUID,
    start_date: datetime,
    end_date: datetime
) -> NetWorthTrendChartResponse:
    """
    Get net worth trend using actual stored snapshots.

    Falls back to calculated values for months without snapshots.
    """
    from app.modules.dashboard.snapshot_service import get_snapshots_for_period
    from calendar import month_abbr

    # Get actual snapshots
    snapshots = await get_snapshots_for_period(db, user_id, start_date, end_date)

    # Build a map of month -> snapshot
    snapshot_map = {}
    for snapshot in snapshots:
        month_key = f"{month_abbr[snapshot.snapshot_date.month]} {snapshot.snapshot_date.year}"
        snapshot_map[month_key] = snapshot

    # If we have snapshots, use them; otherwise fall back to calculated
    if snapshots:
        data_points = []
        for month_key, snapshot in snapshot_map.items():
            data_points.append(NetWorthTrendDataPoint(
                month=month_key,
                net_worth=snapshot.net_worth,
                assets=snapshot.total_assets,
                liabilities=snapshot.total_liabilities
            ))
        # Sort by date
        data_points.sort(key=lambda x: datetime.strptime(x.month, "%b %Y"))
        return NetWorthTrendChartResponse(data=data_points)

    # Fall back to calculated values
    return await get_net_worth_trend_chart(db, user_id, start_date, end_date)
