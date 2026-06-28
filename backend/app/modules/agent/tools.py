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
from datetime import datetime, date
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


def _trailing_full_months(months: int) -> tuple[str, str]:
    """ISO [start, end) covering the `months` full calendar months before the current month.
    today 2026-06-27, months=3 -> ('2026-03-01', '2026-06-01'). `end` is exclusive."""
    today = date.today()
    end = date(today.year, today.month, 1)
    y, m = end.year, end.month - months
    while m <= 0:
        m += 12
        y -= 1
    return date(y, m, 1).isoformat(), end.isoformat()


# Fixed-tax frequency -> months per occurrence, for prorating to a period. Keys match the
# TaxFrequency enum; anything unmapped falls back to 12 (annual) at the call site.
_FREQ_MONTHS = {"annually": 12, "quarterly": 3, "monthly": 1}


def _months_in_range(start_iso: str, end_iso: str) -> int:
    sy, sm, _ = map(int, start_iso.split("-"))
    ey, em, _ = map(int, end_iso.split("-"))
    return max(1, (ey - sy) * 12 + (em - sm))


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


async def income_breakdown(
    db: AsyncSession, user_id: UUID, start: Optional[str] = None, end: Optional[str] = None,
) -> dict:
    """Income grouped by category/source (e.g. Salary vs Freelance) over [start, end)."""
    conds = [IncomeTransaction.user_id == user_id]
    sd, ed = _parse_date(start), _parse_date(end)
    if sd:
        conds.append(IncomeTransaction.date >= sd)
    if ed:
        conds.append(IncomeTransaction.date < ed)
    rows = (await db.execute(
        select(IncomeTransaction.category, func.sum(IncomeTransaction.amount))
        .where(*conds).group_by(IncomeTransaction.category)
    )).all()
    total = sum((amt for _, amt in rows), Decimal("0"))
    sources = sorted(
        ({"category": cat or "Uncategorized", "amount": float(amt),
          "share_pct": round(float(amt) / float(total) * 100, 2) if total else 0.0}
         for cat, amt in rows),
        key=lambda s: s["amount"], reverse=True,
    )
    return {
        "tool": "income_breakdown",
        "total": round(float(total), 2),
        "count": len(sources),
        "currency": "USD",
        "sources": sources,
        "cited_ids": [],
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


async def savings_summary(db: AsyncSession, user_id: UUID) -> dict:
    """Savings/cash accounts: balances, APY, accrued interest, and the combined total."""
    rows = (await db.execute(
        select(SavingsAccount.id, SavingsAccount.name, SavingsAccount.account_type,
               SavingsAccount.institution, SavingsAccount.current_balance,
               SavingsAccount.interest_rate, SavingsAccount.accrued_interest)
        .where(SavingsAccount.user_id == user_id, SavingsAccount.is_active.is_(True))
        .order_by(SavingsAccount.current_balance.desc())
    )).all()
    total = sum((r.current_balance for r in rows), Decimal("0"))
    accrued = sum((r.accrued_interest or Decimal("0") for r in rows), Decimal("0"))
    accounts = []
    for r in rows:
        rate = float(r.interest_rate or 0)
        accounts.append({
            "name": r.name, "account_type": r.account_type, "institution": r.institution,
            "balance": float(r.current_balance), "apy": rate, "apy_pct": round(rate * 100, 2),
            "accrued_interest": float(r.accrued_interest or 0), "id": str(r.id),
        })
    return {
        "tool": "savings_summary",
        # `total`/`count` match the cross-tool convention compute_node's empty-result check keys on.
        "total": round(float(total), 2),
        "total_accrued_interest": round(float(accrued), 2),
        "count": len(rows),
        "currency": "USD",
        "accounts": accounts,
        "cited_ids": [a["id"] for a in accounts],
    }


async def savings_projection(
    db: AsyncSession, user_id: UUID, months: int = 12, apy: Optional[float] = None,
) -> dict:
    """Project savings balance forward with monthly compounding. Each account grows at its
    own stored APY, unless `apy` (decimal, e.g. 0.05) overrides the rate for all accounts.
    Deterministic; `projection` flag triggers the standard disclaimer in synthesis."""
    rows = (await db.execute(
        select(SavingsAccount.id, SavingsAccount.current_balance, SavingsAccount.interest_rate)
        .where(SavingsAccount.user_id == user_id, SavingsAccount.is_active.is_(True))
    )).all()
    months = max(0, int(months))
    current = sum((r.current_balance for r in rows), Decimal("0"))
    projected = Decimal("0")
    for r in rows:
        rate = Decimal(str(apy)) if apy is not None else (r.interest_rate or Decimal("0"))
        monthly = rate / Decimal("12")
        bal = r.current_balance
        for _ in range(months):
            bal = bal * (Decimal("1") + monthly)
        projected += bal
    return {
        "tool": "savings_projection",
        "projection": True,
        "months": months,
        "count": len(rows),  # non-zero => compute_node's empty-result heuristic won't misfire
        "assumed_apy": float(apy) if apy is not None else None,  # None => per-account APY
        "current_balance": round(float(current), 2),
        "projected_balance": round(float(projected), 2),
        "interest_earned": round(float(projected - current), 2),
        "currency": "USD",
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
        # Annualized so "how much is it yearly" is answerable directly (grounded by construction).
        "yearly_total": round(float(monthly) * 12, 2),
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


async def spending_breakdown(
    db: AsyncSession, user_id: UUID, start: Optional[str] = None, end: Optional[str] = None,
) -> dict:
    """Spending grouped by category over [start, end), with each category's share of the total."""
    conds = [Expense.user_id == user_id, Expense.is_active.is_(True)]
    sd, ed = _parse_date(start), _parse_date(end)
    if sd:
        conds.append(Expense.date >= sd)
    if ed:
        conds.append(Expense.date < ed)
    rows = (await db.execute(
        select(Expense.category, func.sum(Expense.amount))
        .where(*conds).group_by(Expense.category)
    )).all()
    total = sum((amt for _, amt in rows), Decimal("0"))
    categories = sorted(
        ({"category": cat or "Uncategorized", "amount": float(amt),
          "share_pct": round(float(amt) / float(total) * 100, 2) if total else 0.0}
         for cat, amt in rows),
        key=lambda c: c["amount"], reverse=True,
    )
    return {
        "tool": "spending_breakdown",
        "total": round(float(total), 2),
        "count": len(categories),
        "currency": "USD",
        "categories": categories,
        "cited_ids": [],
    }


async def spending_trend(db: AsyncSession, user_id: UUID, months: int = 6) -> dict:
    """Monthly expense totals for the trailing `months` full calendar months, oldest first,
    plus the change from the first to the last month."""
    months = max(1, int(months))
    today = date.today()
    cursor = date(today.year, today.month, 1)
    bounds = []
    for _ in range(months):
        y, m = cursor.year, cursor.month - 1
        if m == 0:
            m = 12
            y -= 1
        start = date(y, m, 1)
        bounds.append((start, cursor))
        cursor = start
    bounds.reverse()
    series = []
    for start, end in bounds:
        total = (await sum_expenses(db, user_id, start=start.isoformat(), end=end.isoformat()))["total"]
        series.append({"month": start.strftime("%Y-%m"), "start": start.isoformat(),
                       "end": end.isoformat(), "total": total})
    first, last = series[0]["total"], series[-1]["total"]
    change = round(last - first, 2)
    return {
        "tool": "spending_trend",
        "series": series,
        "change_first_to_last": change,
        "pct_change": round(change / first * 100, 2) if first else 0.0,
        "count": months,
        "currency": "USD",
        "cited_ids": [],
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


async def portfolio_allocation(db: AsyncSession, user_id: UUID) -> dict:
    """Per-holding allocation %, allocation by asset type, concentration (largest holding),
    and best/worst performer by return %. Read-only analysis."""
    rows = (await db.execute(
        select(PortfolioAsset.id, PortfolioAsset.asset_name, PortfolioAsset.symbol,
               PortfolioAsset.asset_type, PortfolioAsset.current_value,
               PortfolioAsset.total_invested, PortfolioAsset.total_return)
        .where(PortfolioAsset.user_id == user_id, PortfolioAsset.is_active.is_(True))
    )).all()
    total = sum((r.current_value or Decimal("0") for r in rows), Decimal("0"))
    tot = float(total)
    holdings = []
    for r in rows:
        val = float(r.current_value or 0)
        inv = float(r.total_invested or 0)
        ret = float(r.total_return or 0)
        holdings.append({
            "name": r.asset_name, "symbol": r.symbol, "asset_type": r.asset_type,
            "value": val, "allocation_pct": round(val / tot * 100, 2) if tot else 0.0,
            "return_pct": round(ret / inv * 100, 2) if inv else 0.0, "id": str(r.id),
        })
    holdings.sort(key=lambda h: h["value"], reverse=True)
    by_type_totals = {}
    for h in holdings:
        by_type_totals[h["asset_type"]] = by_type_totals.get(h["asset_type"], 0.0) + h["value"]
    by_type = sorted(
        ({"asset_type": t, "value": round(v, 2),
          "allocation_pct": round(v / tot * 100, 2) if tot else 0.0}
         for t, v in by_type_totals.items()),
        key=lambda t: t["value"], reverse=True,
    )
    concentration = ({"name": holdings[0]["name"], "symbol": holdings[0]["symbol"],
                      "allocation_pct": holdings[0]["allocation_pct"]} if holdings else None)
    best = max(holdings, key=lambda h: h["return_pct"], default=None)
    worst = min(holdings, key=lambda h: h["return_pct"], default=None)
    pick = lambda h: {"name": h["name"], "symbol": h["symbol"], "return_pct": h["return_pct"]} if h else None
    return {
        "tool": "portfolio_allocation",
        "total_value": round(tot, 2),
        "count": len(holdings),
        "by_type": by_type,
        "concentration": concentration,
        "best_performer": pick(best),
        "worst_performer": pick(worst),
        "holdings": holdings,
        "currency": "USD",
        "cited_ids": [h["id"] for h in holdings],
    }


async def portfolio_projection(
    db: AsyncSession, user_id: UUID, years: int = 10, annual_return: float = 0.07,
) -> dict:
    """Project total portfolio value forward at an ASSUMED annual return (default 7%),
    compounded yearly. Tier-3 market assumption — carries the standard disclaimer."""
    years = max(0, int(years))
    rate = float(annual_return)
    current = (await portfolio_summary(db, user_id))["total_value"]
    projected = round(current * (1 + rate) ** years, 2)
    return {
        "tool": "portfolio_projection",
        "projection": True,
        "years": years,
        "annual_return": rate,
        "current_value": current,
        "projected_value": projected,
        "gain": round(projected - current, 2),
        "count": 1,
        "currency": "USD",
        "cited_ids": [],
    }


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


async def compare_spending(db: AsyncSession, user_id: UUID, start_a: str, end_a: str,
                          start_b: str, end_b: str, category: Optional[str] = None) -> dict:
    """Compare spending between two periods (optionally one category)."""
    a = await sum_expenses(db, user_id, category=category, start=start_a, end=end_a)
    b = await sum_expenses(db, user_id, category=category, start=start_b, end=end_b)
    delta = round(a["total"] - b["total"], 2)
    pct = round((delta / b["total"] * 100), 2) if b["total"] else 0.0
    return {"tool": "compare_spending", "category": category or "all",
            "a": {"label": f"{start_a}..{end_a}", "total": a["total"]},
            "b": {"label": f"{start_b}..{end_b}", "total": b["total"]},
            "delta": delta, "pct_change": pct, "currency": "USD",
            "cited_ids": (a["cited_ids"] + b["cited_ids"])[:_CITED_CAP]}


async def financial_ratios(db: AsyncSession, user_id: UUID,
                          start: Optional[str] = None, end: Optional[str] = None) -> dict:
    """Savings rate + debt-to-income over [start, end). Debt = installment obligations."""
    income = (await total_income(db, user_id, start=start, end=end))["total"]
    expenses = (await sum_expenses(db, user_id, start=start, end=end))["total"]
    debt = (await installments_summary(db, user_id))["monthly_obligation"]
    savings = round(income - expenses, 2)
    return {"tool": "financial_ratios", "income": income, "expenses": expenses, "savings": savings,
            "savings_rate": round(savings / income * 100, 2) if income else 0.0,
            "debt_to_income": round(debt / income * 100, 2) if income else 0.0,
            "currency": "USD", "cited_ids": []}


async def after_tax_income(
    db: AsyncSession, user_id: UUID, start: Optional[str] = None, end: Optional[str] = None,
) -> dict:
    """Estimated after-tax income over a period. Percentage taxes apply to income; fixed taxes
    are prorated to the period by their frequency. Defaults to the trailing 12 full months."""
    if not start or not end:
        start, end = _trailing_full_months(12)
    months = _months_in_range(start, end)
    income = (await total_income(db, user_id, start=start, end=end))["total"]
    items = (await taxes_summary(db, user_id))["items"]
    pct_rate = sum(i["percentage"] or 0 for i in items if i["tax_type"] == "percentage") / 100.0
    fixed_monthly = sum((i["fixed_amount"] or 0) / _FREQ_MONTHS.get(i["frequency"], 12)
                        for i in items if i["tax_type"] == "fixed")
    estimated_tax = round(income * pct_rate + fixed_monthly * months, 2)
    net = round(income - estimated_tax, 2)
    return {
        "tool": "after_tax_income",
        "window": {"start": start, "end": end, "months": months},
        "months": months,
        "income": income,
        "estimated_tax": estimated_tax,
        "net_income": net,
        "effective_rate": round(estimated_tax / income * 100, 2) if income else 0.0,
        "count": months,
        "currency": "USD",
        "cited_ids": [],
    }


async def cash_flow(db: AsyncSession, user_id: UUID, months: int = 3) -> dict:
    """Average monthly cash flow over the trailing `months` full calendar months. Outflow =
    expenses + active subscriptions + installment payments. Composes existing tools."""
    months = max(1, int(months))
    start, end = _trailing_full_months(months)
    income = (await total_income(db, user_id, start=start, end=end))["total"]
    expenses = (await sum_expenses(db, user_id, start=start, end=end))["total"]
    subs = (await list_subscriptions(db, user_id))["monthly_total"]
    debt = (await installments_summary(db, user_id))["monthly_obligation"]
    income_avg = round(income / months, 2)
    expenses_avg = round(expenses / months, 2)
    recurring_monthly = round(subs + debt, 2)
    outflow_avg = round(expenses_avg + recurring_monthly, 2)
    net_flow_avg = round(income_avg - outflow_avg, 2)
    return {
        "tool": "cash_flow",
        "window": {"start": start, "end": end, "months": months},
        "income_avg": income_avg,
        "expenses_avg": expenses_avg,
        "recurring_monthly": recurring_monthly,
        "outflow_avg": outflow_avg,
        "net_flow_avg": net_flow_avg,
        "count": months,  # non-zero so compute_node's empty-result heuristic won't misfire
        "currency": "USD",
        "cited_ids": [],
    }


async def cash_runway(db: AsyncSession, user_id: UUID) -> dict:
    """How many months liquid savings would cover outflow IF income stopped:
    net_worth / monthly outflow. A projection (carries the standard disclaimer)."""
    cf = await cash_flow(db, user_id)
    liquid = (await net_worth(db, user_id))["total"]
    outflow = cf["outflow_avg"]
    runway = round(liquid / outflow, 1) if outflow > 0 else None
    return {
        "tool": "cash_runway",
        "projection": True,
        "liquid_balance": liquid,
        "monthly_outflow": outflow,
        "runway_months": runway,
        "assumption": "assumes income stops; savings cover average monthly outflow",
        "count": 1,  # non-zero so the empty-result heuristic won't misfire
        "currency": "USD",
        "cited_ids": [],
    }


async def balance_projection(db: AsyncSession, user_id: UUID, months: int = 12) -> dict:
    """Projected savings balance: current net worth + average monthly net cash flow × months.
    A projection (carries the standard disclaimer)."""
    months = max(0, int(months))
    cf = await cash_flow(db, user_id)
    current = (await net_worth(db, user_id))["total"]
    net = cf["net_flow_avg"]
    projected = round(current + net * months, 2)
    return {
        "tool": "balance_projection",
        "projection": True,
        "months": months,
        "current_balance": current,
        "net_flow_monthly": net,
        "projected_balance": projected,
        "change": round(projected - current, 2),
        "count": months or 1,  # non-zero so the empty-result heuristic won't misfire
        "currency": "USD",
        "cited_ids": [],
    }


async def affordability(db: AsyncSession, user_id: UUID, amount: float,
                       start: Optional[str] = None, end: Optional[str] = None) -> dict:
    """Can the user afford `amount`? Disposable = income − expenses − subscriptions − loan payments."""
    income = (await total_income(db, user_id, start=start, end=end))["total"]
    expenses = (await sum_expenses(db, user_id, start=start, end=end))["total"]
    subs = (await list_subscriptions(db, user_id))["monthly_total"]
    debt = (await installments_summary(db, user_id))["monthly_obligation"]
    disposable = round(income - expenses - subs - debt, 2)
    return {"tool": "affordability", "amount": round(float(amount), 2), "disposable_monthly": disposable,
            "can_afford": amount <= disposable,
            "months_to_afford": round(float(amount) / disposable, 1) if disposable > 0 else None,
            "currency": "USD", "cited_ids": []}


# Registry the router selects from. Keep names + arg shapes in sync with ROUTE_TOOL_CATALOG
# in nodes.py (that catalog is what the LLM sees).
TOOLS = {
    "sum_expenses": sum_expenses,
    "total_income": total_income,
    "income_breakdown": income_breakdown,
    "net_worth": net_worth,
    "savings_summary": savings_summary,
    "savings_projection": savings_projection,
    "list_subscriptions": list_subscriptions,
    "find_expenses": find_expenses,
    "spending_breakdown": spending_breakdown,
    "spending_trend": spending_trend,
    "portfolio_summary": portfolio_summary,
    "portfolio_allocation": portfolio_allocation,
    "portfolio_projection": portfolio_projection,
    "debts_summary": debts_summary,
    "installments_summary": installments_summary,
    "taxes_summary": taxes_summary,
    "budget_status": budget_status,
    "goals_progress": goals_progress,
    "compare_spending": compare_spending,
    "financial_ratios": financial_ratios,
    "after_tax_income": after_tax_income,
    "affordability": affordability,
    "cash_flow": cash_flow,
    "cash_runway": cash_runway,
    "balance_projection": balance_projection,
}


async def run_tool(db: AsyncSession, user_id: UUID, name: str, args: dict) -> dict:
    """Dispatch a single tool call. Unknown tools / bad args fail soft so one bad call
    from the LLM doesn't crash the graph — the validate node will catch the gap."""
    fn = TOOLS.get(name)
    if fn is None:
        return {"tool": name, "error": f"unknown tool '{name}'", "cited_ids": []}
    try:
        return await fn(db, user_id, **(args or {}))
    except (TypeError, ValueError) as exc:
        # Bad args fail soft (e.g. a non-numeric months/amount, or an unparseable date) so one
        # bad LLM tool call doesn't crash the graph — the validate node catches the gap.
        return {"tool": name, "error": f"bad args: {exc}", "cited_ids": []}
