"""
Admin configuration and email template management endpoints.
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
    ConfigurationItem,
    ConfigurationCreate,
    ConfigurationUpdate,
    EmailTemplateDetail,
    EmailTemplateCreate,
    EmailTemplateUpdate,
)


router = APIRouter(prefix="/config", tags=["admin-config"])


# Configuration endpoints
@router.get("/settings", response_model=List[ConfigurationItem])
@admin_only
async def list_configurations(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List all configurations. Admin only."""
    service = AdminService(db)
    configs = await service.get_configurations()
    return [ConfigurationItem.model_validate(c) for c in configs]


@router.post("/settings", response_model=ConfigurationItem)
@admin_only
async def create_configuration(
    config_data: ConfigurationCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create new configuration. Admin only."""
    service = AdminService(db)
    config = await service.create_configuration(
        key=config_data.key,
        value=config_data.value,
        description=config_data.description,
        is_system=config_data.is_system,
    )
    return ConfigurationItem.model_validate(config)


@router.patch("/settings/{config_id}", response_model=ConfigurationItem)
@admin_only
async def update_configuration(
    config_id: UUID,
    update_data: ConfigurationUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update configuration. Admin only."""
    service = AdminService(db)
    config = await service.update_configuration(
        config_id=config_id,
        value=update_data.value,
        description=update_data.description,
    )
    return ConfigurationItem.model_validate(config)


@router.delete("/settings/{config_id}", status_code=204)
@admin_only
async def delete_configuration(
    config_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Delete configuration. Admin only."""
    service = AdminService(db)
    await service.delete_configuration(config_id)


# Email template endpoints
@router.get("/email-templates", response_model=List[EmailTemplateDetail])
@admin_only
async def list_email_templates(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List all email templates. Admin only."""
    service = AdminService(db)
    templates = await service.get_email_templates()
    return [EmailTemplateDetail.model_validate(t) for t in templates]


@router.get("/email-templates/{template_id}", response_model=EmailTemplateDetail)
@admin_only
async def get_email_template(
    template_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get email template by ID. Admin only."""
    service = AdminService(db)
    template = await service.get_email_template_by_id(template_id)
    return EmailTemplateDetail.model_validate(template)


@router.post("/email-templates", response_model=EmailTemplateDetail)
@admin_only
async def create_email_template(
    template_data: EmailTemplateCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create new email template. Admin only."""
    service = AdminService(db)
    template = await service.create_email_template(
        name=template_data.name,
        subject=template_data.subject,
        html_content=template_data.html_content,
        text_content=template_data.text_content,
        variables=template_data.variables,
        is_active=template_data.is_active,
    )
    return EmailTemplateDetail.model_validate(template)


@router.patch("/email-templates/{template_id}", response_model=EmailTemplateDetail)
@admin_only
async def update_email_template(
    template_id: UUID,
    update_data: EmailTemplateUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update email template. Admin only."""
    service = AdminService(db)
    template = await service.update_email_template(
        template_id=template_id,
        subject=update_data.subject,
        html_content=update_data.html_content,
        text_content=update_data.text_content,
        variables=update_data.variables,
        is_active=update_data.is_active,
    )
    return EmailTemplateDetail.model_validate(template)
