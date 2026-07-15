import uuid

import pytest
from sqlalchemy import text

from app.models.user import User, UserRole
from app.modules.demo.service import clone_user_data, CLONE_TABLES


@pytest.mark.asyncio
async def test_clone_copies_all_rows_and_remaps_fks(db, user_id):
    # user_id fixture = DEMO_USER_ID, the seeded source of data to clone
    new_id = uuid.uuid4()
    db.add(User(id=new_id, email=f"demo+{new_id.hex}@wealthvault.app",
                name="Demo User", role=UserRole.USER, is_demo=True))
    await db.flush()
    try:
        await clone_user_data(db, user_id, new_id)
        await db.flush()

        for table, _ in CLONE_TABLES:
            src = await db.scalar(text(f'SELECT count(*) FROM "{table}" WHERE user_id = :u'), {"u": str(user_id)})
            dst = await db.scalar(text(f'SELECT count(*) FROM "{table}" WHERE user_id = :u'), {"u": str(new_id)})
            assert dst == src, f"{table}: cloned {dst} != template {src}"

        # FK integrity: cloned expenses must reference the NEW user's accounts (or NULL)
        dangling = await db.scalar(text(
            'SELECT count(*) FROM expenses e WHERE e.user_id = :u AND e.payment_account_id IS NOT NULL '
            'AND NOT EXISTS (SELECT 1 FROM savings_accounts a WHERE a.id = e.payment_account_id AND a.user_id = :u)'
        ), {"u": str(new_id)})
        assert dangling == 0
    finally:
        for t in ("income_transactions", "income_sources", "budgets"):
            await db.execute(text(f'DELETE FROM "{t}" WHERE user_id = :u'), {"u": str(new_id)})
        await db.execute(text('DELETE FROM users WHERE id = :u'), {"u": str(new_id)})
        await db.commit()
