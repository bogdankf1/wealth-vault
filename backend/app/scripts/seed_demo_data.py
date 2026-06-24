"""
Seed a realistic, deterministic demo dataset for the AI agent (RAG + evals).

Why this exists
---------------
The app ships with zero financial data (only tiers/features are seeded). RAG and the
evals are meaningless without data, and this seed doubles as the **ground truth** the
Promptfoo eval cases assert against. So it is:

  * deterministic   — fixed user id, fixed dates anchored to REF_DATE, fixed amounts.
  * all-USD         — single currency so aggregate answers are exact (no FX rounding),
                      which is what makes "is the number correct?" a clean eval.
  * idempotent      — wipes the demo user's rows first, then re-inserts.

It prints a GROUND TRUTH block at the end; those numbers are copied into the eval cases
(backend/evals/cases/*). Run:

    DATABASE_URL=... SECRET_KEY=... python -m app.scripts.seed_demo_data
"""
import asyncio
from datetime import datetime
from decimal import Decimal
from uuid import UUID

from sqlalchemy import delete, select, func

from app.core.database import AsyncSessionLocal
from app.models.user import User, UserRole
from app.modules.savings.models import SavingsAccount
from app.modules.expenses.models import Expense, ExpenseFrequency
from app.modules.income.models import (
    IncomeSource,
    IncomeTransaction,
    IncomeFrequency,
    IncomeTransactionStatus,
)
from app.modules.subscriptions.models import Subscription
from app.modules.ai.models import UploadedFile  # noqa: F401 — registers uploaded_files for ParsedDocument's FK
from app.modules.rag.models import ParsedDocument, DocumentEmbedding


# A fixed, recognizable demo user id. The eval JWT is minted for this id.
DEMO_USER_ID = UUID("00000000-0000-0000-0000-0000000000d1")
DEMO_EMAIL = "demo@wealthvault.app"

# All data is anchored to this reference so the dataset is reproducible regardless of
# when the seed runs. The six full months Dec-2025 .. May-2026 are the "history".
MONTHS = [(2025, 12), (2026, 1), (2026, 2), (2026, 3), (2026, 4), (2026, 5)]


def _d(value: str) -> Decimal:
    return Decimal(value)


# A fixed monthly spending template (same every month) → stable per-category sums.
# (category, name, description, day, amount)
MONTHLY_TEMPLATE = [
    ("Groceries", "Whole Foods Market", "Weekly grocery run", 5, "84.20"),
    ("Groceries", "Trader Joe's", "Groceries and household", 18, "56.75"),
    ("Dining", "Chipotle", "Lunch", 8, "14.50"),
    ("Dining", "Local Bistro", "Dinner with friends", 22, "62.00"),
    ("Transport", "Shell Gas Station", "Fuel", 3, "48.00"),
    ("Transport", "Uber", "Ride downtown", 15, "23.40"),
    ("Utilities", "ComEd Electric", "Monthly electricity bill", 12, "95.00"),
    ("Utilities", "Xfinity Internet", "Home internet", 12, "70.00"),
    ("Coffee", "Starbucks", "Morning coffee", 2, "6.25"),
    ("Coffee", "Starbucks", "Morning coffee", 9, "6.25"),
    ("Coffee", "Starbucks", "Morning coffee", 16, "6.25"),
    ("Coffee", "Starbucks", "Morning coffee", 23, "6.25"),
    ("Health", "CVS Pharmacy", "Prescription refill", 20, "32.10"),
]

# Notable one-offs (year, month, day, category, name, description, amount). These are the
# "interesting" cases the semantic arm and the evals target.
ONE_OFFS = [
    (2026, 2, 10, "Shopping", "AMZN MKTP US*RT4Y2QX0", "Amazon Marketplace order", "238.40"),
    (2026, 3, 14, "Electronics", "Apple Store", "MacBook Pro M4, 14-inch, Space Black", "2499.00"),
    (2026, 4, 2, "Transport", "Pep Boys Auto Service", "Brake pads and rotor replacement", "845.00"),
    (2026, 5, 20, "Travel", "Delta Air Lines", "Flight to San Francisco", "612.30"),
]

# (name, category, amount, description)
SUBSCRIPTIONS = [
    ("Netflix", "Streaming", "11.99", "Netflix Standard plan"),
    ("Spotify", "Streaming", "9.99", "Spotify Premium Individual"),
    ("iCloud+", "Software", "2.99", "iCloud+ 200GB storage"),
    ("Equinox Gym", "Fitness", "30.00", "Monthly gym membership"),
    ("ChatGPT Plus", "Software", "20.00", "OpenAI ChatGPT Plus"),
]

# (name, type, institution, balance)
ACCOUNTS = [
    ("Chase Checking", "personal", "Chase", "8500.00"),
    ("Ally Online Savings", "personal", "Ally Bank", "15000.00"),
    ("Cash Wallet", "cash", None, "320.50"),
]


async def _wipe(session) -> None:
    """Idempotency: remove all of the demo user's data, children first."""
    for model in (DocumentEmbedding, ParsedDocument, IncomeTransaction,
                  IncomeSource, Expense, Subscription, SavingsAccount):
        await session.execute(delete(model).where(model.user_id == DEMO_USER_ID))
    await session.execute(delete(User).where(User.id == DEMO_USER_ID))
    await session.commit()


async def seed() -> None:
    async with AsyncSessionLocal() as session:
        await _wipe(session)

        # --- user ---
        session.add(User(
            id=DEMO_USER_ID,
            email=DEMO_EMAIL,
            name="Demo User",
            role=UserRole.USER,
        ))

        # --- accounts ---
        for name, atype, institution, balance in ACCOUNTS:
            session.add(SavingsAccount(
                user_id=DEMO_USER_ID, name=name, account_type=atype,
                institution=institution, current_balance=_d(balance),
                currency="USD", is_active=True,
            ))

        # --- expenses: monthly template + one-offs (all one-time, all paid) ---
        for (year, month) in MONTHS:
            for category, name, desc, day, amount in MONTHLY_TEMPLATE:
                session.add(Expense(
                    user_id=DEMO_USER_ID, name=name, description=desc, category=category,
                    amount=_d(amount), currency="USD", frequency=ExpenseFrequency.ONE_TIME,
                    date=datetime(year, month, day), is_active=True, status="paid",
                ))
        for year, month, day, category, name, desc, amount in ONE_OFFS:
            session.add(Expense(
                user_id=DEMO_USER_ID, name=name, description=desc, category=category,
                amount=_d(amount), currency="USD", frequency=ExpenseFrequency.ONE_TIME,
                date=datetime(year, month, day), is_active=True, status="paid",
            ))

        # --- income: a salary (monthly) + irregular freelance ---
        salary = IncomeSource(
            user_id=DEMO_USER_ID, name="Acme Corp Salary", category="Salary",
            amount=_d("6500.00"), currency="USD", frequency=IncomeFrequency.MONTHLY,
            is_active=True, start_date=datetime(2025, 12, 1),
        )
        freelance = IncomeSource(
            user_id=DEMO_USER_ID, name="Freelance Design", category="Freelance",
            amount=_d("1000.00"), currency="USD", frequency=IncomeFrequency.MONTHLY,
            is_active=True, start_date=datetime(2026, 1, 1),
        )
        session.add_all([salary, freelance])
        await session.flush()  # need source ids

        for (year, month) in MONTHS:
            session.add(IncomeTransaction(
                user_id=DEMO_USER_ID, source_id=salary.id, amount=_d("6500.00"),
                currency="USD", date=datetime(year, month, 1),
                status=IncomeTransactionStatus.RECEIVED, category="Salary",
                description="Payroll deposit - Acme Corp",
            ))
        for (year, month, day, amount) in [(2026, 2, 15, "1200.00"), (2026, 4, 20, "900.00")]:
            session.add(IncomeTransaction(
                user_id=DEMO_USER_ID, source_id=freelance.id, amount=_d(amount),
                currency="USD", date=datetime(year, month, day),
                status=IncomeTransactionStatus.RECEIVED, category="Freelance",
                description="Upwork payout - design project",
            ))

        # --- subscriptions (all active) ---
        for name, category, amount, desc in SUBSCRIPTIONS:
            session.add(Subscription(
                user_id=DEMO_USER_ID, name=name, description=desc, category=category,
                amount=_d(amount), currency="USD", frequency="monthly",
                start_date=datetime(2025, 11, 1), is_active=True, status="active",
                next_payment_date=datetime(2026, 6, 1),
            ))

        # --- parsed documents: raw Vision-pipeline text retained for RAG ---
        session.add_all([
            ParsedDocument(
                user_id=DEMO_USER_ID, doc_type="statement",
                raw_text=(
                    "CHASE CHECKING STATEMENT — May 2026. Opening balance $7,991.95. "
                    "Deposits: Payroll deposit Acme Corp $6,500.00 on 05/01. "
                    "Card purchases: Whole Foods Market $84.20; Local Bistro $62.00; "
                    "Delta Air Lines $612.30 (flight to San Francisco); Shell Gas Station $48.00. "
                    "Recurring: Netflix $11.99, Spotify $9.99, ChatGPT Plus $20.00. "
                    "Closing balance $8,500.00."
                ),
                structured_json={"account": "Chase Checking", "period": "2026-05"},
            ),
            ParsedDocument(
                user_id=DEMO_USER_ID, doc_type="account",
                raw_text=(
                    "Screenshot of Apple Store receipt: MacBook Pro 14-inch, Apple M4 chip, "
                    "Space Black, 1TB SSD. Total charged $2,499.00 on March 14, 2026 to Chase "
                    "Checking ending 4821. This was the largest single purchase of the year."
                ),
                structured_json={"merchant": "Apple Store", "amount": 2499.00},
            ),
            ParsedDocument(
                user_id=DEMO_USER_ID, doc_type="subscription",
                raw_text=(
                    "Subscriptions overview: Netflix Standard $11.99/mo, Spotify Premium "
                    "$9.99/mo, iCloud+ 200GB $2.99/mo, Equinox Gym $30.00/mo, ChatGPT Plus "
                    "$20.00/mo. Total recurring monthly spend $74.96."
                ),
                structured_json={"count": 5, "monthly_total": 74.96},
            ),
        ])

        await session.commit()
        await _print_ground_truth(session)


async def _scalar(session, stmt) -> Decimal:
    return (await session.execute(stmt)).scalar() or Decimal("0")


async def _print_ground_truth(session) -> None:
    """Compute and print the deterministic facts the eval cases assert against."""
    uid = DEMO_USER_ID

    net_worth = await _scalar(session, select(func.coalesce(func.sum(SavingsAccount.current_balance), 0))
                              .where(SavingsAccount.user_id == uid, SavingsAccount.is_active == True))
    subs_total = await _scalar(session, select(func.coalesce(func.sum(Subscription.amount), 0))
                               .where(Subscription.user_id == uid, Subscription.status == "active"))

    def month_cat(year, month, category):
        start, end = datetime(year, month, 1), datetime(year + (month // 12), (month % 12) + 1, 1)
        return select(func.coalesce(func.sum(Expense.amount), 0)).where(
            Expense.user_id == uid, Expense.category == category,
            Expense.date >= start, Expense.date < end)

    def month_total(year, month):
        start, end = datetime(year, month, 1), datetime(year + (month // 12), (month % 12) + 1, 1)
        return select(func.coalesce(func.sum(Expense.amount), 0)).where(
            Expense.user_id == uid, Expense.date >= start, Expense.date < end)

    dining_may = await _scalar(session, month_cat(2026, 5, "Dining"))
    groceries_may = await _scalar(session, month_cat(2026, 5, "Groceries"))
    total_may = await _scalar(session, month_total(2026, 5))
    income_2026 = await _scalar(session, select(func.coalesce(func.sum(IncomeTransaction.amount), 0)).where(
        IncomeTransaction.user_id == uid, IncomeTransaction.date >= datetime(2026, 1, 1)))
    macbook = await _scalar(session, select(func.coalesce(func.sum(Expense.amount), 0)).where(
        Expense.user_id == uid, Expense.category == "Electronics"))

    print("\n================= GROUND TRUTH (copy into evals) =================")
    print(f"demo_user_id            : {uid}")
    print(f"net_worth (USD)         : {net_worth}")
    print(f"active_subs_monthly     : {subs_total}")
    print(f"dining_may_2026         : {dining_may}")
    print(f"groceries_may_2026      : {groceries_may}")
    print(f"total_spend_may_2026    : {total_may}")
    print(f"income_2026_ytd         : {income_2026}")
    print(f"electronics_total       : {macbook}  (MacBook Pro one-off)")
    print("==================================================================\n")


if __name__ == "__main__":
    asyncio.run(seed())
