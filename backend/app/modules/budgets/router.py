"""
Budget module API router.
"""
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Optional
from uuid import UUID
from datetime import datetime

from app.core.database import get_db
from app.core.permissions import get_current_user
from app.models.user import User
from app.modules.budgets.models import BudgetPeriod
from app.modules.budgets.schemas import (
    BudgetCreate,
    BudgetUpdate,
    BudgetResponse,
    BudgetWithProgress,
    BudgetOverviewResponse,
)
from app.modules.budgets import service
from app.modules.budgets.service import convert_budget_to_display_currency

router = APIRouter(prefix="/api/v1/budgets", tags=["budgets"])


@router.post("", response_model=BudgetResponse, status_code=status.HTTP_201_CREATED)
async def create_budget(
    budget_data: BudgetCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Create a new budget."""
    budget = await service.create_budget(db, current_user.id, budget_data)
    # Convert model to dict and exclude methods
    budget_dict = {
        "id": budget.id,
        "user_id": budget.user_id,
        "name": budget.name,
        "category": budget.category,
        "description": budget.description,
        "amount": budget.amount,
        "currency": budget.currency,
        "period": budget.period,
        "start_date": budget.start_date,
        "end_date": budget.end_date,
        "is_active": budget.is_active,
        "rollover_unused": budget.rollover_unused,
        "alert_threshold": budget.alert_threshold,
        "created_at": budget.created_at,
        "updated_at": budget.updated_at
    }
    return BudgetResponse(**budget_dict)


@router.get("", response_model=list[BudgetResponse])
async def list_budgets(
    category: Optional[str] = None,
    period: Optional[BudgetPeriod] = None,
    is_active: Optional[bool] = None,
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """List all budgets for the current user."""
    budgets = await service.get_budgets(
        db,
        current_user.id,
        category=category,
        period=period,
        is_active=is_active,
        skip=skip,
        limit=limit
    )
    result = []
    for budget in budgets:
        # Convert to display currency
        await convert_budget_to_display_currency(db, current_user.id, budget)

        budget_dict = {
            "id": budget.id,
            "user_id": budget.user_id,
            "name": budget.name,
            "category": budget.category,
            "description": budget.description,
            "amount": budget.amount,
            "currency": budget.currency,
            "period": budget.period,
            "start_date": budget.start_date,
            "end_date": budget.end_date,
            "is_active": budget.is_active,
            "rollover_unused": budget.rollover_unused,
            "alert_threshold": budget.alert_threshold,
            "created_at": budget.created_at,
            "updated_at": budget.updated_at,
            "display_amount": getattr(budget, 'display_amount', None),
            "display_currency": getattr(budget, 'display_currency', None)
        }
        result.append(BudgetResponse(**budget_dict))
    return result


@router.get("/overview", response_model=BudgetOverviewResponse)
async def get_budget_overview(
    start_date: Optional[datetime] = None,
    end_date: Optional[datetime] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get budget overview with stats and category breakdown."""
    return await service.get_budget_overview(
        db,
        current_user.id,
        start_date=start_date,
        end_date=end_date
    )


@router.get("/{budget_id}", response_model=BudgetWithProgress)
async def get_budget(
    budget_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Get a specific budget with progress details."""
    budget_with_progress = await service.get_budget_with_progress(
        db,
        budget_id,
        current_user.id
    )
    if not budget_with_progress:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Budget not found"
        )
    return budget_with_progress


@router.put("/{budget_id}", response_model=BudgetResponse)
async def update_budget(
    budget_id: UUID,
    budget_data: BudgetUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Update a budget."""
    budget = await service.update_budget(db, budget_id, current_user.id, budget_data)
    if not budget:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Budget not found"
        )
    budget_dict = {
        "id": budget.id,
        "user_id": budget.user_id,
        "name": budget.name,
        "category": budget.category,
        "description": budget.description,
        "amount": budget.amount,
        "currency": budget.currency,
        "period": budget.period,
        "start_date": budget.start_date,
        "end_date": budget.end_date,
        "is_active": budget.is_active,
        "rollover_unused": budget.rollover_unused,
        "alert_threshold": budget.alert_threshold,
        "created_at": budget.created_at,
        "updated_at": budget.updated_at
    }
    return BudgetResponse(**budget_dict)


@router.delete("/{budget_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_budget(
    budget_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Delete a budget (soft delete)."""
    deleted = await service.delete_budget(db, budget_id, current_user.id)
    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Budget not found"
        )
