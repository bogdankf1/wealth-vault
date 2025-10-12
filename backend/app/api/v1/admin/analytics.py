"""
Admin analytics and statistics endpoints.
"""
from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List

from app.core.database import get_db
from app.core.permissions import get_current_user, admin_only
from app.models.user import User
from app.services.admin_service import AdminService
from app.schemas.admin import (
    PlatformStats,
    UserAcquisition,
    EngagementMetrics,
)


router = APIRouter(prefix="/analytics", tags=["admin-analytics"])


@router.get("/platform-stats", response_model=PlatformStats)
@admin_only
async def get_platform_statistics(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Get overall platform statistics (users, subscriptions, revenue, churn).
    Admin only.
    """
    service = AdminService(db)
    stats = await service.get_platform_stats()
    return PlatformStats(**stats)


@router.get("/user-acquisition", response_model=List[UserAcquisition])
@admin_only
async def get_user_acquisition_data(
    days: int = Query(30, ge=1, le=365, description="Number of days to fetch"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Get user acquisition data for the last N days.
    Admin only.
    """
    service = AdminService(db)
    data = await service.get_user_acquisition_data(days=days)
    return [UserAcquisition(**item) for item in data]


@router.get("/engagement", response_model=EngagementMetrics)
@admin_only
async def get_engagement_metrics(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Get user engagement metrics (DAU, WAU, MAU, retention).
    Admin only.
    """
    service = AdminService(db)
    metrics = await service.get_engagement_metrics()
    return EngagementMetrics(**metrics)
