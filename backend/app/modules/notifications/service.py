"""
Notification service layer.
"""
from decimal import Decimal
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, update, delete, and_
from typing import Optional, List, Dict, Any
from uuid import UUID
from datetime import datetime, timezone, timedelta

from app.modules.notifications.models import (
    Notification,
    NotificationType,
    NotificationCategory
)
from app.modules.notifications.schemas import (
    NotificationStatsResponse,
)


class NotificationService:
    """Service class for notification operations."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def create_notification(
        self,
        user_id: UUID,
        notification_type: NotificationType,
        category: NotificationCategory,
        title: str,
        message: str,
        priority: int = 3,
        action_url: Optional[str] = None,
        extra_data: Optional[Dict[str, Any]] = None,
        expires_at: Optional[datetime] = None
    ) -> Notification:
        """
        Create a new notification for a user.

        Args:
            user_id: User's UUID
            notification_type: Type of notification (alert, reminder, etc.)
            category: Category (budget, goal, etc.)
            title: Notification title
            message: Notification message
            priority: Priority level (1-5, 1 is highest)
            action_url: Optional URL for navigation
            extra_data: Optional additional data
            expires_at: Optional expiration datetime

        Returns:
            Created Notification object
        """
        notification = Notification(
            user_id=user_id,
            notification_type=notification_type,
            category=category,
            title=title,
            message=message,
            priority=priority,
            action_url=action_url,
            extra_data=extra_data,
            expires_at=expires_at
        )

        self.db.add(notification)
        await self.db.commit()
        await self.db.refresh(notification)

        return notification

    async def get_notification(
        self,
        notification_id: UUID,
        user_id: UUID
    ) -> Optional[Notification]:
        """Get a specific notification by ID."""
        result = await self.db.execute(
            select(Notification).where(
                and_(
                    Notification.id == notification_id,
                    Notification.user_id == user_id,
                    Notification.deleted_at.is_(None)
                )
            )
        )
        return result.scalar_one_or_none()

    async def list_notifications(
        self,
        user_id: UUID,
        page: int = 1,
        page_size: int = 50,
        notification_type: Optional[NotificationType] = None,
        category: Optional[NotificationCategory] = None,
        is_read: Optional[bool] = None,
        priority: Optional[int] = None
    ) -> tuple[List[Notification], int, int]:
        """
        List user's notifications with filtering and pagination.

        Returns:
            Tuple of (notifications list, total count, unread count)
        """
        # Base query
        base_query = select(Notification).where(
            and_(
                Notification.user_id == user_id,
                Notification.deleted_at.is_(None)
            )
        )

        # Apply filters
        if notification_type:
            base_query = base_query.where(Notification.notification_type == notification_type)
        if category:
            base_query = base_query.where(Notification.category == category)
        if is_read is not None:
            base_query = base_query.where(Notification.is_read == is_read)
        if priority:
            base_query = base_query.where(Notification.priority == priority)

        # Get total count
        count_result = await self.db.execute(
            select(func.count()).select_from(base_query.subquery())
        )
        total = count_result.scalar_one()

        # Get unread count (without filters)
        unread_result = await self.db.execute(
            select(func.count()).where(
                and_(
                    Notification.user_id == user_id,
                    Notification.deleted_at.is_(None),
                    Notification.is_read == False
                )
            )
        )
        unread_count = unread_result.scalar_one()

        # Apply ordering and pagination
        # Order by: unread first, then by priority (1 first), then by created_at desc
        query = base_query.order_by(
            Notification.is_read.asc(),
            Notification.priority.asc(),
            Notification.created_at.desc()
        )
        query = query.offset((page - 1) * page_size).limit(page_size)

        result = await self.db.execute(query)
        notifications = list(result.scalars().all())

        return notifications, total, unread_count

    async def get_unread_count(self, user_id: UUID) -> tuple[int, bool]:
        """
        Get unread notification count for badge display.

        Returns:
            Tuple of (unread count, has_urgent flag)
        """
        # Get unread count
        unread_result = await self.db.execute(
            select(func.count()).where(
                and_(
                    Notification.user_id == user_id,
                    Notification.deleted_at.is_(None),
                    Notification.is_read == False
                )
            )
        )
        unread_count = unread_result.scalar_one()

        # Check for urgent (priority 1) unread notifications
        urgent_result = await self.db.execute(
            select(func.count()).where(
                and_(
                    Notification.user_id == user_id,
                    Notification.deleted_at.is_(None),
                    Notification.is_read == False,
                    Notification.priority == 1
                )
            )
        )
        urgent_count = urgent_result.scalar_one()

        return unread_count, urgent_count > 0

    async def mark_as_read(
        self,
        notification_ids: List[UUID],
        user_id: UUID
    ) -> int:
        """
        Mark specific notifications as read.

        Returns:
            Number of notifications marked as read
        """
        now = datetime.now(timezone.utc)

        result = await self.db.execute(
            update(Notification)
            .where(
                and_(
                    Notification.id.in_(notification_ids),
                    Notification.user_id == user_id,
                    Notification.deleted_at.is_(None),
                    Notification.is_read == False
                )
            )
            .values(is_read=True, read_at=now)
        )

        await self.db.commit()
        return result.rowcount

    async def mark_all_as_read(
        self,
        user_id: UUID,
        category: Optional[NotificationCategory] = None
    ) -> int:
        """
        Mark all notifications as read.

        Args:
            user_id: User's UUID
            category: Optional category filter

        Returns:
            Number of notifications marked as read
        """
        now = datetime.now(timezone.utc)

        query = (
            update(Notification)
            .where(
                and_(
                    Notification.user_id == user_id,
                    Notification.deleted_at.is_(None),
                    Notification.is_read == False
                )
            )
        )

        if category:
            query = query.where(Notification.category == category)

        query = query.values(is_read=True, read_at=now)

        result = await self.db.execute(query)
        await self.db.commit()

        return result.rowcount

    async def delete_notifications(
        self,
        notification_ids: List[UUID],
        user_id: UUID
    ) -> int:
        """
        Soft delete specific notifications.

        Returns:
            Number of notifications deleted
        """
        now = datetime.now(timezone.utc)

        result = await self.db.execute(
            update(Notification)
            .where(
                and_(
                    Notification.id.in_(notification_ids),
                    Notification.user_id == user_id,
                    Notification.deleted_at.is_(None)
                )
            )
            .values(deleted_at=now)
        )

        await self.db.commit()
        return result.rowcount

    async def delete_old_notifications(
        self,
        days_old: int = 90
    ) -> int:
        """
        Delete old read notifications (for cleanup task).

        Args:
            days_old: Delete notifications older than this many days

        Returns:
            Number of notifications deleted
        """
        cutoff_date = datetime.now(timezone.utc) - timedelta(days=days_old)

        # Hard delete old read notifications
        result = await self.db.execute(
            delete(Notification).where(
                and_(
                    Notification.is_read == True,
                    Notification.created_at < cutoff_date
                )
            )
        )

        await self.db.commit()
        return result.rowcount

    async def create_payment_failed_notification(
        self,
        user_id: UUID,
        payment_type: str,
        amount: "Decimal",
        currency: str,
        account_name: str,
        item_name: str,
        current_balance: "Decimal" = None,
    ) -> Notification:
        """
        Create a notification for a failed payment due to insufficient funds.

        Args:
            user_id: User's UUID
            payment_type: Type of payment (expense, installment, subscription, stock, tax)
            amount: Amount that failed to process
            currency: Currency code
            account_name: Name of the account with insufficient funds
            item_name: Name of the item (expense name, subscription name, etc.)
            current_balance: Current balance of the account (optional)

        Returns:
            Created Notification object
        """

        title = "Payment Failed - Insufficient Funds"

        if current_balance is not None:
            message = (
                f"{payment_type.capitalize()} payment of {amount:.2f} {currency} for \"{item_name}\" failed. "
                f"Account \"{account_name}\" has insufficient funds (balance: {current_balance:.2f} {currency})."
            )
        else:
            message = (
                f"{payment_type.capitalize()} payment of {amount:.2f} {currency} for \"{item_name}\" failed. "
                f"Account \"{account_name}\" has insufficient funds."
            )

        # Determine action URL based on payment type
        action_urls = {
            "expense": "/dashboard/expenses",
            "installment": "/dashboard/installments",
            "subscription": "/dashboard/subscriptions",
            "stock": "/dashboard/portfolio",
            "tax": "/dashboard/taxes",
        }
        action_url = action_urls.get(payment_type.lower(), "/dashboard")

        return await self.create_notification(
            user_id=user_id,
            notification_type=NotificationType.ALERT,
            category=NotificationCategory.PAYMENT_FAILED,
            title=title,
            message=message,
            priority=1,  # High priority
            action_url=action_url,
            extra_data={
                "payment_type": payment_type,
                "amount": str(amount),
                "currency": currency,
                "account_name": account_name,
                "item_name": item_name,
                "current_balance": str(current_balance) if current_balance is not None else None,
            }
        )

    async def get_stats(self, user_id: UUID) -> NotificationStatsResponse:
        """Get notification statistics for user."""
        # Total count
        total_result = await self.db.execute(
            select(func.count()).where(
                and_(
                    Notification.user_id == user_id,
                    Notification.deleted_at.is_(None)
                )
            )
        )
        total = total_result.scalar_one()

        # Unread count
        unread_result = await self.db.execute(
            select(func.count()).where(
                and_(
                    Notification.user_id == user_id,
                    Notification.deleted_at.is_(None),
                    Notification.is_read == False
                )
            )
        )
        unread = unread_result.scalar_one()

        # By type
        type_result = await self.db.execute(
            select(Notification.notification_type, func.count())
            .where(
                and_(
                    Notification.user_id == user_id,
                    Notification.deleted_at.is_(None)
                )
            )
            .group_by(Notification.notification_type)
        )
        by_type = {str(row[0].value): row[1] for row in type_result.fetchall()}

        # By category
        category_result = await self.db.execute(
            select(Notification.category, func.count())
            .where(
                and_(
                    Notification.user_id == user_id,
                    Notification.deleted_at.is_(None)
                )
            )
            .group_by(Notification.category)
        )
        by_category = {str(row[0].value): row[1] for row in category_result.fetchall()}

        # By priority
        priority_result = await self.db.execute(
            select(Notification.priority, func.count())
            .where(
                and_(
                    Notification.user_id == user_id,
                    Notification.deleted_at.is_(None)
                )
            )
            .group_by(Notification.priority)
        )
        by_priority = {row[0]: row[1] for row in priority_result.fetchall()}

        return NotificationStatsResponse(
            total=total,
            unread=unread,
            by_type=by_type,
            by_category=by_category,
            by_priority=by_priority
        )
