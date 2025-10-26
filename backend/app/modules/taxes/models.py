"""
Taxes module database models
"""
import uuid
from sqlalchemy import Column, String, Numeric, DateTime, Boolean, ForeignKey, Text, Enum as SQLEnum
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from datetime import datetime
import enum

from app.core.database import Base


class TaxType(str, enum.Enum):
    """Types of tax calculation"""
    FIXED = "fixed"  # Fixed amount
    PERCENTAGE = "percentage"  # Percentage of income


class TaxFrequency(str, enum.Enum):
    """Tax payment frequency"""
    monthly = "monthly"
    quarterly = "quarterly"
    annually = "annually"


class Tax(Base):
    """Tax model for tracking tax obligations"""
    __tablename__ = "taxes"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)

    # Tax details
    name = Column(String(100), nullable=False)  # e.g., "Federal Income Tax", "State Tax"
    description = Column(Text, nullable=True)
    tax_type = Column(SQLEnum(TaxType, native_enum=False, length=20), nullable=False, default=TaxType.FIXED)
    frequency = Column(SQLEnum(TaxFrequency, native_enum=False, length=20), nullable=False, default=TaxFrequency.annually)

    # Amount (for fixed taxes)
    fixed_amount = Column(Numeric(12, 2), nullable=True)  # Fixed amount
    currency = Column(String(3), nullable=False, default="USD")

    # Percentage (for percentage-based taxes)
    percentage = Column(Numeric(5, 2), nullable=True)  # Percentage of income (0-100)

    # Status
    is_active = Column(Boolean, nullable=False, default=True)

    # Metadata
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)
    deleted_at = Column(DateTime, nullable=True)

    # Relationships
    user = relationship("User", back_populates="taxes")

    def __repr__(self):
        return f"<Tax(id={self.id}, name={self.name}, type={self.tax_type})>"
