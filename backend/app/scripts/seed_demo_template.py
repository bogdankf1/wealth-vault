"""Provision (or re-provision) the frozen demo TEMPLATE user + its golden dataset.

    python -m app.scripts.seed_demo_template   (run from backend/; .env auto-loads)

Idempotent: wipes the template's per-user rows, ensures the template User row exists
(role USER, wealth tier, is_demo=False so cleanup never touches it), then executes
demo_template_seed.sql.
"""
import asyncio
from pathlib import Path

from sqlalchemy import select, text, delete

from app.core.database import AsyncSessionLocal
from app.models.user import User, UserRole
from app.models.tier import Tier
from app.modules.demo.constants import TEMPLATE_USER_ID

SQL_FILE = Path(__file__).parent / "demo_template_seed.sql"
TEMPLATE_EMAIL = "demo-template@wealthvault.app"
# user_id FKs WITHOUT ON DELETE CASCADE — clear before deleting the user
NON_CASCADE = ("income_transactions", "income_sources", "budgets")


async def seed() -> None:
    async with AsyncSessionLocal() as session:
        # 1. wipe existing template data (non-cascade children first, then the user cascades the rest)
        for table in NON_CASCADE:
            await session.execute(text(f'DELETE FROM "{table}" WHERE user_id = :u'), {"u": str(TEMPLATE_USER_ID)})
        await session.execute(delete(User).where(User.id == TEMPLATE_USER_ID))
        await session.commit()

        # 2. ensure the template user exists (wealth tier)
        tier = (await session.execute(select(Tier).where(Tier.name == "wealth"))).scalar_one()
        session.add(User(
            id=TEMPLATE_USER_ID,
            email=TEMPLATE_EMAIL,
            name="Demo Template",
            role=UserRole.USER,
            tier_id=tier.id,
            is_demo=False,
        ))
        await session.commit()

        # 3. run the golden dataset SQL (single DO block; exec_driver_sql avoids bind-param parsing)
        sql = SQL_FILE.read_text()
        conn = await session.connection()
        await conn.exec_driver_sql(sql)
        await session.commit()
        print(f"Template seeded: {TEMPLATE_USER_ID}")


if __name__ == "__main__":
    asyncio.run(seed())
