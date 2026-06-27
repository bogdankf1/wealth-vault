"""
Script to seed supported currencies (ISO 4217).

The `currencies` table is not populated by create_all_tables / alembic / seed_data,
so a fresh database has zero currencies and the frontend's GET /currencies/{code}
lookups 404. Run this after seed_data:

    PYTHONPATH=. python -m app.scripts.seed_currencies

Idempotent: existing codes are left untouched, missing ones are inserted.
"""
import asyncio
from sqlalchemy import select

from app.core.database import AsyncSessionLocal
from app.modules.currency.models import Currency

# (code, name, symbol, decimal_places)
SUPPORTED_CURRENCIES = [
    ("USD", "US Dollar", "$", 2),
    ("EUR", "Euro", "€", 2),
    ("GBP", "British Pound", "£", 2),
    ("UAH", "Ukrainian Hryvnia", "₴", 2),
    ("JPY", "Japanese Yen", "¥", 0),
    ("CNY", "Chinese Yuan", "¥", 2),
    ("CAD", "Canadian Dollar", "C$", 2),
    ("AUD", "Australian Dollar", "A$", 2),
    ("CHF", "Swiss Franc", "CHF", 2),
    ("PLN", "Polish Złoty", "zł", 2),
    ("SEK", "Swedish Krona", "kr", 2),
    ("NOK", "Norwegian Krone", "kr", 2),
    ("DKK", "Danish Krone", "kr", 2),
    ("INR", "Indian Rupee", "₹", 2),
    ("BRL", "Brazilian Real", "R$", 2),
    ("MXN", "Mexican Peso", "$", 2),
    ("SGD", "Singapore Dollar", "S$", 2),
    ("HKD", "Hong Kong Dollar", "HK$", 2),
    ("NZD", "New Zealand Dollar", "NZ$", 2),
    ("ZAR", "South African Rand", "R", 2),
    ("TRY", "Turkish Lira", "₺", 2),
    ("CZK", "Czech Koruna", "Kč", 2),
    ("KRW", "South Korean Won", "₩", 0),
]


async def seed_currencies():
    """Insert any supported currencies that don't already exist."""
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(Currency.code))
        existing = {code for (code,) in result.all()}

        created = 0
        for code, name, symbol, decimals in SUPPORTED_CURRENCIES:
            if code in existing:
                continue
            db.add(Currency(
                code=code,
                name=name,
                symbol=symbol,
                decimal_places=decimals,
                is_active=True,
            ))
            created += 1

        await db.commit()
        print(f"✓ Currencies: {created} created, {len(existing)} already present")


async def main():
    print("Seeding currencies...")
    await seed_currencies()
    print("✓ Done")


if __name__ == "__main__":
    asyncio.run(main())
