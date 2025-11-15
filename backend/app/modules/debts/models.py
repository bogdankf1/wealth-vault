"""
Debts module database models
"""
import uuid
from sqlalchemy import Column, String, Numeric, DateTime, Boolean, ForeignKey, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from datetime import datetime

from app.core.database import Base


class Debt(Base):
    """Debt model for tracking money owed to the user"""
    __tablename__ = "debts"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)

    # Debt details
    debtor_name = Column(String(100), nullable=False)  # Person/entity who owes money
    description = Column(Text, nullable=True)
    amount = Column(Numeric(12, 2), nullable=False)  # Total debt amount
    amount_paid = Column(Numeric(12, 2), nullable=False, default=0)  # Amount paid so far
    currency = Column(String(3), nullable=False, default="USD")

    # Status tracking
    is_active = Column(Boolean, nullable=False, default=True)
    is_paid = Column(Boolean, nullable=False, default=False)
    due_date = Column(DateTime, nullable=True)
    paid_date = Column(DateTime, nullable=True)

    # Metadata
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)
    deleted_at = Column(DateTime, nullable=True)

    # Relationships
    user = relationship("User", back_populates="debts")

    def __repr__(self):
        return f"<Debt(id={self.id}, debtor={self.debtor_name}, amount={self.amount})>"
