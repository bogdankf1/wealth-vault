"""
Service layer for backup operations.
"""
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, Date, DateTime
from sqlalchemy.orm import selectinload
from typing import List, Dict, Any
from uuid import UUID
from datetime import datetime, date
from decimal import Decimal
from dateutil import parser as date_parser

from app.modules.backups.models import Backup
from app.modules.backups.schemas import BackupCreate, ModuleType
from app.modules.income.models import IncomeSource
from app.modules.expenses.models import Expense
from app.modules.subscriptions.models import Subscription
from app.modules.installments.models import Installment
from app.modules.budgets.models import Budget
from app.modules.savings.models import SavingsAccount
from app.modules.portfolio.models import PortfolioAsset
from app.modules.goals.models import Goal
from app.modules.debts.models import Debt
from app.modules.taxes.models import Tax


# Mapping of module types to their models
MODULE_MODELS = {
    "income": IncomeSource,
    "expenses": Expense,
    "subscriptions": Subscription,
    "installments": Installment,
    "budgets": Budget,
    "savings": SavingsAccount,
    "portfolio": PortfolioAsset,
    "goals": Goal,
    "debts": Debt,
    "taxes": Tax,
}


def model_to_dict(obj: Any) -> Dict[str, Any]:
    """
    Convert SQLAlchemy model instance to dictionary.
    Excludes internal fields and user_id.
    """
    data = {}
    for column in obj.__table__.columns:
        # Exclude these fields from backup
        if column.name in ['id', 'user_id', 'created_at', 'updated_at', 'deleted_at']:
            continue
        value = getattr(obj, column.name)
        # Convert datetime objects to ISO format strings
        if isinstance(value, datetime):
            data[column.name] = value.isoformat()
        # Convert date objects to ISO format strings
        elif isinstance(value, date):
            data[column.name] = value.isoformat()
        # Convert Decimal to float for JSON serialization
        elif isinstance(value, Decimal):
            data[column.name] = float(value)
        else:
            data[column.name] = value
    return data


def dict_to_model_data(model: Any, item_data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Convert dictionary to model data, parsing date/datetime strings back to proper objects.

    Args:
        model: SQLAlchemy model class
        item_data: Dictionary with backup data (contains ISO format strings for dates)

    Returns:
        Dictionary with proper Python types for model constructor
    """
    converted_data = {}

    for column in model.__table__.columns:
        # Skip fields that are not in backup data
        if column.name not in item_data:
            continue

        value = item_data[column.name]

        # Skip None values
        if value is None:
            converted_data[column.name] = None
            continue

        # Parse date strings back to date objects
        if isinstance(column.type, Date) and isinstance(value, str):
            try:
                parsed = date_parser.parse(value)
                # If column is Date (not DateTime), extract just the date
                if type(column.type).__name__ == 'Date':
                    converted_data[column.name] = parsed.date()
                else:
                    converted_data[column.name] = parsed
            except (ValueError, TypeError):
                converted_data[column.name] = value
        # Parse datetime strings back to datetime objects
        elif isinstance(column.type, DateTime) and isinstance(value, str):
            try:
                converted_data[column.name] = date_parser.parse(value)
            except (ValueError, TypeError):
                converted_data[column.name] = value
        else:
            converted_data[column.name] = value

    return converted_data


async def create_backup(
    db: AsyncSession,
    user_id: UUID,
    backup_data: BackupCreate
) -> Backup:
    """
    Create a backup of all items from a specific module for the user.

    Args:
        db: Database session
        user_id: User ID
        backup_data: Backup creation data

    Returns:
        Created backup object
    """
    module_type = backup_data.module_type
    model = MODULE_MODELS.get(module_type)

    if not model:
        raise ValueError(f"Invalid module type: {module_type}")

    # Query all items for this module and user
    query = select(model).where(model.user_id == user_id)

    # Exclude soft-deleted items if the model supports soft deletes
    if hasattr(model, 'deleted_at'):
        query = query.where(model.deleted_at.is_(None))

    result = await db.execute(query)
    items = result.scalars().all()

    # Convert items to dictionaries
    items_data = [model_to_dict(item) for item in items]

    # Create backup
    backup = Backup(
        user_id=user_id,
        module_type=module_type,
        backup_data=items_data
    )

    db.add(backup)
    await db.commit()
    await db.refresh(backup)

    return backup


async def get_user_backups(
    db: AsyncSession,
    user_id: UUID
) -> List[Backup]:
    """
    Get all backups for a user.

    Args:
        db: Database session
        user_id: User ID

    Returns:
        List of user's backups
    """
    result = await db.execute(
        select(Backup)
        .where(and_(
            Backup.user_id == user_id,
            Backup.deleted_at.is_(None)
        ))
        .order_by(Backup.created_at.desc())
    )
    return list(result.scalars().all())


async def restore_backup(
    db: AsyncSession,
    user_id: UUID,
    backup_id: UUID
) -> int:
    """
    Restore a backup by replacing all existing items with the backup data.
    This will DELETE all current items and restore from the backup.

    Args:
        db: Database session
        user_id: User ID
        backup_id: Backup ID to restore

    Returns:
        Number of items restored

    Raises:
        ValueError: If backup not found or doesn't belong to user
    """
    # Get the backup
    result = await db.execute(
        select(Backup).where(and_(
            Backup.id == backup_id,
            Backup.user_id == user_id,
            Backup.deleted_at.is_(None)
        ))
    )
    backup = result.scalar_one_or_none()

    if not backup:
        raise ValueError("Backup not found")

    module_type = backup.module_type
    model = MODULE_MODELS.get(module_type)

    if not model:
        raise ValueError(f"Invalid module type: {module_type}")

    # Delete all existing items for this module and user
    delete_query = select(model).where(model.user_id == user_id)

    # Exclude soft-deleted items if the model supports soft deletes
    if hasattr(model, 'deleted_at'):
        delete_query = delete_query.where(model.deleted_at.is_(None))

    existing_items_result = await db.execute(delete_query)
    existing_items = existing_items_result.scalars().all()

    # Delete all existing items
    for item in existing_items:
        await db.delete(item)

    await db.flush()  # Flush deletions before creating new items

    # Create new items from backup data
    restored_count = 0
    for item_data in backup.backup_data:
        # Convert data types from JSON to proper Python objects
        converted_data = dict_to_model_data(model, item_data)

        # Create new instance with user_id
        new_item = model(
            user_id=user_id,
            **converted_data
        )
        db.add(new_item)
        restored_count += 1

    await db.commit()

    return restored_count


async def delete_backup(
    db: AsyncSession,
    user_id: UUID,
    backup_id: UUID
) -> bool:
    """
    Soft delete a backup.

    Args:
        db: Database session
        user_id: User ID
        backup_id: Backup ID to delete

    Returns:
        True if deleted successfully

    Raises:
        ValueError: If backup not found or doesn't belong to user
    """
    result = await db.execute(
        select(Backup).where(and_(
            Backup.id == backup_id,
            Backup.user_id == user_id,
            Backup.deleted_at.is_(None)
        ))
    )
    backup = result.scalar_one_or_none()

    if not backup:
        raise ValueError("Backup not found")

    # Soft delete
    backup.deleted_at = datetime.utcnow()
    await db.commit()

    return True
