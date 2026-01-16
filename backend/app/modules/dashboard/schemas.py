"""
Dashboard Pydantic schemas for request/response validation.
"""
from datetime import date, datetime
from decimal import Decimal
from typing import Optional, List
from uuid import UUID

from pydantic import BaseModel


class NetWorthResponse(BaseModel):
    """Schema for net worth calculation response."""

    total_assets: Decimal
    total_liabilities: Decimal
    net_worth: Decimal
    portfolio_value: Decimal
    savings_balance: Decimal
    debts_receivable: Decimal = Decimal('0')  # Debts owed TO user (assets)
    total_debt: Decimal  # Installments (liabilities)
    currency: str

    # Optional breakdown details
    assets_breakdown: Optional[dict] = None
    liabilities_breakdown: Optional[dict] = None


class CashFlowResponse(BaseModel):
    """Schema for monthly cash flow response."""

    monthly_income: Decimal
    monthly_expenses: Decimal
    monthly_subscriptions: Decimal
    monthly_installments: Decimal
    monthly_taxes: Decimal
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


class IncomeBreakdownDataPoint(BaseModel):
    """Schema for income breakdown data point."""

    category: str  # "Expenses", "Subscriptions", "Installments", "Net Savings"
    amount: Decimal
    percentage: float


class IncomeBreakdownChartResponse(BaseModel):
    """Schema for income breakdown chart response."""

    data: list[IncomeBreakdownDataPoint]
    total_income: Decimal
    currency: str


# ============================================================================
# Snapshot Schemas
# ============================================================================

class NetWorthSnapshotResponse(BaseModel):
    """Schema for net worth snapshot response."""

    id: UUID
    snapshot_date: datetime
    snapshot_type: str

    # Assets
    total_assets: Decimal
    savings_total: Decimal
    portfolio_total: Decimal
    debts_receivable_total: Decimal

    # Liabilities
    total_liabilities: Decimal
    installments_total: Decimal

    # Net worth
    net_worth: Decimal

    # Change tracking
    change_from_previous: Optional[Decimal] = None
    percentage_change: Optional[Decimal] = None

    # Breakdowns
    assets_breakdown: Optional[dict] = None
    liabilities_breakdown: Optional[dict] = None

    currency: str
    created_at: datetime

    class Config:
        from_attributes = True


class NetWorthSnapshotListResponse(BaseModel):
    """Schema for paginated list of net worth snapshots."""

    items: List[NetWorthSnapshotResponse]
    total: int


class CashFlowSnapshotResponse(BaseModel):
    """Schema for cash flow snapshot response."""

    id: UUID
    period_start: datetime
    period_end: datetime
    period_type: str

    total_income: Decimal
    total_expenses: Decimal
    total_subscriptions: Decimal
    total_installments: Decimal
    total_taxes: Decimal
    net_cash_flow: Decimal
    savings_rate: Optional[Decimal] = None

    income_breakdown: Optional[dict] = None
    expenses_breakdown: Optional[dict] = None

    currency: str
    created_at: datetime

    class Config:
        from_attributes = True


class FinancialProjectionsResponse(BaseModel):
    """Schema for financial projections response."""

    # Current state
    current_net_worth: Decimal
    current_monthly_savings: Decimal
    current_savings_rate: Decimal

    # Projections (based on current trends)
    projected_net_worth_1_year: Decimal
    projected_net_worth_3_years: Decimal
    projected_net_worth_5_years: Decimal
    projected_net_worth_10_years: Decimal

    # Assumptions
    assumed_annual_return: Decimal  # Investment return rate used
    assumed_monthly_savings: Decimal

    currency: str


class GoalProjectionItem(BaseModel):
    """Schema for individual goal projection."""

    goal_id: UUID
    goal_name: str
    target_amount: Decimal
    current_amount: Decimal
    progress_percentage: Decimal
    monthly_contribution: Decimal
    projected_completion_date: Optional[date] = None
    months_to_completion: Optional[int] = None
    on_track: bool


class GoalProjectionsResponse(BaseModel):
    """Schema for goal projections response."""

    goals: List[GoalProjectionItem]
    total_goal_targets: Decimal
    total_current_progress: Decimal
    overall_progress_percentage: Decimal


class CreateSnapshotRequest(BaseModel):
    """Schema for manual snapshot creation request."""

    snapshot_type: str = "manual"  # manual, event


class UpcomingPaymentEnhanced(BaseModel):
    """Enhanced upcoming payment with more details."""

    id: UUID
    module: str  # subscriptions, installments, taxes
    name: str
    amount: Decimal
    currency: str
    due_date: date
    days_until_due: int
    is_overdue: bool
    payment_account: Optional[str] = None
    auto_pay: bool = False
    frequency: str


# ============================================================================
# Failed Payments Schemas
# ============================================================================

class FailedPaymentItem(BaseModel):
    """Schema for a failed payment item."""

    id: UUID
    payment_type: str  # "expense", "installment", "subscription"
    name: str
    amount: Decimal
    currency: str
    account_name: Optional[str] = None
    account_id: Optional[UUID] = None
    failure_date: datetime
    status: str


class FailedPaymentsResponse(BaseModel):
    """Schema for failed payments list response."""

    items: List[FailedPaymentItem]
    total: int
    has_failed_payments: bool
