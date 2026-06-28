"""
Dashboard models for historical data tracking.
"""
from datetime import datetime
from uuid import uuid4

from sqlalchemy import Column, DateTime, ForeignKey, Numeric, String, Index, JSON
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from app.core.database import Base


class NetWorthSnapshot(Base):
    """
    Stores historical net worth snapshots for tracking financial progress over time.

    Snapshots are created:
    - Automatically on the 1st of each month (via Celery task)
    - Manually by user request
    - On significant financial events (optional)
    """
    __tablename__ = "net_worth_snapshots"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)

    # Snapshot metadata
    snapshot_date = Column(DateTime, nullable=False, index=True)
    snapshot_type = Column(String(20), default="monthly")  # monthly, daily, manual, event

    # Assets breakdown
    total_assets = Column(Numeric(14, 2), nullable=False, default=0)
    savings_total = Column(Numeric(14, 2), nullable=False, default=0)
    portfolio_total = Column(Numeric(14, 2), nullable=False, default=0)
    debts_receivable_total = Column(Numeric(14, 2), nullable=False, default=0)  # Debts owed TO user

    # Liabilities breakdown
    total_liabilities = Column(Numeric(14, 2), nullable=False, default=0)
    installments_total = Column(Numeric(14, 2), nullable=False, default=0)

    # Net worth
    net_worth = Column(Numeric(14, 2), nullable=False, default=0)

    # Change tracking (compared to previous snapshot)
    change_from_previous = Column(Numeric(14, 2), nullable=True)
    percentage_change = Column(Numeric(7, 4), nullable=True)  # e.g., 5.25 = 5.25%

    # Detailed breakdown (JSON for flexibility and charts)
    assets_breakdown = Column(JSON, nullable=True)
    # Structure: {
    #   "savings": {"Account Name": amount, ...},
    #   "portfolio": {"Asset Name": amount, ...},
    #   "debts_receivable": {"Debtor Name": amount, ...}
    # }

    liabilities_breakdown = Column(JSON, nullable=True)
    # Structure: {
    #   "installments": {"Installment Name": remaining_balance, ...}
    # }

    # Currency (all amounts converted to this currency)
    currency = Column(String(3), nullable=False, default="USD")

    # Timestamps
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    # Indexes for efficient querying
    __table_args__ = (
        Index("ix_net_worth_snapshots_user_date", "user_id", "snapshot_date"),
        Index("ix_net_worth_snapshots_user_type", "user_id", "snapshot_type"),
    )

    # Relationships
    user = relationship("User", back_populates="net_worth_snapshots")

    def __repr__(self):
        return f"<NetWorthSnapshot {self.snapshot_date.strftime('%Y-%m-%d')} net_worth={self.net_worth}>"


class CashFlowSnapshot(Base):
    """
    Stores monthly cash flow snapshots for tracking income vs expenses over time.

    Unlike net worth which is a point-in-time balance,
    cash flow represents the flow of money during a period.
    """
    __tablename__ = "cash_flow_snapshots"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)

    # Period
    period_start = Column(DateTime, nullable=False)
    period_end = Column(DateTime, nullable=False)
    period_type = Column(String(20), default="monthly")  # monthly, quarterly, yearly

    # Income (actual received, not expected)
    total_income = Column(Numeric(14, 2), nullable=False, default=0)
    income_breakdown = Column(JSON, nullable=True)
    # Structure: {"Source Name": amount, ...}

    # Expenses (actual paid)
    total_expenses = Column(Numeric(14, 2), nullable=False, default=0)
    expenses_breakdown = Column(JSON, nullable=True)
    # Structure: {"Category": amount, ...}

    # Subscriptions paid
    total_subscriptions = Column(Numeric(14, 2), nullable=False, default=0)

    # Installments paid
    total_installments = Column(Numeric(14, 2), nullable=False, default=0)

    # Taxes paid
    total_taxes = Column(Numeric(14, 2), nullable=False, default=0)

    # Net cash flow
    net_cash_flow = Column(Numeric(14, 2), nullable=False, default=0)
    savings_rate = Column(Numeric(7, 4), nullable=True)  # Percentage

    # Currency
    currency = Column(String(3), nullable=False, default="USD")

    # Timestamps
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    # Indexes
    __table_args__ = (
        Index("ix_cash_flow_snapshots_user_period", "user_id", "period_start", "period_end"),
    )

    # Relationships
    user = relationship("User", back_populates="cash_flow_snapshots")

    def __repr__(self):
        return f"<CashFlowSnapshot {self.period_start.strftime('%Y-%m')} net={self.net_cash_flow}>"
