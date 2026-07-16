import uuid

import pytest
from sqlalchemy import text

from app.models.user import User, UserRole
from app.modules.demo.service import clone_user_data, CLONE_TABLES


@pytest.mark.asyncio
async def test_clone_copies_all_rows_and_remaps_fks(db, user_id):
    new_id = uuid.uuid4()
    marker = uuid.uuid4().hex  # tags the fixture rows we add to the source user
    sa_id = await db.scalar(text(
        "SELECT id FROM savings_accounts WHERE user_id = :u ORDER BY id LIMIT 1"), {"u": str(user_id)})
    assert sa_id is not None, "demo user must have a savings account for this test"
    at_id = uuid.uuid4()
    exp_id = uuid.uuid4()

    # fixture rows on the SOURCE user carrying NON-NULL foreign keys (what the clone must remap)
    await db.execute(text(
        "INSERT INTO account_transactions (id, account_id, user_id, transaction_type, amount, currency, "
        "balance_before, balance_after, transaction_date, status, created_at, updated_at) "
        "VALUES (:id, :acc, :u, 'withdrawal', 10, 'USD', 100, 90, now(), 'completed', now(), now())"
    ), {"id": str(at_id), "acc": str(sa_id), "u": str(user_id)})
    await db.execute(text(
        "INSERT INTO expenses (id, user_id, name, amount, currency, frequency, is_active, status, auto_pay, "
        "payment_account_id, account_transaction_id, created_at, updated_at) "
        "VALUES (:id, :u, :nm, 10, 'USD', 'ONE_TIME', true, 'paid', false, :acc, :at, now(), now())"
    ), {"id": str(exp_id), "u": str(user_id), "nm": f"cln-{marker}", "acc": str(sa_id), "at": str(at_id)})
    await db.flush()

    db.add(User(id=new_id, email=f"demo+{new_id.hex}@wealthvault.app",
                name="Demo User", role=UserRole.USER, is_demo=True))
    await db.flush()
    try:
        await clone_user_data(db, user_id, new_id)
        await db.flush()

        # 1) row-count parity across every cloned table
        for table, _ in CLONE_TABLES:
            src = await db.scalar(text(f'SELECT count(*) FROM "{table}" WHERE user_id = :u'), {"u": str(user_id)})
            dst = await db.scalar(text(f'SELECT count(*) FROM "{table}" WHERE user_id = :u'), {"u": str(new_id)})
            assert dst == src, f"{table}: cloned {dst} != template {src}"

        # 2) the cloned expense's non-null FKs must be uuid5-REMAPPED to the new user's rows
        new_pa, new_at = (await db.execute(text(
            "SELECT payment_account_id, account_transaction_id FROM expenses "
            "WHERE user_id = :u AND name = :nm"), {"u": str(new_id), "nm": f"cln-{marker}"})).one()
        exp_pa = await db.scalar(text(
            "SELECT uuid_generate_v5(CAST(:ns AS uuid), CAST(:old AS uuid)::text)"),
            {"ns": str(new_id), "old": str(sa_id)})
        exp_at = await db.scalar(text(
            "SELECT uuid_generate_v5(CAST(:ns AS uuid), CAST(:old AS uuid)::text)"),
            {"ns": str(new_id), "old": str(at_id)})
        assert str(new_pa) == str(exp_pa), "payment_account_id was not remapped"
        assert str(new_at) == str(exp_at), "account_transaction_id was not remapped"
        # and they resolve to rows OWNED BY the new user (not the source user's)
        assert await db.scalar(text("SELECT count(*) FROM savings_accounts WHERE id=:i AND user_id=:u"),
                               {"i": str(new_pa), "u": str(new_id)}) == 1
        assert await db.scalar(text("SELECT count(*) FROM account_transactions WHERE id=:i AND user_id=:u"),
                               {"i": str(new_at), "u": str(new_id)}) == 1
    finally:
        for t in ("income_transactions", "income_sources", "budgets"):
            await db.execute(text(f'DELETE FROM "{t}" WHERE user_id = :u'), {"u": str(new_id)})
        await db.execute(text('DELETE FROM users WHERE id = :u'), {"u": str(new_id)})
        # remove the fixture rows added to the SOURCE user
        await db.execute(text("DELETE FROM expenses WHERE id = :i"), {"i": str(exp_id)})
        await db.execute(text("DELETE FROM account_transactions WHERE id = :i"), {"i": str(at_id)})
        await db.commit()
