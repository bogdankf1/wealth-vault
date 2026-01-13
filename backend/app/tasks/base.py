"""
Base task class with common functionality for all Celery tasks.
"""
import logging
from celery import Task
from typing import Any, Optional
from datetime import datetime

from app.core.celery_app import celery_app

# Import all models to ensure SQLAlchemy mappers are configured
# This must happen before any database operations in tasks
from app.models.base import BaseModel
from app.models.user import User
from app.models.tier import Tier, Feature, TierFeature
from app.models.billing import UserSubscription, PaymentHistory
from app.models.configuration import AppConfiguration, EmailTemplate
from app.modules.income.models import IncomeSource
from app.modules.expenses.models import Expense
from app.modules.savings.models import SavingsAccount, AccountTransaction, BalanceHistory
from app.modules.subscriptions.models import Subscription
from app.modules.installments.models import Installment
from app.modules.goals.models import Goal
from app.modules.portfolio.models import PortfolioAsset
from app.modules.debts.models import Debt
from app.modules.taxes.models import Tax
from app.modules.budgets.models import Budget
from app.modules.notifications.models import Notification
from app.modules.dashboard_layouts.models import DashboardLayout
from app.modules.backups.models import Backup
from app.modules.support.models import SupportTopic, SupportMessage

# Import event handlers to register them in Celery worker context
import app.core.event_handlers  # noqa: F401

logger = logging.getLogger(__name__)


class BaseTask(Task):
    """
    Base task class that provides:
    - Automatic retry on failure
    - Logging
    - Error handling
    - Database session management
    """

    # Default retry settings
    autoretry_for = (Exception,)
    retry_backoff = True
    retry_backoff_max = 600  # Max 10 minutes between retries
    retry_jitter = True
    max_retries = 3

    # Track task execution
    track_started = True

    def before_start(self, task_id: str, args: tuple, kwargs: dict) -> None:
        """Called before task starts executing."""
        logger.info(
            f"Task {self.name} [{task_id}] starting",
            extra={
                "task_id": task_id,
                "task_name": self.name,
                "task_args": str(args)[:200],
                "task_kwargs": str(kwargs)[:200],
            }
        )

    def on_success(self, retval: Any, task_id: str, args: tuple, kwargs: dict) -> None:
        """Called on successful task completion."""
        logger.info(
            f"Task {self.name} [{task_id}] completed successfully",
            extra={
                "task_id": task_id,
                "task_name": self.name,
                "result": str(retval)[:200] if retval else None,
            }
        )

    def on_failure(
        self,
        exc: Exception,
        task_id: str,
        args: tuple,
        kwargs: dict,
        einfo: Any
    ) -> None:
        """Called on task failure."""
        logger.error(
            f"Task {self.name} [{task_id}] failed: {exc}",
            extra={
                "task_id": task_id,
                "task_name": self.name,
                "exception": str(exc),
                "traceback": str(einfo),
            },
            exc_info=True
        )

    def on_retry(
        self,
        exc: Exception,
        task_id: str,
        args: tuple,
        kwargs: dict,
        einfo: Any
    ) -> None:
        """Called when task is retried."""
        logger.warning(
            f"Task {self.name} [{task_id}] retrying due to: {exc}",
            extra={
                "task_id": task_id,
                "task_name": self.name,
                "exception": str(exc),
                "retry_count": self.request.retries,
            }
        )


def get_async_db_session():
    """
    Get an async database session for use in Celery tasks.

    Note: This creates a new session that must be properly closed.
    Use with async context manager in tasks.
    """
    from app.core.database import AsyncSessionLocal
    return AsyncSessionLocal()


async def run_in_session(coro_func, *args, **kwargs):
    """
    Helper to run an async function within a database session.

    Usage:
        result = await run_in_session(my_async_func, arg1, arg2)
    """
    async with get_async_db_session() as session:
        try:
            result = await coro_func(session, *args, **kwargs)
            await session.commit()
            return result
        except Exception:
            await session.rollback()
            raise
