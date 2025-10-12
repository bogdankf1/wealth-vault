"""
Admin service layer for user management, tier management, configuration, and analytics.
"""
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_, or_, desc
from sqlalchemy.orm import selectinload
from typing import Optional, List, Tuple
from datetime import datetime, timedelta
from uuid import UUID

from app.models.user import User, UserRole
from app.models.tier import Tier, Feature, TierFeature
from app.models.configuration import AppConfiguration, EmailTemplate
from app.models.billing import UserSubscription, PaymentHistory
from app.core.security import create_access_token
from app.core.exceptions import NotFoundException, BadRequestException


class AdminService:
    """Service for admin operations."""

    def __init__(self, db: AsyncSession):
        self.db = db

    # ==================== User Management ====================

    async def get_users(
        self,
        page: int = 1,
        page_size: int = 20,
        search: Optional[str] = None,
        role: Optional[str] = None,
        tier_name: Optional[str] = None,
    ) -> Tuple[List[User], int]:
        """
        Get paginated list of users with filtering.

        Args:
            page: Page number (1-indexed)
            page_size: Number of users per page
            search: Search by email or name
            role: Filter by role
            tier_name: Filter by tier name

        Returns:
            Tuple of (users list, total count)
        """
        query = select(User).options(selectinload(User.tier))

        # Apply filters
        if search:
            search_filter = or_(
                User.email.ilike(f"%{search}%"),
                User.name.ilike(f"%{search}%")
            )
            query = query.where(search_filter)

        if role:
            query = query.where(User.role == role)

        if tier_name:
            query = query.join(Tier).where(Tier.name == tier_name)

        # Get total count
        count_query = select(func.count()).select_from(query.subquery())
        total_result = await self.db.execute(count_query)
        total = total_result.scalar()

        # Apply pagination
        offset = (page - 1) * page_size
        query = query.order_by(desc(User.created_at)).offset(offset).limit(page_size)

        result = await self.db.execute(query)
        users = result.scalars().all()

        return list(users), total

    async def get_user_by_id(self, user_id: UUID) -> User:
        """Get user by ID with tier relationship."""
        result = await self.db.execute(
            select(User)
            .options(selectinload(User.tier))
            .where(User.id == user_id)
        )
        user = result.scalar_one_or_none()

        if not user:
            raise NotFoundException(message=f"User with id {user_id} not found")

        return user

    async def update_user(self, user_id: UUID, tier_id: Optional[UUID] = None, role: Optional[str] = None) -> User:
        """
        Update user tier or role.

        Args:
            user_id: User ID to update
            tier_id: New tier ID
            role: New role (USER/ADMIN)

        Returns:
            Updated user
        """
        user = await self.get_user_by_id(user_id)

        if tier_id is not None:
            # Validate tier exists
            tier_result = await self.db.execute(select(Tier).where(Tier.id == tier_id))
            tier = tier_result.scalar_one_or_none()
            if not tier:
                raise NotFoundException(message=f"Tier with id {tier_id} not found")
            user.tier_id = tier_id

        if role is not None:
            if role not in ["USER", "ADMIN"]:
                raise BadRequestException(message="Role must be USER or ADMIN")
            user.role = UserRole(role)

        await self.db.commit()
        await self.db.refresh(user)

        return user

    async def impersonate_user(self, user_id: UUID) -> Tuple[User, str]:
        """
        Generate impersonation token for user.

        Args:
            user_id: User ID to impersonate

        Returns:
            Tuple of (user, token)
        """
        user = await self.get_user_by_id(user_id)
        token = create_access_token(data={"sub": str(user.id)})
        return user, token

    async def suspend_user(self, user_id: UUID, reason: Optional[str] = None) -> User:
        """
        Suspend/ban user (soft delete).

        Args:
            user_id: User ID to suspend
            reason: Optional suspension reason

        Returns:
            Suspended user
        """
        user = await self.get_user_by_id(user_id)
        user.deleted_at = datetime.utcnow()
        await self.db.commit()
        await self.db.refresh(user)
        return user

    async def unsuspend_user(self, user_id: UUID) -> User:
        """
        Unsuspend/unban user (restore from soft delete).

        Args:
            user_id: User ID to unsuspend

        Returns:
            Unsuspended user
        """
        user = await self.get_user_by_id(user_id)
        user.deleted_at = None
        await self.db.commit()
        await self.db.refresh(user)
        return user

    # ==================== Tier Management ====================

    async def get_tiers(self) -> List[Tier]:
        """Get all tiers."""
        result = await self.db.execute(select(Tier).order_by(Tier.price_monthly))
        return list(result.scalars().all())

    async def get_tier_by_id(self, tier_id: UUID) -> Tier:
        """Get tier by ID."""
        result = await self.db.execute(select(Tier).where(Tier.id == tier_id))
        tier = result.scalar_one_or_none()

        if not tier:
            raise NotFoundException(message=f"Tier with id {tier_id} not found")

        return tier

    async def update_tier(
        self,
        tier_id: UUID,
        display_name: Optional[str] = None,
        description: Optional[str] = None,
        price_monthly: Optional[int] = None,
        price_annual: Optional[int] = None,
        is_active: Optional[bool] = None,
    ) -> Tier:
        """Update tier details."""
        tier = await self.get_tier_by_id(tier_id)

        if display_name is not None:
            tier.display_name = display_name
        if description is not None:
            tier.description = description
        if price_monthly is not None:
            tier.price_monthly = price_monthly
        if price_annual is not None:
            tier.price_annual = price_annual
        if is_active is not None:
            tier.is_active = is_active

        await self.db.commit()
        await self.db.refresh(tier)

        return tier

    async def get_features(self) -> List[Feature]:
        """Get all features."""
        result = await self.db.execute(select(Feature).order_by(Feature.module, Feature.name))
        return list(result.scalars().all())

    async def get_tier_features(self, tier_id: UUID) -> List[TierFeature]:
        """Get all feature assignments for a tier."""
        result = await self.db.execute(
            select(TierFeature)
            .options(selectinload(TierFeature.feature))
            .where(TierFeature.tier_id == tier_id)
        )
        return list(result.scalars().all())

    async def assign_feature_to_tier(
        self,
        tier_id: UUID,
        feature_id: UUID,
        enabled: bool,
        limit_value: Optional[int] = None,
    ) -> TierFeature:
        """Assign or update feature for tier."""
        # Check if assignment already exists
        result = await self.db.execute(
            select(TierFeature).where(
                and_(
                    TierFeature.tier_id == tier_id,
                    TierFeature.feature_id == feature_id
                )
            )
        )
        tier_feature = result.scalar_one_or_none()

        if tier_feature:
            # Update existing
            tier_feature.enabled = enabled
            tier_feature.limit_value = limit_value
        else:
            # Create new
            tier_feature = TierFeature(
                tier_id=tier_id,
                feature_id=feature_id,
                enabled=enabled,
                limit_value=limit_value,
            )
            self.db.add(tier_feature)

        await self.db.commit()
        await self.db.refresh(tier_feature)

        return tier_feature

    # ==================== Configuration Management ====================

    async def get_configurations(self) -> List[AppConfiguration]:
        """Get all configurations."""
        result = await self.db.execute(select(AppConfiguration).order_by(AppConfiguration.key))
        return list(result.scalars().all())

    async def get_configuration_by_key(self, key: str) -> Optional[AppConfiguration]:
        """Get configuration by key."""
        result = await self.db.execute(select(AppConfiguration).where(AppConfiguration.key == key))
        return result.scalar_one_or_none()

    async def create_configuration(
        self,
        key: str,
        value: dict,
        description: Optional[str] = None,
        is_system: bool = False,
    ) -> AppConfiguration:
        """Create new configuration."""
        # Check if key already exists
        existing = await self.get_configuration_by_key(key)
        if existing:
            raise BadRequestException(message=f"Configuration with key '{key}' already exists")

        config = AppConfiguration(
            key=key,
            value=value,
            description=description,
            is_system=is_system,
        )
        self.db.add(config)
        await self.db.commit()
        await self.db.refresh(config)

        return config

    async def update_configuration(
        self,
        config_id: UUID,
        value: Optional[dict] = None,
        description: Optional[str] = None,
    ) -> AppConfiguration:
        """Update configuration."""
        result = await self.db.execute(select(AppConfiguration).where(AppConfiguration.id == config_id))
        config = result.scalar_one_or_none()

        if not config:
            raise NotFoundException(message=f"Configuration with id {config_id} not found")

        if value is not None:
            config.value = value
        if description is not None:
            config.description = description

        await self.db.commit()
        await self.db.refresh(config)

        return config

    async def delete_configuration(self, config_id: UUID) -> None:
        """Delete configuration (soft delete)."""
        result = await self.db.execute(select(AppConfiguration).where(AppConfiguration.id == config_id))
        config = result.scalar_one_or_none()

        if not config:
            raise NotFoundException(message=f"Configuration with id {config_id} not found")

        if config.is_system:
            raise BadRequestException(message="Cannot delete system configuration")

        config.deleted_at = datetime.utcnow()
        await self.db.commit()

    # ==================== Email Templates ====================

    async def get_email_templates(self) -> List[EmailTemplate]:
        """Get all email templates."""
        result = await self.db.execute(select(EmailTemplate).order_by(EmailTemplate.name))
        return list(result.scalars().all())

    async def get_email_template_by_id(self, template_id: UUID) -> EmailTemplate:
        """Get email template by ID."""
        result = await self.db.execute(select(EmailTemplate).where(EmailTemplate.id == template_id))
        template = result.scalar_one_or_none()

        if not template:
            raise NotFoundException(message=f"Email template with id {template_id} not found")

        return template

    async def create_email_template(
        self,
        name: str,
        subject: str,
        html_content: str,
        text_content: Optional[str] = None,
        variables: Optional[dict] = None,
        is_active: bool = True,
    ) -> EmailTemplate:
        """Create new email template."""
        template = EmailTemplate(
            name=name,
            subject=subject,
            html_content=html_content,
            text_content=text_content,
            variables=variables,
            is_active=is_active,
        )
        self.db.add(template)
        await self.db.commit()
        await self.db.refresh(template)

        return template

    async def update_email_template(
        self,
        template_id: UUID,
        subject: Optional[str] = None,
        html_content: Optional[str] = None,
        text_content: Optional[str] = None,
        variables: Optional[dict] = None,
        is_active: Optional[bool] = None,
    ) -> EmailTemplate:
        """Update email template."""
        template = await self.get_email_template_by_id(template_id)

        if subject is not None:
            template.subject = subject
        if html_content is not None:
            template.html_content = html_content
        if text_content is not None:
            template.text_content = text_content
        if variables is not None:
            template.variables = variables
        if is_active is not None:
            template.is_active = is_active

        await self.db.commit()
        await self.db.refresh(template)

        return template

    # ==================== Analytics ====================

    async def get_platform_stats(self) -> dict:
        """Get overall platform statistics."""
        now = datetime.utcnow()
        today_start = datetime(now.year, now.month, now.day)
        week_start = now - timedelta(days=7)
        month_start = now - timedelta(days=30)

        # Total users
        total_users_result = await self.db.execute(select(func.count(User.id)))
        total_users = total_users_result.scalar()

        # Active users (logged in last 30 days) - we'll need to track this with login activity
        # For now, count non-deleted users
        active_users_result = await self.db.execute(
            select(func.count(User.id)).where(User.deleted_at.is_(None))
        )
        active_users = active_users_result.scalar()

        # New users
        new_today_result = await self.db.execute(
            select(func.count(User.id)).where(User.created_at >= today_start)
        )
        new_users_today = new_today_result.scalar()

        new_week_result = await self.db.execute(
            select(func.count(User.id)).where(User.created_at >= week_start)
        )
        new_users_this_week = new_week_result.scalar()

        new_month_result = await self.db.execute(
            select(func.count(User.id)).where(User.created_at >= month_start)
        )
        new_users_this_month = new_month_result.scalar()

        # Subscriptions
        total_subs_result = await self.db.execute(select(func.count(UserSubscription.id)))
        total_subscriptions = total_subs_result.scalar()

        active_subs_result = await self.db.execute(
            select(func.count(UserSubscription.id)).where(UserSubscription.status == "active")
        )
        active_subscriptions = active_subs_result.scalar()

        # Revenue (MRR/ARR) - simplified calculation
        # MRR = sum of all active monthly subscriptions
        # This is a placeholder - in production you'd calculate this from Stripe data
        mrr = active_subscriptions * 1000  # Placeholder: $10 per sub in cents
        arr = mrr * 12

        # Churn rate (simplified)
        cancelled_subs_result = await self.db.execute(
            select(func.count(UserSubscription.id)).where(
                and_(
                    UserSubscription.canceled_at.isnot(None),
                    UserSubscription.canceled_at >= month_start
                )
            )
        )
        cancelled_this_month = cancelled_subs_result.scalar()
        churn_rate = (cancelled_this_month / total_subscriptions * 100) if total_subscriptions > 0 else 0.0

        return {
            "total_users": total_users,
            "active_users": active_users,
            "new_users_today": new_users_today,
            "new_users_this_week": new_users_this_week,
            "new_users_this_month": new_users_this_month,
            "total_subscriptions": total_subscriptions,
            "active_subscriptions": active_subscriptions,
            "mrr": mrr,
            "arr": arr,
            "churn_rate": round(churn_rate, 2),
        }

    async def get_user_acquisition_data(self, days: int = 30) -> List[dict]:
        """Get user acquisition data for the last N days."""
        start_date = datetime.utcnow() - timedelta(days=days)

        # Group by date and count
        result = await self.db.execute(
            select(
                func.date(User.created_at).label("date"),
                func.count(User.id).label("count")
            )
            .where(User.created_at >= start_date)
            .group_by(func.date(User.created_at))
            .order_by(func.date(User.created_at))
        )

        return [{"date": row.date, "count": row.count} for row in result.all()]

    async def get_engagement_metrics(self) -> dict:
        """Get user engagement metrics."""
        # Simplified version - in production, track actual login activity
        now = datetime.utcnow()
        day_ago = now - timedelta(days=1)
        week_ago = now - timedelta(days=7)
        month_ago = now - timedelta(days=30)

        # For now, use active (non-deleted) users as proxy
        total_users_result = await self.db.execute(
            select(func.count(User.id)).where(User.deleted_at.is_(None))
        )
        total_users = total_users_result.scalar()

        return {
            "dau": total_users,  # Placeholder
            "wau": total_users,  # Placeholder
            "mau": total_users,  # Placeholder
            "avg_session_duration": None,
            "retention_rate_30d": 85.0,  # Placeholder
        }
