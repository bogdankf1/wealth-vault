"""
Celery application configuration for background tasks.
"""
from celery import Celery
from app.core.config import settings

celery_app = Celery(
    "wealth_vault",
    broker=settings.REDIS_URL,
    backend=settings.REDIS_URL,
    include=["app.tasks"]
)

# Celery configuration
celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    task_track_started=True,
    task_time_limit=30 * 60,  # 30 minutes
    task_soft_time_limit=25 * 60,  # 25 minutes
)

# Optional: Configure periodic tasks (will be used in later phases)
celery_app.conf.beat_schedule = {
    # Example: Daily subscription renewal check
    # "check-subscription-renewals": {
    #     "task": "app.tasks.check_subscription_renewals",
    #     "schedule": crontab(hour=0, minute=0),  # Daily at midnight
    # },
}
