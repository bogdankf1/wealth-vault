"""
Admin tier and feature management endpoints.
"""
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List
from uuid import UUID

from app.core.database import get_db
from app.core.permissions import get_current_user, admin_only
from app.models.user import User
from app.services.admin_service import AdminService
from app.schemas.admin import (
    TierDetail,
    TierUpdate,
    FeatureDetail,
    TierFeatureAssignment,
    TierFeatureResponse,
)


router = APIRouter(prefix="/tiers", tags=["admin-tiers"])


@router.get("", response_model=List[TierDetail])
@admin_only
async def list_tiers(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List all tiers. Admin only."""
    service = AdminService(db)
    tiers = await service.get_tiers()
    return [TierDetail.model_validate(tier) for tier in tiers]


@router.get("/{tier_id}", response_model=TierDetail)
@admin_only
async def get_tier(
    tier_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get tier by ID. Admin only."""
    service = AdminService(db)
    tier = await service.get_tier_by_id(tier_id)
    return TierDetail.model_validate(tier)


@router.patch("/{tier_id}", response_model=TierDetail)
@admin_only
async def update_tier(
    tier_id: UUID,
    update_data: TierUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update tier details. Admin only."""
    service = AdminService(db)
    tier = await service.update_tier(
        tier_id=tier_id,
        display_name=update_data.display_name,
        description=update_data.description,
        price_monthly=update_data.price_monthly,
        price_annual=update_data.price_annual,
        is_active=update_data.is_active,
    )
    return TierDetail.model_validate(tier)


@router.get("/{tier_id}/features", response_model=List[TierFeatureResponse])
@admin_only
async def get_tier_features(
    tier_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get all feature assignments for a tier. Admin only."""
    service = AdminService(db)
    tier_features = await service.get_tier_features(tier_id)

    return [
        TierFeatureResponse(
            tier_id=tf.tier_id,
            feature_id=tf.feature_id,
            feature_key=tf.feature.key,
            feature_name=tf.feature.name,
            enabled=tf.enabled,
            limit_value=tf.limit_value,
        )
        for tf in tier_features
    ]


@router.post("/{tier_id}/features", response_model=TierFeatureResponse)
@admin_only
async def assign_feature_to_tier(
    tier_id: UUID,
    assignment: TierFeatureAssignment,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Assign or update feature for tier. Admin only."""
    service = AdminService(db)
    tier_feature = await service.assign_feature_to_tier(
        tier_id=tier_id,
        feature_id=assignment.feature_id,
        enabled=assignment.enabled,
        limit_value=assignment.limit_value,
    )

    # Reload with feature relationship
    await db.refresh(tier_feature, ["feature"])

    return TierFeatureResponse(
        tier_id=tier_feature.tier_id,
        feature_id=tier_feature.feature_id,
        feature_key=tier_feature.feature.key,
        feature_name=tier_feature.feature.name,
        enabled=tier_feature.enabled,
        limit_value=tier_feature.limit_value,
    )


@router.get("/features/all", response_model=List[FeatureDetail])
@admin_only
async def list_features(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List all available features. Admin only."""
    service = AdminService(db)
    features = await service.get_features()
    return [FeatureDetail.model_validate(f) for f in features]
