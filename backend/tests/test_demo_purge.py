import uuid
from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import text

from app.models.user import User, UserRole
from app.tasks.demo_tasks import _purge_expired


@pytest.mark.asyncio
async def test_purge_removes_expired_demo(db):
    uid = uuid.uuid4()
    past = datetime.now(timezone.utc) - timedelta(hours=1)
    db.add(User(id=uid, email=f"demo+{uid.hex}@wealthvault.app", name="Demo User",
                role=UserRole.USER, is_demo=True, demo_expires_at=past))
    await db.flush()
    await db.execute(text(
        "INSERT INTO budgets (id, user_id, name, category, amount, currency, period, start_date, "
        "is_active, rollover_unused, rollover_amount, alert_threshold, created_at, updated_at) "
        "VALUES (gen_random_uuid(), :u, 'B', 'groceries', 100, 'USD', 'monthly', now(), true, false, 0, 80, now(), now())"
    ), {"u": str(uid)})
    await db.commit()

    removed = await _purge_expired(db)
    assert removed >= 1
    gone = await db.scalar(text("SELECT count(*) FROM users WHERE id = :u"), {"u": str(uid)})
    assert gone == 0
