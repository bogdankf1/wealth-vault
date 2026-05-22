"""
Smoke-test the Monobank client against a real personal token.

Usage:
    cd backend && python -m scripts.test_monobank

Reads MONOBANK_TEST_TOKEN from .env. Does NOT register a webhook (we don't
have a public URL in dev). Hits client-info and pulls a 1-day statement for
the first account.
"""
from __future__ import annotations

import asyncio
import json
import os
import sys
import time
from pathlib import Path


# Allow running from repo root or backend/.
BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.core.config import settings  # noqa: E402
from app.modules.monobank.client import (  # noqa: E402
    MonobankClient,
    MonobankInvalidToken,
    currency_alpha,
    minor_to_decimal,
)


async def main() -> int:
    token = settings.MONOBANK_TEST_TOKEN
    if not token:
        print("ERROR: MONOBANK_TEST_TOKEN is not set in backend/.env")
        return 2

    client = MonobankClient()

    print(f"Hitting client-info @ {settings.MONOBANK_API_URL} ...")
    try:
        info = await client.get_client_info(token)
    except MonobankInvalidToken as e:
        print(f"Token rejected: {e}")
        return 3

    print(f"  clientId    : {info.get('clientId')}")
    print(f"  name        : {info.get('name')}")
    print(f"  permissions : {info.get('permissions')}")
    print(f"  webHookUrl  : {info.get('webHookUrl') or '(none registered)'}")
    print(f"  accounts    : {len(info.get('accounts', []))}")
    print(f"  jars        : {len(info.get('jars', []))}")

    for acc in info.get("accounts", []):
        bal = minor_to_decimal(int(acc["balance"]))
        cur = currency_alpha(int(acc["currencyCode"]))
        print(f"    - [{acc.get('type')}] id={acc['id']} bal={bal} {cur} iban={acc.get('iban')}")

    for jar in info.get("jars", []):
        bal = minor_to_decimal(int(jar["balance"]))
        cur = currency_alpha(int(jar["currencyCode"]))
        print(f"    - [jar] id={jar['id']} title={jar.get('title')!r} bal={bal} {cur}")

    if not info.get("accounts"):
        print("No accounts found — nothing to fetch a statement for.")
        return 0

    first = info["accounts"][0]
    one_day_ago = int(time.time()) - 86_400
    print(f"\nSleeping 65s to clear Mono's 1-req/60s rate limit...")
    await asyncio.sleep(65)
    print(f"Fetching last 24h of statement for account {first['id']}...")
    items = await client.get_statement(token, first["id"], one_day_ago)
    print(f"  got {len(items)} item(s)")
    for it in items[:5]:
        amt = minor_to_decimal(int(it["amount"]))
        cur = currency_alpha(int(it.get("currencyCode", 980)))
        print(
            f"    - {it['id']} {amt:>10} {cur}  mcc={it.get('mcc')}  "
            f"{(it.get('counterName') or it.get('description') or '')[:60]}"
        )

    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
