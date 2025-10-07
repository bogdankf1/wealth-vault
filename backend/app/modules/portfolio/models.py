"""
Portfolio database models.
"""
import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Numeric, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from app.core.database import Base


class PortfolioAsset(Base):
    """Portfolio asset model for tracking investments."""

    __tablename__ = "portfolio_assets"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)

    # Asset information
    asset_name = Column(String(100), nullable=False)
    asset_type = Column(String(50), nullable=True, index=True)  # Stocks, Bonds, ETFs, Crypto, Real Estate, etc.
    symbol = Column(String(20), nullable=True)  # Ticker symbol or identifier
    description = Column(String(500), nullable=True)

    # Investment details
    quantity = Column(Numeric(18, 8), nullable=False)  # Support crypto decimals
    purchase_price = Column(Numeric(12, 2), nullable=False)  # Price per unit at purchase
    current_price = Column(Numeric(12, 2), nullable=False)  # Current price per unit
    currency = Column(String(3), nullable=False, default="USD")

    # Dates
    purchase_date = Column(DateTime, nullable=False)

    # Calculated fields (stored for performance)
    total_invested = Column(Numeric(18, 2), nullable=True)  # quantity * purchase_price
    current_value = Column(Numeric(18, 2), nullable=True)  # quantity * current_price
    total_return = Column(Numeric(18, 2), nullable=True)  # current_value - total_invested
    return_percentage = Column(Numeric(10, 4), nullable=True)  # (total_return / total_invested) * 100

    # Status
    is_active = Column(Boolean, nullable=False, default=True)

    # Timestamps
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    user = relationship("User", back_populates="portfolio_assets")

    def __repr__(self) -> str:
        return f"<PortfolioAsset {self.asset_name} ({self.symbol or 'N/A'})>"
