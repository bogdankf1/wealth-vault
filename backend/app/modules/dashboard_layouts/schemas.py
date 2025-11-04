"""
Dashboard Layout schemas.
"""
from datetime import datetime
from typing import List
from uuid import UUID
from pydantic import BaseModel, Field


class WidgetConfig(BaseModel):
    """Widget configuration schema."""
    id: str = Field(..., description="Widget identifier")
    visible: bool = Field(True, description="Whether widget is visible")
    order: int = Field(..., description="Display order")


class LayoutConfiguration(BaseModel):
    """Layout configuration schema."""
    widgets: List[WidgetConfig] = Field(..., description="List of widget configurations")


class DashboardLayoutBase(BaseModel):
    """Base dashboard layout schema."""
    name: str = Field(..., min_length=1, max_length=100, description="Layout name")
    configuration: LayoutConfiguration = Field(..., description="Layout configuration")


class DashboardLayoutCreate(DashboardLayoutBase):
    """Schema for creating a dashboard layout."""
    pass


class DashboardLayoutUpdate(BaseModel):
    """Schema for updating a dashboard layout."""
    name: str | None = Field(None, min_length=1, max_length=100, description="Layout name")
    configuration: LayoutConfiguration | None = Field(None, description="Layout configuration")


class DashboardLayout(DashboardLayoutBase):
    """Dashboard layout response schema."""
    id: UUID
    user_id: UUID
    is_active: bool
    is_preset: bool
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class DashboardLayoutList(BaseModel):
    """List of dashboard layouts."""
    items: List[DashboardLayout]
    total: int
