"""
Database models for support/help center functionality.
"""
from sqlalchemy import Column, String, Text, Boolean, ForeignKey, Enum as SQLEnum
from sqlalchemy.orm import relationship
from sqlalchemy.dialects.postgresql import UUID
import enum

from app.models.base import BaseModel


class SupportTopicStatus(str, enum.Enum):
    """Support topic status enumeration."""
    OPEN = "open"
    IN_PROGRESS = "in_progress"
    RESOLVED = "resolved"


class SupportTopic(BaseModel):
    """Support topic (ticket) model."""
    __tablename__ = "support_topics"

    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True)
    title = Column(String(255), nullable=False)
    status = Column(
        String(20),
        nullable=False,
        default=SupportTopicStatus.OPEN.value,
        server_default='open'
    )

    # Relationships
    user = relationship("User", back_populates="support_topics")
    messages = relationship(
        "SupportMessage",
        back_populates="topic",
        cascade="all, delete-orphan",
        order_by="SupportMessage.created_at"
    )


class SupportMessage(BaseModel):
    """Support message model."""
    __tablename__ = "support_messages"

    topic_id = Column(UUID(as_uuid=True), ForeignKey("support_topics.id"), nullable=False, index=True)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True)
    message = Column(Text, nullable=False)
    is_admin_reply = Column(Boolean, nullable=False, default=False, server_default="false")

    # Relationships
    topic = relationship("SupportTopic", back_populates="messages")
    user = relationship("User", back_populates="support_messages")
