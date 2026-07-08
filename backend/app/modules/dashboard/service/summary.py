"""Dashboard summary aggregations: net worth, cash flow, financial health."""
from datetime import datetime, timedelta
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
)
from app.services.currency_service import CurrencyService
from app.modules.dashboard.service.common import get_user_display_currency


async def get_net_worth(db: AsyncSession, user_id: UUID) -> NetWorthResponse:
    """
    Calculate net worth = (Portfolio + Savings + Debts Receivable) - Installments.

    Assets:
    - Portfolio current value
    - Savings balance
    - Debts owed TO user (receivables)

    Liabilities:
    - Installments remaining balance

    Net Worth = Assets - Liabilities

    All amounts are converted to user's display currency.
    """
    from app.modules.debts.models import Debt

    # Get user's display currency
    display_currency = await get_user_display_currency(db, user_id)
    currency_service = CurrencyService(db)

    # =========================================================================
    # ASSETS
    # =========================================================================

    # 1. Portfolio Assets
    portfolio_query = select(PortfolioAsset).where(
        and_(
            PortfolioAsset.user_id == user_id,
            PortfolioAsset.is_active == True
        )
    )
    portfolio_result = await db.execute(portfolio_query)
    portfolio_assets = portfolio_result.scalars().all()

    portfolio_value = Decimal('0')
    portfolio_breakdown = {}
    for asset in portfolio_assets:
        if asset.current_value:
            if asset.currency == display_currency:
                amount = asset.current_value
            else:
                converted = await currency_service.convert_amount(
                    asset.current_value, asset.currency, display_currency
                )
                amount = converted if converted else Decimal('0')
            portfolio_value += amount
            portfolio_breakdown[asset.asset_name] = float(amount)

    # 2. Savings Accounts
    savings_query = select(SavingsAccount).where(
        and_(
            SavingsAccount.user_id == user_id,
            SavingsAccount.is_active == True
        )
    )
    savings_result = await db.execute(savings_query)
    savings_accounts = savings_result.scalars().all()

    savings_balance = Decimal('0')
    savings_breakdown = {}
    for account in savings_accounts:
        if account.current_balance:
            if account.currency == display_currency:
                amount = account.current_balance
            else:
                converted = await currency_service.convert_amount(
                    account.current_balance, account.currency, display_currency
                )
                amount = converted if converted else Decimal('0')
            savings_balance += amount
            savings_breakdown[account.name] = float(amount)

    # 3. Debts Owed TO User (Receivables - these are ASSETS)
    debts_query = select(Debt).where(
        and_(
            Debt.user_id == user_id,
            Debt.is_active == True,
            Debt.deleted_at.is_(None)
        )
    )
    debts_result = await db.execute(debts_query)
    debts = debts_result.scalars().all()

    debts_receivable = Decimal('0')
    debts_breakdown = {}
    for debt in debts:
        remaining = (debt.amount or Decimal('0')) - (debt.amount_paid or Decimal('0'))
        if remaining > 0:
            if debt.currency == display_currency:
                amount = remaining
            else:
                converted = await currency_service.convert_amount(
                    remaining, debt.currency, display_currency
                )
                amount = converted if converted else Decimal('0')
            debts_receivable += amount
            debtor_name = debt.debtor_name or f"Debt {debt.id}"
            debts_breakdown[debtor_name] = float(amount)

    # =========================================================================
    # LIABILITIES
    # =========================================================================

    # 1. Installments (money user owes)
    installments_query = select(Installment).where(
        and_(
            Installment.user_id == user_id,
            Installment.is_active == True
        )
    )
    installments_result = await db.execute(installments_query)
    installments = installments_result.scalars().all()

    total_debt = Decimal('0')
    installments_breakdown = {}
    for installment in installments:
        if installment.remaining_balance:
            if installment.currency == display_currency:
                amount = installment.remaining_balance
            else:
                converted = await currency_service.convert_amount(
                    installment.remaining_balance, installment.currency, display_currency
                )
                amount = converted if converted else Decimal('0')
            total_debt += amount
            installments_breakdown[installment.name] = float(amount)

    # =========================================================================
    # TOTALS
    # =========================================================================

    total_assets = portfolio_value + savings_balance + debts_receivable
    total_liabilities = total_debt
    net_worth = total_assets - total_liabilities

    return NetWorthResponse(
        total_assets=total_assets,
        total_liabilities=total_liabilities,
        net_worth=net_worth,
        portfolio_value=portfolio_value,
        savings_balance=savings_balance,
        debts_receivable=debts_receivable,
        total_debt=total_debt,
        currency=display_currency,
        assets_breakdown={
            "savings": savings_breakdown,
            "portfolio": portfolio_breakdown,
            "debts_receivable": debts_breakdown
        },
        liabilities_breakdown={
            "installments": installments_breakdown
        }
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
