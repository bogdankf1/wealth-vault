"""
Dashboard API endpoints for aggregating financial data.
"""
from datetime import datetime
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.permissions import get_current_user
from app.models.user import User
from app.modules.dashboard.schemas import (
    DashboardOverviewResponse,
    NetWorthResponse,
    CashFlowResponse,
    FinancialHealthResponse,
    RecentActivityItem,
    UpcomingPayment,
    FinancialAlert,
    IncomeVsExpensesChartResponse,
    ExpenseByCategoryChartResponse,
    MonthlySpendingChartResponse,
    NetWorthTrendChartResponse,
    IncomeBreakdownChartResponse,
)
from app.modules.dashboard import service

router = APIRouter(prefix="/api/v1/dashboard", tags=["Dashboard"])


@router.get("/overview", response_model=DashboardOverviewResponse)
async def get_dashboard_overview(
    start_date: Optional[datetime] = Query(None, description="Start date for filtering (overrides month/year)"),
    end_date: Optional[datetime] = Query(None, description="End date for filtering (overrides month/year)"),
    month: Optional[int] = Query(None, ge=1, le=12, description="Month (1-12), defaults to current month"),
    year: Optional[int] = Query(None, ge=2000, le=2100, description="Year, defaults to current year"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Get complete dashboard overview with all widgets.

    Query Parameters:
    - start_date: Start date for filtering (ISO format, optional)
    - end_date: End date for filtering (ISO format, optional)
    - month: Target month (1-12), defaults to current month (ignored if start_date/end_date provided)
    - year: Target year, defaults to current year (ignored if start_date/end_date provided)

    Returns:
    - Net worth (assets vs liabilities)
    - Monthly cash flow (with date-based expense filtering)
    - Financial health score
    - Recent activity (last 10 transactions)
    - Upcoming payments (next 7 days)
    """
    # Fetch all dashboard data
    net_worth = await service.get_net_worth(db, current_user.id)
    cash_flow = await service.get_cash_flow(db, current_user.id, month, year, start_date, end_date)
    financial_health = await service.get_financial_health_score(db, current_user.id)
    recent_activity = await service.get_recent_activity(db, current_user.id, limit=10)
    upcoming_payments = await service.get_upcoming_payments(db, current_user.id, days=7)

    # Generate financial alerts based on the data
    alerts = await service.get_financial_alerts(db, current_user.id, net_worth, cash_flow, financial_health)

    return DashboardOverviewResponse(
        net_worth=net_worth,
        cash_flow=cash_flow,
        financial_health=financial_health,
        recent_activity=recent_activity,
        upcoming_payments=upcoming_payments,
        alerts=alerts
    )


@router.get("/net-worth", response_model=NetWorthResponse)
async def get_net_worth(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Calculate net worth.

    Net Worth = (Portfolio + Savings) - Installments

    Returns:
    - Total assets (portfolio + savings)
    - Total liabilities (installments)
    - Net worth
    - Breakdown by category
    """
    return await service.get_net_worth(db, current_user.id)


@router.get("/cash-flow", response_model=CashFlowResponse)
async def get_cash_flow(
    start_date: Optional[datetime] = Query(None, description="Start date for filtering (overrides month/year)"),
    end_date: Optional[datetime] = Query(None, description="End date for filtering (overrides month/year)"),
    month: Optional[int] = Query(None, ge=1, le=12, description="Month (1-12)"),
    year: Optional[int] = Query(None, ge=2000, le=2100, description="Year"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Calculate monthly cash flow.

    Cash Flow = Income - Expenses - Subscriptions - Installments

    Query Parameters:
    - start_date: Start date for filtering (ISO format, optional)
    - end_date: End date for filtering (ISO format, optional)
    - month: Target month (1-12), defaults to current month (ignored if start_date/end_date provided)
    - year: Target year, defaults to current year (ignored if start_date/end_date provided)

    Expense Calculation:
    - Uses date-based filtering (same logic as Expenses page)
    - One-time expenses: included if date falls within range
    - Recurring expenses: included if overlaps with range, using monthly equivalent

    Returns:
    - Monthly income (recurring sources)
    - Monthly expenses (date-filtered)
    - Monthly subscriptions (all active)
    - Monthly installments (all active)
    - Net cash flow
    - Savings rate (%)
    """
    return await service.get_cash_flow(db, current_user.id, month, year, start_date, end_date)


@router.get("/financial-health", response_model=FinancialHealthResponse)
async def get_financial_health(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Calculate financial health score (0-100).

    Score Components (20 points each):
    1. Emergency Fund - Savings >= 3-6 months expenses
    2. Debt-to-Income Ratio - Total debt / income < 36%
    3. Savings Rate - % of income saved (20%+ excellent)
    4. Investment Diversity - Multiple asset types
    5. Goals Progress - Average progress towards goals

    Returns:
    - Total score (0-100)
    - Individual component scores
    - Rating (Excellent/Good/Fair/Needs Improvement)
    - Detailed breakdown
    """
    return await service.get_financial_health_score(db, current_user.id)


@router.get("/recent-activity", response_model=list[RecentActivityItem])
async def get_recent_activity(
    limit: int = Query(10, ge=1, le=50, description="Number of items to return"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Get recent financial activity across all modules.

    Aggregates transactions from:
    - Income sources
    - Expenses
    - Subscriptions

    Query Parameters:
    - limit: Number of items (1-50), defaults to 10

    Returns list sorted by date (newest first).
    """
    return await service.get_recent_activity(db, current_user.id, limit)


@router.get("/upcoming-payments", response_model=list[UpcomingPayment])
async def get_upcoming_payments(
    days: int = Query(7, ge=1, le=90, description="Number of days to look ahead"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Get upcoming subscription renewals and installment payments.

    Query Parameters:
    - days: Look ahead N days (1-90), defaults to 7

    Returns:
    - Subscription renewals due
    - Installment payments due
    - Days until due
    - Overdue status

    Returns list sorted by due date (earliest first).
    """
    return await service.get_upcoming_payments(db, current_user.id, days)


# Analytics endpoints for charts

@router.get("/analytics/income-vs-expenses", response_model=IncomeVsExpensesChartResponse)
async def get_income_vs_expenses_chart(
    start_date: datetime = Query(..., description="Start date for the period"),
    end_date: datetime = Query(..., description="End date for the period"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Get income vs expenses chart data for the specified period.

    Query Parameters:
    - start_date: Start date (ISO format)
    - end_date: End date (ISO format)

    Returns monthly aggregated income and expenses data.
    """
    return await service.get_income_vs_expenses_chart(db, current_user.id, start_date, end_date)


@router.get("/analytics/subscriptions-by-category", response_model=ExpenseByCategoryChartResponse)
async def get_subscriptions_by_category_chart(
    start_date: datetime = Query(..., description="Start date for the period"),
    end_date: datetime = Query(..., description="End date for the period"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Get subscription breakdown by category (monthly equivalents) for the specified period.

    Returns active subscriptions grouped by category with percentages.
    Amounts are shown as monthly equivalents regardless of billing frequency.
    Only includes subscriptions that are active during the specified period.
    """
    return await service.get_subscriptions_by_category_chart(db, current_user.id, start_date, end_date)


@router.get("/analytics/installments-by-category", response_model=ExpenseByCategoryChartResponse)
async def get_installments_by_category_chart(
    start_date: datetime = Query(..., description="Start date for the period"),
    end_date: datetime = Query(..., description="End date for the period"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Get installment breakdown by category (monthly equivalents) for the specified period.

    Returns active installments grouped by category with percentages.
    Amounts are shown as monthly equivalents regardless of payment frequency.
    Only includes installments that are active during the specified period.
    """
    return await service.get_installments_by_category_chart(db, current_user.id, start_date, end_date)


@router.get("/analytics/expenses-by-category", response_model=ExpenseByCategoryChartResponse)
async def get_expenses_by_category_chart(
    start_date: datetime = Query(..., description="Start date for the period"),
    end_date: datetime = Query(..., description="End date for the period"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Get expense breakdown by category (monthly equivalents) for the specified period.

    Returns expenses grouped by category with percentages.
    Excludes subscriptions, installments, and taxes (shows only regular expenses).
    Amounts are shown as monthly equivalents based on expense frequency.
    """
    return await service.get_expenses_by_category_chart(db, current_user.id, start_date, end_date)


@router.get("/analytics/budgets-by-category", response_model=ExpenseByCategoryChartResponse)
async def get_budgets_by_category_chart(
    start_date: datetime = Query(..., description="Start date for the period"),
    end_date: datetime = Query(..., description="End date for the period"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Get budget breakdown by category for the specified period.

    Returns active budgets grouped by category with percentages.
    Shows allocated budget amounts converted to monthly equivalents.
    Only includes budgets that overlap with the specified period.
    """
    return await service.get_budgets_by_category_chart(db, current_user.id, start_date, end_date)


@router.get("/analytics/monthly-spending", response_model=MonthlySpendingChartResponse)
async def get_monthly_spending_chart(
    start_date: datetime = Query(..., description="Start date for the period"),
    end_date: datetime = Query(..., description="End date for the period"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Get monthly spending patterns for the specified period.

    Query Parameters:
    - start_date: Start date (ISO format)
    - end_date: End date (ISO format)

    Returns monthly aggregated spending with average.
    """
    return await service.get_monthly_spending_chart(db, current_user.id, start_date, end_date)


@router.get("/analytics/net-worth-trend", response_model=NetWorthTrendChartResponse)
async def get_net_worth_trend_chart(
    start_date: datetime = Query(..., description="Start date for the period"),
    end_date: datetime = Query(..., description="End date for the period"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Get net worth trend for the specified period.

    Query Parameters:
    - start_date: Start date (ISO format)
    - end_date: End date (ISO format)

    Returns monthly net worth, assets, and liabilities data.
    """
    return await service.get_net_worth_trend_chart(db, current_user.id, start_date, end_date)


@router.get("/analytics/income-breakdown", response_model=IncomeBreakdownChartResponse)
async def get_income_breakdown_chart(
    start_date: datetime = Query(..., description="Start date for the period"),
    end_date: datetime = Query(..., description="End date for the period"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Get income breakdown showing allocation across expenses, subscriptions, installments, taxes, and net savings.

    Uses the specified period's cash flow data to show how monthly income is allocated.

    Returns:
    - Breakdown by category (Expenses, Subscriptions, Installments, Taxes, Net Savings)
    - Percentages of total income
    - Total monthly income
    """
    return await service.get_income_breakdown_chart(db, current_user.id, start_date, end_date)
