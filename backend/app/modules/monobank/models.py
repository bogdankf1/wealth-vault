"""
Monobank integration models.

One MonobankConnection per user; each holds the encrypted personal token plus
metadata about discovered accounts and webhook state. Per-account links live
on SavingsAccount via (external_source='monobank', external_id=<mono account id>).
"""
import enum
import uuid
from datetime import datetime

from sqlalchemy import Column, String, DateTime, ForeignKey, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from app.core.database import Base


class MonobankConnectionStatus(str, enum.Enum):
    ACTIVE = "active"
    DISABLED = "disabled"        # user disconnected
    INVALID_TOKEN = "invalid_token"  # Mono returned 401/403
    ERROR = "error"


class MonobankConnection(Base):
    """A user's connection to Monobank's Personal API."""

    __tablename__ = "monobank_connections"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)

    # Fernet-encrypted personal token (X-Token header value).
    encrypted_token = Column(String(1024), nullable=False)

    # Random secret embedded in the webhook URL — the URL itself is the auth.
    webhook_secret = Column(String(64), nullable=False, unique=True)
    webhook_url = Column(String(512), nullable=True)   # what we registered with Mono, if any
    webhook_registered_at = Column(DateTime(timezone=True), nullable=True)

    # Mono client metadata (cached at connect time).
    mono_client_id = Column(String(64), nullable=True)
    mono_client_name = Column(String(256), nullable=True)
    permissions = Column(String(32), nullable=True)

    # Sync state.
    last_full_sync_at = Column(DateTime(timezone=True), nullable=True)
    last_webhook_at = Column(DateTime(timezone=True), nullable=True)
    last_error = Column(String(512), nullable=True)

    status = Column(String(20), nullable=False, default=MonobankConnectionStatus.ACTIVE.value)

    created_at = Column(DateTime(timezone=True), nullable=False, default=datetime.utcnow)
    updated_at = Column(
        DateTime(timezone=True),
        nullable=False,
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
    )

    __table_args__ = (
        UniqueConstraint("user_id", name="uq_monobank_connection_user"),
    )

    user = relationship("User", backref="monobank_connection")

    def __repr__(self) -> str:
        return f"<MonobankConnection(user_id={self.user_id}, status={self.status})>"
