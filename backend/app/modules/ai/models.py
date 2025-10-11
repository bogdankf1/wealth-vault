"""
AI Module Models
Models for file uploads, AI categorization tracking, and insights
"""
from sqlalchemy import Column, String, DateTime, Boolean, Text, Integer, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.sql import func
import uuid

from app.core.database import Base


class UploadedFile(Base):
    """Model for tracking uploaded files (bank statements, receipts, etc.)"""
    __tablename__ = "uploaded_files"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    filename = Column(String(255), nullable=False)
    file_url = Column(String(512), nullable=False)  # Vercel Blob URL
    file_type = Column(String(50), nullable=False)  # csv, pdf, xlsx, image
    file_size = Column(Integer, nullable=False)  # bytes
    status = Column(String(50), nullable=False, default="uploaded")  # uploaded, processing, completed, failed
    error_message = Column(Text, nullable=True)
    transactions_imported = Column(Integer, nullable=True, default=0)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)


class CategorizationCorrection(Base):
    """Model for tracking user corrections to AI categorization (learning)"""
    __tablename__ = "categorization_corrections"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    description = Column(Text, nullable=False, index=True)  # Transaction description
    correct_category = Column(String(100), nullable=False)  # User's corrected category
    original_category = Column(String(100), nullable=True)  # AI's original suggestion
    corrected_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class AIInsight(Base):
    """Model for caching generated AI insights"""
    __tablename__ = "ai_insights"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    insight_type = Column(String(50), nullable=False)  # spending_anomaly, savings_opportunity, budget_recommendation
    title = Column(String(255), nullable=False)
    content = Column(Text, nullable=False)
    priority = Column(Integer, nullable=False, default=1)  # 1-5, higher is more important
    is_actionable = Column(Boolean, nullable=False, default=False)
    action_url = Column(String(255), nullable=True)
    is_dismissed = Column(Boolean, nullable=False, default=False)
    generated_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    expires_at = Column(DateTime(timezone=True), nullable=True)  # Insights can expire
