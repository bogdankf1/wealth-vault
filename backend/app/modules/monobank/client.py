"""
Monobank Personal API client.

The Personal API enforces 1 request per 60 seconds per token across all
endpoints (client-info + statement share the same bucket). We coordinate
this across processes via Redis so the Celery backfill worker and a
synchronous request from the API server do not collide.

Spec: https://api.monobank.ua/docs/
"""
from __future__ import annotations

import asyncio
import logging
import time
from dataclasses import dataclass
from decimal import Decimal
from typing import Any, Dict, List, Optional

import httpx
import redis.asyncio as aioredis

from app.core.config import settings


logger = logging.getLogger(__name__)


# ISO 4217 numeric -> alpha. Mono returns numeric; the rest of our app uses alpha.
# Full list is huge; map the ones a Mono user could plausibly hold.
CURRENCY_CODE_MAP: Dict[int, str] = {
    980: "UAH",
    840: "USD",
    978: "EUR",
    826: "GBP",
    985: "PLN",
    756: "CHF",
    124: "CAD",
    392: "JPY",
    156: "CNY",
    949: "TRY",
    643: "RUB",
    933: "BYN",
    498: "MDL",
    981: "GEL",
}


def currency_alpha(numeric: int) -> str:
    return CURRENCY_CODE_MAP.get(numeric, str(numeric))


def minor_to_decimal(minor_units: int) -> Decimal:
    """Mono returns amounts as int64 in minor units (kopecks/cents)."""
    return (Decimal(minor_units) / Decimal(100)).quantize(Decimal("0.01"))


class MonobankError(Exception):
    """Base error for Monobank API failures."""


class MonobankInvalidToken(MonobankError):
    """401/403 from Mono — token is bad or revoked."""


class MonobankRateLimited(MonobankError):
    """429 from Mono — caller should back off and retry later."""


@dataclass
class StatementWindow:
    from_ts: int
    to_ts: int


class _TokenRateLimiter:
    """Redis-backed 1-req-per-60s gate per token."""

    WINDOW_SECONDS = 60

    def __init__(self, redis_url: str) -> None:
        self._redis_url = redis_url
        self._client: Optional[aioredis.Redis] = None

    async def _redis(self) -> aioredis.Redis:
        if self._client is None:
            self._client = aioredis.from_url(self._redis_url, encoding="utf-8", decode_responses=True)
        return self._client

    async def acquire(self, token_hash: str, wait: bool = True) -> bool:
        """
        Try to claim the next request slot. If `wait=False` and the slot is
        held, returns False immediately; otherwise sleeps until free.
        """
        key = f"monobank:ratelimit:{token_hash}"
        r = await self._redis()
        while True:
            # SET NX with TTL — atomic claim.
            claimed = await r.set(key, "1", nx=True, ex=self.WINDOW_SECONDS)
            if claimed:
                return True
            if not wait:
                return False
            ttl = await r.ttl(key)
            await asyncio.sleep(max(ttl, 1) + 0.25)


def _token_hash(token: str) -> str:
    """Stable, short, non-reversible identifier for rate-limit bucketing."""
    import hashlib
    return hashlib.sha256(token.encode("utf-8")).hexdigest()[:24]


class MonobankClient:
    """Async client for Mono Personal API. One instance per process is fine."""

    def __init__(
        self,
        base_url: Optional[str] = None,
        redis_url: Optional[str] = None,
        timeout: float = 15.0,
    ) -> None:
        self._base_url = (base_url or settings.MONOBANK_API_URL).rstrip("/")
        self._limiter = _TokenRateLimiter(redis_url or settings.REDIS_URL)
        self._timeout = timeout

    async def _request(
        self,
        method: str,
        path: str,
        token: str,
        *,
        json: Optional[Dict[str, Any]] = None,
        wait_for_rate_limit: bool = True,
    ) -> Any:
        await self._limiter.acquire(_token_hash(token), wait=wait_for_rate_limit)
        url = f"{self._base_url}{path}"
        async with httpx.AsyncClient(timeout=self._timeout) as http:
            resp = await http.request(method, url, headers={"X-Token": token}, json=json)

        if resp.status_code in (401, 403):
            raise MonobankInvalidToken(f"{resp.status_code}: {resp.text[:200]}")
        if resp.status_code == 429:
            raise MonobankRateLimited(resp.text[:200])
        if resp.status_code >= 400:
            raise MonobankError(f"{resp.status_code}: {resp.text[:500]}")
        if not resp.content:
            return None
        return resp.json()

    async def get_client_info(self, token: str) -> Dict[str, Any]:
        return await self._request("GET", "/personal/client-info", token)

    async def get_statement(
        self,
        token: str,
        account_id: str,
        from_ts: int,
        to_ts: Optional[int] = None,
    ) -> List[Dict[str, Any]]:
        path = f"/personal/statement/{account_id}/{from_ts}"
        if to_ts is not None:
            path += f"/{to_ts}"
        return await self._request("GET", path, token) or []

    async def set_webhook(self, token: str, webhook_url: str) -> None:
        await self._request("POST", "/personal/webhook", token, json={"webHookUrl": webhook_url})


def chunk_statement_windows(months_back: int, *, now_ts: Optional[int] = None) -> List[StatementWindow]:
    """
    Mono's statement endpoint accepts windows of up to 31 days + 1 hour
    (2_682_000 seconds). Walk backward from `now_ts` in non-overlapping chunks.
    """
    end = int(now_ts if now_ts is not None else time.time())
    earliest = end - months_back * 31 * 86_400
    max_window = 2_682_000  # 31d + 1h
    windows: List[StatementWindow] = []
    cursor = end
    while cursor > earliest:
        chunk_start = max(earliest, cursor - max_window)
        windows.append(StatementWindow(from_ts=chunk_start, to_ts=cursor))
        cursor = chunk_start - 1
    return windows
