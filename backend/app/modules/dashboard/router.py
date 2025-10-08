"""
Dashboard API endpoints for aggregating financial data.
"""
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
)
from app.modules.dashboard import service

router = APIRouter(prefix="/api/v1/dashboard", tags=["Dashboard"])


@router.get("/overview", response_model=DashboardOverviewResponse)
async def get_dashboard_overview(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Get complete dashboard overview with all widgets.

    Returns:
    - Net worth (assets vs liabilities)
    - Monthly cash flow
    - Financial health score
    - Recent activity (last 10 transactions)
    - Upcoming payments (next 7 days)
    """
    # Fetch all dashboard data
    net_worth = await service.get_net_worth(db, current_user.id)
    cash_flow = await service.get_cash_flow(db, current_user.id)
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
    month: Optional[int] = Query(None, ge=1, le=12, description="Month (1-12)"),
    year: Optional[int] = Query(None, ge=2000, le=2100, description="Year"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Calculate monthly cash flow.

    Cash Flow = Income - Expenses - Subscriptions

    Query Parameters:
    - month: Target month (1-12), defaults to current month
    - year: Target year, defaults to current year

    Returns:
    - Monthly income (recurring sources)
    - Monthly expenses
    - Monthly subscriptions
    - Net cash flow
    - Savings rate (%)
    """
    return await service.get_cash_flow(db, current_user.id, month, year)


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
