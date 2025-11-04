"""
Dashboard layouts API endpoints.
"""
from typing import List
from uuid import UUID
from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.permissions import get_current_user
from app.models.user import User
from app.modules.dashboard_layouts import service
from app.modules.dashboard_layouts.schemas import (
    DashboardLayout as DashboardLayoutSchema,
    DashboardLayoutCreate,
    DashboardLayoutUpdate,
    DashboardLayoutList,
)

router = APIRouter(prefix="/dashboard/layouts", tags=["Dashboard Layouts"])


@router.get("", response_model=DashboardLayoutList)
async def list_layouts(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    List all dashboard layouts for the current user.
    """
    layouts = await service.list_layouts(db, current_user.id)
    return DashboardLayoutList(items=layouts, total=len(layouts))


@router.get("/active", response_model=DashboardLayoutSchema)
async def get_active_layout(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Get the active dashboard layout for the current user.
    Creates a default layout if none exists.
    """
    layout = await service.get_active_layout(db, current_user.id)
    return layout


@router.get("/{layout_id}", response_model=DashboardLayoutSchema)
async def get_layout(
    layout_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Get a specific dashboard layout by ID.
    """
    layout = await service.get_layout(db, layout_id, current_user.id)
    return layout


@router.post("", response_model=DashboardLayoutSchema, status_code=status.HTTP_201_CREATED)
async def create_layout(
    layout_data: DashboardLayoutCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Create a new dashboard layout.
    """
    layout = await service.create_layout(db, current_user.id, layout_data)
    return layout


@router.put("/{layout_id}", response_model=DashboardLayoutSchema)
async def update_layout(
    layout_id: UUID,
    layout_data: DashboardLayoutUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Update an existing dashboard layout.
    Preset layouts cannot be modified.
    """
    layout = await service.update_layout(db, layout_id, current_user.id, layout_data)
    return layout


@router.delete("/{layout_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_layout(
    layout_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Delete a dashboard layout.
    Preset layouts and the last remaining layout cannot be deleted.
    """
    await service.delete_layout(db, layout_id, current_user.id)


@router.post("/{layout_id}/activate", response_model=DashboardLayoutSchema)
async def activate_layout(
    layout_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Activate a dashboard layout (deactivates all others).
    """
    layout = await service.activate_layout(db, layout_id, current_user.id)
    return layout


@router.post("/presets/initialize", response_model=DashboardLayoutList, status_code=status.HTTP_201_CREATED)
async def initialize_presets(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Initialize all preset layouts for the current user.
    Useful for first-time setup or resetting to defaults.
    """
    layouts = await service.create_preset_layouts_for_user(db, current_user.id)
    return DashboardLayoutList(items=layouts, total=len(layouts))
