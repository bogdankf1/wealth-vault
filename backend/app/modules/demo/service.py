"""Clone all per-user financial data from a template user into a fresh demo user.

Deterministic UUIDv5 remapping: every new primary key AND every foreign key is
uuid_generate_v5(new_user_id, old_id::text). Because PK and FK use the same function,
references stay consistent with no cross-table id map. Requires the uuid-ossp extension.
Insertion order below guarantees each FK target is inserted before its referrers.
"""
from uuid import UUID

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

# (table, {fk_column: parent_table}) — order matters (parents before children).
CLONE_TABLES: list[tuple[str, dict[str, str]]] = [
    ("savings_accounts", {}),
    ("income_sources", {"target_account_id": "savings_accounts"}),
    ("goals", {}),
    ("portfolio_assets", {"payment_account_id": "savings_accounts", "dividend_account_id": "savings_accounts"}),
    ("debts", {"deposit_account_id": "savings_accounts"}),
    ("taxes", {"payment_account_id": "savings_accounts", "income_source_id": "income_sources"}),
    ("subscriptions", {"payment_account_id": "savings_accounts"}),
    # account_transactions.source_id is a POLYMORPHIC soft-pointer (keyed by source_type), not a real
    # FK — deliberately NOT remapped. It is NULL in the template today; revisit if that ever changes.
    ("account_transactions", {"account_id": "savings_accounts"}),
    ("expenses", {"payment_account_id": "savings_accounts", "account_transaction_id": "account_transactions"}),
    ("income_transactions", {"source_id": "income_sources", "deposited_to_account_id": "savings_accounts", "account_transaction_id": "account_transactions"}),
    ("goal_account_links", {"goal_id": "goals", "account_id": "savings_accounts"}),
    ("debt_payments", {"debt_id": "debts", "account_transaction_id": "account_transactions"}),
    ("tax_payments", {"tax_id": "taxes", "account_transaction_id": "account_transactions"}),
    ("budgets", {}),
    ("portfolio_transactions", {"asset_id": "portfolio_assets", "account_transaction_id": "account_transactions", "income_transaction_id": "income_transactions"}),
]


async def _columns(db: AsyncSession, table: str) -> list[str]:
    rows = await db.execute(text(
        "SELECT column_name FROM information_schema.columns "
        "WHERE table_schema = 'public' AND table_name = :t ORDER BY ordinal_position"
    ), {"t": table})
    return [r[0] for r in rows]


async def clone_user_data(db: AsyncSession, template_user_id: UUID, new_user_id: UUID) -> None:
    """Copy every per-user row from template_user_id to new_user_id. Does NOT commit."""
    params = {"ns": str(new_user_id), "new_user": str(new_user_id), "template": str(template_user_id)}
    for table, fk_cols in CLONE_TABLES:
        cols = await _columns(db, table)
        exprs: list[str] = []
        for c in cols:
            if c == "id":
                exprs.append("uuid_generate_v5(CAST(:ns AS uuid), id::text) AS id")
            elif c == "user_id":
                exprs.append("CAST(:new_user AS uuid) AS user_id")
            elif c in fk_cols:
                exprs.append(
                    f'CASE WHEN "{c}" IS NULL THEN NULL '
                    f'ELSE uuid_generate_v5(CAST(:ns AS uuid), "{c}"::text) END AS "{c}"'
                )
            else:
                exprs.append(f'"{c}"')
        col_list = ", ".join(f'"{c}"' for c in cols)
        where = "user_id = CAST(:template AS uuid)"
        if "deleted_at" in cols:
            where += " AND deleted_at IS NULL"  # never clone soft-deleted rows
        sql = f'INSERT INTO "{table}" ({col_list}) SELECT {", ".join(exprs)} FROM "{table}" WHERE {where}'
        await db.execute(text(sql), params)
