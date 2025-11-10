"""
Portfolio module API routes.
"""
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Optional
from uuid import UUID

from app.core.database import get_db
from app.core.permissions import get_current_user, require_feature
from app.models.user import User
from app.modules.portfolio import service
from app.modules.portfolio.schemas import (
    PortfolioAssetCreate,
    PortfolioAssetUpdate,
    PortfolioAssetResponse,
    PortfolioAssetListResponse,
    PortfolioStats,
    AssetBatchDelete,
    AssetBatchDeleteResponse)
from app.modules.portfolio.service import convert_asset_to_display_currency

router = APIRouter(prefix="/api/v1/portfolio", tags=["portfolio"])


@router.post("", response_model=PortfolioAssetResponse, status_code=status.HTTP_201_CREATED)
@require_feature("portfolio_tracking")
async def create_asset(
    asset_data: PortfolioAssetCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Create a new portfolio asset"""
    # Check tier limits
    tier_limits = {
        "starter": 5,
        "growth": 50,
        "wealth": None  # Unlimited
    }

    tier_name = current_user.tier.name.lower() if current_user.tier else "starter"
    limit = tier_limits.get(tier_name, 5)

    if limit is not None:
        # Count existing assets
        assets, total = await service.list_assets(db, current_user.id, page_size=1000)
        if total >= limit:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Portfolio asset limit reached for {tier_name} tier. Upgrade to add more."
            )

    asset = await service.create_asset(db, current_user.id, asset_data)
    return asset


@router.get("", response_model=PortfolioAssetListResponse)
@require_feature("portfolio_tracking")
async def list_assets(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=100),
    asset_type: Optional[str] = None,
    is_active: Optional[bool] = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """List portfolio assets with pagination and filters"""
    assets, total = await service.list_assets(
        db,
        current_user.id,
        page=page,
        page_size=page_size,
        asset_type=asset_type,
        is_active=is_active
    )

    # Convert each asset to display currency
    for asset in assets:
        await convert_asset_to_display_currency(db, current_user.id, asset)

    return PortfolioAssetListResponse(
        items=assets,
        total=total,
        page=page,
        page_size=page_size
    )


@router.get("/stats", response_model=PortfolioStats)
@require_feature("portfolio_tracking")
async def get_portfolio_stats(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Get portfolio statistics"""
    return await service.get_portfolio_stats(db, current_user.id)


@router.get("/{asset_id}", response_model=PortfolioAssetResponse)
@require_feature("portfolio_tracking")
async def get_asset(
    asset_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Get a single portfolio asset"""
    asset = await service.get_asset(db, current_user.id, asset_id)
    if not asset:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Portfolio asset not found"
        )

    # Convert to display currency
    await convert_asset_to_display_currency(db, current_user.id, asset)

    return asset


@router.put("/{asset_id}", response_model=PortfolioAssetResponse)
@require_feature("portfolio_tracking")
async def update_asset(
    asset_id: UUID,
    asset_data: PortfolioAssetUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Update a portfolio asset"""
    asset = await service.update_asset(
        db,
        current_user.id,
        asset_id,
        asset_data
    )
    if not asset:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Portfolio asset not found"
        )
    return asset


@router.delete("/{asset_id}", status_code=status.HTTP_204_NO_CONTENT)
@require_feature("portfolio_tracking")
async def delete_asset(
    asset_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Delete a portfolio asset"""
    success = await service.delete_asset(db, current_user.id, asset_id)
    if not success:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Portfolio asset not found"
        )
    return None


@router.post("/batch-delete", response_model=AssetBatchDeleteResponse)
async def batch_delete_portfolio(
    batch_data: AssetBatchDelete,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Delete multiple portfolio in a single request.

    Returns the count of successfully deleted items and any IDs that failed to delete.
    """
    deleted_count = 0
    failed_ids = []

    for item_id in batch_data.ids:
        try:
            success = await service.delete_asset(db, current_user.id, item_id)
            if success:
                deleted_count += 1
            else:
                failed_ids.append(item_id)
        except Exception:
            failed_ids.append(item_id)

    return AssetBatchDeleteResponse(
        deleted_count=deleted_count,
        failed_ids=failed_ids
    )
