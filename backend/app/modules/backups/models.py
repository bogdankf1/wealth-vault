"""
Backup model for storing module data snapshots.
"""
from sqlalchemy import Column, String, JSON, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from app.models.base import BaseModel


class Backup(BaseModel):
    """
    Backup model for storing snapshots of user data from different modules.
    """
    __tablename__ = "backups"

    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True)
    module_type = Column(String(50), nullable=False, index=True)
    backup_data = Column(JSON, nullable=False)

    # Relationships
    user = relationship("User", back_populates="backups")
