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
from app.modules.portfolio.models import PortfolioAsset
from app.modules.debts.models import Debt
from app.modules.installments.models import Installment
from app.modules.taxes.models import Tax
from app.modules.budgets.models import Budget
from app.modules.goals.models import Goal

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


async def portfolio_summary(db: AsyncSession, user_id: UUID, asset_type: Optional[str] = None) -> dict:
    """Holdings, total value, and return. Optional asset_type filter (e.g. 'stock','etf','crypto')."""
    conds = [PortfolioAsset.user_id == user_id, PortfolioAsset.is_active.is_(True)]
    if asset_type:
        conds.append(func.lower(PortfolioAsset.asset_type) == asset_type.lower())
    rows = (await db.execute(
        select(PortfolioAsset.id, PortfolioAsset.asset_name, PortfolioAsset.symbol,
               PortfolioAsset.asset_type, PortfolioAsset.current_value,
               PortfolioAsset.total_invested, PortfolioAsset.total_return).where(*conds)
    )).all()
    value = sum((r.current_value or Decimal("0") for r in rows), Decimal("0"))
    invested = sum((r.total_invested or Decimal("0") for r in rows), Decimal("0"))
    ret = sum((r.total_return or Decimal("0") for r in rows), Decimal("0"))
    return {"tool": "portfolio_summary", "total_value": round(float(value), 2),
            "total_invested": round(float(invested), 2), "total_return": round(float(ret), 2),
            "return_pct": round(float(ret / invested * 100), 2) if invested else 0.0,
            "currency": "USD",
            "holdings": [{"name": r.asset_name, "symbol": r.symbol, "asset_type": r.asset_type,
                          "value": float(r.current_value or 0), "return": float(r.total_return or 0)} for r in rows],
            "cited_ids": [str(r.id) for r in rows[:_CITED_CAP]], "filters": {"asset_type": asset_type}}


async def debts_summary(db: AsyncSession, user_id: UUID) -> dict:
    """Money owed TO the user: outstanding totals + overdue list."""
    rows = (await db.execute(
        select(Debt.id, Debt.debtor_name, Debt.amount, Debt.amount_paid, Debt.due_date)
        .where(Debt.user_id == user_id, Debt.is_active.is_(True), Debt.is_paid.is_(False))
    )).all()
    now = datetime.utcnow()
    items, overdue, total = [], [], Decimal("0")
    for r in rows:
        out = (r.amount or Decimal("0")) - (r.amount_paid or Decimal("0"))
        total += out
        entry = {"debtor": r.debtor_name, "amount": float(r.amount or 0), "paid": float(r.amount_paid or 0),
                 "outstanding": float(out), "due_date": r.due_date.date().isoformat() if r.due_date else None,
                 "id": str(r.id)}
        items.append(entry)
        if r.due_date and r.due_date < now:
            overdue.append(entry)
    return {"tool": "debts_summary", "total_outstanding": round(float(total), 2), "count": len(rows),
            "currency": "USD", "items": items, "overdue": overdue,
            "cited_ids": [str(r.id) for r in rows[:_CITED_CAP]]}


async def installments_summary(db: AsyncSession, user_id: UUID) -> dict:
    """Active loans the user owes: remaining balance + monthly obligation."""
    rows = (await db.execute(
        select(Installment.id, Installment.name, Installment.remaining_balance,
               Installment.amount_per_payment, Installment.frequency, Installment.next_payment_date)
        .where(Installment.user_id == user_id, Installment.is_active.is_(True))
    )).all()
    remaining = sum((r.remaining_balance or Decimal("0") for r in rows), Decimal("0"))
    monthly = sum((r.amount_per_payment or Decimal("0") for r in rows if r.frequency == "monthly"), Decimal("0"))
    return {"tool": "installments_summary", "active_count": len(rows),
            "total_remaining": round(float(remaining), 2), "monthly_obligation": round(float(monthly), 2),
            "currency": "USD",
            "items": [{"name": r.name, "remaining": float(r.remaining_balance or 0),
                       "amount_per_payment": float(r.amount_per_payment or 0),
                       "next_payment_date": r.next_payment_date.date().isoformat() if r.next_payment_date else None,
                       "id": str(r.id)} for r in rows],
            "cited_ids": [str(r.id) for r in rows[:_CITED_CAP]]}


async def taxes_summary(db: AsyncSession, user_id: UUID) -> dict:
    """Configured taxes (rates / fixed amounts)."""
    rows = (await db.execute(
        select(Tax.id, Tax.name, Tax.tax_type, Tax.fixed_amount, Tax.percentage,
               Tax.frequency, Tax.next_payment_date)
        .where(Tax.user_id == user_id, Tax.is_active.is_(True))
    )).all()
    return {"tool": "taxes_summary", "count": len(rows), "currency": "USD",
            "items": [{"name": r.name,
                       "tax_type": str(r.tax_type.value if hasattr(r.tax_type, "value") else r.tax_type),
                       "fixed_amount": float(r.fixed_amount) if r.fixed_amount is not None else None,
                       "percentage": float(r.percentage) if r.percentage is not None else None,
                       "frequency": str(r.frequency.value if hasattr(r.frequency, "value") else r.frequency),
                       "id": str(r.id)} for r in rows],
            "cited_ids": [str(r.id) for r in rows[:_CITED_CAP]]}


async def budget_status(db: AsyncSession, user_id: UUID, category: Optional[str] = None,
                        start: Optional[str] = None, end: Optional[str] = None) -> dict:
    """Budget vs actual spend per category over [start, end)."""
    bconds = [Budget.user_id == user_id, Budget.is_active.is_(True)]
    if category:
        bconds.append(func.lower(Budget.category) == category.lower())
    budgets = (await db.execute(
        select(Budget.id, Budget.name, Budget.category, Budget.amount).where(*bconds)
    )).all()
    sd, ed = _parse_date(start), _parse_date(end)
    out = []
    for b in budgets:
        econds = [Expense.user_id == user_id, Expense.is_active.is_(True),
                  func.lower(Expense.category) == (b.category or "").lower()]
        if sd:
            econds.append(Expense.date >= sd)
        if ed:
            econds.append(Expense.date < ed)
        spent = (await db.execute(select(func.coalesce(func.sum(Expense.amount), 0)).where(*econds))).scalar() or Decimal("0")
        amount = b.amount or Decimal("0")
        out.append({"name": b.name, "category": b.category, "amount": float(amount),
                    "spent": round(float(spent), 2), "remaining": round(float(amount - spent), 2),
                    "burn_pct": round(float(spent / amount * 100), 2) if amount else 0.0,
                    "over": spent > amount, "id": str(b.id)})
    return {"tool": "budget_status", "currency": "USD", "budgets": out, "cited_ids": [b["id"] for b in out]}


async def goals_progress(db: AsyncSession, user_id: UUID, name: Optional[str] = None) -> dict:
    """Progress toward savings goals."""
    conds = [Goal.user_id == user_id, Goal.is_active.is_(True)]
    if name:
        conds.append(func.lower(Goal.name).like(f"%{name.lower()}%"))
    rows = (await db.execute(
        select(Goal.id, Goal.name, Goal.target_amount, Goal.current_amount, Goal.monthly_contribution).where(*conds)
    )).all()
    goals = []
    for r in rows:
        target = r.target_amount or Decimal("0")
        current = r.current_amount or Decimal("0")
        goals.append({"name": r.name, "target": float(target), "current": float(current),
                      "pct": round(float(current / target * 100), 2) if target else 0.0,
                      "monthly_contribution": float(r.monthly_contribution or 0), "id": str(r.id)})
    return {"tool": "goals_progress", "goals": goals, "currency": "USD", "cited_ids": [g["id"] for g in goals]}


# Registry the router selects from. Keep names + arg shapes in sync with ROUTE_TOOL_CATALOG
# in nodes.py (that catalog is what the LLM sees).
TOOLS = {
    "sum_expenses": sum_expenses,
    "total_income": total_income,
    "net_worth": net_worth,
    "list_subscriptions": list_subscriptions,
    "find_expenses": find_expenses,
    "portfolio_summary": portfolio_summary,
    "debts_summary": debts_summary,
    "installments_summary": installments_summary,
    "taxes_summary": taxes_summary,
    "budget_status": budget_status,
    "goals_progress": goals_progress,
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
