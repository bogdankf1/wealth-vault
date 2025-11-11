"""
Pydantic schemas for support/help center functionality.
"""
from pydantic import BaseModel, Field, field_serializer
from typing import List, Optional
from uuid import UUID
from datetime import datetime
from enum import Enum


class SupportTopicStatus(str, Enum):
    """Support topic status."""
    OPEN = "open"
    IN_PROGRESS = "in_progress"
    RESOLVED = "resolved"


class SupportTopicCreate(BaseModel):
    """Schema for creating a new support topic."""
    title: str = Field(..., min_length=1, max_length=255, description="Topic title")
    message: str = Field(..., min_length=1, description="Initial message")


class SupportMessageCreate(BaseModel):
    """Schema for creating a new message in a topic."""
    message: str = Field(..., min_length=1, description="Message content")


class SupportTopicStatusUpdate(BaseModel):
    """Schema for updating topic status."""
    status: SupportTopicStatus


class SupportMessageResponse(BaseModel):
    """Schema for support message response."""
    id: UUID
    topic_id: UUID
    user_id: UUID
    message: str
    is_admin_reply: bool
    created_at: datetime
    user_name: Optional[str] = None
    user_email: Optional[str] = None

    @field_serializer('created_at')
    def serialize_created_at(self, dt: datetime, _info):
        """Serialize datetime with timezone info."""
        if dt.tzinfo is None:
            # If naive datetime, assume UTC
            from datetime import timezone
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.isoformat()

    class Config:
        from_attributes = True


class SupportTopicResponse(BaseModel):
    """Schema for support topic response."""
    id: UUID
    user_id: UUID
    title: str
    status: SupportTopicStatus
    created_at: datetime
    updated_at: datetime
    message_count: int = 0
    last_message_at: Optional[datetime] = None
    user_name: Optional[str] = None
    user_email: Optional[str] = None

    @field_serializer('created_at', 'updated_at', 'last_message_at')
    def serialize_datetime(self, dt: Optional[datetime], _info):
        """Serialize datetime with timezone info."""
        if dt is None:
            return None
        if dt.tzinfo is None:
            from datetime import timezone
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.isoformat()

    class Config:
        from_attributes = True


class SupportTopicDetailResponse(BaseModel):
    """Schema for detailed support topic response with messages."""
    id: UUID
    user_id: UUID
    title: str
    status: SupportTopicStatus
    created_at: datetime
    updated_at: datetime
    user_name: Optional[str] = None
    user_email: Optional[str] = None
    messages: List[SupportMessageResponse] = []

    @field_serializer('created_at', 'updated_at')
    def serialize_datetime(self, dt: datetime, _info):
        """Serialize datetime with timezone info."""
        if dt.tzinfo is None:
            from datetime import timezone
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.isoformat()

    class Config:
        from_attributes = True
