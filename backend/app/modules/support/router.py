"""
API router for support/help center operations.
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List
from uuid import UUID

from app.core.database import get_db
from app.core.permissions import get_current_user, require_admin
from app.models.user import User
from app.modules.support import service
from app.modules.support.schemas import (
    SupportTopicCreate,
    SupportMessageCreate,
    SupportTopicStatusUpdate,
    SupportTopicResponse,
    SupportTopicDetailResponse,
)


router = APIRouter(prefix="/support", tags=["support"])


@router.post("/topics", response_model=SupportTopicResponse, status_code=status.HTTP_201_CREATED)
async def create_topic(
    topic_data: SupportTopicCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Create a new support topic with initial message.

    Args:
        topic_data: Topic creation data
        current_user: Current authenticated user
        db: Database session

    Returns:
        Created topic information
    """
    topic = await service.create_topic(db, current_user.id, topic_data)

    return SupportTopicResponse(
        id=topic.id,
        user_id=topic.user_id,
        title=topic.title,
        status=topic.status,
        created_at=topic.created_at,
        updated_at=topic.updated_at,
        message_count=1,
        last_message_at=topic.created_at
    )


@router.get("/topics", response_model=List[SupportTopicResponse])
async def get_user_topics(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Get all topics for the current user.

    Args:
        current_user: Current authenticated user
        db: Database session

    Returns:
        List of user's topics
    """
    topics = await service.get_user_topics(db, current_user.id)
    return topics


@router.get("/topics/{topic_id}", response_model=SupportTopicDetailResponse)
async def get_topic_detail(
    topic_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Get topic details with all messages.

    Args:
        topic_id: Topic ID
        current_user: Current authenticated user
        db: Database session

    Returns:
        Topic details with messages
    """
    topic = await service.get_topic_detail(db, topic_id, current_user.id)

    if not topic:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Topic not found"
        )

    return topic


@router.post("/topics/{topic_id}/messages", status_code=status.HTTP_201_CREATED)
async def add_message(
    topic_id: UUID,
    message_data: SupportMessageCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Add a message to a topic.

    Args:
        topic_id: Topic ID
        message_data: Message data
        current_user: Current authenticated user
        db: Database session

    Returns:
        Success message
    """
    try:
        await service.add_message_to_topic(
            db,
            topic_id,
            current_user.id,
            message_data,
            is_admin_reply=False
        )
        return {"success": True, "message": "Message added successfully"}
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(e)
        )


# Admin endpoints
@router.get("/admin/topics", response_model=List[SupportTopicResponse])
async def get_all_topics_admin(
    current_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db)
):
    """
    Get all support topics (admin only).

    Args:
        current_user: Current authenticated admin user
        db: Database session

    Returns:
        List of all topics
    """
    topics = await service.get_all_topics_admin(db)
    return topics


@router.get("/admin/topics/{topic_id}", response_model=SupportTopicDetailResponse)
async def get_topic_detail_admin(
    topic_id: UUID,
    current_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db)
):
    """
    Get topic details (admin only).

    Args:
        topic_id: Topic ID
        current_user: Current authenticated admin user
        db: Database session

    Returns:
        Topic details with messages
    """
    topic = await service.get_topic_detail(db, topic_id)

    if not topic:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Topic not found"
        )

    return topic


@router.post("/admin/topics/{topic_id}/messages", status_code=status.HTTP_201_CREATED)
async def add_admin_reply(
    topic_id: UUID,
    message_data: SupportMessageCreate,
    current_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db)
):
    """
    Add an admin reply to a topic.

    Args:
        topic_id: Topic ID
        message_data: Message data
        current_user: Current authenticated admin user
        db: Database session

    Returns:
        Success message
    """
    try:
        await service.add_message_to_topic(
            db,
            topic_id,
            current_user.id,
            message_data,
            is_admin_reply=True
        )
        return {"success": True, "message": "Reply added successfully"}
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(e)
        )


@router.patch("/admin/topics/{topic_id}/status", response_model=SupportTopicResponse)
async def update_topic_status(
    topic_id: UUID,
    status_data: SupportTopicStatusUpdate,
    current_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db)
):
    """
    Update topic status (admin only).

    Args:
        topic_id: Topic ID
        status_data: New status
        current_user: Current authenticated admin user
        db: Database session

    Returns:
        Updated topic
    """
    try:
        topic = await service.update_topic_status(db, topic_id, status_data)

        return SupportTopicResponse(
            id=topic.id,
            user_id=topic.user_id,
            title=topic.title,
            status=topic.status,
            created_at=topic.created_at,
            updated_at=topic.updated_at,
            message_count=0
        )
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(e)
        )
