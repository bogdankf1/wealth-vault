"""
Service layer for support/help center operations.
"""
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_, desc
from sqlalchemy.orm import selectinload, joinedload
from typing import List, Optional
from uuid import UUID
from datetime import datetime

from app.modules.support.models import SupportTopic, SupportMessage, SupportTopicStatus
from app.modules.support.schemas import (
    SupportTopicCreate,
    SupportMessageCreate,
    SupportTopicStatusUpdate,
    SupportTopicResponse,
    SupportTopicDetailResponse,
    SupportMessageResponse,
)
from app.models.user import User


async def create_topic(
    db: AsyncSession,
    user_id: UUID,
    topic_data: SupportTopicCreate
) -> SupportTopic:
    """
    Create a new support topic with initial message.

    Args:
        db: Database session
        user_id: User ID creating the topic
        topic_data: Topic creation data

    Returns:
        Created topic
    """
    # Create topic
    topic = SupportTopic(
        user_id=user_id,
        title=topic_data.title,
        status=SupportTopicStatus.OPEN
    )
    db.add(topic)
    await db.flush()

    # Create initial message
    message = SupportMessage(
        topic_id=topic.id,
        user_id=user_id,
        message=topic_data.message,
        is_admin_reply=False
    )
    db.add(message)

    await db.commit()
    await db.refresh(topic)

    return topic


async def get_user_topics(
    db: AsyncSession,
    user_id: UUID
) -> List[SupportTopicResponse]:
    """
    Get all topics for a specific user.

    Args:
        db: Database session
        user_id: User ID

    Returns:
        List of user's topics with metadata
    """
    # Subquery to get last message timestamp
    last_message_subq = (
        select(
            SupportMessage.topic_id,
            func.max(SupportMessage.created_at).label('last_message_at')
        )
        .group_by(SupportMessage.topic_id)
        .subquery()
    )

    # Main query
    query = (
        select(
            SupportTopic,
            func.count(SupportMessage.id).label('message_count'),
            last_message_subq.c.last_message_at
        )
        .outerjoin(SupportMessage, SupportTopic.id == SupportMessage.topic_id)
        .outerjoin(last_message_subq, SupportTopic.id == last_message_subq.c.topic_id)
        .where(and_(
            SupportTopic.user_id == user_id,
            SupportTopic.deleted_at.is_(None)
        ))
        .group_by(SupportTopic.id, last_message_subq.c.last_message_at)
        .order_by(desc(SupportTopic.created_at))
    )

    result = await db.execute(query)
    rows = result.all()

    topics = []
    for topic, message_count, last_message_at in rows:
        topics.append(
            SupportTopicResponse(
                id=topic.id,
                user_id=topic.user_id,
                title=topic.title,
                status=topic.status,
                created_at=topic.created_at,
                updated_at=topic.updated_at,
                message_count=message_count or 0,
                last_message_at=last_message_at
            )
        )

    return topics


async def get_all_topics_admin(
    db: AsyncSession
) -> List[SupportTopicResponse]:
    """
    Get all topics for admin view.

    Args:
        db: Database session

    Returns:
        List of all topics with user information
    """
    # Subquery to get last message timestamp
    last_message_subq = (
        select(
            SupportMessage.topic_id,
            func.max(SupportMessage.created_at).label('last_message_at')
        )
        .group_by(SupportMessage.topic_id)
        .subquery()
    )

    # Main query with user join
    query = (
        select(
            SupportTopic,
            User.name.label('user_name'),
            User.email.label('user_email'),
            func.count(SupportMessage.id).label('message_count'),
            last_message_subq.c.last_message_at
        )
        .join(User, SupportTopic.user_id == User.id)
        .outerjoin(SupportMessage, SupportTopic.id == SupportMessage.topic_id)
        .outerjoin(last_message_subq, SupportTopic.id == last_message_subq.c.topic_id)
        .where(SupportTopic.deleted_at.is_(None))
        .group_by(SupportTopic.id, User.name, User.email, last_message_subq.c.last_message_at)
        .order_by(desc(SupportTopic.updated_at))
    )

    result = await db.execute(query)
    rows = result.all()

    topics = []
    for topic, user_name, user_email, message_count, last_message_at in rows:
        topics.append(
            SupportTopicResponse(
                id=topic.id,
                user_id=topic.user_id,
                title=topic.title,
                status=topic.status,
                created_at=topic.created_at,
                updated_at=topic.updated_at,
                message_count=message_count or 0,
                last_message_at=last_message_at,
                user_name=user_name,
                user_email=user_email
            )
        )

    return topics


async def get_topic_detail(
    db: AsyncSession,
    topic_id: UUID,
    user_id: Optional[UUID] = None
) -> Optional[SupportTopicDetailResponse]:
    """
    Get topic details with all messages.

    Args:
        db: Database session
        topic_id: Topic ID
        user_id: Optional user ID for access control

    Returns:
        Topic details with messages or None if not found
    """
    query = (
        select(SupportTopic)
        .options(
            selectinload(SupportTopic.messages).selectinload(SupportMessage.user),
            joinedload(SupportTopic.user)
        )
        .where(and_(
            SupportTopic.id == topic_id,
            SupportTopic.deleted_at.is_(None)
        ))
    )

    if user_id:
        query = query.where(SupportTopic.user_id == user_id)

    result = await db.execute(query)
    topic = result.scalar_one_or_none()

    if not topic:
        return None

    # Build messages list
    messages = []
    for msg in topic.messages:
        messages.append(
            SupportMessageResponse(
                id=msg.id,
                topic_id=msg.topic_id,
                user_id=msg.user_id,
                message=msg.message,
                is_admin_reply=msg.is_admin_reply,
                created_at=msg.created_at,
                user_name=msg.user.name if msg.user else None,
                user_email=msg.user.email if msg.user else None
            )
        )

    return SupportTopicDetailResponse(
        id=topic.id,
        user_id=topic.user_id,
        title=topic.title,
        status=topic.status,
        created_at=topic.created_at,
        updated_at=topic.updated_at,
        user_name=topic.user.name if topic.user else None,
        user_email=topic.user.email if topic.user else None,
        messages=messages
    )


async def add_message_to_topic(
    db: AsyncSession,
    topic_id: UUID,
    user_id: UUID,
    message_data: SupportMessageCreate,
    is_admin_reply: bool = False
) -> SupportMessage:
    """
    Add a message to a topic.

    Args:
        db: Database session
        topic_id: Topic ID
        user_id: User ID adding the message
        message_data: Message data
        is_admin_reply: Whether this is an admin reply

    Returns:
        Created message

    Raises:
        ValueError: If topic not found or user doesn't have access
    """
    # Get topic
    query = select(SupportTopic).where(and_(
        SupportTopic.id == topic_id,
        SupportTopic.deleted_at.is_(None)
    ))

    if not is_admin_reply:
        query = query.where(SupportTopic.user_id == user_id)

    result = await db.execute(query)
    topic = result.scalar_one_or_none()

    if not topic:
        raise ValueError("Topic not found")

    # Create message
    message = SupportMessage(
        topic_id=topic_id,
        user_id=user_id,
        message=message_data.message,
        is_admin_reply=is_admin_reply
    )
    db.add(message)

    # Update topic timestamp
    topic.updated_at = datetime.utcnow()

    await db.commit()
    await db.refresh(message)

    return message


async def update_topic_status(
    db: AsyncSession,
    topic_id: UUID,
    status_data: SupportTopicStatusUpdate
) -> SupportTopic:
    """
    Update topic status (admin only).

    Args:
        db: Database session
        topic_id: Topic ID
        status_data: New status

    Returns:
        Updated topic

    Raises:
        ValueError: If topic not found
    """
    result = await db.execute(
        select(SupportTopic).where(and_(
            SupportTopic.id == topic_id,
            SupportTopic.deleted_at.is_(None)
        ))
    )
    topic = result.scalar_one_or_none()

    if not topic:
        raise ValueError("Topic not found")

    topic.status = status_data.status
    topic.updated_at = datetime.utcnow()

    await db.commit()
    await db.refresh(topic)

    return topic
