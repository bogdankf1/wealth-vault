"""
Base model with common fields.
"""
import uuid
from datetime import datetime
from typing import Any
from sqlalchemy import Column, DateTime, Boolean
from sqlalchemy.dialects.postgresql import UUID
from app.core.database import Base


class BaseModel(Base):
    """Base model with common fields for all tables."""

    __abstract__ = True

    id = Column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
        unique=True,
        nullable=False
    )
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(
        DateTime,
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
        nullable=False
    )
    deleted_at = Column(DateTime, nullable=True)  # Soft delete

    def soft_delete(self) -> None:
        """Mark record as deleted without actually removing it."""
        self.deleted_at = datetime.utcnow()

    def is_deleted(self) -> bool:
        """Check if record is soft deleted."""
        return self.deleted_at is not None

    def to_dict(self) -> dict[str, Any]:
        """Convert model to dictionary."""
        return {
            column.name: getattr(self, column.name)
            for column in self.__table__.columns
        }
