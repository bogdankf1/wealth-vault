"""
Tier Downgrade Service.

Handles all aspects of tier subscription downgrades:
- Downgrading user to starter tier
- Archiving tier-specific data
- Calculating features being lost
- Sending downgrade notifications
"""
import logging
from datetime import datetime
from typing import Dict, Any, List, Optional
from uuid import UUID
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.models.user import User
from app.models.tier import Tier, Feature, TierFeature
from app.models.billing import UserSubscription, SubscriptionStatus
from app.core.events import event_dispatcher, BillingEvents

logger = logging.getLogger(__name__)


class TierDowngradeService:
    """Service for handling tier downgrades."""

    @staticmethod
    async def get_starter_tier(db: AsyncSession) -> Optional[Tier]:
        """Get the starter tier from database."""
        result = await db.execute(
            select(Tier).where(Tier.name == "starter")
        )
        return result.scalar_one_or_none()

    @staticmethod
    async def get_tier_by_name(db: AsyncSession, name: str) -> Optional[Tier]:
        """Get a tier by name."""
        result = await db.execute(
            select(Tier).where(Tier.name == name)
        )
        return result.scalar_one_or_none()

    @staticmethod
    async def get_user_by_id(db: AsyncSession, user_id: UUID) -> Optional[User]:
        """Get user by ID with tier relationship loaded."""
        result = await db.execute(
            select(User)
            .options(selectinload(User.tier))
            .where(User.id == user_id)
        )
        return result.scalar_one_or_none()

    @staticmethod
    async def get_features_for_tier(db: AsyncSession, tier_id: UUID) -> List[Dict[str, Any]]:
        """Get all enabled features for a tier."""
        result = await db.execute(
            select(Feature, TierFeature)
            .join(TierFeature, TierFeature.feature_id == Feature.id)
            .where(TierFeature.tier_id == tier_id)
            .where(TierFeature.enabled == True)
        )
        rows = result.all()

        features = []
        for feature, tier_feature in rows:
            features.append({
                "key": feature.key,
                "name": feature.name,
                "description": feature.description,
                "module": feature.module,
                "limit_value": tier_feature.limit_value,
            })
        return features

    @staticmethod
    async def get_features_being_lost(
        db: AsyncSession,
        from_tier_id: UUID,
        to_tier_id: UUID
    ) -> List[Dict[str, Any]]:
        """
        Calculate which features will be lost when downgrading.

        Returns features that are:
        - Enabled in from_tier but not in to_tier
        - Have higher limits in from_tier than to_tier
        """
        # Get features for both tiers
        from_features = await TierDowngradeService.get_features_for_tier(db, from_tier_id)
        to_features = await TierDowngradeService.get_features_for_tier(db, to_tier_id)

        # Create lookup for to_tier features
        to_features_map = {f["key"]: f for f in to_features}

        lost_features = []
        for feature in from_features:
            to_feature = to_features_map.get(feature["key"])

            if not to_feature:
                # Feature not available in lower tier
                lost_features.append({
                    **feature,
                    "reason": "not_available",
                    "message": f"{feature['name']} will no longer be available"
                })
            elif (feature["limit_value"] is not None and
                  to_feature["limit_value"] is not None and
                  feature["limit_value"] > to_feature["limit_value"]):
                # Feature has reduced limits
                lost_features.append({
                    **feature,
                    "reason": "reduced_limit",
                    "new_limit": to_feature["limit_value"],
                    "message": f"{feature['name']} limit reduced from {feature['limit_value']} to {to_feature['limit_value']}"
                })

        return lost_features

    @staticmethod
    async def archive_excess_data(
        db: AsyncSession,
        user_id: UUID,
        lost_features: List[Dict[str, Any]]
    ) -> Dict[str, int]:
        """
        Archive data that exceeds new tier limits.

        For now, we don't actually delete data - just mark it as archived
        or keep it read-only. Users can still view but not edit.

        Returns count of items archived per module.
        """
        archived_counts = {}

        # For each feature with reduced limits, check if user exceeds new limit
        for feature in lost_features:
            if feature.get("reason") != "reduced_limit":
                continue

            module = feature.get("module")
            new_limit = feature.get("new_limit")

            if not module or new_limit is None:
                continue

            # Module-specific archival logic would go here
            # For now, we just log and track what would be archived
            logger.info(
                f"Would archive excess {module} items for user {user_id}, "
                f"new limit: {new_limit}"
            )
            archived_counts[module] = 0

        return archived_counts

    @staticmethod
    async def downgrade_user_to_starter(
        db: AsyncSession,
        user_id: UUID,
        reason: str = "subscription_expired"
    ) -> Dict[str, Any]:
        """
        Downgrade a user to the starter tier.

        Args:
            db: Database session
            user_id: User ID to downgrade
            reason: Reason for downgrade (subscription_expired, payment_failed, manual, etc.)

        Returns:
            Dict with downgrade results including features lost
        """
        user = await TierDowngradeService.get_user_by_id(db, user_id)
        if not user:
            logger.error(f"User not found for downgrade: {user_id}")
            return {"success": False, "error": "User not found"}

        # Get current tier info
        from_tier = user.tier
        from_tier_name = from_tier.name if from_tier else "unknown"
        from_tier_id = from_tier.id if from_tier else None

        # Get starter tier
        starter_tier = await TierDowngradeService.get_starter_tier(db)
        if not starter_tier:
            logger.error("Starter tier not found in database")
            return {"success": False, "error": "Starter tier not found"}

        # Already on starter tier
        if from_tier and from_tier.name == "starter":
            return {
                "success": True,
                "already_starter": True,
                "message": "User is already on starter tier"
            }

        # Calculate features being lost
        lost_features = []
        if from_tier_id:
            lost_features = await TierDowngradeService.get_features_being_lost(
                db, from_tier_id, starter_tier.id
            )

        # Archive excess data
        archived = await TierDowngradeService.archive_excess_data(
            db, user_id, lost_features
        )

        # Update user tier
        user.tier_id = starter_tier.id
        user.stripe_subscription_id = None  # Clear subscription reference

        # Update subscription record if exists
        result = await db.execute(
            select(UserSubscription).where(UserSubscription.user_id == user_id)
        )
        subscription = result.scalar_one_or_none()

        if subscription:
            subscription.status = SubscriptionStatus.CANCELED
            subscription.canceled_at = datetime.utcnow()

        await db.commit()

        # Dispatch downgrade event
        await event_dispatcher.dispatch(
            BillingEvents.TIER_DOWNGRADED,
            user_id=user_id,
            from_tier=from_tier_name,
            to_tier="starter",
            reason=reason,
            lost_features=[f["key"] for f in lost_features],
            archived_counts=archived
        )

        logger.info(
            f"User {user_id} downgraded from {from_tier_name} to starter. "
            f"Reason: {reason}. Features lost: {len(lost_features)}"
        )

        return {
            "success": True,
            "user_id": str(user_id),
            "from_tier": from_tier_name,
            "to_tier": "starter",
            "reason": reason,
            "lost_features": lost_features,
            "archived_counts": archived,
            "downgraded_at": datetime.utcnow().isoformat()
        }

    @staticmethod
    async def get_expiring_subscriptions(
        db: AsyncSession,
        days_until_expiry: int
    ) -> List[Dict[str, Any]]:
        """
        Get subscriptions expiring within the specified days.

        Args:
            db: Database session
            days_until_expiry: Number of days until expiration

        Returns:
            List of subscription data with user info
        """
        from datetime import timedelta

        now = datetime.utcnow()
        target_date = now + timedelta(days=days_until_expiry)

        # Query subscriptions that:
        # - Are marked to cancel at period end
        # - Have period end within the target date range
        result = await db.execute(
            select(UserSubscription, User)
            .join(User, User.id == UserSubscription.user_id)
            .where(UserSubscription.cancel_at_period_end == 1)
            .where(UserSubscription.status == SubscriptionStatus.ACTIVE)
            .where(UserSubscription.current_period_end <= target_date)
            .where(UserSubscription.current_period_end > now)
        )
        rows = result.all()

        expiring = []
        for subscription, user in rows:
            days_left = (subscription.current_period_end - now).days
            expiring.append({
                "user_id": str(user.id),
                "user_email": user.email,
                "user_name": user.name,
                "subscription_id": str(subscription.id),
                "stripe_subscription_id": subscription.stripe_subscription_id,
                "current_period_end": subscription.current_period_end.isoformat(),
                "days_until_expiry": days_left,
                "tier_name": user.tier.name if user.tier else "unknown"
            })

        return expiring

    @staticmethod
    async def get_expired_subscriptions(db: AsyncSession) -> List[Dict[str, Any]]:
        """
        Get subscriptions that have expired and need to be downgraded.

        Returns:
            List of expired subscription data
        """
        now = datetime.utcnow()

        result = await db.execute(
            select(UserSubscription, User)
            .join(User, User.id == UserSubscription.user_id)
            .where(UserSubscription.cancel_at_period_end == 1)
            .where(UserSubscription.current_period_end < now)
            .where(UserSubscription.status == SubscriptionStatus.ACTIVE)
        )
        rows = result.all()

        expired = []
        for subscription, user in rows:
            # Only include if user is not already on starter
            if user.tier and user.tier.name != "starter":
                expired.append({
                    "user_id": str(user.id),
                    "user_email": user.email,
                    "subscription_id": str(subscription.id),
                    "current_period_end": subscription.current_period_end.isoformat(),
                    "tier_name": user.tier.name
                })

        return expired

    @staticmethod
    async def send_expiration_warning(
        db: AsyncSession,
        user_id: UUID,
        days_until_expiry: int,
        lost_features: List[Dict[str, Any]]
    ) -> bool:
        """
        Send an expiration warning notification to the user.

        Args:
            db: Database session
            user_id: User to notify
            days_until_expiry: Days until subscription expires
            lost_features: Features that will be lost

        Returns:
            True if notification was sent successfully
        """
        user = await TierDowngradeService.get_user_by_id(db, user_id)
        if not user:
            return False

        # Dispatch expiration warning event
        await event_dispatcher.dispatch(
            BillingEvents.EXPIRATION_WARNING,
            user_id=user_id,
            email=user.email,
            name=user.name,
            days_until_expiry=days_until_expiry,
            tier_name=user.tier.name if user.tier else "unknown",
            lost_features=[f["name"] for f in lost_features],
            lost_feature_details=lost_features
        )

        logger.info(
            f"Expiration warning sent to user {user_id} ({user.email}). "
            f"Days until expiry: {days_until_expiry}"
        )

        return True
