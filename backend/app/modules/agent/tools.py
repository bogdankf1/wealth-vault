"""
Typed compute tools — the "compute arm" of the agent.

These are the ONLY way the agent touches financial numbers. The LLM router chooses which
tool to call and fills structured args (category, date range); it never writes SQL. Each
tool:
  * injects `user_id` from the authenticated request — never from the model — so the agent
    can't read another tenant's rows (the answer to the text-to-SQL safety question),
  * is parameterized (no injection), and returns EXACT aggregates plus the `cited_ids`
    of the rows it used (so answers can cite transactions and evals can assert retrieval).

Single-currency (USD) for the demo dataset, so sums are exact with no FX rounding.
"""
from datetime import datetime
from decimal import Decimal
from typing import Optional
from uuid import UUID

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

# Fully initialize the app.models package before importing individual module models.
# The codebase has a latent circular import (app.models.__init__ <-> module models);
# the app avoids it because app.main / create_all_tables.py load app.models first. This
# keeps the agent module importable standalone (tests, the eval harness, scripts).
import app.models  # noqa: F401,E402

from app.modules.expenses.models import Expense
from app.modules.income.models import IncomeTransaction
from app.modules.subscriptions.models import Subscription
from app.modules.savings.models import SavingsAccount

_CITED_CAP = 50  # keep response payloads bounded


def _parse_date(value: Optional[str]) -> Optional[datetime]:
    if not value:
        return None
    return datetime.fromisoformat(value)


async def sum_expenses(
    db: AsyncSession, user_id: UUID,
    category: Optional[str] = None, start: Optional[str] = None, end: Optional[str] = None,
) -> dict:
    """Total spending, optionally filtered by category and [start, end) date range."""
    conds = [Expense.user_id == user_id, Expense.is_active.is_(True)]
    if category:
        conds.append(func.lower(Expense.category) == category.lower())
    sd, ed = _parse_date(start), _parse_date(end)
    if sd:
        conds.append(Expense.date >= sd)
    if ed:
        conds.append(Expense.date < ed)  # end is exclusive (first day after the range)

    rows = (await db.execute(
        select(Expense.id, Expense.amount).where(*conds).order_by(Expense.amount.desc())
    )).all()
    total = sum((r.amount for r in rows), Decimal("0"))
    return {
        "tool": "sum_expenses",
        "total": round(float(total), 2),
        "count": len(rows),
        "currency": "USD",
        "filters": {"category": category, "start": start, "end": end},
        "cited_ids": [str(r.id) for r in rows[:_CITED_CAP]],
    }


async def total_income(
    db: AsyncSession, user_id: UUID,
    start: Optional[str] = None, end: Optional[str] = None,
) -> dict:
    """Total income received over an optional [start, end) date range."""
    conds = [IncomeTransaction.user_id == user_id]
    sd, ed = _parse_date(start), _parse_date(end)
    if sd:
        conds.append(IncomeTransaction.date >= sd)
    if ed:
        conds.append(IncomeTransaction.date < ed)
    rows = (await db.execute(
        select(IncomeTransaction.id, IncomeTransaction.amount).where(*conds)
    )).all()
    total = sum((r.amount for r in rows), Decimal("0"))
    return {
        "tool": "total_income",
        "total": round(float(total), 2),
        "count": len(rows),
        "currency": "USD",
        "filters": {"start": start, "end": end},
        "cited_ids": [str(r.id) for r in rows[:_CITED_CAP]],
    }


async def net_worth(db: AsyncSession, user_id: UUID) -> dict:
    """Sum of active account balances (assets). Demo net worth = liquid balances."""
    rows = (await db.execute(
        select(SavingsAccount.id, SavingsAccount.name, SavingsAccount.current_balance)
        .where(SavingsAccount.user_id == user_id, SavingsAccount.is_active.is_(True))
    )).all()
    total = sum((r.current_balance for r in rows), Decimal("0"))
    return {
        "tool": "net_worth",
        "total": round(float(total), 2),
        "currency": "USD",
        "accounts": [{"name": r.name, "balance": float(r.current_balance)} for r in rows],
        "cited_ids": [str(r.id) for r in rows],
    }


async def list_subscriptions(db: AsyncSession, user_id: UUID, active_only: bool = True) -> dict:
    """Active subscriptions and their combined monthly cost."""
    conds = [Subscription.user_id == user_id]
    if active_only:
        conds.append(Subscription.status == "active")
    rows = (await db.execute(
        select(Subscription.id, Subscription.name, Subscription.amount, Subscription.frequency)
        .where(*conds).order_by(Subscription.amount.desc())
    )).all()
    monthly = sum((r.amount for r in rows if r.frequency == "monthly"), Decimal("0"))
    return {
        "tool": "list_subscriptions",
        "monthly_total": round(float(monthly), 2),
        "count": len(rows),
        "currency": "USD",
        "items": [{"name": r.name, "amount": float(r.amount), "frequency": r.frequency,
                   "id": str(r.id)} for r in rows],
        "cited_ids": [str(r.id) for r in rows],
    }


async def find_expenses(
    db: AsyncSession, user_id: UUID,
    category: Optional[str] = None, min_amount: Optional[float] = None,
    start: Optional[str] = None, end: Optional[str] = None, limit: int = 10,
) -> dict:
    """List the largest matching expenses (for 'what was that big purchase' style asks)."""
    conds = [Expense.user_id == user_id, Expense.is_active.is_(True)]
    if category:
        conds.append(func.lower(Expense.category) == category.lower())
    if min_amount is not None:
        conds.append(Expense.amount >= Decimal(str(min_amount)))
    sd, ed = _parse_date(start), _parse_date(end)
    if sd:
        conds.append(Expense.date >= sd)
    if ed:
        conds.append(Expense.date < ed)
    rows = (await db.execute(
        select(Expense.id, Expense.name, Expense.amount, Expense.category, Expense.date)
        .where(*conds).order_by(Expense.amount.desc()).limit(min(limit, 25))
    )).all()
    return {
        "tool": "find_expenses",
        "count": len(rows),
        "items": [{"id": str(r.id), "name": r.name, "amount": float(r.amount),
                   "category": r.category, "date": r.date.date().isoformat() if r.date else None}
                  for r in rows],
        "cited_ids": [str(r.id) for r in rows],
    }


# Registry the router selects from. Keep names + arg shapes in sync with ROUTE_TOOL_CATALOG
# in nodes.py (that catalog is what the LLM sees).
TOOLS = {
    "sum_expenses": sum_expenses,
    "total_income": total_income,
    "net_worth": net_worth,
    "list_subscriptions": list_subscriptions,
    "find_expenses": find_expenses,
}


async def run_tool(db: AsyncSession, user_id: UUID, name: str, args: dict) -> dict:
    """Dispatch a single tool call. Unknown tools / bad args fail soft so one bad call
    from the LLM doesn't crash the graph — the validate node will catch the gap."""
    fn = TOOLS.get(name)
    if fn is None:
        return {"tool": name, "error": f"unknown tool '{name}'", "cited_ids": []}
    try:
        return await fn(db, user_id, **(args or {}))
    except TypeError as exc:
        return {"tool": name, "error": f"bad args: {exc}", "cited_ids": []}
