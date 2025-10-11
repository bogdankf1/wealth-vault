"""
Dashboard Pydantic schemas for request/response validation.
"""
from datetime import date, datetime
from decimal import Decimal
from typing import Optional
from uuid import UUID

from pydantic import BaseModel


class NetWorthResponse(BaseModel):
    """Schema for net worth calculation response."""

    total_assets: Decimal
    total_liabilities: Decimal
    net_worth: Decimal
    portfolio_value: Decimal
    savings_balance: Decimal
    total_debt: Decimal
    currency: str


class CashFlowResponse(BaseModel):
    """Schema for monthly cash flow response."""

    monthly_income: Decimal
    monthly_expenses: Decimal
    monthly_subscriptions: Decimal
    net_cash_flow: Decimal
    savings_rate: Decimal  # Percentage
    currency: str
    month: int
    year: int


class FinancialHealthBreakdown(BaseModel):
    """Breakdown of financial health score components."""

    emergency_fund: dict
    debt_to_income: dict
    savings_rate: dict
    investment_diversity: dict
    goals_progress: dict


class FinancialHealthResponse(BaseModel):
    """Schema for financial health score response."""

    score: int  # 0-100
    emergency_fund_score: int
    debt_to_income_score: int
    savings_rate_score: int
    investment_diversity_score: int
    goals_progress_score: int
    breakdown: FinancialHealthBreakdown
    rating: str  # "Excellent", "Good", "Fair", "Poor"


class RecentActivityItem(BaseModel):
    """Schema for recent activity item."""

    id: UUID
    module: str  # "income", "expenses", "subscriptions", etc.
    type: str  # "income_source", "expense", "subscription", etc.
    name: str
    amount: Decimal
    currency: str
    date: datetime
    icon: str  # Icon name for frontend
    is_positive: bool  # True for income, False for expenses


class UpcomingPayment(BaseModel):
    """Schema for upcoming payment."""

    id: UUID
    module: str  # "subscriptions" or "installments"
    name: str
    amount: Decimal
    currency: str
    due_date: date
    days_until_due: int
    is_overdue: bool


class FinancialAlert(BaseModel):
    """Schema for financial alert/notification."""

    id: str  # Unique identifier for the alert
    type: str  # "warning", "info", "success", "danger"
    category: str  # "subscription", "spending", "goal", "savings", etc.
    title: str
    message: str
    priority: int  # 1-5, higher is more important
    actionable: bool  # Whether user can take action
    action_url: Optional[str] = None


class DashboardOverviewResponse(BaseModel):
    """Schema for complete dashboard overview."""

    net_worth: NetWorthResponse
    cash_flow: CashFlowResponse
    financial_health: FinancialHealthResponse
    recent_activity: list[RecentActivityItem]
    upcoming_payments: list[UpcomingPayment]
    alerts: list[FinancialAlert]


# Analytics schemas for charts
class IncomeVsExpensesDataPoint(BaseModel):
    """Schema for income vs expenses chart data point."""

    month: str  # e.g., "Jan 2025"
    income: Decimal
    expenses: Decimal


class IncomeVsExpensesChartResponse(BaseModel):
    """Schema for income vs expenses chart response."""

    data: list[IncomeVsExpensesDataPoint]


class ExpenseByCategoryDataPoint(BaseModel):
    """Schema for expense by category data point."""

    category: str
    amount: Decimal
    percentage: float


class ExpenseByCategoryChartResponse(BaseModel):
    """Schema for expense by category chart response."""

    data: list[ExpenseByCategoryDataPoint]
    total: Decimal


class MonthlySpendingDataPoint(BaseModel):
    """Schema for monthly spending data point."""

    month: str
    amount: Decimal


class MonthlySpendingChartResponse(BaseModel):
    """Schema for monthly spending chart response."""

    data: list[MonthlySpendingDataPoint]
    average: Decimal
    total: Decimal


class NetWorthTrendDataPoint(BaseModel):
    """Schema for net worth trend data point."""

    month: str
    net_worth: Decimal = 0
    assets: Decimal = 0
    liabilities: Decimal = 0


class NetWorthTrendChartResponse(BaseModel):
    """Schema for net worth trend chart response."""

    data: list[NetWorthTrendDataPoint]
