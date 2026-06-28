"""
Portfolio module API routes.
"""
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Optional
from uuid import UUID

from app.core.database import get_db
from app.core.permissions import get_current_user, require_feature
from app.models.user import User
from app.modules.savings.transaction_service import InsufficientFundsError
from app.modules.savings.models import SavingsAccount
from app.modules.portfolio import service
from app.modules.portfolio.schemas import (
    PortfolioAssetCreate,
    PortfolioAssetUpdate,
    PortfolioAssetResponse,
    PortfolioAssetListResponse,
    PortfolioStats,
    AssetBatchDelete,
    AssetBatchDeleteResponse,
    PortfolioTransactionResponse,
    PortfolioTransactionListResponse,
    BuyAssetRequest,
    SellAssetRequest,
    SellAssetResponse,
    RecordDividendRequest,
    UpdatePriceRequest,
    PriceUpdateResponse,
    BulkPriceUpdateResponse,
)
from app.modules.portfolio.service import convert_asset_to_display_currency

router = APIRouter(prefix="/api/v1/portfolio", tags=["portfolio"])


# ==================== Asset CRUD ====================

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

    try:
        asset = await service.create_asset(db, current_user.id, asset_data)
        return asset
    except InsufficientFundsError:
        # Get account details for detailed error response
        account_id = asset_data.payment_account_id
        account_name = "Unknown"
        current_balance = None
        currency = asset_data.currency or "USD"

        if account_id:
            account_result = await db.execute(
                select(SavingsAccount).where(
                    SavingsAccount.id == account_id,
                    SavingsAccount.user_id == current_user.id
                )
            )
            account = account_result.scalar_one_or_none()
            if account:
                account_name = account.name
                current_balance = float(account.current_balance)
                currency = account.currency

        required_amount = float(asset_data.quantity * asset_data.purchase_price) if asset_data.quantity and asset_data.purchase_price else 0

        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "message": "Insufficient funds",
                "error_code": "INSUFFICIENT_FUNDS",
                "account_name": account_name,
                "current_balance": current_balance,
                "required_amount": required_amount,
                "currency": currency
            }
        )


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


# ==================== Ticker Validation ====================
# NOTE: These routes must come BEFORE /{asset_id} routes to avoid path conflicts

@router.get("/validate-ticker/{ticker}")
@require_feature("portfolio_tracking")
async def validate_ticker(
    ticker: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Validate a ticker symbol and get current price"""
    from app.services.price_service import PriceService

    result = await PriceService.get_price(ticker)
    if not result:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Ticker '{ticker}' not found or no price data available"
        )

    return {
        "ticker": ticker.upper(),
        "price": result.get("price"),
        "currency": result.get("currency"),
        "name": result.get("name"),
        "change": result.get("change"),
        "change_percent": result.get("change_percent"),
        "valid": True
    }


@router.get("/ticker-dividend-info/{ticker}")
@require_feature("portfolio_tracking")
async def get_ticker_dividend_info(
    ticker: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Get dividend information for a ticker"""
    from app.services.price_service import PriceService

    result = await PriceService.get_dividend_info(ticker)
    if not result:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Dividend info for ticker '{ticker}' not found"
        )

    return {
        "ticker": ticker.upper(),
        **result
    }


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


# ==================== Transactions ====================

@router.get("/{asset_id}/transactions", response_model=PortfolioTransactionListResponse)
@require_feature("portfolio_tracking")
async def get_asset_transactions(
    asset_id: UUID,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=100),
    transaction_type: Optional[str] = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Get transaction history for an asset"""
    # Verify asset exists and belongs to user
    asset = await service.get_asset(db, current_user.id, asset_id)
    if not asset:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Portfolio asset not found"
        )

    transactions, total = await service.get_transactions(
        db,
        current_user.id,
        asset_id,
        page=page,
        page_size=page_size,
        transaction_type=transaction_type
    )

    return PortfolioTransactionListResponse(
        items=transactions,
        total=total,
        page=page,
        page_size=page_size
    )


@router.post("/{asset_id}/buy", response_model=PortfolioTransactionResponse)
@require_feature("portfolio_tracking")
async def buy_asset(
    asset_id: UUID,
    buy_data: BuyAssetRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Record a buy transaction for an existing asset"""
    from app.modules.savings.transaction_service import InsufficientFundsError
    from app.modules.savings.models import SavingsAccount
    from app.modules.portfolio.models import PortfolioAsset
    from sqlalchemy import select

    try:
        transaction = await service.record_buy(db, current_user.id, asset_id, buy_data)
        if not transaction:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Portfolio asset not found"
            )
        return transaction
    except InsufficientFundsError:
        # Get asset and account details for detailed error response
        asset_result = await db.execute(
            select(PortfolioAsset).where(
                PortfolioAsset.id == asset_id,
                PortfolioAsset.user_id == current_user.id
            )
        )
        asset = asset_result.scalar_one_or_none()

        account_name = "Unknown"
        current_balance = None
        currency = "USD"

        if asset and asset.payment_account_id:
            account_result = await db.execute(
                select(SavingsAccount).where(
                    SavingsAccount.id == asset.payment_account_id,
                    SavingsAccount.user_id == current_user.id
                )
            )
            account = account_result.scalar_one_or_none()
            if account:
                account_name = account.name
                current_balance = float(account.current_balance)
                currency = account.currency

        total_amount = float(buy_data.quantity * buy_data.price_per_unit + buy_data.fees)

        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "message": "Insufficient funds",
                "error_code": "INSUFFICIENT_FUNDS",
                "account_name": account_name,
                "current_balance": current_balance,
                "required_amount": total_amount,
                "currency": currency
            }
        )


@router.post("/{asset_id}/sell", response_model=SellAssetResponse)
@require_feature("portfolio_tracking")
async def sell_asset(
    asset_id: UUID,
    sell_data: SellAssetRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Record a sell transaction for an existing asset"""
    try:
        result = await service.record_sell(db, current_user.id, asset_id, sell_data)
        if not result:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Portfolio asset not found"
            )
        return SellAssetResponse(
            transaction=result["transaction"],
            proceeds=result["proceeds"],
            cost_basis_sold=result["cost_basis_sold"],
            realized_gain_loss=result["realized_gain_loss"],
            is_gain=result["is_gain"]
        )
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )


@router.post("/{asset_id}/dividend", response_model=PortfolioTransactionResponse)
@require_feature("portfolio_tracking")
async def record_dividend(
    asset_id: UUID,
    dividend_data: RecordDividendRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Record a dividend payment for an asset"""
    transaction = await service.record_dividend(db, current_user.id, asset_id, dividend_data)
    if not transaction:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Portfolio asset not found"
        )
    return transaction


# ==================== Price Updates ====================

@router.post("/{asset_id}/update-price", response_model=PriceUpdateResponse)
@require_feature("portfolio_tracking")
async def update_asset_price_manual(
    asset_id: UUID,
    price_data: UpdatePriceRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Manually update asset price"""
    result = await service.update_price_manual(db, current_user.id, asset_id, price_data.current_price)
    if not result:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Portfolio asset not found"
        )
    return result


@router.post("/{asset_id}/refresh-price", response_model=PriceUpdateResponse)
@require_feature("portfolio_tracking")
async def refresh_asset_price(
    asset_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Refresh asset price from API (requires ticker)"""
    result = await service.update_price_from_api(db, current_user.id, asset_id)
    if not result:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Portfolio asset not found or no ticker set"
        )
    return result


@router.post("/refresh-all-prices", response_model=BulkPriceUpdateResponse)
@require_feature("portfolio_tracking")
async def refresh_all_prices(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Refresh prices for all assets with dynamic pricing enabled"""
    result = await service.update_all_prices(db, current_user.id)
    return BulkPriceUpdateResponse(
        updated_count=result["updated_count"],
        failed_count=result["failed_count"],
        updates=result["updates"],
        errors=result["errors"]
    )
