"""
Exchange Rate Service
Fetches and caches exchange rates from external API.
"""
import httpx
import redis.asyncio as aioredis
from datetime import datetime, timedelta
from typing import Dict, Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_

from app.core.config import settings
from app.core.database import get_db
from app.modules.currency.models import ExchangeRate


class ExchangeRateService:
    """Service for managing currency exchange rates."""

    # Free tier API: https://exchangerate-api.com/
    BASE_URL = "https://v6.exchangerate-api.com/v6"
    CACHE_TTL = 3600  # 1 hour cache

    def __init__(self, db: AsyncSession, redis_client: Optional[aioredis.Redis] = None):
        self.db = db
        self.redis_client = redis_client
        self.api_key = settings.EXCHANGE_RATE_API_KEY

    async def get_exchange_rate(
        self,
        from_currency: str,
        to_currency: str
    ) -> Optional[float]:
        """
        Get exchange rate from cache or API.

        Args:
            from_currency: Source currency code (e.g., 'USD')
            to_currency: Target currency code (e.g., 'EUR')

        Returns:
            Exchange rate as float, or None if unavailable
        """
        # Same currency = rate of 1
        if from_currency == to_currency:
            return 1.0

        # Try cache first
        cache_key = f"exchange_rate:{from_currency}:{to_currency}"

        if self.redis_client:
            try:
                cached_rate = await self.redis_client.get(cache_key)
                if cached_rate:
                    return float(cached_rate)
            except Exception as e:
                print(f"Redis cache error: {e}")

        # Try fetching from API
        rate = await self._fetch_rate_from_api(from_currency, to_currency)

        if rate:
            # Cache the rate
            if self.redis_client:
                try:
                    await self.redis_client.setex(
                        cache_key,
                        self.CACHE_TTL,
                        str(rate)
                    )
                except Exception as e:
                    print(f"Redis cache set error: {e}")

            # Store in database for historical tracking
            await self._store_rate_in_db(from_currency, to_currency, rate)

            return rate

        # Fallback: try to get last known rate from database
        return await self._get_last_known_rate(from_currency, to_currency)

    async def _fetch_rate_from_api(
        self,
        from_currency: str,
        to_currency: str
    ) -> Optional[float]:
        """
        Fetch exchange rate from external API.

        Uses exchangerate-api.com free tier.
        API URL: https://v6.exchangerate-api.com/v6/{API_KEY}/pair/{FROM}/{TO}
        """
        if not self.api_key:
            print("Warning: EXCHANGE_RATE_API_KEY not set, using fallback rates")
            return None

        url = f"{self.BASE_URL}/{self.api_key}/pair/{from_currency}/{to_currency}"

        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.get(url)
                response.raise_for_status()

                data = response.json()

                if data.get("result") == "success":
                    return float(data.get("conversion_rate"))
                else:
                    print(f"API error: {data.get('error-type')}")
                    return None

        except httpx.HTTPError as e:
            print(f"HTTP error fetching exchange rate: {e}")
            return None
        except Exception as e:
            print(f"Error fetching exchange rate: {e}")
            return None

    async def _store_rate_in_db(
        self,
        from_currency: str,
        to_currency: str,
        rate: float
    ) -> None:
        """Store exchange rate in database for historical tracking."""
        try:
            exchange_rate = ExchangeRate(
                from_currency=from_currency,
                to_currency=to_currency,
                rate=rate,
                fetched_at=datetime.utcnow(),
                source="exchangerate-api.com"
            )
            self.db.add(exchange_rate)
            await self.db.commit()
        except Exception as e:
            print(f"Error storing rate in DB: {e}")
            await self.db.rollback()

    async def _get_last_known_rate(
        self,
        from_currency: str,
        to_currency: str
    ) -> Optional[float]:
        """
        Get the last known exchange rate from database.
        Falls back to this if API is unavailable.
        """
        try:
            # Get most recent rate (within last 7 days)
            seven_days_ago = datetime.utcnow() - timedelta(days=7)

            result = await self.db.execute(
                select(ExchangeRate)
                .where(
                    and_(
                        ExchangeRate.from_currency == from_currency,
                        ExchangeRate.to_currency == to_currency,
                        ExchangeRate.fetched_at >= seven_days_ago
                    )
                )
                .order_by(ExchangeRate.fetched_at.desc())
                .limit(1)
            )

            rate_record = result.scalar_one_or_none()

            if rate_record:
                print(f"Using cached DB rate from {rate_record.fetched_at}")
                return rate_record.rate

            return None

        except Exception as e:
            print(f"Error fetching last known rate: {e}")
            return None

    async def convert_amount(
        self,
        amount: float,
        from_currency: str,
        to_currency: str
    ) -> Optional[float]:
        """
        Convert an amount from one currency to another.

        Args:
            amount: Amount to convert
            from_currency: Source currency code
            to_currency: Target currency code

        Returns:
            Converted amount, or None if conversion failed
        """
        if from_currency == to_currency:
            return amount

        rate = await self.get_exchange_rate(from_currency, to_currency)

        if rate is not None:
            return amount * rate

        return None

    async def get_all_rates_for_currency(
        self,
        base_currency: str
    ) -> Dict[str, float]:
        """
        Get all exchange rates for a base currency.

        Args:
            base_currency: Base currency code (e.g., 'USD')

        Returns:
            Dictionary mapping currency codes to rates
        """
        if not self.api_key:
            return {}

        url = f"{self.BASE_URL}/{self.api_key}/latest/{base_currency}"

        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.get(url)
                response.raise_for_status()

                data = response.json()

                if data.get("result") == "success":
                    return data.get("conversion_rates", {})
                else:
                    return {}

        except Exception as e:
            print(f"Error fetching all rates: {e}")
            return {}

    async def refresh_all_rates(self, base_currency: str = "USD") -> int:
        """
        Refresh all exchange rates for common currencies.
        Returns number of rates refreshed.
        """
        rates = await self.get_all_rates_for_currency(base_currency)
        count = 0

        for to_currency, rate in rates.items():
            cache_key = f"exchange_rate:{base_currency}:{to_currency}"

            if self.redis_client:
                try:
                    await self.redis_client.setex(
                        cache_key,
                        self.CACHE_TTL,
                        str(rate)
                    )
                except Exception:
                    pass

            await self._store_rate_in_db(base_currency, to_currency, rate)
            count += 1

        return count


async def get_exchange_rate_service(
    db: AsyncSession,
    redis_client: Optional[aioredis.Redis] = None
) -> ExchangeRateService:
    """Dependency for getting exchange rate service."""
    return ExchangeRateService(db, redis_client)
