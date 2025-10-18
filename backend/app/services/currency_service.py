"""
Currency service for exchange rate fetching and currency conversion.
"""
import logging
from datetime import datetime, timedelta
from decimal import Decimal
from typing import Optional, Dict, List
import httpx
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_

from app.modules.currency.models import Currency, ExchangeRate
from app.core.config import settings

logger = logging.getLogger(__name__)


class CurrencyService:
    """Service for currency operations and exchange rate management."""

    # Exchange Rate API configuration
    EXCHANGE_RATE_API_URL = "https://v6.exchangerate-api.com/v6"
    CACHE_TTL_HOURS = 1  # Cache exchange rates for 1 hour

    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_all_currencies(self, active_only: bool = True) -> List[Currency]:
        """Get all currencies from the database."""
        query = select(Currency)
        if active_only:
            query = query.where(Currency.is_active == True)
        query = query.order_by(Currency.code)
        result = await self.db.execute(query)
        return list(result.scalars().all())

    async def get_currency(self, code: str) -> Optional[Currency]:
        """Get a specific currency by code."""
        query = select(Currency).where(Currency.code == code)
        result = await self.db.execute(query)
        return result.scalar_one_or_none()

    async def create_currency(
        self,
        code: str,
        name: str,
        symbol: str,
        decimal_places: int = 2,
        is_active: bool = True,
        created_by_admin: Optional[str] = None
    ) -> Currency:
        """Create a new currency."""
        currency = Currency(
            code=code.upper(),
            name=name,
            symbol=symbol,
            decimal_places=decimal_places,
            is_active=is_active,
            created_by_admin=created_by_admin
        )
        self.db.add(currency)
        await self.db.flush()
        await self.db.refresh(currency)
        logger.info(f"Created currency: {code}")
        return currency

    async def update_currency(
        self,
        code: str,
        **updates
    ) -> Optional[Currency]:
        """Update a currency."""
        currency = await self.get_currency(code)
        if not currency:
            return None

        for key, value in updates.items():
            if hasattr(currency, key):
                setattr(currency, key, value)

        await self.db.flush()
        await self.db.refresh(currency)
        logger.info(f"Updated currency: {code}")
        return currency

    async def delete_currency(self, code: str) -> bool:
        """Delete a currency (soft delete by setting is_active=False)."""
        currency = await self.get_currency(code)
        if not currency:
            return False

        currency.is_active = False
        await self.db.flush()
        logger.info(f"Deactivated currency: {code}")
        return True

    async def fetch_exchange_rate_from_api(
        self,
        from_currency: str,
        to_currency: str
    ) -> Optional[Decimal]:
        """Fetch exchange rate from external API."""
        try:
            # Use Exchange Rate API
            api_key = getattr(settings, 'EXCHANGE_RATE_API_KEY', 'YOUR_API_KEY')
            url = f"{self.EXCHANGE_RATE_API_URL}/{api_key}/pair/{from_currency}/{to_currency}"

            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.get(url)
                response.raise_for_status()
                data = response.json()

                if data.get("result") == "success":
                    rate = Decimal(str(data.get("conversion_rate")))
                    logger.info(f"Fetched rate {from_currency}/{to_currency} = {rate}")
                    return rate
                else:
                    logger.error(f"API error: {data.get('error-type')}")
                    return None

        except httpx.HTTPError as e:
            logger.error(f"HTTP error fetching exchange rate: {e}")
            return None
        except Exception as e:
            logger.exception(f"Error fetching exchange rate: {e}")
            return None

    async def get_exchange_rate(
        self,
        from_currency: str,
        to_currency: str,
        force_refresh: bool = False
    ) -> Optional[Decimal]:
        """
        Get exchange rate between two currencies.
        Uses cached rate if available and not stale, otherwise fetches from API.
        """
        # If currencies are the same, rate is 1
        if from_currency == to_currency:
            return Decimal("1.0")

        # Check if currencies exist
        from_curr = await self.get_currency(from_currency)
        to_curr = await self.get_currency(to_currency)

        if not from_curr or not to_curr:
            logger.error(f"Currency not found: {from_currency} or {to_currency}")
            return None

        # Check cache unless force_refresh
        if not force_refresh:
            cached_rate = await self._get_cached_rate(from_currency, to_currency)
            if cached_rate:
                return cached_rate

        # Fetch from API
        rate = await self.fetch_exchange_rate_from_api(from_currency, to_currency)

        if rate:
            # Store in database
            await self._store_exchange_rate(from_currency, to_currency, rate)
            return rate
        else:
            # Fallback to last known rate (even if stale)
            fallback_rate = await self._get_last_known_rate(from_currency, to_currency)
            if fallback_rate:
                logger.warning(f"Using stale exchange rate for {from_currency}/{to_currency}")
                return fallback_rate

            logger.error(f"No exchange rate available for {from_currency}/{to_currency}")
            return None

    async def _get_cached_rate(
        self,
        from_currency: str,
        to_currency: str
    ) -> Optional[Decimal]:
        """Get cached exchange rate if not stale (most recent)."""
        cutoff_time = datetime.utcnow() - timedelta(hours=self.CACHE_TTL_HOURS)

        query = select(ExchangeRate).where(
            and_(
                ExchangeRate.from_currency == from_currency,
                ExchangeRate.to_currency == to_currency,
                ExchangeRate.fetched_at >= cutoff_time
            )
        ).order_by(ExchangeRate.fetched_at.desc()).limit(1)

        result = await self.db.execute(query)
        rate_record = result.scalar_one_or_none()

        if rate_record:
            logger.info(f"Using cached rate {from_currency}/{to_currency}")
            return rate_record.rate

        return None

    async def _get_last_known_rate(
        self,
        from_currency: str,
        to_currency: str
    ) -> Optional[Decimal]:
        """Get last known exchange rate (fallback for stale data - most recent)."""
        query = select(ExchangeRate).where(
            and_(
                ExchangeRate.from_currency == from_currency,
                ExchangeRate.to_currency == to_currency
            )
        ).order_by(ExchangeRate.fetched_at.desc()).limit(1)

        result = await self.db.execute(query)
        rate_record = result.scalar_one_or_none()

        if rate_record:
            return rate_record.rate

        return None

    async def _store_exchange_rate(
        self,
        from_currency: str,
        to_currency: str,
        rate: Decimal,
        source: str = "exchangerate-api"
    ) -> ExchangeRate:
        """Store exchange rate in database."""
        exchange_rate = ExchangeRate(
            from_currency=from_currency,
            to_currency=to_currency,
            rate=rate,
            source=source,
            fetched_at=datetime.utcnow()
        )
        self.db.add(exchange_rate)
        await self.db.flush()
        await self.db.refresh(exchange_rate)
        return exchange_rate

    async def convert_amount(
        self,
        amount: Decimal,
        from_currency: str,
        to_currency: str
    ) -> Optional[Decimal]:
        """Convert an amount from one currency to another."""
        if amount == 0:
            return Decimal("0.0")

        rate = await self.get_exchange_rate(from_currency, to_currency)
        if rate is None:
            return None

        converted = amount * rate
        # Round to appropriate decimal places
        to_curr = await self.get_currency(to_currency)
        if to_curr:
            return converted.quantize(Decimal(10) ** -to_curr.decimal_places)

        return converted

    async def batch_convert_amounts(
        self,
        amounts: List[Dict[str, any]],
        target_currency: str
    ) -> List[Dict[str, any]]:
        """
        Convert multiple amounts to target currency.
        Input: [{"amount": Decimal, "currency": "USD"}, ...]
        Output: [{"original_amount": Decimal, "original_currency": "USD", "converted_amount": Decimal, "target_currency": "USD"}, ...]
        """
        results = []

        for item in amounts:
            amount = item.get("amount")
            from_currency = item.get("currency")

            if not amount or not from_currency:
                continue

            converted = await self.convert_amount(amount, from_currency, target_currency)

            results.append({
                "original_amount": amount,
                "original_currency": from_currency,
                "converted_amount": converted if converted else amount,
                "target_currency": target_currency,
                "conversion_failed": converted is None
            })

        return results

    async def refresh_all_rates(self) -> Dict[str, int]:
        """
        Refresh all exchange rates from API.
        Returns dict with success and failure counts.
        """
        currencies = await self.get_all_currencies(active_only=True)
        currency_codes = [c.code for c in currencies]

        success_count = 0
        failure_count = 0

        # Fetch rates for all currency pairs
        for from_curr in currency_codes:
            for to_curr in currency_codes:
                if from_curr == to_curr:
                    continue

                rate = await self.fetch_exchange_rate_from_api(from_curr, to_curr)
                if rate:
                    await self._store_exchange_rate(from_curr, to_curr, rate)
                    success_count += 1
                else:
                    failure_count += 1

        logger.info(f"Refreshed exchange rates: {success_count} successful, {failure_count} failed")

        return {
            "success": success_count,
            "failed": failure_count
        }

    async def set_manual_rate(
        self,
        from_currency: str,
        to_currency: str,
        rate: Decimal,
        admin_id: str
    ) -> ExchangeRate:
        """Set a manual exchange rate override."""
        exchange_rate = ExchangeRate(
            from_currency=from_currency,
            to_currency=to_currency,
            rate=rate,
            source="manual_override",
            fetched_at=datetime.utcnow(),
            is_manual_override=True,
            overridden_by=admin_id
        )
        self.db.add(exchange_rate)
        await self.db.flush()
        await self.db.refresh(exchange_rate)
        logger.info(f"Set manual rate {from_currency}/{to_currency} = {rate} by admin {admin_id}")
        return exchange_rate
