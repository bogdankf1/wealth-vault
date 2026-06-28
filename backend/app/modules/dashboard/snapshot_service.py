"""
Snapshot service for creating and managing historical net worth and cash flow data.
"""
from datetime import datetime, timedelta
from decimal import Decimal
from typing import Optional, List, Dict, Any
from uuid import UUID

from sqlalchemy import and_, select, desc
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.dashboard.models import NetWorthSnapshot, CashFlowSnapshot
from app.modules.portfolio.models import PortfolioAsset
from app.modules.savings.models import SavingsAccount
from app.modules.installments.models import Installment
from app.modules.debts.models import Debt
from app.services.currency_service import CurrencyService
from app.modules.dashboard.service import get_user_display_currency

import logging

logger = logging.getLogger(__name__)


async def calculate_net_worth_with_debts(
    db: AsyncSession,
    user_id: UUID,
    display_currency: Optional[str] = None
) -> Dict[str, Any]:
    """
    Calculate complete net worth including debts owed TO the user.

    Net Worth = Total Assets - Total Liabilities

    Total Assets:
    - Savings account balances
    - Portfolio asset current values
    - Debts owed TO user (receivables)

    Total Liabilities:
    - Installment remaining balances

    Returns a dictionary with all breakdown details.
    """
    if not display_currency:
        display_currency = await get_user_display_currency(db, user_id)

    currency_service = CurrencyService(db)

    # =========================================================================
    # ASSETS
    # =========================================================================

    # 1. Savings Accounts
    savings_query = select(SavingsAccount).where(
        and_(
            SavingsAccount.user_id == user_id,
            SavingsAccount.is_active == True
        )
    )
    savings_result = await db.execute(savings_query)
    savings_accounts = savings_result.scalars().all()

    savings_total = Decimal('0')
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

            savings_total += amount
            savings_breakdown[account.name] = float(amount)

    # 2. Portfolio Assets
    portfolio_query = select(PortfolioAsset).where(
        and_(
            PortfolioAsset.user_id == user_id,
            PortfolioAsset.is_active == True
        )
    )
    portfolio_result = await db.execute(portfolio_query)
    portfolio_assets = portfolio_result.scalars().all()

    portfolio_total = Decimal('0')
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

            portfolio_total += amount
            portfolio_breakdown[asset.asset_name] = float(amount)

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

    debts_receivable_total = Decimal('0')
    debts_receivable_breakdown = {}
    for debt in debts:
        # Calculate remaining balance (amount - amount_paid)
        remaining = (debt.amount or Decimal('0')) - (debt.amount_paid or Decimal('0'))
        if remaining > 0:
            if debt.currency == display_currency:
                amount = remaining
            else:
                converted = await currency_service.convert_amount(
                    remaining, debt.currency, display_currency
                )
                amount = converted if converted else Decimal('0')

            debts_receivable_total += amount
            # Use debtor name as key
            debtor_name = debt.debtor_name or f"Debt {debt.id}"
            debts_receivable_breakdown[debtor_name] = float(amount)

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

    installments_total = Decimal('0')
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

            installments_total += amount
            installments_breakdown[installment.name] = float(amount)

    # =========================================================================
    # TOTALS
    # =========================================================================

    total_assets = savings_total + portfolio_total + debts_receivable_total
    total_liabilities = installments_total
    net_worth = total_assets - total_liabilities

    return {
        "total_assets": total_assets,
        "savings_total": savings_total,
        "portfolio_total": portfolio_total,
        "debts_receivable_total": debts_receivable_total,
        "total_liabilities": total_liabilities,
        "installments_total": installments_total,
        "net_worth": net_worth,
        "assets_breakdown": {
            "savings": savings_breakdown,
            "portfolio": portfolio_breakdown,
            "debts_receivable": debts_receivable_breakdown
        },
        "liabilities_breakdown": {
            "installments": installments_breakdown
        },
        "currency": display_currency
    }


async def create_net_worth_snapshot(
    db: AsyncSession,
    user_id: UUID,
    snapshot_type: str = "monthly",
    snapshot_date: Optional[datetime] = None
) -> NetWorthSnapshot:
    """
    Create a net worth snapshot for the given user.

    Args:
        db: Database session
        user_id: User ID
        snapshot_type: Type of snapshot (monthly, daily, manual, event)
        snapshot_date: Date for the snapshot (defaults to now)

    Returns:
        Created NetWorthSnapshot object
    """
    if snapshot_date is None:
        snapshot_date = datetime.utcnow()

    # Calculate current net worth
    net_worth_data = await calculate_net_worth_with_debts(db, user_id)

    # Get previous snapshot to calculate change
    previous_snapshot = await get_previous_snapshot(db, user_id, snapshot_date)

    change_from_previous = None
    percentage_change = None
    if previous_snapshot:
        change_from_previous = net_worth_data["net_worth"] - previous_snapshot.net_worth
        if previous_snapshot.net_worth != 0:
            percentage_change = (change_from_previous / previous_snapshot.net_worth) * 100

    # Create snapshot
    snapshot = NetWorthSnapshot(
        user_id=user_id,
        snapshot_date=snapshot_date,
        snapshot_type=snapshot_type,
        total_assets=net_worth_data["total_assets"],
        savings_total=net_worth_data["savings_total"],
        portfolio_total=net_worth_data["portfolio_total"],
        debts_receivable_total=net_worth_data["debts_receivable_total"],
        total_liabilities=net_worth_data["total_liabilities"],
        installments_total=net_worth_data["installments_total"],
        net_worth=net_worth_data["net_worth"],
        change_from_previous=change_from_previous,
        percentage_change=percentage_change,
        assets_breakdown=net_worth_data["assets_breakdown"],
        liabilities_breakdown=net_worth_data["liabilities_breakdown"],
        currency=net_worth_data["currency"]
    )

    db.add(snapshot)
    await db.commit()
    await db.refresh(snapshot)

    logger.info(f"Created {snapshot_type} net worth snapshot for user {user_id}: {net_worth_data['net_worth']}")

    return snapshot


async def get_previous_snapshot(
    db: AsyncSession,
    user_id: UUID,
    before_date: datetime
) -> Optional[NetWorthSnapshot]:
    """Get the most recent snapshot before the given date."""
    query = select(NetWorthSnapshot).where(
        and_(
            NetWorthSnapshot.user_id == user_id,
            NetWorthSnapshot.snapshot_date < before_date
        )
    ).order_by(desc(NetWorthSnapshot.snapshot_date)).limit(1)

    result = await db.execute(query)
    return result.scalar_one_or_none()


async def get_latest_snapshot(
    db: AsyncSession,
    user_id: UUID
) -> Optional[NetWorthSnapshot]:
    """Get the most recent snapshot for the user."""
    query = select(NetWorthSnapshot).where(
        NetWorthSnapshot.user_id == user_id
    ).order_by(desc(NetWorthSnapshot.snapshot_date)).limit(1)

    result = await db.execute(query)
    return result.scalar_one_or_none()


async def get_snapshots_for_period(
    db: AsyncSession,
    user_id: UUID,
    start_date: datetime,
    end_date: datetime,
    snapshot_type: Optional[str] = None
) -> List[NetWorthSnapshot]:
    """
    Get all snapshots for a user within a date range.

    Args:
        db: Database session
        user_id: User ID
        start_date: Start of period
        end_date: End of period
        snapshot_type: Optional filter by type (monthly, daily, manual)

    Returns:
        List of snapshots ordered by date ascending
    """
    conditions = [
        NetWorthSnapshot.user_id == user_id,
        NetWorthSnapshot.snapshot_date >= start_date,
        NetWorthSnapshot.snapshot_date <= end_date
    ]

    if snapshot_type:
        conditions.append(NetWorthSnapshot.snapshot_type == snapshot_type)

    query = select(NetWorthSnapshot).where(
        and_(*conditions)
    ).order_by(NetWorthSnapshot.snapshot_date)

    result = await db.execute(query)
    return list(result.scalars().all())


async def get_monthly_snapshots(
    db: AsyncSession,
    user_id: UUID,
    months: int = 12
) -> List[NetWorthSnapshot]:
    """
    Get monthly snapshots for the last N months.

    Args:
        db: Database session
        user_id: User ID
        months: Number of months to retrieve

    Returns:
        List of monthly snapshots
    """
    start_date = datetime.utcnow() - timedelta(days=months * 31)

    query = select(NetWorthSnapshot).where(
        and_(
            NetWorthSnapshot.user_id == user_id,
            NetWorthSnapshot.snapshot_date >= start_date,
            NetWorthSnapshot.snapshot_type == "monthly"
        )
    ).order_by(NetWorthSnapshot.snapshot_date)

    result = await db.execute(query)
    return list(result.scalars().all())


async def check_and_create_monthly_snapshot(
    db: AsyncSession,
    user_id: UUID
) -> Optional[NetWorthSnapshot]:
    """
    Check if a monthly snapshot exists for the current month, create if not.

    This is used by the Celery task to ensure we don't create duplicate snapshots.

    Returns:
        Created snapshot or None if one already exists
    """
    now = datetime.utcnow()
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    month_end = (month_start + timedelta(days=32)).replace(day=1) - timedelta(seconds=1)

    # Check if snapshot already exists for this month
    existing_query = select(NetWorthSnapshot).where(
        and_(
            NetWorthSnapshot.user_id == user_id,
            NetWorthSnapshot.snapshot_type == "monthly",
            NetWorthSnapshot.snapshot_date >= month_start,
            NetWorthSnapshot.snapshot_date <= month_end
        )
    ).limit(1)

    result = await db.execute(existing_query)
    existing = result.scalar_one_or_none()

    if existing:
        logger.debug(f"Monthly snapshot already exists for user {user_id} for {now.strftime('%Y-%m')}")
        return None

    # Create new monthly snapshot
    return await create_net_worth_snapshot(
        db,
        user_id,
        snapshot_type="monthly",
        snapshot_date=month_start  # Use first of month
    )


async def backfill_monthly_snapshots(
    db: AsyncSession,
    user_id: UUID,
    months: int = 6
) -> List[NetWorthSnapshot]:
    """
    Create historical monthly snapshots for a user.

    This is useful for new users or when enabling snapshot tracking.
    Note: Historical snapshots will use current data since we can't
    go back in time. This creates a baseline for future tracking.

    Args:
        db: Database session
        user_id: User ID
        months: Number of months to backfill

    Returns:
        List of created snapshots
    """
    created_snapshots = []
    now = datetime.utcnow()

    for i in range(months, -1, -1):
        # Calculate the first day of each month
        target_date = (now.replace(day=1) - timedelta(days=i * 30)).replace(day=1)

        # Check if snapshot exists
        month_start = target_date.replace(hour=0, minute=0, second=0, microsecond=0)
        month_end = (month_start + timedelta(days=32)).replace(day=1) - timedelta(seconds=1)

        existing_query = select(NetWorthSnapshot).where(
            and_(
                NetWorthSnapshot.user_id == user_id,
                NetWorthSnapshot.snapshot_type == "monthly",
                NetWorthSnapshot.snapshot_date >= month_start,
                NetWorthSnapshot.snapshot_date <= month_end
            )
        ).limit(1)

        result = await db.execute(existing_query)
        if result.scalar_one_or_none():
            continue

        # Create snapshot with current data (best we can do for historical)
        snapshot = await create_net_worth_snapshot(
            db,
            user_id,
            snapshot_type="monthly",
            snapshot_date=month_start
        )
        created_snapshots.append(snapshot)

    return created_snapshots


# ============================================================================
# Cash Flow Snapshot Functions
# ============================================================================

async def create_cash_flow_snapshot(
    db: AsyncSession,
    user_id: UUID,
    period_start: datetime,
    period_end: datetime,
    period_type: str = "monthly"
) -> CashFlowSnapshot:
    """
    Create a cash flow snapshot for the given period.

    This uses actual transaction data when available, falling back to
    expected values for projections.
    """
    from app.modules.dashboard.service import get_cash_flow

    # Get cash flow data for the period
    cash_flow_data = await get_cash_flow(
        db, user_id,
        start_date=period_start,
        end_date=period_end
    )

    # Create snapshot
    snapshot = CashFlowSnapshot(
        user_id=user_id,
        period_start=period_start,
        period_end=period_end,
        period_type=period_type,
        total_income=cash_flow_data.monthly_income,
        total_expenses=cash_flow_data.monthly_expenses,
        total_subscriptions=cash_flow_data.monthly_subscriptions,
        total_installments=cash_flow_data.monthly_installments,
        total_taxes=cash_flow_data.monthly_taxes,
        net_cash_flow=cash_flow_data.net_cash_flow,
        savings_rate=cash_flow_data.savings_rate,
        currency=cash_flow_data.currency
    )

    db.add(snapshot)
    await db.commit()
    await db.refresh(snapshot)

    logger.info(f"Created {period_type} cash flow snapshot for user {user_id}: net={cash_flow_data.net_cash_flow}")

    return snapshot


async def get_cash_flow_snapshots_for_period(
    db: AsyncSession,
    user_id: UUID,
    start_date: datetime,
    end_date: datetime
) -> List[CashFlowSnapshot]:
    """Get all cash flow snapshots within a date range."""
    query = select(CashFlowSnapshot).where(
        and_(
            CashFlowSnapshot.user_id == user_id,
            CashFlowSnapshot.period_start >= start_date,
            CashFlowSnapshot.period_end <= end_date
        )
    ).order_by(CashFlowSnapshot.period_start)

    result = await db.execute(query)
    return list(result.scalars().all())
