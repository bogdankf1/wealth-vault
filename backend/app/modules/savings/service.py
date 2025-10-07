"""
Savings module service layer
"""
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_
from typing import Optional, Tuple, List
from uuid import UUID
from decimal import Decimal
from datetime import datetime, timedelta

from app.modules.savings.models import SavingsAccount, BalanceHistory, AccountType
from app.modules.savings.schemas import (
    SavingsAccountCreate,
    SavingsAccountUpdate,
    BalanceHistoryCreate,
    SavingsStats
)


async def create_account(
    db: AsyncSession,
    user_id: UUID,
    account_data: SavingsAccountCreate
) -> SavingsAccount:
    """Create a new savings account"""
    account = SavingsAccount(
        user_id=user_id,
        **account_data.model_dump()
    )
    db.add(account)
    await db.commit()
    await db.refresh(account)

    # Create initial balance history entry
    if account.current_balance > 0:
        history = BalanceHistory(
            account_id=account.id,
            balance=account.current_balance,
            date=datetime.utcnow(),
            change_reason="Initial balance"
        )
        db.add(history)
        await db.commit()

    return account


async def get_account(
    db: AsyncSession,
    user_id: UUID,
    account_id: UUID
) -> Optional[SavingsAccount]:
    """Get a single savings account"""
    query = select(SavingsAccount).where(
        and_(
            SavingsAccount.id == account_id,
            SavingsAccount.user_id == user_id
        )
    )
    result = await db.execute(query)
    return result.scalar_one_or_none()


async def list_accounts(
    db: AsyncSession,
    user_id: UUID,
    skip: int = 0,
    limit: int = 50,
    account_type: Optional[AccountType] = None,
    is_active: Optional[bool] = None
) -> Tuple[List[SavingsAccount], int]:
    """List savings accounts with filters"""
    query = select(SavingsAccount).where(SavingsAccount.user_id == user_id)

    # Apply filters
    if account_type:
        query = query.where(SavingsAccount.account_type == account_type)
    if is_active is not None:
        query = query.where(SavingsAccount.is_active == is_active)

    # Get total count
    count_query = select(func.count()).select_from(query.subquery())
    total_result = await db.execute(count_query)
    total = total_result.scalar_one()

    # Apply pagination
    query = query.order_by(SavingsAccount.created_at.desc())
    query = query.offset(skip).limit(limit)

    result = await db.execute(query)
    accounts = result.scalars().all()

    return list(accounts), total


async def update_account(
    db: AsyncSession,
    user_id: UUID,
    account_id: UUID,
    account_data: SavingsAccountUpdate
) -> Optional[SavingsAccount]:
    """Update a savings account"""
    account = await get_account(db, user_id, account_id)
    if not account:
        return None

    # Track balance changes
    old_balance = account.current_balance
    update_dict = account_data.model_dump(exclude_unset=True)

    # Update account
    for key, value in update_dict.items():
        setattr(account, key, value)

    account.updated_at = datetime.utcnow()
    await db.commit()
    await db.refresh(account)

    # If balance changed, create history entry
    if "current_balance" in update_dict and update_dict["current_balance"] != old_balance:
        new_balance = update_dict["current_balance"]
        change = new_balance - old_balance
        history = BalanceHistory(
            account_id=account.id,
            balance=new_balance,
            date=datetime.utcnow(),
            change_amount=change,
            change_reason="Balance update"
        )
        db.add(history)
        await db.commit()

    return account


async def delete_account(
    db: AsyncSession,
    user_id: UUID,
    account_id: UUID
) -> bool:
    """Delete a savings account"""
    account = await get_account(db, user_id, account_id)
    if not account:
        return False

    await db.delete(account)
    await db.commit()
    return True


async def get_balance_history(
    db: AsyncSession,
    user_id: UUID,
    account_id: UUID,
    days: int = 30
) -> List[BalanceHistory]:
    """Get balance history for an account"""
    # Verify account belongs to user
    account = await get_account(db, user_id, account_id)
    if not account:
        return []

    cutoff_date = datetime.utcnow() - timedelta(days=days)
    query = select(BalanceHistory).where(
        and_(
            BalanceHistory.account_id == account_id,
            BalanceHistory.date >= cutoff_date
        )
    ).order_by(BalanceHistory.date.asc())

    result = await db.execute(query)
    return list(result.scalars().all())


async def add_balance_history(
    db: AsyncSession,
    user_id: UUID,
    account_id: UUID,
    history_data: BalanceHistoryCreate
) -> Optional[BalanceHistory]:
    """Add a balance history entry"""
    # Verify account belongs to user
    account = await get_account(db, user_id, account_id)
    if not account:
        return None

    history = BalanceHistory(
        account_id=account_id,
        **history_data.model_dump()
    )
    db.add(history)

    # Update account's current balance if this is the latest entry
    if history_data.date >= account.updated_at:
        account.current_balance = history_data.balance
        account.updated_at = datetime.utcnow()

    await db.commit()
    await db.refresh(history)
    return history


async def get_savings_stats(
    db: AsyncSession,
    user_id: UUID
) -> SavingsStats:
    """Get savings statistics for user"""
    # Get all accounts
    query = select(SavingsAccount).where(SavingsAccount.user_id == user_id)
    result = await db.execute(query)
    accounts = result.scalars().all()

    total_accounts = len(accounts)
    active_accounts = sum(1 for acc in accounts if acc.is_active)

    # Calculate totals by currency
    balance_by_currency = {}
    for account in accounts:
        if account.is_active:
            currency = account.currency
            balance_by_currency[currency] = balance_by_currency.get(currency, Decimal(0)) + account.current_balance

    # Calculate totals by account type (simplified - no conversion for now)
    balance_by_type = {}
    for account in accounts:
        if account.is_active:
            acc_type = account.account_type
            balance_by_type[acc_type] = balance_by_type.get(acc_type, Decimal(0)) + account.current_balance

    # TODO: Implement currency conversion for accurate net worth
    # For now, assuming all balances are in USD or sum them as-is
    total_balance_usd = sum(balance_by_currency.values())

    return SavingsStats(
        total_accounts=total_accounts,
        active_accounts=active_accounts,
        total_balance_usd=total_balance_usd,
        total_balance_by_currency=balance_by_currency,
        total_balance_by_type=balance_by_type,
        net_worth=total_balance_usd
    )
