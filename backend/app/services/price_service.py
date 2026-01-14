"""
Price service for fetching stock/asset prices from external APIs.
Uses yfinance for market data.
"""
import logging
from datetime import datetime, timedelta
from decimal import Decimal
from typing import Optional, Dict, Any, List
from functools import lru_cache
import asyncio

logger = logging.getLogger(__name__)

# Cache for price data (simple in-memory cache)
_price_cache: Dict[str, Dict[str, Any]] = {}
CACHE_TTL_MINUTES = 15  # Cache prices for 15 minutes


class PriceService:
    """Service for fetching and caching asset prices."""

    @staticmethod
    def _is_cache_valid(ticker: str) -> bool:
        """Check if cached price is still valid."""
        if ticker not in _price_cache:
            return False
        cached = _price_cache[ticker]
        if "timestamp" not in cached:
            return False
        age = datetime.utcnow() - cached["timestamp"]
        return age < timedelta(minutes=CACHE_TTL_MINUTES)

    @staticmethod
    def _get_cached_price(ticker: str) -> Optional[Decimal]:
        """Get price from cache if valid."""
        if PriceService._is_cache_valid(ticker):
            return _price_cache[ticker].get("price")
        return None

    @staticmethod
    def _set_cached_price(ticker: str, price: Decimal, info: Dict[str, Any] = None):
        """Set price in cache."""
        _price_cache[ticker] = {
            "price": price,
            "timestamp": datetime.utcnow(),
            "info": info or {}
        }

    @staticmethod
    def clear_cache(ticker: str = None):
        """Clear price cache."""
        global _price_cache
        if ticker:
            _price_cache.pop(ticker, None)
        else:
            _price_cache = {}

    @staticmethod
    async def get_price(ticker: str) -> Optional[Dict[str, Any]]:
        """
        Fetch current price for a ticker using yfinance.

        Returns dict with:
        - price: Current price as Decimal
        - currency: Currency code
        - name: Company/asset name
        - change: Price change
        - change_percent: Percentage change
        - source: "yfinance"
        - timestamp: When price was fetched
        """
        if not ticker:
            return None

        ticker = ticker.upper().strip()

        # Check cache first
        cached_price = PriceService._get_cached_price(ticker)
        if cached_price is not None:
            cached_info = _price_cache[ticker].get("info", {})
            return {
                "price": cached_price,
                "currency": cached_info.get("currency", "USD"),
                "name": cached_info.get("name"),
                "change": cached_info.get("change"),
                "change_percent": cached_info.get("change_percent"),
                "source": "yfinance",
                "timestamp": _price_cache[ticker].get("timestamp"),
                "from_cache": True
            }

        try:
            # Import yfinance here to avoid issues if not installed
            import yfinance as yf

            # Run yfinance in thread pool since it's blocking
            loop = asyncio.get_event_loop()
            ticker_obj = await loop.run_in_executor(None, yf.Ticker, ticker)

            # Get fast info (more reliable than info for just price)
            fast_info = await loop.run_in_executor(None, lambda: ticker_obj.fast_info)

            if fast_info is None:
                logger.warning(f"No data found for ticker: {ticker}")
                return None

            # Get current price
            current_price = getattr(fast_info, 'last_price', None)
            if current_price is None:
                # Try regular close as fallback
                current_price = getattr(fast_info, 'regular_market_previous_close', None)

            if current_price is None:
                logger.warning(f"Could not get price for ticker: {ticker}")
                return None

            price = Decimal(str(current_price))

            # Get additional info
            info = await loop.run_in_executor(None, lambda: ticker_obj.info)

            currency = info.get("currency", "USD") if info else "USD"
            name = info.get("shortName") or info.get("longName") if info else None

            # Calculate change if available
            prev_close = info.get("previousClose") if info else None
            change = None
            change_percent = None
            if prev_close and current_price:
                change = Decimal(str(current_price - prev_close))
                change_percent = Decimal(str((current_price - prev_close) / prev_close * 100))

            # Cache the result
            cache_info = {
                "currency": currency,
                "name": name,
                "change": change,
                "change_percent": change_percent
            }
            PriceService._set_cached_price(ticker, price, cache_info)

            return {
                "price": price,
                "currency": currency,
                "name": name,
                "change": change,
                "change_percent": change_percent,
                "source": "yfinance",
                "timestamp": datetime.utcnow(),
                "from_cache": False
            }

        except ImportError:
            logger.error("yfinance is not installed. Install with: pip install yfinance")
            return None
        except Exception as e:
            logger.error(f"Error fetching price for {ticker}: {str(e)}")
            return None

    @staticmethod
    async def get_prices_bulk(tickers: List[str]) -> Dict[str, Dict[str, Any]]:
        """
        Fetch prices for multiple tickers at once.
        More efficient than individual calls.
        """
        results = {}

        # Filter out empty tickers and normalize
        tickers = [t.upper().strip() for t in tickers if t]
        if not tickers:
            return results

        # Check cache first
        uncached_tickers = []
        for ticker in tickers:
            cached_price = PriceService._get_cached_price(ticker)
            if cached_price is not None:
                cached_info = _price_cache[ticker].get("info", {})
                results[ticker] = {
                    "price": cached_price,
                    "currency": cached_info.get("currency", "USD"),
                    "name": cached_info.get("name"),
                    "source": "yfinance",
                    "timestamp": _price_cache[ticker].get("timestamp"),
                    "from_cache": True
                }
            else:
                uncached_tickers.append(ticker)

        if not uncached_tickers:
            return results

        try:
            import yfinance as yf

            loop = asyncio.get_event_loop()

            # Download all tickers at once
            tickers_str = " ".join(uncached_tickers)
            data = await loop.run_in_executor(
                None,
                lambda: yf.download(tickers_str, period="1d", progress=False)
            )

            if data.empty:
                logger.warning(f"No data returned for tickers: {uncached_tickers}")
                return results

            # Process each ticker
            for ticker in uncached_tickers:
                try:
                    if len(uncached_tickers) == 1:
                        # Single ticker - data structure is different
                        if 'Close' in data.columns:
                            price = data['Close'].iloc[-1]
                        else:
                            continue
                    else:
                        # Multiple tickers
                        if ('Close', ticker) in data.columns:
                            price = data[('Close', ticker)].iloc[-1]
                        else:
                            continue

                    if price is not None and not (hasattr(price, 'isna') and price.isna()):
                        price_decimal = Decimal(str(float(price)))
                        PriceService._set_cached_price(ticker, price_decimal, {"currency": "USD"})
                        results[ticker] = {
                            "price": price_decimal,
                            "currency": "USD",
                            "source": "yfinance",
                            "timestamp": datetime.utcnow(),
                            "from_cache": False
                        }
                except Exception as e:
                    logger.error(f"Error processing ticker {ticker}: {str(e)}")
                    continue

        except ImportError:
            logger.error("yfinance is not installed")
        except Exception as e:
            logger.error(f"Error in bulk price fetch: {str(e)}")

        return results

    @staticmethod
    async def get_dividend_info(ticker: str) -> Optional[Dict[str, Any]]:
        """
        Fetch dividend information for a ticker.

        Returns dict with:
        - dividend_yield: Annual yield as decimal
        - dividend_rate: Annual dividend per share
        - ex_dividend_date: Next ex-dividend date
        - dividend_frequency: Estimated frequency
        """
        if not ticker:
            return None

        ticker = ticker.upper().strip()

        try:
            import yfinance as yf

            loop = asyncio.get_event_loop()
            ticker_obj = await loop.run_in_executor(None, yf.Ticker, ticker)
            info = await loop.run_in_executor(None, lambda: ticker_obj.info)

            if not info:
                return None

            dividend_yield = info.get("dividendYield")
            dividend_rate = info.get("dividendRate")
            ex_dividend_date = info.get("exDividendDate")

            # Convert ex_dividend_date from timestamp if needed
            if ex_dividend_date and isinstance(ex_dividend_date, (int, float)):
                ex_dividend_date = datetime.fromtimestamp(ex_dividend_date)

            # Estimate frequency based on trailing dividends
            frequency = None
            if dividend_rate and dividend_yield:
                # Most US stocks pay quarterly
                frequency = "quarterly"

            return {
                "dividend_yield": Decimal(str(dividend_yield)) if dividend_yield else None,
                "dividend_rate": Decimal(str(dividend_rate)) if dividend_rate else None,
                "ex_dividend_date": ex_dividend_date,
                "dividend_frequency": frequency,
                "pays_dividend": bool(dividend_yield and dividend_yield > 0)
            }

        except ImportError:
            logger.error("yfinance is not installed")
            return None
        except Exception as e:
            logger.error(f"Error fetching dividend info for {ticker}: {str(e)}")
            return None

    @staticmethod
    async def validate_ticker(ticker: str) -> bool:
        """
        Validate that a ticker exists and has price data.
        """
        if not ticker:
            return False

        result = await PriceService.get_price(ticker)
        return result is not None and result.get("price") is not None

    @staticmethod
    async def search_ticker(query: str) -> List[Dict[str, str]]:
        """
        Search for tickers matching a query.
        Note: yfinance doesn't have great search, so this is limited.
        """
        # yfinance doesn't have a proper search API
        # For now, just validate if the query is a valid ticker
        result = await PriceService.get_price(query)
        if result:
            return [{
                "symbol": query.upper(),
                "name": result.get("name", query.upper()),
                "type": "equity"
            }]
        return []
