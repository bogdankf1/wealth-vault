"""
Trial Service.

Handles all aspects of free trial subscriptions for new users:
- Getting and managing trial settings from configuration
- Creating trial subscriptions for new users
- Checking and expiring trials
"""
import logging
from datetime import datetime, timedelta, timezone
from typing import Dict, Any, List, Optional
from uuid import UUID
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.models.user import User
from app.models.tier import Tier
from app.models.billing import UserSubscription, SubscriptionStatus
from app.models.configuration import AppConfiguration
from app.services.tier_downgrade_service import TierDowngradeService

logger = logging.getLogger(__name__)

# Default trial settings
DEFAULT_TRIAL_SETTINGS = {
    "enabled": False,
    "duration_days": 30,
    "trial_tier": "wealth"
}


class TrialService:
    """Service for handling free trial subscriptions."""

    @staticmethod
    async def get_trial_settings(db: AsyncSession) -> Dict[str, Any]:
        """
        Get trial settings from configuration.

        Returns:
            Dict with trial settings (enabled, duration_days, trial_tier)
        """
        result = await db.execute(
            select(AppConfiguration).where(AppConfiguration.key == "trial_settings")
        )
        config = result.scalar_one_or_none()

        if not config:
            return DEFAULT_TRIAL_SETTINGS.copy()

        # Merge with defaults to ensure all keys exist
        settings = DEFAULT_TRIAL_SETTINGS.copy()
        if config.value:
            settings.update(config.value)

        return settings

    @staticmethod
    async def update_trial_settings(
        db: AsyncSession,
        enabled: Optional[bool] = None,
        duration_days: Optional[int] = None,
        trial_tier: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Update trial settings in configuration.

        Args:
            db: Database session
            enabled: Whether trial is enabled
            duration_days: Duration of trial in days
            trial_tier: Tier to assign during trial

        Returns:
            Updated trial settings
        """
        result = await db.execute(
            select(AppConfiguration).where(AppConfiguration.key == "trial_settings")
        )
        config = result.scalar_one_or_none()

        # Get current settings
        current_settings = await TrialService.get_trial_settings(db)

        # Update only provided fields
        if enabled is not None:
            current_settings["enabled"] = enabled
        if duration_days is not None:
            current_settings["duration_days"] = duration_days
        if trial_tier is not None:
            current_settings["trial_tier"] = trial_tier

        if config:
            config.value = current_settings
        else:
            config = AppConfiguration(
                key="trial_settings",
                value=current_settings,
                description="Free trial settings for new users",
                is_system=True
            )
            db.add(config)

        await db.commit()
        await db.refresh(config)

        return current_settings

    @staticmethod
    async def is_trial_enabled(db: AsyncSession) -> bool:
        """Check if trial is currently enabled."""
        settings = await TrialService.get_trial_settings(db)
        return settings.get("enabled", False)

    @staticmethod
    async def get_trial_tier(db: AsyncSession) -> Optional[Tier]:
        """
        Get the tier to assign for trials.

        Returns:
            Tier object or None if not found
        """
        settings = await TrialService.get_trial_settings(db)
        tier_name = settings.get("trial_tier", "wealth")

        result = await db.execute(
            select(Tier).where(Tier.name == tier_name)
        )
        return result.scalar_one_or_none()

    @staticmethod
    async def create_trial_subscription(
        db: AsyncSession,
        user_id: UUID,
        duration_days: Optional[int] = None
    ) -> Optional[UserSubscription]:
        """
        Create a trial subscription for a user.

        Args:
            db: Database session
            user_id: User ID to create trial for
            duration_days: Override for trial duration (uses settings default if not provided)

        Returns:
            Created UserSubscription or None if failed
        """
        settings = await TrialService.get_trial_settings(db)

        if duration_days is None:
            duration_days = settings.get("duration_days", 30)

        now = datetime.now(timezone.utc)
        trial_end = now + timedelta(days=duration_days)

        # Check if user already has a subscription
        result = await db.execute(
            select(UserSubscription).where(UserSubscription.user_id == user_id)
        )
        existing = result.scalar_one_or_none()

        if existing:
            logger.warning(f"User {user_id} already has a subscription, cannot create trial")
            return None

        # Create trial subscription
        subscription = UserSubscription(
            user_id=user_id,
            payment_provider="trial",
            status=SubscriptionStatus.TRIALING,
            current_period_start=now,
            current_period_end=trial_end,
            trial_start=now,
            trial_end=trial_end,
            cancel_at_period_end=0
        )

        db.add(subscription)
        await db.commit()
        await db.refresh(subscription)

        logger.info(
            f"Created trial subscription for user {user_id}. "
            f"Trial ends: {trial_end.isoformat()}"
        )

        return subscription

    @staticmethod
    async def get_expired_trials(db: AsyncSession) -> List[Dict[str, Any]]:
        """
        Get all trials that have expired and need to be downgraded.

        Returns:
            List of expired trial data with user info
        """
        now = datetime.now(timezone.utc)

        result = await db.execute(
            select(UserSubscription, User)
            .join(User, User.id == UserSubscription.user_id)
            .options(selectinload(User.tier))
            .where(UserSubscription.status == SubscriptionStatus.TRIALING)
            .where(UserSubscription.trial_end < now)
        )
        rows = result.all()

        expired = []
        for subscription, user in rows:
            # Only include if user is not already on starter
            if user.tier and user.tier.name != "starter":
                expired.append({
                    "user_id": str(user.id),
                    "user_email": user.email,
                    "user_name": user.name,
                    "subscription_id": str(subscription.id),
                    "trial_end": subscription.trial_end.isoformat() if subscription.trial_end else None,
                    "tier_name": user.tier.name
                })

        return expired

    @staticmethod
    async def expire_trial(db: AsyncSession, user_id: UUID) -> Dict[str, Any]:
        """
        Expire a user's trial and downgrade to starter.

        Args:
            db: Database session
            user_id: User ID to expire trial for

        Returns:
            Dict with expiration results
        """
        # Get user with tier
        result = await db.execute(
            select(User)
            .options(selectinload(User.tier))
            .where(User.id == user_id)
        )
        user = result.scalar_one_or_none()

        if not user:
            return {"success": False, "error": "User not found"}

        from_tier_name = user.tier.name if user.tier else "unknown"

        # Get starter tier
        starter_tier = await TierDowngradeService.get_starter_tier(db)
        if not starter_tier:
            return {"success": False, "error": "Starter tier not found"}

        # Update subscription status
        sub_result = await db.execute(
            select(UserSubscription).where(UserSubscription.user_id == user_id)
        )
        subscription = sub_result.scalar_one_or_none()

        if subscription:
            subscription.status = SubscriptionStatus.CANCELED
            subscription.canceled_at = datetime.now(timezone.utc)

        # Downgrade user tier
        user.tier_id = starter_tier.id

        await db.commit()

        logger.info(
            f"Trial expired for user {user_id}. "
            f"Downgraded from {from_tier_name} to starter."
        )

        return {
            "success": True,
            "user_id": str(user_id),
            "from_tier": from_tier_name,
            "to_tier": "starter",
            "expired_at": datetime.now(timezone.utc).isoformat()
        }

    @staticmethod
    async def is_user_on_trial(db: AsyncSession, user_id: UUID) -> bool:
        """Check if a user is currently on trial."""
        result = await db.execute(
            select(UserSubscription)
            .where(UserSubscription.user_id == user_id)
            .where(UserSubscription.status == SubscriptionStatus.TRIALING)
        )
        subscription = result.scalar_one_or_none()
        return subscription is not None

    @staticmethod
    async def get_trial_info(db: AsyncSession, user_id: UUID) -> Optional[Dict[str, Any]]:
        """
        Get trial information for a user.

        Returns:
            Dict with trial info or None if not on trial
        """
        result = await db.execute(
            select(UserSubscription)
            .where(UserSubscription.user_id == user_id)
            .where(UserSubscription.status == SubscriptionStatus.TRIALING)
        )
        subscription = result.scalar_one_or_none()

        if not subscription:
            return None

        now = datetime.now(timezone.utc)
        trial_end = subscription.trial_end

        if trial_end:
            # Handle both timezone-aware and naive trial_end
            if trial_end.tzinfo is None:
                trial_end = trial_end.replace(tzinfo=timezone.utc)
            days_remaining = (trial_end - now).days
            if days_remaining < 0:
                days_remaining = 0
        else:
            days_remaining = 0

        return {
            "is_trial": True,
            "trial_start": subscription.trial_start.isoformat() if subscription.trial_start else None,
            "trial_end": subscription.trial_end.isoformat() if subscription.trial_end else None,
            "days_remaining": days_remaining
        }
