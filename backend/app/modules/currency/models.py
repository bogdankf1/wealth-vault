"""
Currency module database models.
"""
from sqlalchemy import Column, String, Integer, Boolean, ForeignKey, DateTime, Numeric
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from datetime import datetime
from decimal import Decimal

from app.models.base import BaseModel


class Currency(BaseModel):
    """Currency model for storing supported currencies."""

    __tablename__ = "currencies"

    # Currency details (ISO 4217 standard)
    code = Column(String(3), nullable=False, unique=True, index=True)  # e.g., "USD", "EUR", "UAH"
    name = Column(String(100), nullable=False)  # e.g., "US Dollar", "Euro", "Ukrainian Hryvnia"
    symbol = Column(String(10), nullable=False)  # e.g., "$", "€", "₴"
    decimal_places = Column(Integer, nullable=False, default=2)  # Most currencies use 2 decimal places

    # Status
    is_active = Column(Boolean, nullable=False, default=True, index=True)

    # Admin tracking
    created_by_admin = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)

    # Relationships
    creator = relationship("User", foreign_keys=[created_by_admin])

    def __repr__(self) -> str:
        return f"<Currency(code={self.code}, name={self.name}, symbol={self.symbol})>"


class ExchangeRate(BaseModel):
    """Exchange rate model for currency conversions."""

    __tablename__ = "exchange_rates"

    # Currency pair
    from_currency = Column(String(3), ForeignKey("currencies.code"), nullable=False, index=True)
    to_currency = Column(String(3), ForeignKey("currencies.code"), nullable=False, index=True)

    # Exchange rate
    rate = Column(Numeric(20, 10), nullable=False)  # High precision for exchange rates

    # Metadata
    source = Column(String(100), nullable=False, default="exchangerate-api")  # API source
    fetched_at = Column(DateTime, nullable=False, default=datetime.utcnow, index=True)

    # Manual override flag (for admin adjustments)
    is_manual_override = Column(Boolean, nullable=False, default=False)
    overridden_by = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)

    # Relationships
    from_curr = relationship("Currency", foreign_keys=[from_currency])
    to_curr = relationship("Currency", foreign_keys=[to_currency])
    override_user = relationship("User", foreign_keys=[overridden_by])

    def __repr__(self) -> str:
        return f"<ExchangeRate({self.from_currency}/{self.to_currency}={self.rate})>"

    def convert(self, amount: Decimal) -> Decimal:
        """Convert an amount using this exchange rate."""
        return amount * Decimal(str(self.rate))
