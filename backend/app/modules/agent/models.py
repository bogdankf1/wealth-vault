"""Level D — audit log of agent-initiated write actions. One row per committed action."""
from sqlalchemy import Column, String, Text, ForeignKey, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID, JSONB

from app.models.base import BaseModel


class AgentActionLog(BaseModel):
    __tablename__ = "agent_action_log"
    __table_args__ = (
        UniqueConstraint("user_id", "idempotency_key", name="uq_agent_action_user_idem"),
    )

    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"),
                     nullable=False, index=True)
    action_type = Column(String(50), nullable=False)
    args = Column(JSONB, nullable=False)
    status = Column(String(20), nullable=False)              # "committed"
    created_entity_type = Column(String(50), nullable=True)  # e.g. "expense"
    created_entity_id = Column(UUID(as_uuid=True), nullable=True)
    idempotency_key = Column(String(100), nullable=False)
    error = Column(Text, nullable=True)
