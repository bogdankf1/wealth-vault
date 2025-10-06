"""
Tier, Feature, and TierFeature models for subscription management.
"""
from sqlalchemy import Column, String, Integer, Boolean, ForeignKey, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from app.models.base import BaseModel


class Tier(BaseModel):
    """Subscription tier model."""

    __tablename__ = "tiers"

    name = Column(String(50), unique=True, nullable=False)  # starter, growth, wealth
    display_name = Column(String(100), nullable=False)  # Starter, Growth, Wealth
    description = Column(Text, nullable=True)
    price_monthly = Column(Integer, default=0, nullable=False)  # Price in cents
    price_annual = Column(Integer, default=0, nullable=False)  # Price in cents
    is_active = Column(Boolean, default=True, nullable=False)

    # Relationships
    users = relationship("User", back_populates="tier")
    tier_features = relationship("TierFeature", back_populates="tier", cascade="all, delete-orphan")

    def __repr__(self) -> str:
        return f"<Tier(id={self.id}, name={self.name}, price_monthly={self.price_monthly})>"


class Feature(BaseModel):
    """Feature model representing platform capabilities."""

    __tablename__ = "features"

    key = Column(String(100), unique=True, nullable=False, index=True)  # income_tracking, ai_categorization
    name = Column(String(100), nullable=False)  # Income Tracking, AI Categorization
    description = Column(Text, nullable=True)
    module = Column(String(50), nullable=True)  # income, expenses, portfolio, etc.

    # Relationships
    tier_features = relationship("TierFeature", back_populates="feature", cascade="all, delete-orphan")

    def __repr__(self) -> str:
        return f"<Feature(id={self.id}, key={self.key}, name={self.name})>"


class TierFeature(BaseModel):
    """Association table linking tiers with features and their limits."""

    __tablename__ = "tier_features"

    tier_id = Column(UUID(as_uuid=True), ForeignKey("tiers.id"), nullable=False)
    feature_id = Column(UUID(as_uuid=True), ForeignKey("features.id"), nullable=False)
    enabled = Column(Boolean, default=True, nullable=False)
    limit_value = Column(Integer, nullable=True)  # e.g., max 3 income sources for starter

    # Relationships
    tier = relationship("Tier", back_populates="tier_features")
    feature = relationship("Feature", back_populates="tier_features")

    def __repr__(self) -> str:
        return f"<TierFeature(tier_id={self.tier_id}, feature_id={self.feature_id}, enabled={self.enabled})>"
