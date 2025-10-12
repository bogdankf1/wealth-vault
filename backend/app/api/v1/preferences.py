"""
User preferences API endpoints.
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.core.database import get_db
from app.core.permissions import get_current_user
from app.models.user import User
from app.models.user_preferences import UserPreferences
from app.schemas.user_preferences import (
    UserPreferencesResponse,
    UserPreferencesUpdate,
    UserPreferencesCreate
)

router = APIRouter()


@router.get("/me", response_model=UserPreferencesResponse)
async def get_my_preferences(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Get current user's preferences.
    Creates default preferences if none exist.
    """
    result = await db.execute(
        select(UserPreferences).where(UserPreferences.user_id == current_user.id)
    )
    preferences = result.scalar_one_or_none()

    # Create default preferences if they don't exist
    if not preferences:
        preferences = UserPreferences(user_id=current_user.id)
        db.add(preferences)
        await db.commit()
        await db.refresh(preferences)

    return preferences


@router.put("/me", response_model=UserPreferencesResponse)
async def update_my_preferences(
    preferences_update: UserPreferencesUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Update current user's preferences.
    """
    result = await db.execute(
        select(UserPreferences).where(UserPreferences.user_id == current_user.id)
    )
    preferences = result.scalar_one_or_none()

    # Create preferences if they don't exist
    if not preferences:
        preferences = UserPreferences(user_id=current_user.id)
        db.add(preferences)

    # Update fields
    update_data = preferences_update.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(preferences, field, value)

    await db.commit()
    await db.refresh(preferences)

    return preferences


@router.post("/me/reset", response_model=UserPreferencesResponse)
async def reset_my_preferences(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Reset current user's preferences to defaults.
    """
    result = await db.execute(
        select(UserPreferences).where(UserPreferences.user_id == current_user.id)
    )
    preferences = result.scalar_one_or_none()

    if not preferences:
        raise HTTPException(status_code=404, detail="Preferences not found")

    # Delete and recreate with defaults
    await db.delete(preferences)
    await db.commit()

    preferences = UserPreferences(user_id=current_user.id)
    db.add(preferences)
    await db.commit()
    await db.refresh(preferences)

    return preferences
