"""
Currency API routes.
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List
from decimal import Decimal

from app.core.database import get_db
from app.core.permissions import get_current_user, admin_only
from app.models.user import User
from sqlalchemy.ext.asyncio import AsyncSession
from app.services.currency_service import CurrencyService
from app.modules.currency.schemas import (
    CurrencyResponse,
    CurrencyCreate,
    CurrencyUpdate,
    ExchangeRateResponse,
    ExchangeRateCreate,
    ConversionRequest,
    ConversionResponse,
    RefreshRatesResponse
)

router = APIRouter(prefix="/currencies", tags=["currencies"])


@router.get("", response_model=List[CurrencyResponse])
async def get_currencies(
    active_only: bool = True,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get all currencies."""
    service = CurrencyService(db)
    currencies = await service.get_all_currencies(active_only=active_only)
    return currencies


@router.get("/{code}", response_model=CurrencyResponse)
async def get_currency(
    code: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get a specific currency by code."""
    service = CurrencyService(db)
    currency = await service.get_currency(code.upper())

    if not currency:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Currency {code} not found"
        )

    return currency


@router.post("", response_model=CurrencyResponse, status_code=status.HTTP_201_CREATED)
@admin_only
async def create_currency(
    currency_data: CurrencyCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Create a new currency (admin only)."""
    service = CurrencyService(db)

    # Check if currency already exists
    existing = await service.get_currency(currency_data.code.upper())
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Currency {currency_data.code} already exists"
        )

    currency = await service.create_currency(
        code=currency_data.code.upper(),
        name=currency_data.name,
        symbol=currency_data.symbol,
        decimal_places=currency_data.decimal_places,
        is_active=currency_data.is_active,
        created_by_admin=current_user.id
    )

    return currency


@router.patch("/{code}", response_model=CurrencyResponse)
@admin_only
async def update_currency(
    code: str,
    currency_data: CurrencyUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Update a currency (admin only)."""
    service = CurrencyService(db)

    currency = await service.update_currency(
        code=code.upper(),
        **currency_data.dict(exclude_unset=True)
    )

    if not currency:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Currency {code} not found"
        )

    return currency


@router.delete("/{code}", status_code=status.HTTP_204_NO_CONTENT)
@admin_only
async def delete_currency(
    code: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Deactivate a currency (admin only)."""
    service = CurrencyService(db)

    success = await service.delete_currency(code.upper())

    if not success:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Currency {code} not found"
        )

    return None


@router.post("/convert", response_model=ConversionResponse)
async def convert_currency(
    conversion: ConversionRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Convert an amount from one currency to another."""
    service = CurrencyService(db)

    converted_amount = await service.convert_amount(
        amount=conversion.amount,
        from_currency=conversion.from_currency.upper(),
        to_currency=conversion.to_currency.upper()
    )

    if converted_amount is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unable to convert from {conversion.from_currency} to {conversion.to_currency}"
        )

    rate = await service.get_exchange_rate(
        conversion.from_currency.upper(),
        conversion.to_currency.upper()
    )

    from datetime import datetime

    return ConversionResponse(
        original_amount=conversion.amount,
        original_currency=conversion.from_currency.upper(),
        converted_amount=converted_amount,
        target_currency=conversion.to_currency.upper(),
        exchange_rate=rate,
        fetched_at=datetime.utcnow()
    )


@router.get("/rates/{from_currency}/{to_currency}", response_model=ExchangeRateResponse)
async def get_exchange_rate(
    from_currency: str,
    to_currency: str,
    force_refresh: bool = False,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get exchange rate between two currencies."""
    service = CurrencyService(db)

    rate = await service.get_exchange_rate(
        from_currency.upper(),
        to_currency.upper(),
        force_refresh=force_refresh
    )

    if rate is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Exchange rate not available for {from_currency}/{to_currency}"
        )

    # Get the stored rate record
    from app.modules.currency.models import ExchangeRate
    from sqlalchemy import select

    query = select(ExchangeRate).where(
        ExchangeRate.from_currency == from_currency.upper(),
        ExchangeRate.to_currency == to_currency.upper()
    ).order_by(ExchangeRate.fetched_at.desc())
    result = await db.execute(query)
    rate_record = result.scalar_one_or_none()

    if not rate_record:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Exchange rate record not found"
        )

    return rate_record


@router.post("/rates/refresh", response_model=RefreshRatesResponse)
@admin_only
async def refresh_exchange_rates(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Refresh all exchange rates from API (admin only)."""
    service = CurrencyService(db)

    result = await service.refresh_all_rates()

    return RefreshRatesResponse(
        success=result["success"],
        failed=result["failed"],
        message=f"Refreshed {result['success']} rates, {result['failed']} failed"
    )


@router.post("/rates/manual", response_model=ExchangeRateResponse, status_code=status.HTTP_201_CREATED)
@admin_only
async def set_manual_rate(
    rate_data: ExchangeRateCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Set a manual exchange rate override (admin only)."""
    service = CurrencyService(db)

    exchange_rate = await service.set_manual_rate(
        from_currency=rate_data.from_currency.upper(),
        to_currency=rate_data.to_currency.upper(),
        rate=rate_data.rate,
        admin_id=str(current_user.id)
    )

    return exchange_rate
