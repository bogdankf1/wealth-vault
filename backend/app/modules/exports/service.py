"""
Export service for generating data exports
"""
import csv
import io
from datetime import datetime
from typing import List, Dict, Any
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, or_, extract
from uuid import UUID

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
from app.modules.exports.schemas import EntryType, ExportFormat


# Field mappings for CSV export
FIELD_MAPPINGS = {
    "income": [
        ("name", "Name"),
        ("category", "Category"),
        ("amount", "Amount"),
        ("currency", "Currency"),
        ("frequency", "Frequency"),
        ("start_date", "Start Date"),
        ("description", "Description"),
        ("is_active", "Active"),
    ],
    "expenses": [
        ("name", "Name"),
        ("category", "Category"),
        ("amount", "Amount"),
        ("currency", "Currency"),
        ("frequency", "Frequency"),
        ("start_date", "Start Date"),
        ("description", "Description"),
        ("is_active", "Active"),
    ],
    "subscriptions": [
        ("name", "Name"),
        ("category", "Category"),
        ("amount", "Amount"),
        ("currency", "Currency"),
        ("billing_cycle", "Billing Cycle"),
        ("start_date", "Start Date"),
        ("next_billing_date", "Next Billing"),
        ("description", "Description"),
        ("is_active", "Active"),
    ],
    "installments": [
        ("name", "Name"),
        ("category", "Category"),
        ("total_amount", "Total Amount"),
        ("amount_per_payment", "Payment Amount"),
        ("currency", "Currency"),
        ("interest_rate", "Interest Rate %"),
        ("frequency", "Frequency"),
        ("number_of_payments", "Total Payments"),
        ("payments_made", "Payments Made"),
        ("remaining_balance", "Remaining Balance"),
        ("start_date", "Start Date"),
        ("first_payment_date", "First Payment Date"),
        ("end_date", "End Date"),
        ("description", "Description"),
        ("is_active", "Active"),
    ],
    "budgets": [
        ("name", "Name"),
        ("category", "Category"),
        ("amount", "Amount"),
        ("currency", "Currency"),
        ("period", "Period"),
        ("start_date", "Start Date"),
        ("end_date", "End Date"),
        ("description", "Description"),
        ("is_active", "Active"),
    ],
    "savings": [
        ("name", "Name"),
        ("account_type", "Account Type"),
        ("current_balance", "Current Balance"),
        ("currency", "Currency"),
        ("institution", "Institution"),
        ("account_number_last4", "Account #"),
        ("interest_rate", "Interest Rate"),
        ("notes", "Notes"),
        ("is_active", "Active"),
    ],
    "portfolio": [
        ("asset_name", "Asset Name"),
        ("symbol", "Symbol"),
        ("asset_type", "Asset Type"),
        ("quantity", "Quantity"),
        ("purchase_price", "Purchase Price"),
        ("current_value", "Current Value"),
        ("currency", "Currency"),
        ("purchase_date", "Purchase Date"),
        ("notes", "Notes"),
    ],
    "goals": [
        ("name", "Name"),
        ("category", "Category"),
        ("target_amount", "Target Amount"),
        ("current_amount", "Current Amount"),
        ("currency", "Currency"),
        ("target_date", "Target Date"),
        ("description", "Description"),
        ("priority", "Priority"),
        ("is_active", "Active"),
    ],
    "debts": [
        ("name", "Name"),
        ("debt_type", "Debt Type"),
        ("total_amount", "Total Amount"),
        ("remaining_amount", "Remaining Amount"),
        ("currency", "Currency"),
        ("interest_rate", "Interest Rate"),
        ("minimum_payment", "Minimum Payment"),
        ("due_date", "Due Date"),
        ("creditor", "Creditor"),
        ("is_active", "Active"),
    ],
    "taxes": [
        ("name", "Name"),
        ("tax_type", "Tax Type"),
        ("fixed_amount", "Fixed Amount"),
        ("percentage", "Percentage"),
        ("currency", "Currency"),
        ("frequency", "Frequency"),
        ("description", "Description"),
        ("notes", "Notes"),
        ("is_active", "Active"),
    ],
}

MODEL_MAPPINGS = {
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


async def fetch_data_for_export(
    db: AsyncSession,
    user_id: UUID,
    entry_type: EntryType,
    start_date: datetime | None,
    end_date: datetime | None
) -> List[Dict[str, Any]]:
    """
    Fetch data for export based on entry type and date range.

    Filtering logic matches frontend filterByMonth:
    - For one_time entries: date must fall within the date range
    - For recurring entries: entry must be active during the date range
      (start_date <= end_date AND (end_date is NULL OR end_date >= start_date))
    """
    model = MODEL_MAPPINGS[entry_type]

    # Convert timezone-aware datetimes to naive datetimes for database comparison
    # Database uses TIMESTAMP WITHOUT TIME ZONE
    if start_date and start_date.tzinfo:
        start_date = start_date.replace(tzinfo=None)
    if end_date and end_date.tzinfo:
        end_date = end_date.replace(tzinfo=None)

    # Build base query - filter by user_id and exclude soft-deleted items (if applicable)
    conditions = [model.user_id == user_id]

    # Only filter by deleted_at if the model has this field (some models use soft deletes)
    if hasattr(model, 'deleted_at'):
        conditions.append(model.deleted_at.is_(None))

    query = select(model).where(and_(*conditions))

    # Apply date filtering if date range is provided
    if start_date and end_date:
        # Check if model has frequency field (recurring entries)
        if hasattr(model, 'frequency'):
            # Build condition for filtering:
            # 1. One-time entries: date falls within range
            # 2. Recurring entries: active during the range

            # For one-time entries: check date field
            one_time_condition = None
            if hasattr(model, 'date'):
                one_time_condition = and_(
                    model.frequency == 'one_time',
                    model.date.isnot(None),
                    model.date >= start_date,
                    model.date <= end_date
                )

            # For recurring entries: check if range overlaps with start_date/end_date
            recurring_condition = None
            if hasattr(model, 'start_date'):
                # Entry is active if:
                # - start_date <= end_date (starts before or during the period)
                # - AND (end_date is NULL OR end_date >= start_date) (hasn't ended or ends during/after the period)
                recurring_condition = and_(
                    model.frequency != 'one_time',
                    model.start_date.isnot(None),
                    model.start_date <= end_date,
                    or_(
                        model.end_date.is_(None),
                        model.end_date >= start_date
                    )
                )

            # Combine conditions
            if one_time_condition is not None and recurring_condition is not None:
                query = query.where(or_(one_time_condition, recurring_condition))
            elif one_time_condition is not None:
                query = query.where(one_time_condition)
            elif recurring_condition is not None:
                query = query.where(recurring_condition)
        else:
            # For non-recurring models, filter by available date field
            date_field = None
            if hasattr(model, 'date'):
                date_field = model.date
            elif hasattr(model, 'purchase_date'):
                date_field = model.purchase_date
            elif hasattr(model, 'due_date'):
                date_field = model.due_date
            elif hasattr(model, 'target_date'):
                date_field = model.target_date
            elif hasattr(model, 'created_at'):
                date_field = model.created_at

            if date_field is not None:
                query = query.where(
                    and_(
                        date_field >= start_date,
                        date_field <= end_date
                    )
                )

    result = await db.execute(query)
    records = result.scalars().all()

    # Convert to dictionaries
    data = []
    for record in records:
        record_dict = {}
        for field, _ in FIELD_MAPPINGS[entry_type]:
            value = getattr(record, field, None)
            # Format dates and booleans
            if value is not None:
                if isinstance(value, datetime):
                    value = value.strftime('%Y-%m-%d')
                elif isinstance(value, bool):
                    value = "Yes" if value else "No"
            record_dict[field] = value if value is not None else ""
        data.append(record_dict)

    return data


def generate_csv(data: List[Dict[str, Any]], entry_type: EntryType) -> str:
    """Generate CSV string from data"""
    if not data:
        # Return empty CSV with headers
        output = io.StringIO()
        writer = csv.writer(output)
        headers = [header for _, header in FIELD_MAPPINGS[entry_type]]
        writer.writerow(headers)
        return output.getvalue()

    output = io.StringIO()
    writer = csv.writer(output)

    # Write headers
    headers = [header for _, header in FIELD_MAPPINGS[entry_type]]
    writer.writerow(headers)

    # Write data
    for row in data:
        writer.writerow([row[field] for field, _ in FIELD_MAPPINGS[entry_type]])

    return output.getvalue()


async def export_data(
    db: AsyncSession,
    user_id: UUID,
    entry_type: EntryType,
    format: ExportFormat,
    start_date: datetime | None = None,
    end_date: datetime | None = None
) -> tuple[str, int]:
    """
    Export data in specified format
    Returns: (exported_content, row_count)
    """
    # Fetch data
    data = await fetch_data_for_export(db, user_id, entry_type, start_date, end_date)

    # Generate export based on format
    if format == "csv":
        content = generate_csv(data, entry_type)
    else:
        raise ValueError(f"Unsupported export format: {format}")

    return content, len(data)
