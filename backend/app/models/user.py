"""
User model with role and tier support.
"""
from sqlalchemy import Column, String, Enum, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
import enum
from app.models.base import BaseModel


class UserRole(str, enum.Enum):
    """User role enumeration."""
    USER = "USER"
    ADMIN = "ADMIN"


class User(BaseModel):
    """User model with authentication and tier information."""

    __tablename__ = "users"

    email = Column(String(255), unique=True, nullable=False, index=True)
    name = Column(String(255), nullable=True)
    avatar_url = Column(String(500), nullable=True)

    # OAuth fields
    google_id = Column(String(255), unique=True, nullable=True, index=True)
    apple_id = Column(String(255), unique=True, nullable=True, index=True)

    # Role and tier
    role = Column(
        Enum(UserRole, native_enum=False, length=20),
        default=UserRole.USER,
        nullable=False
    )
    tier_id = Column(UUID(as_uuid=True), ForeignKey("tiers.id"), nullable=True)

    # Stripe integration
    stripe_customer_id = Column(String(255), unique=True, nullable=True)
    stripe_subscription_id = Column(String(255), unique=True, nullable=True)

    # Relationships
    tier = relationship("Tier", back_populates="users")
    income_sources = relationship("IncomeSource", back_populates="user", cascade="all, delete-orphan")
    expenses = relationship("Expense", back_populates="user", cascade="all, delete-orphan")
    savings_accounts = relationship("SavingsAccount", back_populates="user", cascade="all, delete-orphan")
    subscriptions = relationship("Subscription", back_populates="user", cascade="all, delete-orphan")
    installments = relationship("Installment", back_populates="user", cascade="all, delete-orphan")
    goals = relationship("Goal", back_populates="user", cascade="all, delete-orphan")
    portfolio_assets = relationship("PortfolioAsset", back_populates="user", cascade="all, delete-orphan")
    debts = relationship("Debt", back_populates="user", cascade="all, delete-orphan")
    taxes = relationship("Tax", back_populates="user", cascade="all, delete-orphan")
    dashboard_layouts = relationship("DashboardLayout", back_populates="user", cascade="all, delete-orphan")
    backups = relationship("Backup", back_populates="user", cascade="all, delete-orphan")

    def __repr__(self) -> str:
        return f"<User(id={self.id}, email={self.email}, role={self.role})>"

    def is_admin(self) -> bool:
        """Check if user has admin role."""
        return self.role == UserRole.ADMIN

    def has_feature(self, feature_key: str) -> bool:
        """
        Check if user's tier has access to a specific feature.

        Args:
            feature_key: Feature identifier

        Returns:
            True if user has access to feature
        """
        if not self.tier:
            return False
        return any(
            tf.feature.key == feature_key and tf.enabled
            for tf in self.tier.tier_features
        )
