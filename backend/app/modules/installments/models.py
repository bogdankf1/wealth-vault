"""
Installments module database models.
"""
from sqlalchemy import Column, String, Numeric, DateTime, Boolean, Integer, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
import uuid
from datetime import datetime

from app.models.base import Base


class Installment(Base):
    """
    Installment model for tracking loans, debts, and payment plans.

    Examples: personal loans, auto loans, student loans, credit cards, mortgages
    """
    __tablename__ = "installments"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)

    # Basic information
    name = Column(String(100), nullable=False)  # e.g., "Car Loan", "Student Loan"
    description = Column(String(500), nullable=True)
    category = Column(String(50), nullable=True, index=True)  # Personal, Auto, Student, Credit Card, Mortgage, etc.

    # Loan details
    total_amount = Column(Numeric(12, 2), nullable=False)  # Original loan amount
    amount_per_payment = Column(Numeric(12, 2), nullable=False)  # Payment amount (monthly, etc.)
    currency = Column(String(3), nullable=False, default="USD")
    interest_rate = Column(Numeric(5, 2), nullable=True)  # Annual interest rate (e.g., 5.5 for 5.5%)

    # Payment schedule
    frequency = Column(String(20), nullable=False, default="monthly")  # monthly, biweekly, weekly
    number_of_payments = Column(Integer, nullable=False)  # Total number of payments (e.g., 36, 60)
    payments_made = Column(Integer, nullable=False, default=0)  # Number of payments completed

    # Dates
    start_date = Column(DateTime, nullable=False)  # Loan start date
    first_payment_date = Column(DateTime, nullable=False)  # Date of first payment
    end_date = Column(DateTime, nullable=True)  # Calculated payoff date

    # Status
    is_active = Column(Boolean, nullable=False, default=True)
    remaining_balance = Column(Numeric(12, 2), nullable=True)  # Calculated field

    # Timestamps
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    user = relationship("User", back_populates="installments")

    def __repr__(self) -> str:
        return f"<Installment(id={self.id}, name={self.name}, user_id={self.user_id})>"
