"""
Seed the demo financial dataset onto an EXISTING user (e.g. your real Google account),
so /dashboard and /dashboard/ask show real data under your own login.

Unlike seed_demo_data (which owns the synthetic demo user), this NEVER creates or deletes
the user row — it only replaces that user's financial data. Reuses the same data
definitions as seed_demo_data so the numbers match the evals' ground truth.

    SEED_TARGET_EMAIL=you@example.com python -m app.scripts.seed_account
    # or:  python -m app.scripts.seed_account you@example.com
"""
import asyncio
import sys
from datetime import datetime

from sqlalchemy import delete, select, func

from app.core.database import AsyncSessionLocal
from app.models.user import User  # imported early so app.models initializes first
from app.modules.savings.models import SavingsAccount
from app.modules.expenses.models import Expense, ExpenseFrequency
from app.modules.income.models import (
    IncomeSource, IncomeTransaction, IncomeFrequency, IncomeTransactionStatus,
)
from app.modules.subscriptions.models import Subscription
from app.modules.ai.models import UploadedFile  # noqa: F401 — registers uploaded_files FK
from app.modules.rag.models import ParsedDocument, DocumentEmbedding
from app.modules.portfolio.models import PortfolioAsset
from app.modules.debts.models import Debt
from app.modules.installments.models import Installment
from app.modules.taxes.models import Tax, TaxType, TaxFrequency
from app.modules.budgets.models import Budget, BudgetPeriod
from app.modules.goals.models import Goal
from app.scripts.seed_demo_data import (
    _d, MONTHS, MONTHLY_TEMPLATE, ONE_OFFS, SUBSCRIPTIONS, ACCOUNTS,
)


async def insert_financial_data(session, user_id) -> None:
    """Insert accounts/expenses/income/subscriptions/parsed-docs for user_id (no User row)."""
    for name, atype, institution, balance in ACCOUNTS:
        session.add(SavingsAccount(
            user_id=user_id, name=name, account_type=atype, institution=institution,
            current_balance=_d(balance), currency="USD", is_active=True,
        ))

    for (year, month) in MONTHS:
        for category, name, desc, day, amount in MONTHLY_TEMPLATE:
            session.add(Expense(
                user_id=user_id, name=name, description=desc, category=category,
                amount=_d(amount), currency="USD", frequency=ExpenseFrequency.ONE_TIME,
                date=datetime(year, month, day), is_active=True, status="paid",
            ))
    for year, month, day, category, name, desc, amount in ONE_OFFS:
        session.add(Expense(
            user_id=user_id, name=name, description=desc, category=category,
            amount=_d(amount), currency="USD", frequency=ExpenseFrequency.ONE_TIME,
            date=datetime(year, month, day), is_active=True, status="paid",
        ))

    salary = IncomeSource(
        user_id=user_id, name="Acme Corp Salary", category="Salary",
        amount=_d("6500.00"), currency="USD", frequency=IncomeFrequency.MONTHLY,
        is_active=True, start_date=datetime(2025, 12, 1),
    )
    freelance = IncomeSource(
        user_id=user_id, name="Freelance Design", category="Freelance",
        amount=_d("1000.00"), currency="USD", frequency=IncomeFrequency.MONTHLY,
        is_active=True, start_date=datetime(2026, 1, 1),
    )
    session.add_all([salary, freelance])
    await session.flush()

    for (year, month) in MONTHS:
        session.add(IncomeTransaction(
            user_id=user_id, source_id=salary.id, amount=_d("6500.00"), currency="USD",
            date=datetime(year, month, 1), status=IncomeTransactionStatus.RECEIVED,
            category="Salary", description="Payroll deposit - Acme Corp",
        ))
    for (year, month, day, amount) in [(2026, 2, 15, "1200.00"), (2026, 4, 20, "900.00")]:
        session.add(IncomeTransaction(
            user_id=user_id, source_id=freelance.id, amount=_d(amount), currency="USD",
            date=datetime(year, month, day), status=IncomeTransactionStatus.RECEIVED,
            category="Freelance", description="Upwork payout - design project",
        ))

    for name, category, amount, desc in SUBSCRIPTIONS:
        session.add(Subscription(
            user_id=user_id, name=name, description=desc, category=category,
            amount=_d(amount), currency="USD", frequency="monthly",
            start_date=datetime(2025, 11, 1), is_active=True, status="active",
            next_payment_date=datetime(2026, 6, 1),
        ))

    session.add_all([
        ParsedDocument(
            user_id=user_id, doc_type="statement",
            raw_text=(
                "CHASE CHECKING STATEMENT — May 2026. Opening balance $7,991.95. "
                "Deposits: Payroll deposit Acme Corp $6,500.00 on 05/01. Card purchases: "
                "Whole Foods Market $84.20; Local Bistro $62.00; Delta Air Lines $612.30 "
                "(flight to San Francisco); Shell Gas Station $48.00. Recurring: Netflix "
                "$11.99, Spotify $9.99, ChatGPT Plus $20.00. Closing balance $8,500.00."
            ),
            structured_json={"account": "Chase Checking", "period": "2026-05"},
        ),
        ParsedDocument(
            user_id=user_id, doc_type="account",
            raw_text=(
                "Screenshot of Apple Store receipt: MacBook Pro 14-inch, Apple M4 chip, "
                "Space Black, 1TB SSD. Total charged $2,499.00 on March 14, 2026 to Chase "
                "Checking ending 4821. This was the largest single purchase of the year."
            ),
            structured_json={"merchant": "Apple Store", "amount": 2499.00},
        ),
        ParsedDocument(
            user_id=user_id, doc_type="subscription",
            raw_text=(
                "Subscriptions overview: Netflix Standard $11.99/mo, Spotify Premium "
                "$9.99/mo, iCloud+ 200GB $2.99/mo, Equinox Gym $30.00/mo, ChatGPT Plus "
                "$20.00/mo. Total recurring monthly spend $74.97."
            ),
            structured_json={"count": 5, "monthly_total": 74.97},
        ),
    ])

    # --- portfolio ---
    for name, symbol, atype, qty, buy, cur in [
        ("Apple Inc.", "AAPL", "stock", "10", "150.00", "220.00"),
        ("Vanguard S&P 500", "VOO", "etf", "5", "400.00", "500.00"),
        ("Bitcoin", "BTC", "crypto", "0.1", "40000.00", "60000.00"),
    ]:
        q, b, c = _d(qty), _d(buy), _d(cur)
        session.add(PortfolioAsset(
            user_id=user_id, asset_name=name, symbol=symbol, ticker=symbol,
            asset_type=atype, quantity=q, purchase_price=b, current_price=c,
            currency="USD", purchase_date=datetime(2025, 6, 1),
            total_invested=q * b, current_value=q * c, total_return=q * (c - b),
            is_active=True,
        ))
    # --- debts (money owed TO the user) ---
    for debtor, amount, paid, due in [
        ("Alex Rivera", "500.00", "0.00", datetime(2026, 7, 1)),
        ("Jordan Lee", "1200.00", "400.00", datetime(2026, 5, 1)),
    ]:
        session.add(Debt(
            user_id=user_id, debtor_name=debtor, amount=_d(amount),
            amount_paid=_d(paid), currency="USD", is_active=True, is_paid=False, due_date=due,
        ))
    # --- installments (loans the user owes) ---
    session.add(Installment(
        user_id=user_id, name="Car Loan", category="Auto",
        total_amount=_d("24000.00"), amount_per_payment=_d("450.00"), currency="USD",
        interest_rate=_d("5.50"), frequency="monthly", number_of_payments=60,
        payments_made=12, start_date=datetime(2025, 6, 1),
        first_payment_date=datetime(2025, 7, 1), is_active=True, status="active",
        remaining_balance=_d("18600.00"), next_payment_date=datetime(2026, 7, 1),
    ))
    # --- taxes ---
    session.add(Tax(
        user_id=user_id, name="Federal Income Tax", tax_type=TaxType.percentage,
        frequency=TaxFrequency.annually, percentage=_d("22.00"), currency="USD", is_active=True,
    ))
    session.add(Tax(
        user_id=user_id, name="Self-Employment Tax", tax_type=TaxType.fixed,
        frequency=TaxFrequency.quarterly, fixed_amount=_d("1200.00"), currency="USD", is_active=True,
    ))
    # --- budgets (monthly) ---
    for name, category, amount in [
        ("Monthly Groceries", "Groceries", "300.00"),
        ("Monthly Dining", "Dining", "60.00"),
        ("Monthly Transport", "Transport", "100.00"),
    ]:
        session.add(Budget(
            user_id=user_id, name=name, category=category, amount=_d(amount),
            currency="USD", period=BudgetPeriod.MONTHLY, start_date=datetime(2025, 12, 1),
            is_active=True, alert_threshold=80,
        ))
    # --- goals ---
    for name, target, current, contrib in [
        ("Emergency Fund", "10000.00", "6000.00", "500.00"),
        ("Hawaii 2026", "5000.00", "1500.00", "250.00"),
    ]:
        session.add(Goal(
            user_id=user_id, name=name, target_amount=_d(target),
            current_amount=_d(current), currency="USD", monthly_contribution=_d(contrib),
            start_date=datetime(2026, 1, 1), is_active=True,
        ))


async def seed_for_email(target_email: str) -> None:
    async with AsyncSessionLocal() as session:
        user = (await session.execute(
            select(User).where(User.email == target_email)
        )).scalar_one_or_none()
        if not user:
            raise SystemExit(f"No user with email {target_email!r}. Sign in once first, then re-run.")

        # Replace this user's financial data only — leave the User row untouched.
        for model in (PortfolioAsset, Debt, Installment, Tax, Budget, Goal,
                      DocumentEmbedding, ParsedDocument, IncomeTransaction,
                      IncomeSource, Expense, Subscription, SavingsAccount):
            await session.execute(delete(model).where(model.user_id == user.id))
        await insert_financial_data(session, user.id)
        await session.commit()

        n_exp = (await session.execute(
            select(func.count()).select_from(Expense).where(Expense.user_id == user.id)
        )).scalar()
        nw = (await session.execute(
            select(func.coalesce(func.sum(SavingsAccount.current_balance), 0))
            .where(SavingsAccount.user_id == user.id, SavingsAccount.is_active == True)
        )).scalar()
        print(f"✅ Seeded {target_email} (user {user.id}): {n_exp} expenses, net worth ${nw}")
        print("Now run the embedding backfill for this user.")


if __name__ == "__main__":
    import os
    target = os.getenv("SEED_TARGET_EMAIL") or (sys.argv[1] if len(sys.argv) > 1 else None)
    if not target:
        raise SystemExit("Provide an email: SEED_TARGET_EMAIL=you@x.com or as arg1")
    asyncio.run(seed_for_email(target))
