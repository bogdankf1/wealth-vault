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
    NetWorthSnapshotResponse,
    NetWorthSnapshotListResponse,
    FinancialProjectionsResponse,
    GoalProjectionsResponse,
    CreateSnapshotRequest,
    FailedPaymentsResponse,
    FailedPaymentItem,
)
from app.modules.dashboard import service
from app.modules.dashboard import snapshot_service

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


# ============================================================================
# Snapshot Endpoints
# ============================================================================

@router.get("/snapshots/net-worth", response_model=NetWorthSnapshotListResponse)
async def get_net_worth_snapshots(
    start_date: datetime = Query(..., description="Start date for the period"),
    end_date: datetime = Query(..., description="End date for the period"),
    snapshot_type: Optional[str] = Query(None, description="Filter by snapshot type (monthly, daily, manual)"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Get net worth snapshots for the specified period.

    Query Parameters:
    - start_date: Start date (ISO format)
    - end_date: End date (ISO format)
    - snapshot_type: Optional filter (monthly, daily, manual)

    Returns list of historical net worth snapshots with full breakdown.
    """
    snapshots = await snapshot_service.get_snapshots_for_period(
        db, current_user.id, start_date, end_date, snapshot_type
    )
    return NetWorthSnapshotListResponse(
        items=[NetWorthSnapshotResponse.model_validate(s) for s in snapshots],
        total=len(snapshots)
    )


@router.get("/snapshots/net-worth/latest", response_model=Optional[NetWorthSnapshotResponse])
async def get_latest_net_worth_snapshot(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Get the most recent net worth snapshot.

    Returns the latest snapshot or null if no snapshots exist.
    """
    snapshot = await snapshot_service.get_latest_snapshot(db, current_user.id)
    if snapshot:
        return NetWorthSnapshotResponse.model_validate(snapshot)
    return None


@router.post("/snapshots/net-worth", response_model=NetWorthSnapshotResponse)
async def create_net_worth_snapshot_endpoint(
    request: CreateSnapshotRequest = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Create a manual net worth snapshot.

    Use this to capture the current financial state at any time.
    Automatic monthly snapshots are created by the system.

    Returns the created snapshot with full breakdown.
    """
    snapshot_type = request.snapshot_type if request else "manual"
    snapshot = await snapshot_service.create_net_worth_snapshot(
        db, current_user.id, snapshot_type=snapshot_type
    )
    return NetWorthSnapshotResponse.model_validate(snapshot)


@router.post("/snapshots/net-worth/backfill", response_model=NetWorthSnapshotListResponse)
async def backfill_net_worth_snapshots(
    months: int = Query(6, ge=1, le=24, description="Number of months to backfill"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Create historical snapshots for the last N months.

    Note: Historical snapshots use current data since we can't
    retrieve past values. This creates a baseline for future tracking.

    Returns list of created snapshots.
    """
    snapshots = await snapshot_service.backfill_monthly_snapshots(
        db, current_user.id, months=months
    )
    return NetWorthSnapshotListResponse(
        items=[NetWorthSnapshotResponse.model_validate(s) for s in snapshots],
        total=len(snapshots)
    )


# ============================================================================
# Projection Endpoints
# ============================================================================

@router.get("/projections/net-worth", response_model=FinancialProjectionsResponse)
async def get_net_worth_projections(
    annual_return_rate: float = Query(7.0, ge=0, le=30, description="Assumed annual investment return rate (%)"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Get net worth projections for 1, 3, 5, and 10 years.

    Projections are based on:
    - Current net worth
    - Current monthly savings rate
    - Assumed investment return rate

    Query Parameters:
    - annual_return_rate: Expected annual return (default 7%)

    Returns projected net worth at different time horizons.
    """
    from decimal import Decimal
    rate = Decimal(str(annual_return_rate / 100))  # Convert percentage to decimal
    return await service.get_financial_projections(db, current_user.id, rate)


@router.get("/projections/goals", response_model=GoalProjectionsResponse)
async def get_goals_projections(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Get projections for all active financial goals.

    For each goal, calculates:
    - Current progress percentage
    - Estimated completion date based on monthly contribution
    - Whether the goal is on track to meet target date

    Returns list of goal projections with overall progress.
    """
    return await service.get_goal_projections(db, current_user.id)


# ============================================================================
# Enhanced Net Worth Endpoint (with full breakdown)
# ============================================================================

@router.get("/net-worth/breakdown")
async def get_net_worth_breakdown(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Get detailed net worth breakdown with all asset and liability categories.

    Returns:
    - Total assets with breakdown (savings, portfolio, debts receivable)
    - Total liabilities with breakdown (installments)
    - Net worth
    - Individual item values within each category
    """
    return await snapshot_service.calculate_net_worth_with_debts(db, current_user.id)


# ============================================================================
# Failed Payments Endpoint
# ============================================================================

@router.get("/failed-payments", response_model=FailedPaymentsResponse)
async def get_failed_payments(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Get all failed payments across expenses, installments, and subscriptions.

    Returns payments that failed due to insufficient funds and need attention.
    Useful for displaying alerts and allowing users to retry payments.

    Returns:
    - List of failed payment items with details
    - Total count
    - Flag indicating if there are any failed payments
    """
    return await service.get_failed_payments(db, current_user.id)
