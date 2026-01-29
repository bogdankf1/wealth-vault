"""
Dashboard layout service.
"""
import uuid
from typing import List, Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_
from fastapi import HTTPException, status

from app.modules.dashboard_layouts.models import DashboardLayout
from app.modules.dashboard_layouts.schemas import (
    DashboardLayoutCreate,
    DashboardLayoutUpdate,
    LayoutConfiguration,
    WidgetConfig,
)


# Default layout presets - these are created for each new user but can be edited/deleted
LAYOUT_PRESETS = {
    "optimal": {
        "name": "Optimal View",
        "configuration": {
            "widgets": [
                # Minimal widgets (stats cards)
                {"id": "net-worth", "visible": True, "order": 1},
                {"id": "income-vs-expenses", "visible": True, "order": 2},  # Income & Expenses
                {"id": "upcoming-bills", "visible": True, "order": 3},  # Subscriptions & Installments
                {"id": "taxes", "visible": True, "order": 4},
                {"id": "debts-owed", "visible": True, "order": 5},
                {"id": "monthly-spending", "visible": True, "order": 6},  # Net Cash Flow
                # Planned widgets
                {"id": "planned-subscriptions", "visible": True, "order": 7},
                {"id": "planned-expenses", "visible": True, "order": 8},
                {"id": "planned-installments", "visible": True, "order": 9},
                # Charts (Optimal adds these)
                {"id": "subscriptions-by-category", "visible": True, "order": 10},
                {"id": "installments-by-category", "visible": True, "order": 11},
                {"id": "expenses-by-category", "visible": True, "order": 12},
                {"id": "income-allocation", "visible": True, "order": 13},
                # Hidden widgets
                {"id": "quick-actions", "visible": False, "order": 14},
                {"id": "ai-insights", "visible": False, "order": 15},
                {"id": "exchange-rates", "visible": False, "order": 16},
                {"id": "budget-overview", "visible": False, "order": 17},
                {"id": "goals-progress", "visible": False, "order": 18},
                {"id": "portfolio-summary", "visible": False, "order": 19},
                {"id": "budgets-by-category", "visible": False, "order": 20},
                {"id": "net-worth-trend", "visible": False, "order": 21},
            ]
        }
    },
    "minimal": {
        "name": "Minimal View",
        "configuration": {
            "widgets": [
                # Only stats cards, no charts
                {"id": "net-worth", "visible": True, "order": 1},
                {"id": "income-vs-expenses", "visible": True, "order": 2},  # Income & Expenses
                {"id": "upcoming-bills", "visible": True, "order": 3},  # Subscriptions & Installments
                {"id": "taxes", "visible": True, "order": 4},
                {"id": "debts-owed", "visible": True, "order": 5},
                {"id": "monthly-spending", "visible": True, "order": 6},  # Net Cash Flow
                # Planned widgets
                {"id": "planned-subscriptions", "visible": True, "order": 7},
                {"id": "planned-expenses", "visible": True, "order": 8},
                {"id": "planned-installments", "visible": True, "order": 9},
                # All other widgets hidden
                {"id": "subscriptions-by-category", "visible": False, "order": 10},
                {"id": "installments-by-category", "visible": False, "order": 11},
                {"id": "expenses-by-category", "visible": False, "order": 12},
                {"id": "income-allocation", "visible": False, "order": 13},
                {"id": "quick-actions", "visible": False, "order": 14},
                {"id": "ai-insights", "visible": False, "order": 15},
                {"id": "exchange-rates", "visible": False, "order": 16},
                {"id": "budget-overview", "visible": False, "order": 17},
                {"id": "goals-progress", "visible": False, "order": 18},
                {"id": "portfolio-summary", "visible": False, "order": 19},
                {"id": "budgets-by-category", "visible": False, "order": 20},
                {"id": "net-worth-trend", "visible": False, "order": 21},
            ]
        }
    },
    "complete": {
        "name": "Complete View",
        "configuration": {
            "widgets": [
                {"id": "quick-actions", "visible": True, "order": 1},
                {"id": "ai-insights", "visible": True, "order": 2},
                {"id": "budget-overview", "visible": True, "order": 3},
                {"id": "planned-subscriptions", "visible": True, "order": 4},
                {"id": "planned-expenses", "visible": True, "order": 5},
                {"id": "planned-installments", "visible": True, "order": 6},
                {"id": "net-worth", "visible": True, "order": 7},
                {"id": "income-vs-expenses", "visible": True, "order": 8},
                {"id": "upcoming-bills", "visible": True, "order": 9},
                {"id": "taxes", "visible": True, "order": 10},
                {"id": "debts-owed", "visible": True, "order": 11},
                {"id": "monthly-spending", "visible": True, "order": 12},
                {"id": "subscriptions-by-category", "visible": True, "order": 13},
                {"id": "installments-by-category", "visible": True, "order": 14},
                {"id": "expenses-by-category", "visible": True, "order": 15},
                {"id": "budgets-by-category", "visible": True, "order": 16},
                {"id": "income-allocation", "visible": True, "order": 17},
                {"id": "net-worth-trend", "visible": True, "order": 18},
                {"id": "exchange-rates", "visible": True, "order": 19},
                {"id": "portfolio-summary", "visible": True, "order": 20},
                {"id": "goals-progress", "visible": False, "order": 21},
            ]
        }
    },
}


async def create_default_layout_for_user(db: AsyncSession, user_id: uuid.UUID) -> DashboardLayout:
    """
    Create a default "Optimal View" layout for a new user.
    """
    preset = LAYOUT_PRESETS["optimal"]
    layout = DashboardLayout(
        id=uuid.uuid4(),
        user_id=user_id,
        name=preset["name"],
        is_active=True,
        is_preset=False,  # Not a preset - users can edit/delete
        configuration=preset["configuration"],
    )
    db.add(layout)
    await db.commit()
    await db.refresh(layout)
    return layout


async def list_layouts(db: AsyncSession, user_id: uuid.UUID) -> List[DashboardLayout]:
    """
    List all layouts for a user.
    """
    result = await db.execute(
        select(DashboardLayout)
        .where(DashboardLayout.user_id == user_id)
        .order_by(DashboardLayout.created_at)
    )
    return list(result.scalars().all())


async def get_active_layout(db: AsyncSession, user_id: uuid.UUID) -> Optional[DashboardLayout]:
    """
    Get the active layout for a user. If none exists, create a default one.
    """
    result = await db.execute(
        select(DashboardLayout)
        .where(and_(DashboardLayout.user_id == user_id, DashboardLayout.is_active == True))
    )
    layout = result.scalar_one_or_none()

    if not layout:
        # Create default layout if none exists
        layout = await create_default_layout_for_user(db, user_id)

    return layout


async def get_layout(db: AsyncSession, layout_id: uuid.UUID, user_id: uuid.UUID) -> DashboardLayout:
    """
    Get a specific layout by ID.
    """
    result = await db.execute(
        select(DashboardLayout)
        .where(and_(DashboardLayout.id == layout_id, DashboardLayout.user_id == user_id))
    )
    layout = result.scalar_one_or_none()

    if not layout:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Layout not found"
        )

    return layout


async def create_layout(
    db: AsyncSession,
    user_id: uuid.UUID,
    layout_data: DashboardLayoutCreate,
    is_preset: bool = False
) -> DashboardLayout:
    """
    Create a new layout for a user.
    """
    layout = DashboardLayout(
        id=uuid.uuid4(),
        user_id=user_id,
        name=layout_data.name,
        is_active=False,
        is_preset=is_preset,
        configuration=layout_data.configuration.model_dump(),
    )
    db.add(layout)
    await db.commit()
    await db.refresh(layout)
    return layout


async def update_layout(
    db: AsyncSession,
    layout_id: uuid.UUID,
    user_id: uuid.UUID,
    layout_data: DashboardLayoutUpdate
) -> DashboardLayout:
    """
    Update an existing layout.
    """
    layout = await get_layout(db, layout_id, user_id)

    if layout_data.name is not None:
        layout.name = layout_data.name

    if layout_data.configuration is not None:
        layout.configuration = layout_data.configuration.model_dump()

    await db.commit()
    await db.refresh(layout)
    return layout


async def delete_layout(db: AsyncSession, layout_id: uuid.UUID, user_id: uuid.UUID) -> None:
    """
    Delete a layout.
    """
    layout = await get_layout(db, layout_id, user_id)

    # Don't allow deleting the active layout if it's the only one
    if layout.is_active:
        layouts = await list_layouts(db, user_id)
        if len(layouts) <= 1:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot delete the only layout. Create another layout first."
            )

    await db.delete(layout)
    await db.commit()


async def activate_layout(db: AsyncSession, layout_id: uuid.UUID, user_id: uuid.UUID) -> DashboardLayout:
    """
    Activate a layout (deactivate all others).
    """
    layout = await get_layout(db, layout_id, user_id)

    # Deactivate all other layouts
    await db.execute(
        select(DashboardLayout)
        .where(and_(DashboardLayout.user_id == user_id, DashboardLayout.is_active == True))
    )
    result = await db.execute(
        select(DashboardLayout)
        .where(DashboardLayout.user_id == user_id)
    )
    all_layouts = result.scalars().all()

    for l in all_layouts:
        l.is_active = (l.id == layout_id)

    await db.commit()
    await db.refresh(layout)
    return layout


async def create_preset_layouts_for_user(db: AsyncSession, user_id: uuid.UUID) -> List[DashboardLayout]:
    """
    Create all default layouts for a user.
    Only creates layouts that don't already exist (checks by name).
    These layouts are fully editable and deletable by the user.
    """
    # Check which layouts already exist
    existing_layouts = await list_layouts(db, user_id)
    existing_layout_names = {layout.name for layout in existing_layouts}

    layouts = []
    has_active = any(layout.is_active for layout in existing_layouts)

    for preset_key, preset_data in LAYOUT_PRESETS.items():
        preset_name = preset_data["name"]

        # Skip if this layout already exists
        if preset_name in existing_layout_names:
            continue

        layout = DashboardLayout(
            id=uuid.uuid4(),
            user_id=user_id,
            name=preset_name,
            is_active=(preset_key == "optimal" and not has_active),  # Optimal is default
            is_preset=False,  # Not a preset - users can edit/delete
            configuration=preset_data["configuration"],
        )
        db.add(layout)
        layouts.append(layout)

    if layouts:
        await db.commit()
        for layout in layouts:
            await db.refresh(layout)

    return layouts
