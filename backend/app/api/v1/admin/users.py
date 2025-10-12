"""
Admin user management endpoints.
"""
from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Optional
from uuid import UUID

from app.core.database import get_db
from app.core.permissions import get_current_user, admin_only
from app.models.user import User
from app.services.admin_service import AdminService
from app.schemas.admin import (
    UserListResponse,
    UserListItem,
    UserDetail,
    UserUpdate,
    UserImpersonate,
    UserSuspend,
)


router = APIRouter(prefix="/users", tags=["admin-users"])


@router.get("", response_model=UserListResponse)
@admin_only
async def list_users(
    page: int = Query(1, ge=1, description="Page number"),
    page_size: int = Query(20, ge=1, le=100, description="Items per page"),
    search: Optional[str] = Query(None, description="Search by email or name"),
    role: Optional[str] = Query(None, description="Filter by role"),
    tier_name: Optional[str] = Query(None, description="Filter by tier name"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    List all users with filtering and pagination.
    Admin only.
    """
    service = AdminService(db)
    users, total = await service.get_users(
        page=page,
        page_size=page_size,
        search=search,
        role=role,
        tier_name=tier_name,
    )

    # Convert to response schema
    user_items = [
        UserListItem(
            id=u.id,
            email=u.email,
            name=u.name,
            role=u.role.value,
            tier_name=u.tier.name if u.tier else None,
            tier_display_name=u.tier.display_name if u.tier else None,
            created_at=u.created_at,
            is_active=u.deleted_at is None,
        )
        for u in users
    ]

    return UserListResponse(
        users=user_items,
        total=total,
        page=page,
        page_size=page_size,
    )


@router.get("/{user_id}", response_model=UserDetail)
@admin_only
async def get_user(
    user_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Get user details by ID.
    Admin only.
    """
    service = AdminService(db)
    user = await service.get_user_by_id(user_id)

    return UserDetail(
        id=user.id,
        email=user.email,
        name=user.name,
        avatar_url=user.avatar_url,
        google_id=user.google_id,
        apple_id=user.apple_id,
        role=user.role.value,
        tier_id=user.tier_id,
        tier_name=user.tier.name if user.tier else None,
        tier_display_name=user.tier.display_name if user.tier else None,
        stripe_customer_id=user.stripe_customer_id,
        stripe_subscription_id=user.stripe_subscription_id,
        created_at=user.created_at,
        updated_at=user.updated_at,
        deleted_at=user.deleted_at,
    )


@router.patch("/{user_id}", response_model=UserDetail)
@admin_only
async def update_user(
    user_id: UUID,
    update_data: UserUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Update user (change tier or role).
    Admin only.
    """
    service = AdminService(db)
    user = await service.update_user(
        user_id=user_id,
        tier_id=update_data.tier_id,
        role=update_data.role,
    )

    return UserDetail(
        id=user.id,
        email=user.email,
        name=user.name,
        avatar_url=user.avatar_url,
        google_id=user.google_id,
        apple_id=user.apple_id,
        role=user.role.value,
        tier_id=user.tier_id,
        tier_name=user.tier.name if user.tier else None,
        tier_display_name=user.tier.display_name if user.tier else None,
        stripe_customer_id=user.stripe_customer_id,
        stripe_subscription_id=user.stripe_subscription_id,
        created_at=user.created_at,
        updated_at=user.updated_at,
        deleted_at=user.deleted_at,
    )


@router.post("/{user_id}/impersonate", response_model=UserImpersonate)
@admin_only
async def impersonate_user(
    user_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Generate impersonation token to view app as specific user.
    Admin only.
    """
    service = AdminService(db)
    user, token = await service.impersonate_user(user_id)

    return UserImpersonate(
        token=token,
        user=UserDetail(
            id=user.id,
            email=user.email,
            name=user.name,
            avatar_url=user.avatar_url,
            google_id=user.google_id,
            apple_id=user.apple_id,
            role=user.role.value,
            tier_id=user.tier_id,
            tier_name=user.tier.name if user.tier else None,
            tier_display_name=user.tier.display_name if user.tier else None,
            stripe_customer_id=user.stripe_customer_id,
            stripe_subscription_id=user.stripe_subscription_id,
            created_at=user.created_at,
            updated_at=user.updated_at,
            deleted_at=user.deleted_at,
        ),
    )


@router.post("/{user_id}/suspend", response_model=UserDetail)
@admin_only
async def suspend_user(
    user_id: UUID,
    suspend_data: UserSuspend,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Suspend/ban user.
    Admin only.
    """
    service = AdminService(db)
    user = await service.suspend_user(user_id, reason=suspend_data.reason)

    return UserDetail(
        id=user.id,
        email=user.email,
        name=user.name,
        avatar_url=user.avatar_url,
        google_id=user.google_id,
        apple_id=user.apple_id,
        role=user.role.value,
        tier_id=user.tier_id,
        tier_name=user.tier.name if user.tier else None,
        tier_display_name=user.tier.display_name if user.tier else None,
        stripe_customer_id=user.stripe_customer_id,
        stripe_subscription_id=user.stripe_subscription_id,
        created_at=user.created_at,
        updated_at=user.updated_at,
        deleted_at=user.deleted_at,
    )


@router.post("/{user_id}/unsuspend", response_model=UserDetail)
@admin_only
async def unsuspend_user(
    user_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Unsuspend/unban user.
    Admin only.
    """
    service = AdminService(db)
    user = await service.unsuspend_user(user_id)

    return UserDetail(
        id=user.id,
        email=user.email,
        name=user.name,
        avatar_url=user.avatar_url,
        google_id=user.google_id,
        apple_id=user.apple_id,
        role=user.role.value,
        tier_id=user.tier_id,
        tier_name=user.tier.name if user.tier else None,
        tier_display_name=user.tier.display_name if user.tier else None,
        stripe_customer_id=user.stripe_customer_id,
        stripe_subscription_id=user.stripe_subscription_id,
        created_at=user.created_at,
        updated_at=user.updated_at,
        deleted_at=user.deleted_at,
    )
