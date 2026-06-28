"""
Notification-related Celery tasks.

Tasks:
- Send pending notifications
- Clean up old notifications
- Process notification queues
"""
import logging
from datetime import datetime
from typing import Dict, Any, List

from app.core.celery_app import celery_app
from app.tasks.base import BaseTask, get_async_db_session

logger = logging.getLogger(__name__)


@celery_app.task(base=BaseTask, bind=True, name="tasks.notification.send_email_notifications")
def send_email_notifications(self) -> Dict[str, Any]:
    """
    Periodic task to send email notifications.

    For each pending email notification:
    1. Check if user has email notifications enabled
    2. Format email content
    3. Send via SMTP
    4. Mark as sent
    5. Log delivery

    Returns:
        Dict with results
    """
    import asyncio

    async def _send():
        async with get_async_db_session() as _:
            # TODO: Implement when email system is added
            logger.info("Sending email notifications - placeholder")
            return {
                "emails_sent": 0,
                "errors": 0,
                "timestamp": datetime.utcnow().isoformat()
            }

    return asyncio.get_event_loop().run_until_complete(_send())


@celery_app.task(base=BaseTask, bind=True, name="tasks.notification.cleanup_old_notifications")
def cleanup_old_notifications(self, days_old: int = 90) -> Dict[str, Any]:
    """
    Periodic task to clean up old notifications.

    Actions:
    1. Delete read notifications older than X days
    2. Delete expired notifications
    3. Optionally archive important notifications

    Args:
        days_old: Delete notifications older than this many days (default 90)

    Returns:
        Dict with results
    """
    import asyncio

    async def _cleanup():
        async with get_async_db_session() as db:
            from sqlalchemy import delete, and_, or_
            from datetime import datetime, timedelta
            from app.modules.notifications.models import Notification

            cutoff_date = datetime.utcnow() - timedelta(days=days_old)
            now = datetime.utcnow()

            # Delete read notifications older than cutoff_date OR expired notifications
            delete_stmt = delete(Notification).where(
                or_(
                    # Read notifications older than X days
                    and_(
                        Notification.is_read == True,
                        Notification.created_at < cutoff_date
                    ),
                    # Expired notifications (regardless of read status)
                    and_(
                        Notification.expires_at.isnot(None),
                        Notification.expires_at < now
                    )
                )
            )

            result = await db.execute(delete_stmt)
            deleted_count = result.rowcount
            await db.commit()

            logger.info(f"Cleaned up {deleted_count} notifications older than {days_old} days or expired")
            return {
                "deleted_count": deleted_count,
                "cutoff_date": cutoff_date.isoformat(),
                "timestamp": datetime.utcnow().isoformat()
            }

    return asyncio.get_event_loop().run_until_complete(_cleanup())


@celery_app.task(base=BaseTask, bind=True, name="tasks.notification.create_notification")
def create_notification(
    self,
    user_id: str,
    notification_type: str,
    category: str,
    title: str,
    message: str,
    priority: int = 3,
    action_url: str = None,
    extra_data: Dict[str, Any] = None
) -> Dict[str, Any]:
    """
    Task to create a notification for a user.

    This is an async-friendly way to create notifications from other tasks.

    Args:
        user_id: UUID of the user
        notification_type: Type (alert, reminder, achievement, warning, info)
        category: Category (budget, goal, subscription, etc.)
        title: Notification title
        message: Full message
        priority: Priority level 1-5 (default 3)
        action_url: Optional link to relevant page
        extra_data: Optional extra data

    Returns:
        Dict with created notification info
    """
    import asyncio
    from uuid import UUID as UUIDType

    async def _create():
        async with get_async_db_session() as db:
            from app.modules.notifications.models import (
                Notification,
                NotificationType,
                NotificationCategory
            )

            try:
                # Convert string to enum
                notif_type = NotificationType(notification_type)
                notif_category = NotificationCategory(category)
                user_uuid = UUIDType(user_id)

                # Create the notification
                notification = Notification(
                    user_id=user_uuid,
                    notification_type=notif_type,
                    category=notif_category,
                    title=title,
                    message=message,
                    priority=priority,
                    action_url=action_url,
                    extra_data=extra_data
                )

                db.add(notification)
                await db.commit()
                await db.refresh(notification)

                logger.info(f"Created notification for user {user_id}: {title}")
                return {
                    "success": True,
                    "notification_id": str(notification.id),
                    "user_id": user_id,
                    "notification_type": notification_type,
                    "category": category,
                    "title": title,
                    "timestamp": datetime.utcnow().isoformat()
                }
            except Exception as e:
                logger.error(f"Failed to create notification for user {user_id}: {e}")
                return {
                    "success": False,
                    "error": str(e),
                    "user_id": user_id,
                    "title": title,
                    "timestamp": datetime.utcnow().isoformat()
                }

    return asyncio.get_event_loop().run_until_complete(_create())


@celery_app.task(base=BaseTask, bind=True, name="tasks.notification.send_bulk_notifications")
def send_bulk_notifications(self, notifications: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Task to send multiple notifications at once.

    Useful for scheduled batch notifications (e.g., morning alerts).

    Args:
        notifications: List of notification dicts with keys:
            - user_id
            - type
            - category
            - title
            - message
            - priority (optional)
            - action_url (optional)
            - extra_data (optional)

    Returns:
        Dict with results
    """
    import asyncio

    async def _send_bulk():
        async with get_async_db_session() as db:
            from uuid import UUID as UUIDType
            from app.modules.notifications.models import (
                Notification,
                NotificationType,
                NotificationCategory
            )

            sent = 0
            errors = 0

            for notif_data in notifications:
                try:
                    # Extract and validate required fields
                    user_id = notif_data.get("user_id")
                    notif_type = notif_data.get("type", "info")
                    category = notif_data.get("category", "system")
                    title = notif_data.get("title")
                    message = notif_data.get("message")

                    if not all([user_id, title, message]):
                        logger.warning(f"Skipping notification with missing required fields: {notif_data}")
                        errors += 1
                        continue

                    # Create the notification
                    notification = Notification(
                        user_id=UUIDType(user_id) if isinstance(user_id, str) else user_id,
                        notification_type=NotificationType(notif_type),
                        category=NotificationCategory(category),
                        title=title,
                        message=message,
                        priority=notif_data.get("priority", 3),
                        action_url=notif_data.get("action_url"),
                        extra_data=notif_data.get("extra_data")
                    )

                    db.add(notification)
                    sent += 1

                except Exception as e:
                    logger.error(f"Failed to create notification: {e}")
                    errors += 1

            # Commit all notifications in a single transaction
            if sent > 0:
                await db.commit()

            logger.info(f"Bulk notifications: {sent} sent, {errors} errors out of {len(notifications)} total")
            return {
                "total": len(notifications),
                "sent": sent,
                "errors": errors,
                "timestamp": datetime.utcnow().isoformat()
            }

    return asyncio.get_event_loop().run_until_complete(_send_bulk())
