"""
Notifications module.

Provides user notification functionality including:
- In-app notifications
- Notification preferences
- Notification history
"""
from app.modules.notifications.models import Notification, NotificationType, NotificationCategory
from app.modules.notifications.api import router

__all__ = [
    "Notification",
    "NotificationType",
    "NotificationCategory",
    "router",
]
